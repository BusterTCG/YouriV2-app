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
};

export async function getProductionReport(
  productionId: string,
  nowMs: number,
): Promise<ProductionReport | null> {
  const [production] = await getProductionSummaries({ id: productionId }, nowMs);
  if (!production) return null;
  const rates = productionRates(production);
  const played = production.deals.filter((d) => d.isPast || d.status === "ANNULE");
  const dates = played.map((d) => ({ ...d, finance: financeOf([d]) }));
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
