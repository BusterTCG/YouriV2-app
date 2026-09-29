import "server-only";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { computeCachetsMargeBrute } from "@/lib/finance/cachet-payroll";

/**
 * Recalcule les montants `amount` des Management Fees d'un deal en partant
 * de la nouvelle marge brute Pangee (base de calcul des MF).
 *
 * Base par catégorie :
 *   - **BOOKING** : margeYouri = budget − Σ artistes − Σ charges
 *   - **PROD_EXE** : margeYouri = part Pangee de la date (`Deal.commissionAmount`
 *     = prod-exé % du CA + co-prod % du bénéfice, frais généraux inclus),
 *     calculée par lib/finance/show-financials.ts — refonte Production 2026-09-29
 *   - **CACHETS** : margeYouri = budget × cachetsFeesPct%  (Stan 2026-05-28)
 *
 * À appeler **après** toute action qui modifie la marge brute :
 *   - updateDealBudget (Booking)
 *   - addDealArtist / removeDealArtist / updateDealArtiste (Booking)
 *   - addDealCharge / removeDealCharge / updateDealCharge (Booking)
 *   - upsertProductionLine / deleteProductionLine (Prod Exé)
 *   - updateShowDetails (changement venueDealKind / prodExePct, Prod Exé)
 *   - recomputeProductionFinancials (contrat, frais généraux — toutes les dates)
 *
 * Logique :
 *   - Si margeYouri ≤ 0 → tous les amounts MF passent à 0 (cohérent avec le
 *     bandeau "Pas de management fees" affiché côté UI quand marge négative)
 *   - Si margeYouri > 0 → amount = margeYouri × sharePct / 100 (snapshot
 *     classique). Le sharePct défini par l'user reste inchangé.
 *   - paymentStatus + paidAt + notes restent intacts (pas de reset
 *     destructif sur des paiements déjà faits).
 */
export async function recomputeMfForDeal(dealId: string): Promise<void> {
  if (!dealId) return;

  // Fetch deal + entités qui composent la marge + fees actifs
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      category: true,
      budgetAmount: true,
      commissionAmount: true,
      cachetsFeesPct: true,
      linkedToOwnProd: true,
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
        select: { id: true, sharePct: true, paymentStatus: true },
      },
    },
  });
  if (!deal || deal.managementFees.length === 0) return;

  let margeYouri: number;
  if (deal.category === "PROD_EXE") {
    // Marge brute Pangee = part Pangee de la date (prod-exé + co-prod), déjà
    // recalculée par recomputeShowFinancials (appelé avant ce recompute).
    margeYouri = deal.commissionAmount != null ? Number(deal.commissionAmount) : 0;
  } else if (deal.category === "CACHETS") {
    // Marge brute Pangee = Σ prestations − Σ cachets bruts (Stan 2026-06-17).
    // Pangee facture le tiers, paie le cachet brut à l'artiste, garde la diff.
    // Si `linkedToOwnProd` → cachet versé dans le cadre d'un spectacle produit
    // par Pangee elle-même, pas de marge à dégager (trace paie GUSO uniquement).
    const budget = deal.budgetAmount != null ? Number(deal.budgetAmount) : 0;
    const cachetBrut = deal.dealArtistes.reduce(
      (acc, a) => acc + (a.cachetAmount != null ? Number(a.cachetAmount) : 0),
      0,
    );
    margeYouri = computeCachetsMargeBrute(budget, cachetBrut, deal.linkedToOwnProd);
  } else {
    // BOOKING : marge = budget − artistes − charges
    const budget = deal.budgetAmount != null ? Number(deal.budgetAmount) : 0;
    const totalArtistes = deal.dealArtistes.reduce(
      (acc, a) => acc + (a.cachetAmount != null ? Number(a.cachetAmount) : 0),
      0,
    );
    const totalCharges = deal.dealCharges.reduce(
      (acc, c) => acc + (c.amount != null ? Number(c.amount) : 0),
      0,
    );
    margeYouri = budget - totalArtistes - totalCharges;
  }

  // Update les fees NON payés en parallèle — le sharePct ne change pas, juste
  // l'amount snapshot.
  //
  // Stan 2026-06-11 (audit) : on SKIPPE les lignes déjà PAID. Le montant d'un
  // MF payé est un snapshot du virement réel effectué — le réécrire (ex. après
  // ajout d'une charge oubliée) falsifierait l'historique de rémunération
  // (la ligne "Payé 500 €" deviendrait "Payé 450 €" alors que le virement
  // était bien de 500 €). Tant qu'une ligne n'est pas versée, on la recalcule
  // normalement à chaque mutation de marge.
  const recomputable = deal.managementFees.filter(
    (fee) => fee.paymentStatus !== "PAID",
  );
  await Promise.all(
    recomputable.map((fee) => {
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
  // try/catch : ce recalcul tourne aussi hors requête Next (répétition
  // pré-déploiement, scripts) où revalidatePath n'est pas disponible.
  try {
    revalidatePath("/deals/management-fees");
  } catch {
    // hors contexte Next : rien à invalider
  }
}
