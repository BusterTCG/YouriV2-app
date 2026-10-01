// Calculs purs de la refonte "Production" (étape 1, validée Stan 2026-09-27) :
// - nombre de représentations d'une date (single / mois complet),
// - répartition des frais généraux d'une production au prorata des
//   représentations (dates annulées exclues, dates futures incluses),
// - répartition Pangee ↔ artiste d'une date selon son contrat.
//
// Module pur (pas de Prisma) : importable côté client, serveur et tests.

import type { ArtistShareKind, DealStatus } from "@prisma/client";

/** Champs d'un Deal SPECTACLE nécessaires au comptage des représentations. */
export type PerformanceSource = {
  isMultiDate: boolean;
  performanceCount: number | null;
  multiDateDates: unknown;
};

/**
 * Nombre de représentations portées par une date :
 * - `performanceCount` = nombre de séances (étape 2 : dérivé des séances,
 *   un doublé compte pour 2) — prioritaire dès qu'il est renseigné ;
 * - legacy : date simple → 1, mois complet → jours cochés, sinon 1.
 */
export function performanceCountOf(d: PerformanceSource): number {
  // Compteur dérivé des séances : 0 = toutes les séances annulées → la date
  // ne porte aucune représentation (pas de frais généraux). null = legacy.
  if (d.performanceCount != null) return d.performanceCount;
  if (!d.isMultiDate) return 1;
  const dates = Array.isArray(d.multiDateDates)
    ? d.multiDateDates.filter((v): v is string => typeof v === "string")
    : [];
  return dates.length > 0 ? dates.length : 1;
}

export type OverheadAllocation = {
  /** Total des frais généraux de la production. */
  total: number;
  /** Nombre de représentations non annulées (base du prorata). */
  totalPerformances: number;
  /** Quote-part par représentation (0 si aucune représentation). */
  perPerformance: number;
  /** Quote-part de chaque date (0 pour les annulées). Somme = total au centime. */
  byDeal: Map<string, number>;
  /** Frais non répartis (aucune représentation active) — à signaler dans l'UI. */
  unallocated: number;
};

/**
 * Répartit `total` au prorata des représentations. Arrondi au centime ; le
 * reliquat d'arrondi est porté par la dernière date active pour que la somme
 * des quotes-parts retombe exactement sur le total.
 *
 * Dates soldées (Stan 2026-10-01, lot 3) : `frozenShare` renseigné → la date
 * garde sa quote-part figée au solde ; le reste (total − parts figées) est
 * réparti sur les seules dates non soldées. Sans date non soldée pour le
 * porter, ce reste est « non réparti ».
 */
export function allocateOverhead(
  deals: Array<{ id: string; status: DealStatus; performances: number; frozenShare?: number | null }>,
  total: number,
): OverheadAllocation {
  const byDeal = new Map<string, number>();
  for (const d of deals) byDeal.set(d.id, 0);
  const frozen = deals.filter((d) => d.frozenShare != null);
  for (const d of frozen) byDeal.set(d.id, d.frozenShare ?? 0);
  const frozenTotal = round2(frozen.reduce((s, d) => s + (d.frozenShare ?? 0), 0));
  const remaining = round2(total - frozenTotal);

  const active = deals.filter(
    (d) => d.frozenShare == null && d.status !== "ANNULE" && d.performances > 0,
  );
  const totalPerformances = active.reduce((s, d) => s + d.performances, 0);

  if (totalPerformances === 0 || remaining === 0) {
    return {
      total,
      totalPerformances,
      perPerformance: 0,
      byDeal,
      unallocated: totalPerformances === 0 ? remaining : 0,
    };
  }

  const perPerformance = remaining / totalPerformances;
  let allocated = 0;
  active.forEach((d, i) => {
    const share =
      i === active.length - 1
        ? round2(remaining - allocated)
        : round2(perPerformance * d.performances);
    allocated = round2(allocated + share);
    byDeal.set(d.id, share);
  });

  return { total, totalPerformances, perPerformance, byDeal, unallocated: 0 };
}

export type ShowContract = {
  /** Marqueur « contrat défini » (null = pas de contrat artiste). */
  artistShareKind: ArtistShareKind | null;
  /** Co-prod : % du bénéfice (après prod-exé) qui revient à Pangee. */
  coprodKnPct: number | null;
  /** Prod-exé : % du CA qui revient à Pangee. */
  prodExePct: number | null;
};

/**
 * Taux du contrat artiste (Stan 2026-09-28 : plus de choix exclusif, deux
 * pourcentages cumulables). null = pas de contrat.
 */
export function contractRates(c: ShowContract): { pe: number; cp: number } | null {
  if (!c.artistShareKind) return null;
  return { pe: c.prodExePct ?? 0, cp: c.coprodKnPct ?? 0 };
}

/**
 * Marqueur « contrat défini » déduit des deux taux (plus de choix exclusif) :
 * null si aucun taux, PROD_EXE s'il y a une part prod-exé, sinon COPROD.
 */
export function shareKindFor(pe: number | null | undefined, cp: number | null | undefined): ArtistShareKind | null {
  if (pe == null && cp == null) return null;
  if ((pe ?? 0) > 0) return "PROD_EXE";
  return "COPROD";
}

/** « Prod-exé 15 % du CA · Co-prod 20 % du bénéfice » (parties à 0 omises). */
export function contractSummary(c: ShowContract): string {
  const r = contractRates(c);
  if (!r) return "Contrat non défini";
  const parts = [
    r.pe > 0 && `Prod-exé ${r.pe} % du CA`,
    r.cp > 0 && `Co-prod ${r.cp} % du bénéfice`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Aucune part Pangee";
}

/**
 * Production avec contrat « Résidences » optionnel (Stan 2026-09-29) : les
 * mois de résidence peuvent avoir leurs propres taux, les dates uniques
 * gardent le contrat principal. Générique sur le type des taux (Decimal
 * Prisma ou number).
 */
export type ProductionContracts<N> = {
  artistShareKind: ArtistShareKind | null;
  coprodKnPct: N | null;
  prodExePct: N | null;
  residencyContractSeparate: boolean;
  residencyArtistShareKind: ArtistShareKind | null;
  residencyCoprodKnPct: N | null;
  residencyProdExePct: N | null;
};

/** Contrat appliqué aux mois de résidence d'une production. */
export function residencyContractOf<N>(p: ProductionContracts<N>): {
  artistShareKind: ArtistShareKind | null;
  coprodKnPct: N | null;
  prodExePct: N | null;
} {
  return p.residencyContractSeparate
    ? {
        artistShareKind: p.residencyArtistShareKind,
        coprodKnPct: p.residencyCoprodKnPct,
        prodExePct: p.residencyProdExePct,
      }
    : { artistShareKind: p.artistShareKind, coprodKnPct: p.coprodKnPct, prodExePct: p.prodExePct };
}

/** Résumé du contrat d'une production, avec le contrat résidences s'il diffère. */
export function productionContractSummary(p: ProductionContracts<number>): string {
  const main = contractSummary(p);
  if (!p.residencyContractSeparate) return main;
  return `${main} · Résidences : ${contractSummary(residencyContractOf(p))}`;
}

export type ShowScalars = {
  /** Base affichée (Deal.grossAmount) : bénéfice en co-prod pure, sinon CA. */
  base: number;
  /** % affiché (Deal.commissionPct) : taux effectif de Pangee sur la base. */
  pct: number;
  knAmount: number;
  artistAmount: number;
  /** Rémunération prod-exé (% du CA). */
  knFee: number;
  /** Bénéfice à partager (résultat − rémunération prod-exé). */
  profit: number;
  /** Part co-prod de Pangee sur le bénéfice. */
  knShare: number;
};

/**
 * Répartition Pangee ↔ artiste d'une date (charges = lignes + quote-part frais
 * généraux), dans cet ordre (validé Stan 2026-09-28) :
 *   1. prod-exé : Pangee prend pe % du CA ;
 *   2. co-prod  : le bénéfice restant (résultat − prod-exé) est partagé,
 *      Pangee cp %, artiste le reste.
 * Prod-exé seul (cp = 0) et co-prod seul (pe = 0) sont des cas particuliers.
 * Parts arrondies à l'euro sur chaque date (montants versés en euros
 * entiers) : la somme des dates peut donc différer de quelques euros du
 * partage calculé sur le résultat global.
 * Retourne null si aucun contrat n'est défini.
 */
export function computeShowScalars(
  revenue: number,
  cost: number,
  contract: ShowContract,
): ShowScalars | null {
  const r = contractRates(contract);
  if (!r) return null;
  const margin = revenue - cost;
  const knFee = Math.round(revenue * (r.pe / 100));
  const profit = margin - knFee;
  const knShare = Math.round(profit * (r.cp / 100));
  const knAmount = knFee + knShare;
  const artistAmount = profit - knShare;
  if (r.pe === 0) return { base: margin, pct: r.cp, knAmount, artistAmount, knFee, profit, knShare };
  if (r.cp === 0) return { base: revenue, pct: r.pe, knAmount, artistAmount, knFee, profit, knShare };
  return {
    base: revenue,
    pct: revenue ? round2((knAmount / revenue) * 100) : 0,
    knAmount,
    artistAmount,
    knFee,
    profit,
    knShare,
  };
}

/** P&L d'une date à partir de ses lignes + quote-part de frais généraux. */
export function dealPnl(
  lines: Array<{ kind: "REVENUE" | "COST"; amount: number }>,
  overheadShare: number,
  contract: ShowContract,
) {
  let revenue = 0;
  let lineCost = 0;
  for (const l of lines) {
    if (l.kind === "REVENUE") revenue += l.amount;
    else lineCost += l.amount;
  }
  const cost = lineCost + overheadShare;
  const scalars = computeShowScalars(revenue, cost, contract);
  return {
    revenue,
    lineCost,
    overheadShare,
    cost,
    margin: revenue - cost,
    knAmount: scalars?.knAmount ?? null,
    artistAmount: scalars?.artistAmount ?? null,
    knFee: scalars?.knFee ?? 0,
    knShare: scalars?.knShare ?? 0,
    profit: scalars?.profit ?? revenue - cost,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
