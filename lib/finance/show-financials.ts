import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  allocateOverhead,
  computeShowScalars,
  performanceCountOf,
  residencyContractOf,
  type OverheadAllocation,
} from "@/lib/finance/production-overhead";
import { recomputeMfForDeal } from "@/lib/management-fees-recompute";
import { syncArtistStatuses } from "@/lib/finance/artist-account-server";

/**
 * Calcule et persiste les financials d'une date `PROD_EXE` (portage de la
 * refonte « Production » KN, Stan 2026-09-29).
 *
 * Les scalars `Deal.grossAmount / commissionPct / commissionAmount /
 * artistAmount` ne sont PAS saisis : ils dérivent des `ProductionLine`
 * (recettes & charges), des cachets artistes (`DealArtiste.cachetAmount`,
 * comptés en charges — spécificité Youri), de la quote-part des frais
 * généraux de la Production, et du contrat artiste (deux taux cumulables) :
 *
 *     revenue  = Σ lignes REVENUE (hors coveredByVenue)
 *     cost     = Σ lignes COST (hors coveredByVenue) + Σ cachets + quote-part frais généraux
 *     knFee    = revenue × prodExePct %            (prod-exé Pangee)
 *     profit   = revenue − cost − knFee
 *     knShare  = profit × coprodKnPct %            (co-prod Pangee)
 *     commissionAmount = knFee + knShare           (= part Pangee = base des management fees)
 *     artistAmount     = profit − knShare          (= Part Artiste)
 *
 * Avec co-prod à 0 (cas historique Youri) : commission = CA × 15 %, part
 * artiste = CA − charges − cachets − commission — identique à l'ancien calcul.
 *
 * Si la date appartient à une Production, c'est toute la production qui est
 * recalculée (la quote-part de frais généraux dépend de l'ensemble des dates),
 * puis les management fees de chaque date (leur base = part Pangee).
 */
export async function recomputeShowFinancials(dealId: string): Promise<void> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { category: true, productionId: true },
  });
  if (!deal) return;
  if (deal.category !== "PROD_EXE") return;
  if (deal.productionId) {
    await recomputeProductionFinancials(deal.productionId);
    return;
  }
  await writeDealScalars(dealId, 0);
  await recomputeMfForDeal(dealId);
}

/** Recalcule toutes les dates d'une production (quote-parts + scalars + MF). */
export async function recomputeProductionFinancials(
  productionId: string,
): Promise<void> {
  await syncProductionContract(productionId);
  const allocation = await getProductionOverheadAllocation(productionId);
  for (const [dealId, share] of allocation.byDeal) {
    await writeDealScalars(dealId, share);
  }
  // Parts artiste / encaissements changés → statuts artiste dérivés du compte
  // artiste (KN) — AVANT les management fees, dont la disponibilité lit ce
  // statut.
  await syncArtistStatuses(productionId);
  for (const dealId of allocation.byDeal.keys()) {
    // La part Pangee de chaque date a pu bouger (frais généraux, contrat) →
    // base des management fees à jour (les lignes déjà payées restent figées).
    await recomputeMfForDeal(dealId);
  }
}

/**
 * Contrat artiste = accord de l'exploitation (KN, Stan 2026-09-28) : prod-exé %
 * et / ou co-prod %, fixés sur la production et hérités par TOUTES ses dates.
 * Une date ne choisit que son modèle salle (co-réalisation / location /
 * cession), qui détermine le CA perçu par Pangee.
 */
async function syncProductionContract(productionId: string): Promise<void> {
  const prod = await prisma.production.findUnique({ where: { id: productionId } });
  if (!prod) return;
  // Dates uniques (tournée) → contrat principal.
  await prisma.deal.updateMany({
    where: { productionId, residencyId: null },
    data: {
      artistShareKind: prod.artistShareKind,
      prodExePct: prod.prodExePct,
      coprodKnPct: prod.coprodKnPct,
    },
  });
  // Mois de résidence → contrat « Résidences » s'il est distinct (KN, Stan
  // 2026-09-29), sinon le même.
  const res = residencyContractOf(prod);
  await prisma.deal.updateMany({
    where: { productionId, residencyId: { not: null } },
    data: {
      artistShareKind: res.artistShareKind,
      prodExePct: res.prodExePct,
      coprodKnPct: res.coprodKnPct,
    },
  });
}

/**
 * Répartition des frais généraux d'une production sur ses dates (non
 * supprimées).
 */
export async function getProductionOverheadAllocation(
  productionId: string,
): Promise<OverheadAllocation> {
  const [deals, overheads] = await Promise.all([
    prisma.deal.findMany({
      where: { productionId, category: "PROD_EXE", deletedAt: null },
      select: {
        id: true,
        status: true,
        isMultiDate: true,
        performanceCount: true,
        multiDateDates: true,
      },
      // Tiebreak id : même date → même ordre partout (reliquat d'arrondi).
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
    prisma.productionOverhead.findMany({
      where: { productionId },
      select: { amount: true },
    }),
  ]);
  const total = overheads.reduce((s, o) => s + Number(o.amount), 0);
  return allocateOverhead(
    deals.map((d) => ({
      id: d.id,
      status: d.status,
      performances: performanceCountOf(d),
    })),
    total,
  );
}

async function writeDealScalars(dealId: string, overheadShare: number) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      artistShareKind: true,
      coprodKnPct: true,
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

  // Totaux à partir des lignes (hors lignes "Pris par la salle" : la salle a
  // payé en direct, ce n'est pas une sortie cash Pangee).
  // Stan 2026-06-11 (audit) : on calcule aussi l'encaissement (allRevenuePaid +
  // date) pour normaliser `budgetPaymentStatus` / `budgetPaidAt` /
  // `budgetAmount` — le dashboard et le reporting filtrent dessus.
  let revenue = 0;
  let cost = overheadShare;
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
  // Cachets artistes — charges de la date (Stan 2026-05-27 v6).
  cost += totalCachets(deal.dealArtistes);

  const scalars = computeShowScalars(revenue, cost, {
    artistShareKind: deal.artistShareKind,
    coprodKnPct: deal.coprodKnPct != null ? Number(deal.coprodKnPct) : null,
    prodExePct: deal.prodExePct != null ? Number(deal.prodExePct) : null,
  });

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      // Pas de contrat défini → scalars à null (pas de montants stale).
      ...(scalars
        ? {
            grossAmount: new Prisma.Decimal(scalars.base),
            commissionPct: new Prisma.Decimal(scalars.pct),
            commissionAmount: new Prisma.Decimal(scalars.knAmount),
            artistAmount: new Prisma.Decimal(scalars.artistAmount),
          }
        : {
            grossAmount: null,
            commissionPct: null,
            commissionAmount: null,
            artistAmount: null,
          }),
      // Stan 2026-06-11 : CA HT PROD_EXE = billetterie totale ("le CA = volume
      // d'affaires qui transite par Pangee"). budgetAmount sert au KPI "CA HT
      // encaissé" du dashboard/reporting.
      budgetAmount: new Prisma.Decimal(revenue),
      budgetPaymentStatus: allRevenuePaid ? "PAID" : "N_A",
      budgetPaidAt: allRevenuePaid ? encaissementDate : null,
    },
  });
}

function totalCachets(rows: Array<{ cachetAmount: Prisma.Decimal | null }>): number {
  return rows.reduce(
    (acc, da) => acc + (da.cachetAmount != null ? Number(da.cachetAmount) : 0),
    0,
  );
}

/**
 * Helper centralisé pour la rémunération prod-exé (CA × %), arrondie à
 * l'euro. Conservé pour les écrans qui affichent le taux prod-exé seul.
 */
export function computeProdExeBrute(revenue: number, pct: number): number {
  if (revenue <= 0) return 0;
  return Math.round((revenue * pct) / 100);
}
