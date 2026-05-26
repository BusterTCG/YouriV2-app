import "server-only";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

/**
 * Recalcule les montants `amount` des Management Fees d'un deal en partant
 * de la nouvelle marge Youri (Budget − Artistes − Charges).
 *
 * À appeler **après** toute action qui modifie la marge :
 *   - updateDealBudget (montant ou statut)
 *   - addDealArtist / removeDealArtist / updateDealArtiste (cachetAmount)
 *   - addDealCharge / removeDealCharge / updateDealCharge (amount)
 *
 * Logique :
 *   - Si margeYouri ≤ 0 → tous les amounts MF passent à 0 (cohérent avec le
 *     bandeau "Pas de management fees" affiché côté UI quand marge négative)
 *   - Si margeYouri > 0 → amount = margeYouri × sharePct / 100 (snapshot
 *     classique). Le sharePct défini par l'user reste inchangé.
 *   - paymentStatus + paidAt + notes restent intacts (pas de reset
 *     destructif sur des paiements déjà faits).
 *
 * Stan 2026-05-26 : "si le budget est modifié, les montants MF doivent
 * recalculer automatiquement".
 */
export async function recomputeMfForDeal(dealId: string): Promise<void> {
  if (!dealId) return;

  // Fetch deal + entités qui composent la marge + fees actifs
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      budgetAmount: true,
      dealArtistes: {
        where: { deletedAt: null },
        select: { cachetAmount: true },
      },
      dealCharges: {
        where: { deletedAt: null },
        select: { amount: true },
      },
      managementFees: {
        where: { deletedAt: null },
        select: { id: true, sharePct: true },
      },
    },
  });
  if (!deal || deal.managementFees.length === 0) return;

  const budget = deal.budgetAmount != null ? Number(deal.budgetAmount) : 0;
  const totalArtistes = deal.dealArtistes.reduce(
    (acc, a) => acc + (a.cachetAmount != null ? Number(a.cachetAmount) : 0),
    0,
  );
  const totalCharges = deal.dealCharges.reduce(
    (acc, c) => acc + (c.amount != null ? Number(c.amount) : 0),
    0,
  );
  const margeYouri = budget - totalArtistes - totalCharges;

  // Update tous les fees en parallèle — le sharePct ne change pas, juste
  // l'amount snapshot.
  await Promise.all(
    deal.managementFees.map((fee) => {
      const sharePctNum = Number(fee.sharePct);
      const amount =
        margeYouri > 0
          ? Math.round((margeYouri * sharePctNum) / 100)
          : 0;
      return prisma.dealManagementFee.update({
        where: { id: fee.id },
        data: { amount },
      });
    }),
  );

  // La page liste /deals/management-fees agrège tous les fees → invalider son
  // cache pour que les nouveaux amounts soient visibles immédiatement (audit
  // 2026-05-26 : sinon stale après chaque modif budget/cachet/charge).
  revalidatePath("/deals/management-fees");
}
