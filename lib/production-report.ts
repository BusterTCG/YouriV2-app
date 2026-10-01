// Compte d'exploitation d'une production (portage KN, Stan 2026-09-29) —
// données communes à l'onglet Résultats et (étape 5) au bilan Excel / PDF.
//
// Transparence totale : chaque poste de recette / charge est détaillé, et la
// part Pangee apparaît selon le contrat :
//   - prod-exé : Pangee prend x % du CA → ligne « Rémunération prod-exé
//     Pangee » DANS les charges, le compte se termine sur le net artiste ;
//   - co-prod  : CA − charges − frais généraux − prod-exé = bénéfice, partagé
//     À LA FIN entre Pangee et l'artiste.
//
// ⚠️ Les management fees (tambouille interne Pangee) n'apparaissent JAMAIS
// ici : ce module ne les lit pas (garanti par tests/finance/no-management-fees).
//
// Spécificité Youri : les cachets artistes (`DealArtiste.cachetAmount`) sont
// une charge de la date → ligne « Cachets artistes ».

import type { ProductionLineLabel } from "@prisma/client";
import {
  contractRates,
  residencyContractOf,
  type ProductionContracts,
} from "@/lib/finance/production-overhead";
import type { ProductionDealView } from "@/lib/productions";
import {
  COST_LABELS,
  PRODUCTION_LINE_LABELS,
  REVENUE_LABELS,
} from "@/lib/production-line-labels";

export { COST_LABELS, REVENUE_LABELS };

/**
 * Ordre des charges dans le compte : frais généraux juste après la SACD (KN),
 * cachets artistes juste après la location (ordre du tableau de production
 * Youri).
 */
export type CostRow = ProductionLineLabel | "OVERHEAD" | "CACHETS";
export const COST_ROWS: CostRow[] = [
  "CNM",
  "SACD",
  "OVERHEAD",
  "LOCATION",
  "CACHETS",
  "VHR",
  "COM",
  "TECH",
  "CAPTA",
  "AUTRE",
];
export function costRowLabel(c: CostRow, short = false): string {
  if (c === "OVERHEAD") return short ? "Frais gén." : "Frais généraux";
  if (c === "CACHETS") return short ? "Cachets" : "Cachets artistes";
  return short ? REPORT_LINE_SHORT[c] : REPORT_LINE_LABELS[c];
}
export function costRowValue(f: FinanceBlock, c: CostRow): number {
  if (c === "OVERHEAD") return f.overhead;
  if (c === "CACHETS") return f.cachets;
  return f.byLabel[c];
}

/** Libellés des postes dans le compte (colonnes courtes pour le détail). */
export const REPORT_LINE_LABELS: Record<ProductionLineLabel, string> = {
  ...PRODUCTION_LINE_LABELS,
  RECETTE_HT: "Billetterie HT",
  DL_PROD: "DL Prod",
};
export const REPORT_LINE_SHORT: Record<ProductionLineLabel, string> = {
  RECETTE_HT: "Billet. HT",
  DL_PROD: "DL Prod",
  CNM: "CNM",
  SACD: "SACD",
  LOCATION: "Location",
  VHR: "VHR",
  COM: "Comm.",
  TECH: "Technique",
  CAPTA: "Captation",
  AUTRE: "Autre",
};

export type AudienceTotals = {
  performances: number;
  paying: number;
  invited: number;
  /** Jauge cumulée (jauge × représentations) des dates où payants ET jauge sont saisis. */
  capacity: number;
  /** Payants ÷ jauge cumulée, en % — null si rien de saisi. */
  fillRate: number | null;
};

/** Compte de résultat d'un périmètre (production, mois, date). */
export type FinanceBlock = {
  byLabel: Record<ProductionLineLabel, number>;
  revenue: number;
  /** Charges saisies sur les dates (tous postes + cachets). */
  lineCost: number;
  /** Cachets artistes (inclus dans lineCost). */
  cachets: number;
  overhead: number;
  /** Rémunération prod-exé de Pangee (% du CA), comptée en charge. */
  knFee: number;
  /** Total des charges (postes + cachets + frais généraux + rémunération prod-exé). */
  totalCost: number;
  /** Bénéfice après prod-exé (= à partager en co-prod, = net artiste sinon). */
  result: number;
  /** Part co-prod de Pangee sur le bénéfice. */
  knShare: number;
  /** Total Pangee (prod-exé + co-prod). */
  kn: number;
  artist: number;
};

/**
 * Taux du contrat artiste. `residency` = taux distincts des mois de résidence,
 * absent quand ils sont identiques aux dates uniques.
 */
export type ReportRates = {
  pe: number;
  cp: number;
  residency?: { pe: number; cp: number } | null;
} | null;

/** Taux d'une production, avec ceux des résidences s'ils diffèrent. */
export function productionRates(p: ProductionContracts<number>): ReportRates {
  const main = contractRates(p);
  const res = p.residencyContractSeparate ? contractRates(residencyContractOf(p)) : null;
  if (!main && !res) return null;
  const base = main ?? { pe: 0, cp: 0 };
  const differs = res && (res.pe !== base.pe || res.cp !== base.cp);
  return differs ? { ...base, residency: res } : base;
}

export type ShowKpis = {
  /** Remplissage % (payants ÷ jauge des dates où les deux sont saisis). */
  fillRate: number | null;
  paying: number;
  capacity: number;
  /** Ticket moyen € = billetterie ÷ payants (billetterie brute en co-réa). */
  ticketAvg: number | null;
  played: number;
  planned: number;
  /** Résultat moyen par représentation jouée (€). */
  resultPerPerf: number | null;
  /** Périmètre : dates jouées, ou toute l'exploitation si aucune jouée. */
  scope: "realized" | "all";
};

/**
 * Indicateurs d'un ensemble de dates. Ticket moyen : billetterie brute en
 * co-réa (prix public), sinon Recette HT ; seules les dates avec des payants
 * saisis comptent.
 */
export function computeKpis(
  dates: ProductionDealView[],
  scope: "realized" | "all",
): ShowKpis {
  const active = dates.filter((d) => d.status !== "ANNULE");
  const inScope = scope === "realized" ? active.filter((d) => d.isPast) : active;
  const aud = audienceOf(inScope);
  let ticketBase = 0;
  let ticketPaying = 0;
  for (const d of inScope) {
    if (!d.paying || d.paying <= 0) continue;
    const base =
      d.venueDealKind === "CO_REAL" && d.grossTicketing
        ? d.grossTicketing
        : d.byLabel.RECETTE_HT ?? 0;
    if (base <= 0) continue;
    ticketBase += base;
    ticketPaying += d.paying;
  }
  const perfs = inScope.reduce((s, d) => s + d.performances, 0);
  const result = inScope.reduce((s, d) => s + d.pnl.margin, 0);
  return {
    fillRate: aud.fillRate,
    paying: aud.paying,
    capacity: aud.capacity,
    ticketAvg: ticketPaying ? Math.round(ticketBase / ticketPaying) : null,
    played: active.reduce((s, d) => s + d.performancesPlayed, 0),
    planned: active.reduce((s, d) => s + d.performances, 0),
    resultPerPerf: perfs ? Math.round(result / perfs) : null,
    scope,
  };
}

/**
 * Agrège le compte de résultat d'un ensemble de dates. Les parts Pangee /
 * artiste reprennent celles calculées date par date (contrat propre à chaque
 * date, parts arrondies à l'euro).
 */
export function financeOf(
  dates: Array<Pick<ProductionDealView, "byLabel" | "pnl" | "cachets">>,
): FinanceBlock {
  const byLabel = Object.fromEntries(
    [...REVENUE_LABELS, ...COST_LABELS].map((l) => [l, 0]),
  ) as Record<ProductionLineLabel, number>;
  let revenue = 0;
  let lineCost = 0;
  let cachets = 0;
  let overhead = 0;
  let kn = 0;
  let artist = 0;
  let knFee = 0;
  let knShare = 0;
  let profit = 0;
  for (const d of dates) {
    for (const [label, amount] of Object.entries(d.byLabel) as Array<[ProductionLineLabel, number]>) {
      byLabel[label] += amount;
    }
    revenue += d.pnl.revenue;
    lineCost += d.pnl.lineCost;
    cachets += d.cachets;
    overhead += d.pnl.overheadShare;
    kn += d.pnl.knAmount ?? 0;
    artist += d.pnl.artistAmount ?? 0;
    knFee += d.pnl.knFee;
    knShare += d.pnl.knShare;
    profit += d.pnl.profit;
  }
  return {
    byLabel,
    revenue,
    lineCost,
    cachets,
    overhead,
    knFee,
    totalCost: lineCost + overhead + knFee,
    result: profit,
    knShare,
    kn,
    artist,
  };
}

export function audienceOf(dates: ProductionDealView[]): AudienceTotals {
  let performances = 0;
  let paying = 0;
  let invited = 0;
  let capacity = 0;
  let payingWithCapacity = 0;
  for (const d of dates) {
    if (d.status === "ANNULE") continue;
    performances += d.performances;
    paying += d.paying ?? 0;
    invited += d.invited ?? 0;
    if (d.capacity && d.paying != null && d.paying > 0) {
      capacity += d.capacity * Math.max(d.performances, 1);
      payingWithCapacity += d.paying;
    }
  }
  return {
    performances,
    paying,
    invited,
    capacity,
    fillRate: capacity > 0 ? Math.round((payingWithCapacity / capacity) * 100) : null,
  };
}

/** Remplissage d'une date (payants ÷ jauge × représentations). */
export function dateFillRate(d: ProductionDealView): number | null {
  if (!d.capacity || d.paying == null || d.paying <= 0) return null;
  return Math.round((d.paying / (d.capacity * Math.max(d.performances, 1))) * 100);
}

export function contractLabel(p: {
  artistShareKind: ProductionDealView["artistShareKind"];
  coprodKnPct: number | null;
  prodExePct: number | null;
  residencyContractSeparate?: boolean;
  residencyArtistShareKind?: ProductionDealView["artistShareKind"];
  residencyCoprodKnPct?: number | null;
  residencyProdExePct?: number | null;
}): string {
  const main = singleContractLabel(p);
  if (!p.residencyContractSeparate) return main;
  const res = singleContractLabel({
    artistShareKind: p.residencyArtistShareKind ?? null,
    coprodKnPct: p.residencyCoprodKnPct ?? null,
    prodExePct: p.residencyProdExePct ?? null,
  });
  return res === main ? main : `Dates uniques — ${main} · Résidences — ${res}`;
}

function singleContractLabel(p: {
  artistShareKind: ProductionDealView["artistShareKind"];
  coprodKnPct: number | null;
  prodExePct: number | null;
}): string {
  const r = contractRates(p);
  if (!r) return "Contrat non défini";
  const parts = [
    r.pe > 0 && `Prod-exé : Pangee ${r.pe} % du chiffre d'affaires`,
    r.cp > 0 && `Co-prod : bénéfice partagé Pangee ${r.cp} % / Artiste ${100 - r.cp} %`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Aucune part Pangee";
}

/** « prod-exé 10 % du CA, co-prod 80 % du bénéfice » (parties à 0 omises). */
function ratesText(r: { pe: number; cp: number }): string {
  const parts = [
    r.pe > 0 && `prod-exé ${r.pe} % du CA`,
    r.cp > 0 && `co-prod ${r.cp} % du bénéfice`,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "aucune part Pangee";
}

/** Notes de méthode (bas de document) — communes bilan / compte de production. */
export function reportNotes(o: {
  rates: ReportRates;
  upcomingCount?: number;
  unallocatedOverhead?: number;
}): string[] {
  const r = o.rates;
  const res = r?.residency;
  return [
    "Frais généraux : charges communes à la production, réparties au prorata du nombre de représentations (dates à venir incluses, annulées exclues) ; une date soldée garde la quote-part figée à son solde.",
    !r
      ? "Contrat artiste non défini."
      : res
        ? `Contrat artiste différent selon le type de date — dates uniques : ${ratesText(r)} ; résidences : ${ratesText(res)}. Chaque date applique son contrat.`
        : [
          r.pe > 0 &&
            `Prod-exé : Pangee perçoit ${r.pe} % du chiffre d'affaires, compté dans les charges.`,
          r.cp > 0
            ? `Co-prod : le bénéfice restant (recettes − charges − frais généraux${r.pe > 0 ? " − prod-exé" : ""}) est partagé à ${r.cp} % Pangee / ${100 - r.cp} % artiste, sur le résultat global de la production.`
            : "Le bénéfice restant revient à l'artiste.",
        ]
          .filter(Boolean)
          .join(" "),
    ...((o.unallocatedOverhead ?? 0) > 0
      ? [
          `⚠️ ${Math.round(o.unallocatedOverhead ?? 0).toLocaleString("fr-FR")} € de frais généraux ne sont portés par aucune date (toutes annulées ou aucune date) : ils ne figurent pas dans le résultat ci-dessus.`,
        ]
      : []),
    ...((o.upcomingCount ?? 0) > 0
      ? [`État à date : seules les dates déjà jouées sont comptées (${o.upcomingCount} date${(o.upcomingCount ?? 0) > 1 ? "s" : ""} à venir non comptée${(o.upcomingCount ?? 0) > 1 ? "s" : ""}).`]
      : []),
  ];
}

/**
 * Structure et libellés de fin de compte d'exploitation selon le contrat :
 *   prod-exé > 0 → ligne de rémunération Pangee dans les charges ;
 *   co-prod > 0  → « Bénéfice à partager » puis Part Pangee / Part artiste ;
 *   sinon        → « Net artiste ».
 */
export function resultLabels(rates: ReportRates) {
  const pe = rates?.pe ?? 0;
  const cp = rates?.cp ?? 0;
  const res = rates?.residency;
  if (res) {
    // Deux contrats (dates uniques / résidences) : montants = somme des dates,
    // libellés avec les deux taux.
    const both = (a: number, b: number) => (a === b ? `${a} %` : `${a} % dates · ${b} % résidences`);
    return {
      showFee: pe > 0 || res.pe > 0,
      showSplit: cp > 0 || res.cp > 0,
      knFee: `Rémunération prod-exé Pangee (${both(pe, res.pe)} du CA)`,
      result: cp > 0 || res.cp > 0 ? "Bénéfice à partager" : "Net artiste",
      kn: `Part co-prod Pangee (${both(cp, res.cp)})`,
      artist: "Part artiste",
    };
  }
  return {
    showFee: pe > 0,
    showSplit: cp > 0,
    knFee: `Rémunération prod-exé Pangee (${pe} % du CA)`,
    result: cp > 0 ? "Bénéfice à partager" : "Net artiste",
    kn: `Part co-prod Pangee (${cp} %)`,
    artist: `Part artiste (${100 - cp} %)`,
  };
}

/** Libellé lieu d'une date : salle, sinon titre ; + ville. */
export function dateVenueLabel(d: ProductionDealView): string {
  const main = d.venueName ?? d.title;
  return d.city && !main.includes(d.city) ? `${main} · ${d.city}` : main;
}
