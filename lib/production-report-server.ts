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
  /** Des dates restent à jouer → on affiche Réalisé + Estimé ; sinon Total seul. */
  hasUpcoming: boolean;
  /** Frais généraux non répartis (aucune date active pour les porter). */
  unallocatedOverhead: number;
  contractLabel: string;
  dates: Array<ProductionDealView & { finance: FinanceBlock }>;
  audience: { realized: AudienceTotals; forecast: AudienceTotals };
  finance: { realized: FinanceBlock; forecast: FinanceBlock };
  /** Indicateurs visuels (dates jouées ; toute l'exploitation si rien de joué). */
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
  const dates = production.deals.map((d) => ({ ...d, finance: financeOf([d]) }));
  return {
    production,
    generatedAt: new Date(nowMs),
    rates,
    hasUpcoming: production.deals.some((d) => !d.isPast && d.status !== "ANNULE"),
    unallocatedOverhead: production.unallocatedOverhead,
    contractLabel: contractLabel(production),
    dates,
    audience: {
      realized: audienceOf(production.deals.filter((d) => d.isPast)),
      forecast: audienceOf(production.deals),
    },
    account: await getArtistAccount(productionId, nowMs),
    kpis: computeKpis(
      production.deals,
      production.deals.some((d) => d.isPast && d.status !== "ANNULE") ? "realized" : "all",
    ),
    finance: {
      realized: financeOf(production.deals.filter((d) => d.isPast)),
      forecast: financeOf(production.deals),
    },
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
