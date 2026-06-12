import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Recalcule les scalars financiers d'un deal `PROD_EXE` à partir de ses
 * lignes de production + cachets artistes.
 *
 * Formule (Stan 2026-05-27 v6 — alignée avec l'UI Part Artiste partout) :
 *
 *     revenue          = Σ ProductionLine.amount (kind = REVENUE, hors coveredByVenue)
 *     cost             = Σ ProductionLine.amount (kind = COST, hors coveredByVenue)
 *     totalCachets     = Σ DealArtiste.cachetAmount (actifs)
 *     pct              = deal.prodExePct ?? 15
 *     grossAmount      = revenue            (= CA HT)
 *     commissionPct    = pct
 *     commissionAmount = revenue × pct / 100        (= Marge Brute Pangee)
 *     artistAmount     = revenue − cost − totalCachets − commissionAmount
 *                        (= Part Artiste affichée en UI)
 *
 * Lignes `coveredByVenue = true` (mode CO_REAL : "Pris par la salle") sont
 * exclues du calcul — la salle a payé en direct, ce n'est pas une sortie
 * cash Pangee.
 *
 * Si le deal n'est pas PROD_EXE → noop. Si pas de lignes → scalars à 0.
 *
 * @see helper computeProdExeBrute (lib/finance/prod-exe-formula.ts) pour la
 *      formule Marge Brute centralisée.
 */
export async function recomputeShowFinancials(dealId: string): Promise<void> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      category: true,
      prodExePct: true,
      productionLines: {
        where: { deletedAt: null },
        select: {
          kind: true,
          amount: true,
          coveredByVenue: true,
          paymentStatus: true,
          paidAt: true,
        },
      },
      dealArtistes: {
        where: { deletedAt: null },
        select: { cachetAmount: true },
      },
    },
  });

  if (!deal) return;
  if (deal.category !== "PROD_EXE") return;

  // Totaux à partir des lignes (hors lignes "Pris par la salle").
  // Stan 2026-06-11 (audit) : on calcule aussi l'encaissement (allRevenuePaid +
  // date) avec la MÊME règle que prod-executive-list.ts, pour normaliser
  // `budgetPaymentStatus` / `budgetPaidAt` / `budgetAmount` sur le deal. Ainsi
  // le dashboard et le reporting (qui filtrent sur budgetPaymentStatus=PAID)
  // captent les deals PROD_EXE — avant ce fix ils étaient toujours invisibles.
  let revenue = 0;
  let cost = 0;
  let revenueLineCount = 0;
  let revenuePaidCount = 0;
  let encaissementDate: Date | null = null;
  for (const l of deal.productionLines) {
    if (l.coveredByVenue) continue;
    const amt = l.amount != null ? Number(l.amount) : 0;
    if (l.kind === "REVENUE") {
      revenue += amt;
      if (amt > 0) {
        revenueLineCount += 1;
        if (l.paymentStatus === "PAID") {
          revenuePaidCount += 1;
          if (l.paidAt && (!encaissementDate || l.paidAt > encaissementDate)) {
            encaissementDate = l.paidAt;
          }
        }
      }
    } else {
      cost += amt;
    }
  }
  const allRevenuePaid =
    revenueLineCount > 0 && revenuePaidCount === revenueLineCount;
  // Cachets artistes — déduits de la Part Artiste pour cohérence UI
  // (Stan 2026-05-27 v6 audit : l'UI tableau + fiche les inclut dans les
  // charges, donc le scalar artistAmount doit refléter la même logique).
  const totalCachets = deal.dealArtistes.reduce(
    (acc, da) => acc + (da.cachetAmount != null ? Number(da.cachetAmount) : 0),
    0,
  );

  const pct = deal.prodExePct != null ? Number(deal.prodExePct) : 15;
  const commissionAmount = computeProdExeBrute(revenue, pct);
  const artistAmount = revenue - cost - totalCachets - commissionAmount;

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      grossAmount: new Prisma.Decimal(revenue),
      commissionPct: new Prisma.Decimal(pct),
      commissionAmount: new Prisma.Decimal(commissionAmount),
      artistAmount: new Prisma.Decimal(artistAmount),
      // Stan 2026-06-11 : CA HT PROD_EXE = billetterie totale (décision Stan :
      // "le CA = volume d'affaires qui transite par Pangee, la marge = 15%").
      // budgetAmount sert au KPI "CA HT encaissé" du dashboard/reporting.
      budgetAmount: new Prisma.Decimal(revenue),
      // Encaissement dérivé des lignes REVENUE (cohérent avec allRevenuePaid
      // de la liste Prod Exé). Quand l'user dé-paie une ligne, le recompute
      // re-tourne et repasse en N_A / null automatiquement.
      budgetPaymentStatus: allRevenuePaid ? "PAID" : "N_A",
      budgetPaidAt: allRevenuePaid ? encaissementDate : null,
    },
  });
}

/**
 * Helper centralisé pour la Marge Brute Prod Exé.
 *
 * Anciennement dupliqué en 3 endroits (show-financials, prod-executive-list,
 * management-fees-recompute) avec risque de drift. Centralisé Stan 2026-05-27.
 *
 * @param revenue CA HT (€)
 * @param pct     Pourcentage commission Pangee (défaut 15)
 * @returns       Marge Brute en € (arrondi à l'euro)
 */
export function computeProdExeBrute(revenue: number, pct: number): number {
  if (revenue <= 0) return 0;
  return Math.round((revenue * pct) / 100);
}
