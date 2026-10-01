"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, VenueDealKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { requireDealAccess } from "@/lib/auth/access";
import { safeAction, type ActionResult } from "@/lib/errors";
import { recomputeShowFinancials } from "@/lib/finance/show-financials";
import { recomputeMfForDeal } from "@/lib/management-fees-recompute";
import { syncDealProductionLink } from "@/lib/finance/production-link";
import { revalidateAllDealRoutes } from "@/lib/revalidate-deals";
import { syncDealFromPerformances } from "@/lib/performances";
import { shareKindFor } from "@/lib/finance/production-overhead";
import { isResidencySharedField } from "@/lib/residency-shared-fields";
import { syncShowTaskToggle } from "@/lib/actions/sync-show-tasks";

/**
 * Server actions spécifiques Prod Exécutive (Sprint 4).
 *
 * Met à jour les champs Prod Exé du modèle Deal :
 *   - Modèle salle (venueDealKind), % commission (prodExePct), co-réal info
 *   - Jauge (capacity, paying, invited)
 *   - Multi-date (isMultiDate, multiDateDates, performanceCount)
 *   - Show details (showName, endTime)
 *   - Suivi opérationnel (contractSigned, ticketingReady, ticketingUrl, vhrBooked)
 *   - VenueRoom snapshot (venueRoomId)
 *
 * Toute modif de venueDealKind ou prodExePct déclenche recomputeShowFinancials
 * (les scalars grossAmount / commissionAmount / artistAmount peuvent bouger).
 */

const UpdateShowDetailsSchema = z.object({
  id: z.string().min(1),
  // Modèle financier
  venueDealKind: z.nativeEnum(VenueDealKind).nullable().optional(),
  prodExePct: z
    .union([z.number().min(0).max(100), z.literal(null)])
    .optional(),
  coRealKnPct: z
    .union([z.number().min(0).max(100), z.literal(null)])
    .optional(),
  coRealGrossCa: z
    .union([z.number().nonnegative(), z.literal(null)])
    .optional(),
  // Jauge
  capacity: z.union([z.number().int().nonnegative(), z.literal(null)]).optional(),
  paying: z.union([z.number().int().nonnegative(), z.literal(null)]).optional(),
  invited: z.union([z.number().int().nonnegative(), z.literal(null)]).optional(),
  // Multi-date
  isMultiDate: z.boolean().optional(),
  multiDateDates: z.array(z.string()).nullable().optional(),
  performanceCount: z
    .union([z.number().int().nonnegative(), z.literal(null)])
    .optional(),
  // Show details
  showName: z.string().max(200).nullable().optional(),
  endTime: z.string().max(20).nullable().optional(),
  // Suivi opérationnel
  contractSigned: z.boolean().optional(),
  ticketingReady: z.boolean().optional(),
  ticketingUrl: z.string().max(500).nullable().optional(),
  vhrBooked: z.boolean().optional(),
  // VenueRoom (snapshot)
  venueRoomId: z.string().nullable().optional(),
  /** Mois de résidence : répercuter les champs partagés modifiés sur tous les
   *  mois de la résidence (choix « Tous les mois », par défaut — Stan
   *  2026-10-01, portage KN). */
  applyToResidency: z.boolean().optional(),
});

export async function updateShowDetails(
  input: z.infer<typeof UpdateShowDetailsSchema>,
): Promise<ActionResult> {
  return safeAction("updateShowDetails", async () => {
    await requireUser();
    const parsedInput = UpdateShowDetailsSchema.parse(input);
    await requireDealAccess(parsedInput.id);
    const { id, applyToResidency, ...rest } = parsedInput;
    let { multiDateDates } = parsedInput;

    const current = await prisma.deal.findFirst({
      where: { id, deletedAt: null },
      select: { productionId: true, coprodKnPct: true, residencyId: true },
    });
    if (!current) throw new Error("Date introuvable");
    // Date d'une production (portage KN) : le contrat artiste est celui de
    // l'exploitation — il ne se modifie que sur la fiche production.
    if (current?.productionId) delete rest.prodExePct;
    // Séances = source de vérité des payants / invités / jours / billetterie
    // (étape 2, KN) : ces champs ne sont plus écrits depuis la carte show.
    const ownsDays = (await prisma.performance.count({ where: { dealId: id } })) > 0;
    if (ownsDays) {
      delete rest.paying;
      delete rest.invited;
      delete rest.coRealGrossCa;
      delete rest.isMultiDate;
      delete rest.performanceCount;
      multiDateDates = undefined;
    }

    const data: Prisma.DealUpdateInput = {};
    // Champs simples — on copie tels quels.
    if (rest.venueDealKind !== undefined) data.venueDealKind = rest.venueDealKind;
    if (rest.prodExePct !== undefined) {
      data.prodExePct =
        rest.prodExePct != null ? new Prisma.Decimal(rest.prodExePct) : null;
      // Date hors production : marqueur de contrat déduit des deux taux (KN).
      data.artistShareKind = shareKindFor(
        rest.prodExePct,
        current.coprodKnPct != null ? Number(current.coprodKnPct) : null,
      );
    }
    if (rest.coRealKnPct !== undefined) {
      data.coRealKnPct =
        rest.coRealKnPct != null ? new Prisma.Decimal(rest.coRealKnPct) : null;
    }
    if (rest.coRealGrossCa !== undefined) {
      data.coRealGrossCa =
        rest.coRealGrossCa != null
          ? new Prisma.Decimal(rest.coRealGrossCa)
          : null;
    }
    if (rest.capacity !== undefined) data.capacity = rest.capacity;
    if (rest.paying !== undefined) data.paying = rest.paying;
    if (rest.invited !== undefined) data.invited = rest.invited;
    if (rest.isMultiDate !== undefined) data.isMultiDate = rest.isMultiDate;
    if (multiDateDates !== undefined) {
      data.multiDateDates = (multiDateDates ?? Prisma.JsonNull) as Prisma.InputJsonValue;
      // Auto-compute performanceCount depuis la longueur du tableau.
      if (multiDateDates != null) {
        data.performanceCount = multiDateDates.length;
      }
    }
    if (rest.performanceCount !== undefined && multiDateDates === undefined) {
      data.performanceCount = rest.performanceCount;
    }
    if (rest.showName !== undefined) data.showName = rest.showName;
    if (rest.endTime !== undefined) data.endTime = rest.endTime;
    if (rest.contractSigned !== undefined) data.contractSigned = rest.contractSigned;
    if (rest.ticketingReady !== undefined) data.ticketingReady = rest.ticketingReady;
    if (rest.ticketingUrl !== undefined) data.ticketingUrl = rest.ticketingUrl;
    if (rest.vhrBooked !== undefined) data.vhrBooked = rest.vhrBooked;
    if (rest.venueRoomId !== undefined) data.venueRoomId = rest.venueRoomId;

    await prisma.deal.update({ where: { id }, data });

    // Si venueDealKind, prodExePct ou le nombre de représentations (quote-part
    // des frais généraux) ont bougé → recompute financials (commissionAmount /
    // artistAmount peuvent changer).
    const financialChanged =
      rest.venueDealKind !== undefined ||
      rest.prodExePct !== undefined ||
      rest.isMultiDate !== undefined ||
      rest.performanceCount !== undefined ||
      multiDateDates !== undefined;
    if (ownsDays && (rest.capacity !== undefined || rest.venueDealKind !== undefined)) {
      // Jauge / modèle salle changés → totaux dérivés des séances recalculés.
      await syncDealFromPerformances(id);
    }
    if (rest.showName !== undefined) {
      // Nom du spectacle → rattachement à la production (+ recalcul).
      await syncDealProductionLink(id);
    } else if (financialChanged) {
      await recomputeShowFinancials(id);
      await recomputeMfForDeal(id);
    }

    if (applyToResidency && current.residencyId) {
      const keys = (Object.keys(rest) as Array<keyof typeof rest>).filter(
        (k) => rest[k] !== undefined && isResidencySharedField(k),
      );
      await propagateToResidency(id, current.residencyId, keys);
    }

    revalidatePath("/dashboard");
    revalidatePath("/shows", "layout");
    revalidateAllDealRoutes(id, financialChanged || rest.showName !== undefined);
  });
}

/**
 * Répercute les champs partagés (cf. RESIDENCY_SHARED_FIELDS) du mois `id`
 * sur les autres mois actifs de sa résidence : recalcul de chacun et, pour
 * le suivi, synchro du pipeline de tâches (comme la check-list résidence).
 */
async function propagateToResidency(id: string, residencyId: string, keys: string[]) {
  const shared = keys.filter(isResidencySharedField);
  if (shared.length === 0) return;
  const src = await prisma.deal.findUnique({ where: { id } });
  if (!src) return;
  const data = Object.fromEntries(shared.map((k) => [k, src[k]]));
  const others = await prisma.deal.findMany({
    where: { residencyId, deletedAt: null, id: { not: id } },
    select: { id: true, _count: { select: { performances: true } } },
  });
  if (others.length === 0) return;
  await prisma.deal.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data });
  const checklist = (["contractSigned", "ticketingReady", "vhrBooked"] as const).filter((k) =>
    shared.includes(k),
  );
  const financial = shared.some((k) => k === "venueDealKind" || k === "capacity");
  for (const o of others) {
    for (const k of checklist) await syncShowTaskToggle(o.id, k, src[k]);
    if (!financial) continue;
    if (o._count.performances > 0) await syncDealFromPerformances(o.id);
    await recomputeShowFinancials(o.id);
    await recomputeMfForDeal(o.id);
  }
}
