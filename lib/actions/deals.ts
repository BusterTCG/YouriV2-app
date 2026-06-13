"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DealCategory, DealStatus, PaymentStatus, Prisma, VenueDealKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { listContacts, listVenues, type KnContact, type KnVenue } from "@/lib/kn-client";
import { recomputeMfForDeal } from "@/lib/management-fees-recompute";
import { recomputeShowFinancials } from "@/lib/finance/show-financials";
import { revalidateAllDealRoutes } from "@/lib/revalidate-deals";
import { autoCreateTasksForDeal } from "@/lib/tasks-autocreate";

/**
 * Server actions /deals — édition inline tableau + actions CRUD.
 *
 * Modèle 2026-05-26 (Stan) : Pangee touche un BUDGET → paie artistes +
 * charges → garde la marge. Les actions bulk "commission" sont remplacées
 * par :
 *   - setDealBudgetStatus / setDealBudgetPaidAt (statut budget = St. Marge)
 *   - setDealArtistStatusBulk / setDealArtistPaidAtBulk (cachets)
 *   - setDealChargeStatusBulk / setDealChargePaidAtBulk (charges)
 *
 * Permissions : MEMBER fait tout, pas de check rôle (cf. project-youri-v2).
 */

// ───────── Création / Modification / Suppression deal (Phase 3.5c) ─────────

/**
 * Extrait la ville d'une adresse BAN si elle contient un code postal :
 * "10 Rue de Rivoli 75004 Paris" → "Paris".
 * Utilisé quand l'user saisit une adresse libre sans sélectionner de Venue KN.
 */
function extractCityFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const m = address.match(/\d{5}\s+([^,]+?)\s*$/);
  return m ? m[1].trim() : null;
}

const CreateDealSchema = z.object({
  category: z.nativeEnum(DealCategory).default(DealCategory.BOOKING),
  title: z.string().trim().min(1, "Titre requis").max(200),
  date: z.coerce.date(),
  showTime: z.string().max(20).optional().nullable(),
  status: z.nativeEnum(DealStatus).optional(),
  organizerId: z.string().optional().nullable(),
  organizerName: z.string().max(200).optional().nullable(),
  organizerCompany: z.string().max(200).optional().nullable(),
  organizerCity: z.string().max(120).optional().nullable(),
  venueId: z.string().optional().nullable(),
  venueName: z.string().max(200).optional().nullable(),
  venueCity: z.string().max(120).optional().nullable(),
  /** Adresse libre BAN — pour booking entreprise sans Venue référencé. */
  venueAddress: z.string().max(300).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  /** Artiste initial (1 ligne DealArtiste créée si fourni). Recommandé pour
   *  les deals Prod Exé / Cachets où l'artiste est obligatoire dans le form. */
  initialArtistId: z.string().optional().nullable(),
  // ── Champs Prod Exé (uniquement utilisés si category=PROD_EXE) ──
  showName: z.string().max(200).optional().nullable(),
  isMultiDate: z.boolean().optional(),
  venueDealKind: z.nativeEnum(VenueDealKind).optional().nullable(),
  prodExePct: z.number().min(0).max(100).optional().nullable(),
  // ── Champs CACHETS (Stan 2026-05-28 Sprint 5) ──
  /** Montant facturé au prestataire (tiers). Sert au calcul de la Marge Brute. */
  budgetAmount: z.number().nonnegative().optional().nullable(),
  /** % du budget conservé par Pangee (défaut 10). */
  cachetsFeesPct: z.number().min(0).max(100).optional().nullable(),
  /** Cachet versé dans le cadre d'un spectacle produit par Pangee — 0 marge, 0 MF. */
  linkedToOwnProd: z.boolean().optional(),
});

export async function createDeal(
  input: z.infer<typeof CreateDealSchema>,
): Promise<ActionResult<{ id: string }>> {
  return safeAction("createDeal", async () => {
    const user = await requireUser();
    const data = CreateDealSchema.parse(input);
    // Si pas de Venue KN sélectionné mais adresse libre : extraire la ville
    // depuis le code postal du label BAN (Stan 2026-05-26).
    const venueCity = data.venueId
      ? data.venueCity ?? null
      : data.venueCity ?? extractCityFromAddress(data.venueAddress);

    const created = await prisma.deal.create({
      data: {
        category: data.category,
        status: data.status ?? DealStatus.LEAD,
        title: data.title,
        date: data.date,
        showTime: data.showTime ?? null,
        organizerId: data.organizerId ?? null,
        organizerName: data.organizerName ?? null,
        organizerCompany: data.organizerCompany ?? null,
        organizerCity: data.organizerCity ?? null,
        venueId: data.venueId ?? null,
        venueName: data.venueName ?? null,
        venueCity,
        venueAddress: data.venueAddress ?? null,
        notes: data.notes ?? null,
        createdById: user.id,
        // Champs Prod Exé (null si pas applicable)
        ...(data.category === DealCategory.PROD_EXE
          ? {
              showName: data.showName ?? null,
              isMultiDate: data.isMultiDate ?? false,
              venueDealKind: data.venueDealKind ?? null,
              prodExePct: data.prodExePct ?? null,
            }
          : {}),
        // Champs Cachets (Stan 2026-05-28 Sprint 5)
        ...(data.category === DealCategory.CACHETS
          ? {
              budgetAmount:
                data.budgetAmount != null
                  ? new Prisma.Decimal(data.budgetAmount)
                  : null,
              cachetsFeesPct:
                data.cachetsFeesPct != null
                  ? new Prisma.Decimal(data.cachetsFeesPct)
                  : new Prisma.Decimal(10),
              linkedToOwnProd: data.linkedToOwnProd ?? false,
            }
          : {}),
        // Artiste initial (1 ligne DealArtiste vide rattachée — Stan : on
        // pré-attache l'artiste sélectionné dans le form de création).
        ...(data.initialArtistId
          ? {
              dealArtistes: {
                create: [
                  { artistId: data.initialArtistId, paymentStatus: "N_A" },
                ],
              },
            }
          : {}),
      },
      select: { id: true },
    });
    // Stan 2026-05-31 v4 audit : rollback manuel si auto-création du pipeline
    // crash, pour éviter qu'un deal existe sans son pipeline de tâches.
    // (Transaction interactive Prisma incompatible avec le client étendu.)
    try {
      await autoCreateTasksForDeal(created.id, data.category, data.date);
    } catch (taskErr) {
      // Rollback : on supprime le deal créé pour rester cohérent.
      await prisma.deal.delete({ where: { id: created.id } }).catch(() => {});
      throw taskErr;
    }
    revalidatePath("/deals");
    revalidatePath("/dashboard");
    revalidatePath("/deals/booking");
    revalidatePath("/deals/prod-executive");
    revalidatePath("/deals/cachets");
    revalidatePath("/taches");
    return { id: created.id };
  });
}

const UpdateDealMetaSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  date: z.coerce.date().optional(),
  showTime: z.string().max(20).nullable().optional(),
  organizerId: z.string().nullable().optional(),
  organizerName: z.string().max(200).nullable().optional(),
  organizerCompany: z.string().max(200).nullable().optional(),
  organizerCity: z.string().max(120).nullable().optional(),
  venueId: z.string().nullable().optional(),
  venueName: z.string().max(200).nullable().optional(),
  venueCity: z.string().max(120).nullable().optional(),
  venueAddress: z.string().max(300).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/** Update méta du deal (titre/date/lieu/organisateur/notes). Pas le budget,
 *  les artistes ou les charges (qui ont leurs propres actions). */
export async function updateDealMeta(
  input: z.infer<typeof UpdateDealMetaSchema>,
): Promise<ActionResult> {
  return safeAction("updateDealMeta", async () => {
    await requireUser();
    const { id, ...patch } = UpdateDealMetaSchema.parse(input);
    // Si on update venueAddress sans venueId et sans venueCity explicite,
    // extraire la ville depuis l'adresse (cohérence avec createDeal).
    if (
      patch.venueAddress !== undefined &&
      !patch.venueId &&
      patch.venueCity === undefined
    ) {
      patch.venueCity = extractCityFromAddress(patch.venueAddress);
    }
    await prisma.deal.update({ where: { id }, data: patch });
    revalidateAllDealRoutes(id);
  });
}

/**
 * Soft-delete deal + cascade vers TOUTES les entités enfants soft-deletables :
 *   - DealArtiste, DealCharge, DealManagementFee (Booking + Prod Exé)
 *   - ProductionLine (Prod Exé — audit Stan 2026-05-27)
 *   - EventBriefing (FDR — audit Stan 2026-05-27)
 *
 * Sans cette cascade, les enfants restent actifs en DB ; `recomputeMfForDeal`
 * peut continuer à calculer sur un deal mort, et un futur trash/restore aurait
 * des références orphelines.
 */
export async function softDeleteDeal(id: string): Promise<ActionResult> {
  return safeAction("softDeleteDeal", async () => {
    await requireUser();
    if (!id) throw new Error("ID deal manquant");
    const existing = await prisma.deal.findUnique({
      where: { id },
      select: { id: true, title: true, category: true, deletedAt: true },
    });
    if (!existing || existing.deletedAt) throw new Error("Deal introuvable");
    const now = new Date();
    // Cascade soft-delete : tous les enfants reçoivent le MÊME timestamp `now`,
    // ce qui permet à `restoreDeal` de ne restaurer QUE les enfants supprimés
    // avec le deal (et pas ceux retirés individuellement auparavant).
    await prisma.$transaction([
      prisma.deal.update({ where: { id }, data: { deletedAt: now } }),
      prisma.dealArtiste.updateMany({ where: { dealId: id, deletedAt: null }, data: { deletedAt: now } }),
      prisma.dealCharge.updateMany({ where: { dealId: id, deletedAt: null }, data: { deletedAt: now } }),
      prisma.dealManagementFee.updateMany({ where: { dealId: id, deletedAt: null }, data: { deletedAt: now } }),
      prisma.productionLine.updateMany({ where: { dealId: id, deletedAt: null }, data: { deletedAt: now } }),
      prisma.cachetPrestation.updateMany({ where: { dealId: id, deletedAt: null }, data: { deletedAt: now } }),
      prisma.task.updateMany({ where: { dealId: id, deletedAt: null }, data: { deletedAt: now } }),
      prisma.eventBriefing.updateMany({ where: { dealId: id, deletedAt: null }, data: { deletedAt: now } }),
    ]);
    await logAudit({
      entity: "Deal",
      entityId: id,
      action: "delete",
      summary: `Deal supprimé : « ${existing.title} » (${existing.category})`,
    });
    revalidateDealWide();
  });
}

/**
 * Restaure un deal soft-deleté + sa cascade d'enfants. On ne restaure QUE les
 * enfants dont le `deletedAt` correspond EXACTEMENT à celui du deal (= ceux
 * supprimés par la même cascade), pour ne pas ressusciter un DealArtiste /
 * tâche retiré individuellement avant la suppression du deal.
 */
export async function restoreDeal(id: string): Promise<ActionResult> {
  return safeAction("restoreDeal", async () => {
    await requireUser();
    if (!id) throw new Error("ID deal manquant");
    const existing = await prisma.deal.findUnique({
      where: { id },
      select: { id: true, title: true, deletedAt: true },
    });
    if (!existing) throw new Error("Deal introuvable");
    if (!existing.deletedAt) throw new Error("Ce deal n'est pas supprimé");
    const at = existing.deletedAt;
    await prisma.$transaction([
      prisma.deal.update({ where: { id }, data: { deletedAt: null } }),
      prisma.dealArtiste.updateMany({ where: { dealId: id, deletedAt: at }, data: { deletedAt: null } }),
      prisma.dealCharge.updateMany({ where: { dealId: id, deletedAt: at }, data: { deletedAt: null } }),
      prisma.dealManagementFee.updateMany({ where: { dealId: id, deletedAt: at }, data: { deletedAt: null } }),
      prisma.productionLine.updateMany({ where: { dealId: id, deletedAt: at }, data: { deletedAt: null } }),
      prisma.cachetPrestation.updateMany({ where: { dealId: id, deletedAt: at }, data: { deletedAt: null } }),
      prisma.task.updateMany({ where: { dealId: id, deletedAt: at }, data: { deletedAt: null } }),
      prisma.eventBriefing.updateMany({ where: { dealId: id, deletedAt: at }, data: { deletedAt: null } }),
    ]);
    await logAudit({
      entity: "Deal",
      entityId: id,
      action: "restore",
      summary: `Deal restauré : « ${existing.title} »`,
    });
    revalidateDealWide();
  });
}

/**
 * Suppression DÉFINITIVE (irréversible) d'un deal depuis la corbeille. Le
 * `onDelete: Cascade` du schéma supprime tous les enfants (artistes, charges,
 * MF, prod lines, cachets, tâches, FDR) au niveau DB.
 */
export async function permanentlyDeleteDeal(id: string): Promise<ActionResult> {
  return safeAction("permanentlyDeleteDeal", async () => {
    await requireUser();
    if (!id) throw new Error("ID deal manquant");
    const existing = await prisma.deal.findUnique({
      where: { id },
      select: { id: true, title: true, category: true, date: true, deletedAt: true },
    });
    if (!existing) throw new Error("Deal introuvable");
    await prisma.deal.delete({ where: { id } });
    await logAudit({
      entity: "Deal",
      entityId: id,
      action: "permanently_delete",
      before: existing,
      summary: `Deal supprimé définitivement : « ${existing.title} »`,
    });
    revalidateDealWide();
  });
}

/** Revalide toutes les surfaces impactées par une suppression/restauration
 *  de deal (listes, dashboard, reporting, corbeille). */
function revalidateDealWide(): void {
  revalidatePath("/dashboard");
  revalidatePath("/reporting");
  revalidatePath("/deals/booking");
  revalidatePath("/deals/prod-executive");
  revalidatePath("/deals/cachets");
  revalidatePath("/deals/management-fees");
  revalidatePath("/artistes");
  revalidatePath("/trash");
}

/**
 * Variante avec redirect — pratique pour un bouton Supprimer qui doit
 * naviguer après suppression.
 */
export async function softDeleteDealAndRedirect(id: string): Promise<void> {
  const res = await softDeleteDeal(id);
  if (!res.ok) throw new Error(res.error);
  redirect("/deals/booking");
}

// ───────── Add / Remove DealArtiste ─────────

const AddDealArtistSchema = z.object({
  dealId: z.string().min(1),
  artistId: z.string().min(1),
  cachetAmount: z.union([z.number().nonnegative(), z.literal(null)]).optional(),
  sharePct: z.union([z.number().min(0).max(100), z.literal(null)]).optional(),
});

export async function addDealArtist(
  input: z.infer<typeof AddDealArtistSchema>,
): Promise<ActionResult<{ id: string }>> {
  return safeAction("addDealArtist", async () => {
    await requireUser();
    const { dealId, artistId, cachetAmount, sharePct } = AddDealArtistSchema.parse(input);
    const created = await prisma.dealArtiste.create({
      data: {
        dealId,
        artistId,
        cachetAmount: cachetAmount ?? null,
        sharePct: sharePct ?? null,
      },
      select: { id: true },
    });
    await recomputeMfForDeal(dealId);
    revalidatePath("/dashboard");
    revalidatePath("/deals/booking");
    revalidatePath(`/deals/booking/${dealId}`);
    return { id: created.id };
  });
}

export async function removeDealArtist(id: string): Promise<ActionResult> {
  return safeAction("removeDealArtist", async () => {
    await requireUser();
    if (!id) throw new Error("ID DealArtiste manquant");
    const da = await prisma.dealArtiste.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { dealId: true },
    });
    await recomputeMfForDeal(da.dealId);
    revalidatePath("/dashboard");
    revalidatePath("/deals/booking");
    revalidatePath(`/deals/booking/${da.dealId}`);
  });
}

// ───────── Search roster artistes Pangee (pour ajout sur deal) ─────────

export interface PangeeArtistOption {
  id: string;
  name: string;
  slug: string;
  color: string;
  avatarUrl: string | null;
}

/**
 * Liste les artistes Pangee actifs (active=true + non soft-deleted), avec
 * exclusion optionnelle d'IDs déjà rattachés au deal. Utilisé par le
 * combobox d'ajout sur la fiche détail. Tri français case-insensitive.
 *
 * Pangee gère < 100 artistes — pas de pagination ni de recherche serveur
 * (la recherche se fait côté client dans le CommandInput shadcn).
 */
export async function listPangeeArtists(
  excludeIds: string[] = [],
): Promise<ActionResult<PangeeArtistOption[]>> {
  return safeAction("listPangeeArtists", async () => {
    await requireUser();
    const items = await prisma.artist.findMany({
      where: {
        deletedAt: null,
        active: true,
        ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        avatarUrl: true,
      },
    });
    // Tri français case-insensitive (Divers reste en queue si présent)
    return items.sort((a, b) => {
      if (a.slug === "divers") return 1;
      if (b.slug === "divers") return -1;
      return a.name.localeCompare(b.name, "fr");
    });
  });
}

// ───────── Search annuaire KN (pour ContactPicker + VenuePicker) ─────────

/** Recherche contacts depuis l'annuaire KN distant (via kn-client). Limit 50. */
export async function searchKnContacts(query: string): Promise<ActionResult<KnContact[]>> {
  return safeAction("searchKnContacts", async () => {
    await requireUser();
    const result = await listContacts({ q: query.trim() || undefined, limit: 50 });
    return result.items;
  });
}

/** Recherche venues depuis l'annuaire KN distant. Limit 50. */
export async function searchKnVenues(query: string): Promise<ActionResult<KnVenue[]>> {
  return safeAction("searchKnVenues", async () => {
    await requireUser();
    const result = await listVenues({ q: query.trim() || undefined, limit: 50 });
    return result.items;
  });
}

// ───────── Statut deal (LEAD / EN_COURS / CONFIRME / ANNULE) ─────────

/**
 * Change l'artiste principal d'un deal (Prod Exé / Cachets en mono-artiste).
 * Met à jour le DealArtiste actif existant — ou en crée un nouveau si aucun.
 * Stan 2026-05-27 : permettre de modifier l'artiste lié depuis le dialog d'édition.
 */
const SetDealPrimaryArtistSchema = z.object({
  dealId: z.string().min(1),
  artistId: z.string().min(1).nullable(),
});

export async function setDealPrimaryArtist(
  input: z.infer<typeof SetDealPrimaryArtistSchema>,
): Promise<ActionResult> {
  return safeAction("setDealPrimaryArtist", async () => {
    await requireUser();
    const { dealId, artistId } = SetDealPrimaryArtistSchema.parse(input);

    const existing = await prisma.dealArtiste.findFirst({
      where: { dealId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, artistId: true },
    });

    if (artistId == null) {
      // L'user vide la sélection → soft-delete le DealArtiste actif s'il existe.
      if (existing) {
        await prisma.dealArtiste.update({
          where: { id: existing.id },
          data: { deletedAt: new Date() },
        });
      }
    } else if (existing) {
      if (existing.artistId !== artistId) {
        // L'unique(dealId, artistId) empêche un swap direct si l'artiste cible
        // existe déjà sur ce deal — on soft-delete l'ancien et on crée nouveau.
        const conflict = await prisma.dealArtiste.findFirst({
          where: { dealId, artistId, deletedAt: null },
          select: { id: true },
        });
        if (!conflict) {
          await prisma.dealArtiste.update({
            where: { id: existing.id },
            data: { artistId },
          });
        }
      }
    } else {
      await prisma.dealArtiste.create({
        data: { dealId, artistId, paymentStatus: "N_A" },
      });
    }

    await recomputeMfForDeal(dealId);
    // Stan 2026-05-30 audit Sprint 5 : helper centralisé qui revalide les 3
    // catégories d'un coup (évite les oublis).
    revalidateAllDealRoutes(dealId, true);
  });
}

/**
 * Statut consolidé "Part Artiste payée" — INDÉPENDANT du DealArtiste.paymentStatus
 * individuel. Stan 2026-05-27 v2 : driver UI du pill global "Payé" sur la
 * Part Artiste (fiche show), non corrélé aux cachets individuels.
 */
const SetDealArtistStatusSchema = z.object({
  dealId: z.string().min(1),
  status: z.nativeEnum(PaymentStatus),
});

export async function setDealArtistStatus(
  input: z.infer<typeof SetDealArtistStatusSchema>,
): Promise<ActionResult> {
  return safeAction("setDealArtistStatus", async () => {
    await requireUser();
    const { dealId, status } = SetDealArtistStatusSchema.parse(input);
    await prisma.deal.update({
      where: { id: dealId },
      data: { artistStatus: status },
    });
    // Stan 2026-05-30 audit Sprint 5 : helper centralisé (BOOKING/PROD_EXE/CACHETS).
    // Impacte la règle "Dispo paiement" → MF inclus.
    revalidateAllDealRoutes(dealId, true);
  });
}

const SetDealStatusSchema = z.object({
  dealId: z.string().min(1),
  status: z.nativeEnum(DealStatus),
});

export async function setDealStatus(
  input: z.infer<typeof SetDealStatusSchema>,
): Promise<ActionResult> {
  return safeAction("setDealStatus", async () => {
    await requireUser();
    const { dealId, status } = SetDealStatusSchema.parse(input);
    await prisma.deal.update({
      where: { id: dealId },
      data: { status },
    });
    // Stan 2026-05-30 audit Sprint 5 : helper centralisé. La page liste MF
    // exclut les deals ANNULE → revalider aussi.
    revalidateAllDealRoutes(dealId, true);
  });
}

// ───────── Budget Pangee (statut + mois encaissement) ─────────

const SetDealBudgetStatusSchema = z.object({
  dealId: z.string().min(1),
  status: z.nativeEnum(PaymentStatus),
});

/**
 * Update le statut du budget Pangee (= St. Marge dans le tableau récap).
 * Indépendant des statuts paiements artistes / charges.
 */
export async function setDealBudgetStatus(
  input: z.infer<typeof SetDealBudgetStatusSchema>,
): Promise<ActionResult> {
  return safeAction("setDealBudgetStatus", async () => {
    await requireUser();
    const { dealId, status } = SetDealBudgetStatusSchema.parse(input);
    await prisma.deal.update({
      where: { id: dealId },
      data: { budgetPaymentStatus: status },
    });
    revalidatePath("/dashboard");
    revalidatePath("/deals/booking");
    revalidatePath(`/deals/booking/${dealId}`);
  });
}

const SetDealBudgetPaidAtSchema = z.object({
  dealId: z.string().min(1),
  date: z.coerce.date().nullable(),
});

/**
 * Update le mois d'encaissement du budget Pangee. Quand on fixe une date,
 * on passe aussi budgetPaymentStatus → PAID en cohérence ("j'encaisse en
 * mars" ⇒ c'est encaissé).
 */
export async function setDealBudgetPaidAt(
  input: z.infer<typeof SetDealBudgetPaidAtSchema>,
): Promise<ActionResult> {
  return safeAction("setDealBudgetPaidAt", async () => {
    await requireUser();
    const { dealId, date } = SetDealBudgetPaidAtSchema.parse(input);
    await prisma.deal.update({
      where: { id: dealId },
      data: date
        ? { budgetPaidAt: date, budgetPaymentStatus: PaymentStatus.PAID }
        : { budgetPaidAt: null },
    });
    revalidatePath("/dashboard");
    revalidatePath("/deals/booking");
    revalidatePath(`/deals/booking/${dealId}`);
  });
}

// ───────── Bulk update statuts paiement artistes (cachets) ─────────

const SetBulkPaymentStatusSchema = z.object({
  dealId: z.string().min(1),
  status: z.nativeEnum(PaymentStatus),
});

/**
 * Update `paymentStatus` (statut paiement artiste) sur TOUS les DealArtiste
 * actifs du deal. Utilisé depuis le tableau /deals/booking (édition bulk).
 * L'édition par artiste se fait depuis la fiche détail.
 */
export async function setDealArtistStatusBulk(
  input: z.infer<typeof SetBulkPaymentStatusSchema>,
): Promise<ActionResult> {
  return safeAction("setDealArtistStatusBulk", async () => {
    await requireUser();
    const { dealId, status } = SetBulkPaymentStatusSchema.parse(input);
    await prisma.dealArtiste.updateMany({
      where: { dealId, deletedAt: null },
      data: { paymentStatus: status },
    });
    revalidatePath("/dashboard");
    revalidatePath("/deals/booking");
    revalidatePath(`/deals/booking/${dealId}`);
  });
}

const SetDealArtistPaidAtBulkSchema = z.object({
  dealId: z.string().min(1),
  date: z.coerce.date().nullable(),
});

/**
 * Set le mois de paiement des artistes (bulk). Si une date est fixée,
 * passe aussi paymentStatus → PAID en cohérence.
 */
export async function setDealArtistPaidAtBulk(
  input: z.infer<typeof SetDealArtistPaidAtBulkSchema>,
): Promise<ActionResult> {
  return safeAction("setDealArtistPaidAtBulk", async () => {
    await requireUser();
    const { dealId, date } = SetDealArtistPaidAtBulkSchema.parse(input);
    await prisma.dealArtiste.updateMany({
      where: { dealId, deletedAt: null },
      data: date
        ? { paidAt: date, paymentStatus: PaymentStatus.PAID }
        : { paidAt: null },
    });
    revalidatePath("/dashboard");
    revalidatePath("/deals/booking");
    revalidatePath(`/deals/booking/${dealId}`);
  });
}

// ───────── Édition inline fiche détail (Budget / Artiste / Charge) ─────────
//
// Pattern KN show : chaque ligne a un montant éditable + toggle "Payé"
// (resp. "Encaissé" pour le budget) + notes libres. Pour rester proche du
// modèle KN, on accepte des patch partiels (chaque champ optionnel).

const UpdateDealBudgetSchema = z.object({
  dealId: z.string().min(1),
  amount: z.union([z.number().nonnegative(), z.literal(null)]).optional(),
  isEncaisse: z.boolean().optional(),
  paidAt: z.coerce.date().nullable().optional(),
});

/**
 * Update du budget Pangee depuis la fiche détail.
 * - `amount` : montant brut (€).
 * - `isEncaisse` : toggle vert "✓ Encaissé" ↔ "○ Encaissé". Mappe vers
 *   `budgetPaymentStatus = PAID` (coché) ou `TO_INVOICE` (décoché).
 *   Si coché, fixe aussi `budgetPaidAt = now` si non déjà renseigné.
 * - `paidAt` : mois d'encaissement (override manuel).
 */
export async function updateDealBudget(
  input: z.infer<typeof UpdateDealBudgetSchema>,
): Promise<ActionResult> {
  return safeAction("updateDealBudget", async () => {
    await requireUser();
    const { dealId, amount, isEncaisse, paidAt } = UpdateDealBudgetSchema.parse(input);

    const data: Prisma.DealUpdateInput = {};
    if (amount !== undefined) data.budgetAmount = amount;
    if (isEncaisse !== undefined) {
      data.budgetPaymentStatus = isEncaisse ? PaymentStatus.PAID : PaymentStatus.TO_INVOICE;
      // Si on passe à encaissé et qu'aucune date n'est renseignée, on met now.
      if (isEncaisse && paidAt === undefined) {
        const existing = await prisma.deal.findUnique({
          where: { id: dealId },
          select: { budgetPaidAt: true },
        });
        if (!existing?.budgetPaidAt) {
          const now = new Date();
          data.budgetPaidAt = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 12));
        }
      }
      // Si on décoche, on garde la date (sert d'historique) — l'user peut la
      // vider explicitement via paidAt=null.
    }
    if (paidAt !== undefined) data.budgetPaidAt = paidAt;

    await prisma.deal.update({ where: { id: dealId }, data });
    // Recalcule les MF si le budget a changé (cf. helper).
    if (amount !== undefined) {
      await recomputeMfForDeal(dealId);
    }
    revalidatePath("/dashboard");
    revalidatePath("/deals/booking");
    revalidatePath(`/deals/booking/${dealId}`);
  });
}

const UpdateDealArtisteSchema = z.object({
  id: z.string().min(1),
  cachetAmount: z.union([z.number().nonnegative(), z.literal(null)]).optional(),
  sharePct: z.union([z.number().min(0).max(100), z.literal(null)]).optional(),
  /** Statut direct (4 valeurs artiste : TO_INVOICE/VALIDATED/INVOICED/PAID). */
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  /** Legacy : toggle binaire (PAID/TO_INVOICE). Conservé pour compat. */
  isPaye: z.boolean().optional(),
  paidAt: z.coerce.date().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

/**
 * Update d'une ligne DealArtiste depuis la fiche détail.
 * `isPaye` toggle : PAID ↔ TO_INVOICE (sémantique "payé par Pangee").
 */
export async function updateDealArtiste(
  input: z.infer<typeof UpdateDealArtisteSchema>,
): Promise<ActionResult> {
  return safeAction("updateDealArtiste", async () => {
    await requireUser();
    const { id, cachetAmount, sharePct, paymentStatus, isPaye, paidAt, notes } =
      UpdateDealArtisteSchema.parse(input);

    const data: Prisma.DealArtisteUpdateInput = {};
    if (cachetAmount !== undefined) data.cachetAmount = cachetAmount;
    if (sharePct !== undefined) data.sharePct = sharePct;
    // paymentStatus direct (4 valeurs Stan) — priorité sur le toggle legacy.
    if (paymentStatus !== undefined) {
      data.paymentStatus = paymentStatus;
      // Si on passe à PAID sans date, fixer le mois courant.
      if (paymentStatus === PaymentStatus.PAID && paidAt === undefined) {
        const existing = await prisma.dealArtiste.findUnique({
          where: { id },
          select: { paidAt: true },
        });
        if (!existing?.paidAt) {
          const now = new Date();
          data.paidAt = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 12));
        }
      }
    } else if (isPaye !== undefined) {
      data.paymentStatus = isPaye ? PaymentStatus.PAID : PaymentStatus.TO_INVOICE;
      if (isPaye && paidAt === undefined) {
        const existing = await prisma.dealArtiste.findUnique({
          where: { id },
          select: { paidAt: true },
        });
        if (!existing?.paidAt) {
          const now = new Date();
          data.paidAt = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 12));
        }
      }
    }
    if (paidAt !== undefined) data.paidAt = paidAt;
    if (notes !== undefined) data.notes = notes;

    const da = await prisma.dealArtiste.update({
      where: { id },
      data,
      select: { dealId: true, deal: { select: { category: true } } },
    });
    // Si le cachet (montant artiste) change, la marge bouge → recalc MF.
    // Pour Prod Exé, recompute aussi les financials show (totalCost inclut
    // les cachets indirectement via Part Artiste).
    if (cachetAmount !== undefined) {
      if (da.deal.category === "PROD_EXE") {
        await recomputeShowFinancials(da.dealId);
      }
      await recomputeMfForDeal(da.dealId);
    }
    // Audit Stan 2026-05-27 : revalider TOUS les chemins concernés (l'éditeur
    // de cachets est utilisé depuis booking ET prod-executive ; un changement
    // de statut/cachet impacte aussi la règle "dispo paiement" MF).
    // Stan 2026-05-30 audit Sprint 5 : helper centralisé (BOOKING/PROD_EXE/CACHETS).
    revalidateAllDealRoutes(da.dealId, true);
  });
}

// ───────── Charges diverses : add / update / remove ─────────

const AddDealChargeSchema = z.object({
  dealId: z.string().min(1),
  label: z.string().trim().min(1, "Libellé requis").max(200),
  amount: z.union([z.number().nonnegative(), z.literal(null)]).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

export async function addDealCharge(
  input: z.infer<typeof AddDealChargeSchema>,
): Promise<ActionResult<{ id: string }>> {
  return safeAction("addDealCharge", async () => {
    await requireUser();
    const { dealId, label, amount, notes } = AddDealChargeSchema.parse(input);
    const charge = await prisma.dealCharge.create({
      data: {
        dealId,
        label,
        amount: amount ?? null,
        notes: notes ?? null,
      },
      select: { id: true },
    });
    if (amount !== undefined && amount !== null) {
      await recomputeMfForDeal(dealId);
    }
    revalidatePath("/dashboard");
    revalidatePath("/deals/booking");
    revalidatePath(`/deals/booking/${dealId}`);
    return { id: charge.id };
  });
}

const UpdateDealChargeSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(200).optional(),
  amount: z.union([z.number().nonnegative(), z.literal(null)]).optional(),
  isPaye: z.boolean().optional(),
  paidAt: z.coerce.date().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

/**
 * Update d'une ligne DealCharge. `isPaye` toggle : PAID ↔ TO_INVOICE.
 */
export async function updateDealCharge(
  input: z.infer<typeof UpdateDealChargeSchema>,
): Promise<ActionResult> {
  return safeAction("updateDealCharge", async () => {
    await requireUser();
    const { id, label, amount, isPaye, paidAt, notes } =
      UpdateDealChargeSchema.parse(input);

    const data: Prisma.DealChargeUpdateInput = {};
    if (label !== undefined) data.label = label;
    if (amount !== undefined) data.amount = amount;
    if (isPaye !== undefined) {
      data.paymentStatus = isPaye ? PaymentStatus.PAID : PaymentStatus.TO_INVOICE;
      if (isPaye && paidAt === undefined) {
        const existing = await prisma.dealCharge.findUnique({
          where: { id },
          select: { paidAt: true },
        });
        if (!existing?.paidAt) {
          const now = new Date();
          data.paidAt = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 12));
        }
      }
    }
    if (paidAt !== undefined) data.paidAt = paidAt;
    if (notes !== undefined) data.notes = notes;

    const charge = await prisma.dealCharge.update({
      where: { id },
      data,
      select: { dealId: true },
    });
    if (amount !== undefined) {
      await recomputeMfForDeal(charge.dealId);
    }
    revalidatePath("/dashboard");
    revalidatePath("/deals/booking");
    revalidatePath(`/deals/booking/${charge.dealId}`);
  });
}

export async function removeDealCharge(id: string): Promise<ActionResult> {
  return safeAction("removeDealCharge", async () => {
    await requireUser();
    if (!id) throw new Error("ID charge manquant");
    const charge = await prisma.dealCharge.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { dealId: true },
    });
    await recomputeMfForDeal(charge.dealId);
    revalidatePath("/dashboard");
    revalidatePath("/deals/booking");
    revalidatePath(`/deals/booking/${charge.dealId}`);
  });
}
