import "server-only";

// Bilan d'exploitation d'une production (portage KN, Stan 2026-09-27) —
// données communes aux deux sorties : Excel (lib/finance/production-report-
// excel.ts) et PDF (page d'impression /print/production/[id] rendue par
// Chromium). Calculs purs : lib/production-report.ts.
//
// ⚠️ Les management fees (tambouille interne Pangee) n'apparaissent JAMAIS
// dans le bilan (garanti par tests/finance/no-management-fees.test.ts).

import {
  getProductionSummaries,
  type ProductionDealView,
  type ProductionSummary,
} from "@/lib/productions";
import {
  audienceOf,
  computeKpis,
  contractLabel,
  financeOf,
  productionRates,
  type AudienceTotals,
  type FinanceBlock,
  type ReportRates,
  type ShowKpis,
} from "@/lib/production-report";
import { getArtistAccount, type ArtistAccountView } from "@/lib/finance/artist-account-server";
import { prisma } from "@/lib/db";
import { PRODUCTION_LINE_LABELS } from "@/lib/production-line-labels";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

/** Dépense déjà payée sur une date à venir (charge ou cachet). */
export type PaidUpcomingExpense = {
  id: string;
  /** « 14/11/26 », ou « nov. 2026 » pour un mois de résidence. */
  dateLabel: string;
  /** « Location salle · Dix Heures à Paris » */
  label: string;
  amount: number;
};

export type ProductionReport = {
  production: ProductionSummary;
  generatedAt: Date;
  /** Contrat de la production (structure du compte d'exploitation). */
  rates: ReportRates;
  /** Dates à venir, non comptées dans le bilan (état à date — Stan 2026-10-01 :
   *  plus d'« estimé », seulement le réalisé). */
  upcomingCount: number;
  /** Frais généraux non répartis (aucune date active pour les porter). */
  unallocatedOverhead: number;
  contractLabel: string;
  /** Dates jouées (et annulées) — les dates à venir ne figurent pas au bilan. */
  dates: Array<ProductionDealView & { finance: FinanceBlock }>;
  /** Totaux des dates jouées. */
  audience: AudienceTotals;
  finance: FinanceBlock;
  /** Indicateurs visuels (dates jouées). */
  kpis: ShowKpis;
  /** Compte artiste (quote-parts versées, solde). */
  account: ArtistAccountView;
  /** Dépenses déjà payées sur les dates à venir (Stan 2026-11-02) : hors
   *  résultat des dates jouées et hors compte artiste, déduites du net à date
   *  (`finance.result − paidUpcomingTotal`). */
  paidUpcoming: PaidUpcomingExpense[];
  paidUpcomingTotal: number;
};

/** Charges et cachets déjà sortis de la trésorerie sur des dates à venir. */
async function paidUpcomingExpenses(dates: ProductionDealView[]): Promise<PaidUpcomingExpense[]> {
  if (dates.length === 0) return [];
  const dealIds = dates.map((d) => d.id);
  const [lines, cachets] = await Promise.all([
    prisma.productionLine.findMany({
      where: {
        dealId: { in: dealIds },
        kind: "COST",
        deletedAt: null,
        coveredByVenue: false,
        OR: [{ paymentStatus: "PAID" }, { paidByArtist: true }],
      },
      select: { id: true, dealId: true, label: true, customLabel: true, amount: true, order: true },
      orderBy: { order: "asc" },
    }),
    prisma.dealArtiste.findMany({
      where: { dealId: { in: dealIds }, deletedAt: null, paymentStatus: "PAID" },
      select: { id: true, dealId: true, cachetAmount: true, artist: { select: { name: true } } },
    }),
  ]);
  return dates.flatMap((d) => {
    const dateLabel = d.isMultiDate
      ? format(new Date(`${d.monthKey}-01T12:00:00Z`), "MMM yyyy", { locale: fr })
      : format(d.date, "dd/MM/yy");
    const venue = d.venueName ?? d.title;
    return [
      ...lines
        .filter((l) => l.dealId === d.id)
        .map((l) => ({
          id: l.id,
          dateLabel,
          label: `${l.customLabel || PRODUCTION_LINE_LABELS[l.label]} · ${venue}`,
          amount: Number(l.amount ?? 0),
        })),
      ...cachets
        .filter((c) => c.dealId === d.id)
        .map((c) => ({
          id: c.id,
          dateLabel,
          label: `Cachet ${c.artist.name} · ${venue}`,
          amount: Number(c.cachetAmount ?? 0),
        })),
    ].filter((e) => Math.round(e.amount * 100) !== 0);
  });
}

export async function getProductionReport(
  productionId: string,
  nowMs: number,
): Promise<ProductionReport | null> {
  const [production] = await getProductionSummaries({ id: productionId }, nowMs);
  if (!production) return null;
  const rates = productionRates(production);
  const played = production.deals.filter((d) => d.isPast || d.status === "ANNULE");
  const dates = played.map((d) => ({ ...d, finance: financeOf([d]) }));
  const paidUpcoming = await paidUpcomingExpenses(
    production.deals.filter((d) => !d.isPast && d.status !== "ANNULE"),
  );
  return {
    production,
    generatedAt: new Date(nowMs),
    rates,
    upcomingCount: production.deals.length - played.length,
    unallocatedOverhead: production.unallocatedOverhead,
    contractLabel: contractLabel(production),
    dates,
    audience: audienceOf(production.deals.filter((d) => d.isPast)),
    account: await getArtistAccount(productionId, nowMs),
    kpis: computeKpis(production.deals, "realized"),
    finance: financeOf(production.deals.filter((d) => d.isPast)),
    paidUpcoming,
    paidUpcomingTotal: paidUpcoming.reduce((s, e) => s + e.amount, 0),
  };
}

/** Nom de fichier : "Bilan exploitation - Artiste - Spectacle - AAAA-MM-JJ". */
export function reportFileBase(r: ProductionReport): string {
  const d = r.generatedAt.toISOString().slice(0, 10);
  return `Bilan exploitation - ${r.production.artist.name} - ${r.production.name} - ${d}`
    .replace(/[^\w\s\-àâäéèêëîïôöùûüç]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
