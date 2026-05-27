"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, VenueDealKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { recomputeShowFinancials } from "@/lib/finance/show-financials";
import { recomputeMfForDeal } from "@/lib/management-fees-recompute";

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
});

export async function updateShowDetails(
  input: z.infer<typeof UpdateShowDetailsSchema>,
): Promise<ActionResult> {
  return safeAction("updateShowDetails", async () => {
    await requireUser();
    const { id, multiDateDates, ...rest } =
      UpdateShowDetailsSchema.parse(input);

    const data: Prisma.DealUpdateInput = {};
    // Champs simples — on copie tels quels.
    if (rest.venueDealKind !== undefined) data.venueDealKind = rest.venueDealKind;
    if (rest.prodExePct !== undefined) {
      data.prodExePct =
        rest.prodExePct != null ? new Prisma.Decimal(rest.prodExePct) : null;
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

    // Si venueDealKind ou prodExePct ont bougé → recompute financials
    // (commissionAmount / artistAmount peuvent changer).
    const financialChanged =
      rest.venueDealKind !== undefined || rest.prodExePct !== undefined;
    if (financialChanged) {
      await recomputeShowFinancials(id);
      await recomputeMfForDeal(id);
    }

    revalidatePath("/deals/prod-executive");
    revalidatePath(`/deals/prod-executive/${id}`);
    if (financialChanged) revalidatePath("/deals/management-fees");
  });
}
