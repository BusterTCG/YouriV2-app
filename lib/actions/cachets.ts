"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { recomputeMfForDeal } from "@/lib/management-fees-recompute";
import { computeCachetBreakdownFromBudget } from "@/lib/finance/cachet-payroll";

/**
 * Recompute server-side d'un deal CACHETS :
 *   1. `Deal.budgetAmount` = Σ prestations.amount actives (CA total facturé)
 *   2. `DealArtiste.cachetAmount` (1er artiste actif) =
 *           budgetAmount × (100 − cachetsFeesPct) / 100
 *      → le cachet brut versé à l'artiste est déduit du CA via une simple
 *      règle de partage. Pangee garde `cachetsFeesPct`% (Marge Brute), le
 *      reste va à l'artiste. Stan 2026-05-28.
 *
 * À appeler après TOUTE mutation impactant le CA :
 *   - addCachetPrestation / updateCachetPrestation / deleteCachetPrestation
 *   - updateCachetsDetails (si cachetsFeesPct ou linkedToOwnProd changent)
 *
 * Si `linkedToOwnProd` → on ne recalcule PAS le cachet artiste (Stan le
 * saisit manuellement, le CA n'est pas la base).
 */
async function recomputeCachetsBudget(dealId: string): Promise<void> {
  const [prestations, deal] = await Promise.all([
    prisma.cachetPrestation.findMany({
      where: { dealId, deletedAt: null },
      select: { amount: true },
    }),
    prisma.deal.findUnique({
      where: { id: dealId },
      select: {
        cachetsFeesPct: true,
        linkedToOwnProd: true,
      },
    }),
  ]);
  if (!deal) return;

  const total = prestations.reduce(
    (acc, p) => acc + (p.amount != null ? Number(p.amount) : 0),
    0,
  );

  await prisma.deal.update({
    where: { id: dealId },
    data: { budgetAmount: total > 0 ? new Prisma.Decimal(total) : null },
  });

  // Auto-update du cachet artiste (sauf mode linkedToOwnProd).
  // Stan 2026-05-30 : on stocke le BRUT GUSO (= ce qui apparaît sur la fiche
  // de paie déclarée). Calcul : enveloppe = budget × (100−pct)% ; brut =
  // enveloppe / (1 + chargesPatronales/100). Voir lib/finance/cachet-payroll.
  //
  // Audit Stan 2026-05-30 : si total = 0 (pas de prestations encore), on ne
  // touche PAS au cachetAmount existant — sinon on efface un brut manuel
  // saisi en mode linkedToOwnProd qu'on aurait basculé temporairement.
  if (!deal.linkedToOwnProd && total > 0) {
    const pct =
      deal.cachetsFeesPct != null ? Number(deal.cachetsFeesPct) : 10;
    const breakdown = computeCachetBreakdownFromBudget(total, pct);
    await prisma.dealArtiste.updateMany({
      where: { dealId, deletedAt: null },
      data: {
        cachetAmount:
          breakdown.brut > 0 ? new Prisma.Decimal(breakdown.brut) : null,
      },
    });
  }
}

/**
 * Server actions spécifiques CACHETS (Sprint 5, Stan 2026-05-28).
 *
 * Met à jour les champs spécifiques d'un deal CACHETS :
 *   - `budgetAmount` (montant facturé au prestataire/tiers)
 *   - `cachetsFeesPct` (% de gestion Pangee, défaut 10)
 *   - `linkedToOwnProd` (cachet versé dans le cadre d'un spectacle interne)
 *
 * Toute modif de ces champs déclenche `recomputeMfForDeal` car la Marge
 * Brute Pangee (= base de calcul des MF) bouge en conséquence.
 */

const UpdateCachetsDetailsSchema = z.object({
  id: z.string().min(1),
  // Note : `budgetAmount` n'est plus modifiable directement (recompute auto
  // depuis les prestations). On le garde dans le schéma au cas où on veuille
  // l'override manuellement à terme.
  budgetAmount: z
    .union([z.number().nonnegative(), z.literal(null)])
    .optional(),
  cachetsFeesPct: z
    .union([z.number().min(0).max(100), z.literal(null)])
    .optional(),
  linkedToOwnProd: z.boolean().optional(),
});

export async function updateCachetsDetails(
  input: z.infer<typeof UpdateCachetsDetailsSchema>,
): Promise<ActionResult> {
  return safeAction("updateCachetsDetails", async () => {
    await requireUser();
    const { id, budgetAmount, cachetsFeesPct, linkedToOwnProd } =
      UpdateCachetsDetailsSchema.parse(input);

    const data: Prisma.DealUpdateInput = {};
    if (budgetAmount !== undefined) {
      data.budgetAmount =
        budgetAmount != null ? new Prisma.Decimal(budgetAmount) : null;
    }
    if (cachetsFeesPct !== undefined) {
      data.cachetsFeesPct =
        cachetsFeesPct != null ? new Prisma.Decimal(cachetsFeesPct) : null;
    }
    if (linkedToOwnProd !== undefined) {
      data.linkedToOwnProd = linkedToOwnProd;
    }

    await prisma.deal.update({ where: { id }, data });

    // Tout changement impacte la marge brute Pangee → recalc MF + cachet
    // artiste (la règle de partage budget × (100 − pct)% change avec pct).
    const marginChanged =
      budgetAmount !== undefined ||
      cachetsFeesPct !== undefined ||
      linkedToOwnProd !== undefined;
    if (marginChanged) {
      await recomputeCachetsBudget(id);
      await recomputeMfForDeal(id);
    }

    revalidatePath("/deals/cachets");
    revalidatePath(`/deals/cachets/${id}`);
    if (marginChanged) revalidatePath("/deals/management-fees");
  });
}

// ─────────────────────────── CRUD Prestations (Sprint 5 v2) ───────────────────────────

const AddCachetPrestationSchema = z.object({
  dealId: z.string().min(1),
  // Stan 2026-05-30 audit : autoriser "" à la création pour permettre
  // l'ajout d'une ligne vide depuis la fiche détail (édition inline ensuite).
  // La validation "nom requis" est ramenée à `updateCachetPrestation`.
  prestataire: z.string().trim().max(200).default(""),
  amount: z.union([z.number().nonnegative(), z.literal(null)]).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function addCachetPrestation(
  input: z.infer<typeof AddCachetPrestationSchema>,
): Promise<ActionResult<{ id: string }>> {
  return safeAction("addCachetPrestation", async () => {
    await requireUser();
    const data = AddCachetPrestationSchema.parse(input);

    // Détermine l'ordre — à la fin de la liste actuelle.
    const last = await prisma.cachetPrestation.findFirst({
      where: { dealId: data.dealId, deletedAt: null },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const nextOrder = (last?.order ?? -1) + 1;

    const created = await prisma.cachetPrestation.create({
      data: {
        dealId: data.dealId,
        prestataire: data.prestataire,
        amount: data.amount != null ? new Prisma.Decimal(data.amount) : null,
        notes: data.notes ?? null,
        order: nextOrder,
      },
      select: { id: true },
    });

    await recomputeCachetsBudget(data.dealId);
    await recomputeMfForDeal(data.dealId);

    revalidatePath("/deals/cachets");
    revalidatePath(`/deals/cachets/${data.dealId}`);
    revalidatePath("/deals/management-fees");
    return { id: created.id };
  });
}

const UpdateCachetPrestationSchema = z.object({
  id: z.string().min(1),
  prestataire: z.string().trim().min(1).max(200).optional(),
  amount: z.union([z.number().nonnegative(), z.literal(null)]).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  isPaye: z.boolean().optional(),
  paidAt: z.coerce.date().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function updateCachetPrestation(
  input: z.infer<typeof UpdateCachetPrestationSchema>,
): Promise<ActionResult> {
  return safeAction("updateCachetPrestation", async () => {
    await requireUser();
    const { id, prestataire, amount, paymentStatus, isPaye, paidAt, notes } =
      UpdateCachetPrestationSchema.parse(input);

    const data: Prisma.CachetPrestationUpdateInput = {};
    if (prestataire !== undefined) data.prestataire = prestataire;
    if (amount !== undefined) {
      data.amount = amount != null ? new Prisma.Decimal(amount) : null;
    }
    if (notes !== undefined) data.notes = notes;

    if (paymentStatus !== undefined) {
      data.paymentStatus = paymentStatus;
      if (paymentStatus === PaymentStatus.PAID && paidAt === undefined) {
        const existing = await prisma.cachetPrestation.findUnique({
          where: { id },
          select: { paidAt: true },
        });
        if (!existing?.paidAt) {
          const now = new Date();
          data.paidAt = new Date(
            Date.UTC(now.getFullYear(), now.getMonth(), 1, 12),
          );
        }
      }
    } else if (isPaye !== undefined) {
      data.paymentStatus = isPaye ? PaymentStatus.PAID : PaymentStatus.TO_INVOICE;
      if (isPaye && paidAt === undefined) {
        const existing = await prisma.cachetPrestation.findUnique({
          where: { id },
          select: { paidAt: true },
        });
        if (!existing?.paidAt) {
          const now = new Date();
          data.paidAt = new Date(
            Date.UTC(now.getFullYear(), now.getMonth(), 1, 12),
          );
        }
      } else if (!isPaye && paidAt === undefined) {
        data.paidAt = null;
      }
    }
    if (paidAt !== undefined) data.paidAt = paidAt;

    const updated = await prisma.cachetPrestation.update({
      where: { id },
      data,
      select: { dealId: true },
    });

    // Si le montant a changé → recompute budget + MF
    if (amount !== undefined) {
      await recomputeCachetsBudget(updated.dealId);
      await recomputeMfForDeal(updated.dealId);
    }

    revalidatePath("/deals/cachets");
    revalidatePath(`/deals/cachets/${updated.dealId}`);
    if (amount !== undefined) revalidatePath("/deals/management-fees");
  });
}

export async function deleteCachetPrestation(id: string): Promise<ActionResult> {
  return safeAction("deleteCachetPrestation", async () => {
    await requireUser();
    if (!id) throw new Error("ID prestation manquant");
    const presta = await prisma.cachetPrestation.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { dealId: true },
    });
    await recomputeCachetsBudget(presta.dealId);
    await recomputeMfForDeal(presta.dealId);
    revalidatePath("/deals/cachets");
    revalidatePath(`/deals/cachets/${presta.dealId}`);
    revalidatePath("/deals/management-fees");
  });
}

// ─────────────────────────── Batch create (form création deal) ───────────────────────────

const BatchCreatePrestationsSchema = z.object({
  dealId: z.string().min(1),
  prestations: z.array(
    z.object({
      prestataire: z.string().trim().min(1).max(200),
      amount: z.union([z.number().nonnegative(), z.literal(null)]),
    }),
  ),
});

/**
 * Crée plusieurs prestations en batch pour un deal — utilisé par le form de
 * création (l'user saisit N prestations dans le dialog avant de submit).
 */
export async function batchCreateCachetPrestations(
  input: z.infer<typeof BatchCreatePrestationsSchema>,
): Promise<ActionResult> {
  return safeAction("batchCreateCachetPrestations", async () => {
    await requireUser();
    const { dealId, prestations } = BatchCreatePrestationsSchema.parse(input);
    if (prestations.length === 0) return;

    await prisma.cachetPrestation.createMany({
      data: prestations.map((p, idx) => ({
        dealId,
        prestataire: p.prestataire,
        amount: p.amount != null ? new Prisma.Decimal(p.amount) : null,
        order: idx,
      })),
    });

    await recomputeCachetsBudget(dealId);
    await recomputeMfForDeal(dealId);

    revalidatePath("/deals/cachets");
    revalidatePath(`/deals/cachets/${dealId}`);
    revalidatePath("/deals/management-fees");
  });
}
