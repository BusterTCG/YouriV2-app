import "server-only";

import type { DealCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sortArtistsDiversLast } from "@/lib/artists";
import { getBookingInstallmentUnits } from "@/lib/finance/deal-installments";
import { computeCachetsMargeBrute } from "@/lib/finance/cachet-payroll";
import {
  formatPeriodRangeLabel,
  getPeriodRange,
  type PeriodPreset,
} from "./period-presets";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type CategoryBreakdownSlice,
  type MonthlyBucket,
  type ReportingData,
  type ReportingPeriod,
  type TopArtistRow,
} from "./reporting-types";

export {
  REPORTING_PERIOD_OPTIONS,
  DEFAULT_REPORTING_PERIOD,
  parseReportingPeriod,
  type ReportingPeriod,
} from "./reporting-types";

const MONTHS_FR_SHORT = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sept", "Oct", "Nov", "Déc",
];

/**
 * Fenêtre du chart en fonction du préset.
 *   - this-year / last-year : 12 mois de l'année
 *   - this-month / last-month : 12 mois glissants finissant ce mois (contexte)
 *   - 12m : 12 mois glissants exacts
 *   - all : 24 mois glissants (cap pour ne pas exploser)
 */
function chartWindow(period: ReportingPeriod): { start: Date; end: Date; bucketCount: number } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case "this-year":
      return {
        start: new Date(y, 0, 1),
        end: new Date(y + 1, 0, 1),
        bucketCount: 12,
      };
    case "last-year":
      return {
        start: new Date(y - 1, 0, 1),
        end: new Date(y, 0, 1),
        bucketCount: 12,
      };
    case "this-month":
    case "last-month":
    case "12m":
      return {
        start: new Date(y, m - 11, 1),
        end: new Date(y, m + 1, 1),
        bucketCount: 12,
      };
    case "all":
    default:
      // 24 derniers mois — cap raisonnable pour le chart.
      return {
        start: new Date(y, m - 23, 1),
        end: new Date(y, m + 1, 1),
        bucketCount: 24,
      };
  }
}

/** Filtre artiste (slug) sur la relation DealArtiste. */
function artistDealWhere(artistSlug: string | null): Prisma.DealWhereInput {
  if (!artistSlug || artistSlug === "all") return {};
  // `deletedAt: null` : ne pas matcher via un DealArtiste soft-deleté (artiste
  // détaché du deal) — cohérent avec les listes (audit 2026-06-15).
  return { dealArtistes: { some: { deletedAt: null, artist: { slug: artistSlug } } } };
}

/** Calcule la marge brute d'un deal — adapté Pangee :
 *  - PROD_EXE : commissionAmount scalar (15% × CA HT recompute)
 *  - BOOKING / CACHETS : budget − Σ artistes − Σ charges */
type DealWithFinancials = {
  category: DealCategory;
  budgetAmount: Prisma.Decimal | null;
  commissionAmount: Prisma.Decimal | null;
  cachetsFeesPct: Prisma.Decimal | null;
  linkedToOwnProd: boolean;
  dealArtistes: Array<{ cachetAmount: Prisma.Decimal | null; artistId: string }>;
  dealCharges: Array<{ amount: Prisma.Decimal | null }>;
  managementFees: Array<{ amount: Prisma.Decimal | null }>;
};

/**
 * Marge BRUTE par catégorie — formules canoniques (cf. dashboard.ts /
 * cachets-list.ts). Stan 2026-06-11 audit : CACHETS = budget × cachetsFeesPct%
 * (0 si linkedToOwnProd), pas budget − artistes − charges.
 */
function computeMargeBrute(d: DealWithFinancials): number {
  if (d.category === "PROD_EXE") {
    return d.commissionAmount != null ? Number(d.commissionAmount) : 0;
  }
  const budget = d.budgetAmount != null ? Number(d.budgetAmount) : 0;
  const artistes = d.dealArtistes.reduce(
    (acc, a) => acc + (a.cachetAmount != null ? Number(a.cachetAmount) : 0),
    0,
  );
  if (d.category === "CACHETS") {
    // Marge CACHETS = Σ prestations − Σ cachets bruts (Stan 2026-06-17).
    return computeCachetsMargeBrute(budget, artistes, d.linkedToOwnProd);
  }
  const charges = d.dealCharges.reduce(
    (acc, c) => acc + (c.amount != null ? Number(c.amount) : 0),
    0,
  );
  return budget - artistes - charges;
}

function computeTotalMf(d: DealWithFinancials): number {
  return d.managementFees.reduce(
    (acc, mf) => acc + (mf.amount != null ? Number(mf.amount) : 0),
    0,
  );
}

/**
 * Charge toutes les data reporting en une passe parallèle.
 * Pattern KN `getReportingData` adapté Pangee.
 */
export async function getReportingData(opts: {
  period: ReportingPeriod;
  artistSlug: string | null;
}): Promise<ReportingData> {
  const { period, artistSlug } = opts;
  const { start: periodStart, end: periodEnd } = getPeriodRange(period);
  const { start: chartStart, end: chartEnd, bucketCount } = chartWindow(period);

  const artistWhere = artistDealWhere(artistSlug);
  const FINANCIAL_INCLUDE = {
    // Scalars nécessaires au calcul de marge CACHETS (Stan 2026-06-11 audit).
    cachetsFeesPct: true,
    linkedToOwnProd: true,
    dealArtistes: {
      where: { deletedAt: null },
      select: {
        cachetAmount: true,
        artistId: true,
        artist: {
          select: { id: true, name: true, slug: true, color: true },
        },
      },
    },
    dealCharges: {
      where: { deletedAt: null },
      select: { amount: true },
    },
    managementFees: {
      where: { deletedAt: null },
      select: { amount: true },
    },
  } as const;

  // Where pour les deals encaissés sur la période (KPIs + top artistes +
  // breakdown). Si périodeStart=null (= "all"), on ne filtre pas par date.
  //
  // `installments: { none: {} }` exclut les deals BOOKING qui ont un échéancier :
  // ils sont comptés séparément, tranche par tranche, via
  // getBookingInstallmentUnits (ventilation au mois d'encaissement réel + part
  // marge/MF au prorata du CA encaissé). Évite le double-comptage.
  const periodDealWhere: Prisma.DealWhereInput = {
    ...artistWhere,
    deletedAt: null,
    status: { not: "ANNULE" },
    budgetPaymentStatus: "PAID",
    installments: { none: {} },
    ...(periodStart && periodEnd
      ? { budgetPaidAt: { gte: periodStart, lt: periodEnd } }
      : {}),
  };

  // Fenêtre des tranches d'échéancier sur la période. "all" (périodeStart=null)
  // → fenêtre très large pour tout capter.
  const installmentPeriodRange =
    periodStart && periodEnd
      ? { start: periodStart, end: periodEnd }
      : { start: new Date(2000, 0, 1), end: new Date(2100, 0, 1) };

  const [
    periodDeals,
    chartDeals,
    artistsRaw,
    periodInstallmentUnits,
    chartInstallmentUnits,
  ] = await Promise.all([
    prisma.deal.findMany({
      where: periodDealWhere,
      select: {
        category: true,
        budgetAmount: true,
        commissionAmount: true,
        ...FINANCIAL_INCLUDE,
      },
    }),
    prisma.deal.findMany({
      where: {
        ...artistWhere,
        deletedAt: null,
        status: { not: "ANNULE" },
        budgetPaymentStatus: "PAID",
        installments: { none: {} },
        budgetPaidAt: { gte: chartStart, lt: chartEnd },
      },
      select: {
        category: true,
        budgetAmount: true,
        commissionAmount: true,
        budgetPaidAt: true,
        ...FINANCIAL_INCLUDE,
      },
    }),
    prisma.artist.findMany({
      where: { deletedAt: null, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, color: true },
    }),
    // Reporting = pas de filtre catégorie → BOOKING s'applique toujours.
    getBookingInstallmentUnits(installmentPeriodRange, {
      applies: true,
      artistWhere,
    }),
    getBookingInstallmentUnits(
      { start: chartStart, end: chartEnd },
      { applies: true, artistWhere },
    ),
  ]);

  // ── KPIs ──────────────────────────────────────────────────────────────
  let caHt = 0;
  let totalArtistes = 0;
  let margeBrute = 0;
  let totalMf = 0;
  for (const d of periodDeals) {
    caHt += d.budgetAmount != null ? Number(d.budgetAmount) : 0;
    totalArtistes += d.dealArtistes.reduce(
      (acc, a) => acc + (a.cachetAmount != null ? Number(a.cachetAmount) : 0),
      0,
    );
    margeBrute += computeMargeBrute(d);
    totalMf += computeTotalMf(d);
  }
  // Tranches d'échéancier BOOKING encaissées sur la période — comptées au
  // prorata du CA encaissé (cf. getBookingInstallmentUnits).
  for (const u of periodInstallmentUnits) {
    caHt += u.caHt;
    totalArtistes += u.totalArtistes;
    margeBrute += u.margeBrute;
    totalMf += u.totalMf;
  }
  const margeNette = margeBrute - totalMf;
  const margeNettePct = caHt > 0 ? (margeNette / caHt) * 100 : null;

  // ── Top artistes — CA HT au prorata si plusieurs artistes sur un deal ─
  const artistTotals = new Map<
    string,
    { name: string; slug: string; color: string | null; caHt: number; count: number }
  >();
  for (const d of periodDeals) {
    const dealCa = d.budgetAmount != null ? Number(d.budgetAmount) : 0;
    if (dealCa === 0 || d.dealArtistes.length === 0) continue;
    // Prorata simple : on divise le CA par le nb d'artistes du deal. Pas
    // de sharePct ici car simplification (cohérent avec dashboard).
    const share = dealCa / d.dealArtistes.length;
    for (const da of d.dealArtistes) {
      const id = da.artist.id;
      const existing = artistTotals.get(id);
      if (existing) {
        existing.caHt += share;
        existing.count += 1;
      } else {
        artistTotals.set(id, {
          name: da.artist.name,
          slug: da.artist.slug,
          color: da.artist.color,
          caHt: share,
          count: 1,
        });
      }
    }
  }
  // Tranches d'échéancier — chaque tranche apporte sa part de CA à l'artiste
  // (caShare = CA tranche ÷ nb artistes). Le `count` (nb de deals) est
  // dédupliqué par dealId pour ne pas gonfler avec le nombre de tranches.
  const countedInstArtistDeals = new Set<string>();
  for (const u of periodInstallmentUnits) {
    for (const a of u.artists) {
      const existing = artistTotals.get(a.id);
      const firstForDeal = !countedInstArtistDeals.has(`${a.id}::${u.dealId}`);
      countedInstArtistDeals.add(`${a.id}::${u.dealId}`);
      if (existing) {
        existing.caHt += a.caShare;
        if (firstForDeal) existing.count += 1;
      } else {
        artistTotals.set(a.id, {
          name: a.name,
          slug: a.slug,
          color: a.color,
          caHt: a.caShare,
          count: firstForDeal ? 1 : 0,
        });
      }
    }
  }
  const topArtists: TopArtistRow[] = Array.from(artistTotals.entries())
    .map(([id, info]) => ({
      id,
      name: info.name,
      slug: info.slug,
      color: info.color,
      caHt: info.caHt,
      count: info.count,
      pct: caHt > 0 ? (info.caHt / caHt) * 100 : 0,
    }))
    .sort((a, b) => b.caHt - a.caHt)
    .slice(0, 10);

  // ── Breakdown par catégorie (marge nette) ────────────────────────────
  const byCatMap = new Map<DealCategory, number>();
  for (const d of periodDeals) {
    const net = computeMargeBrute(d) - computeTotalMf(d);
    byCatMap.set(d.category, (byCatMap.get(d.category) ?? 0) + net);
  }
  // Tranches d'échéancier → toujours catégorie BOOKING.
  for (const u of periodInstallmentUnits) {
    const net = u.margeBrute - u.totalMf;
    byCatMap.set("BOOKING", (byCatMap.get("BOOKING") ?? 0) + net);
  }
  const byCategory: CategoryBreakdownSlice[] = (
    ["BOOKING", "PROD_EXE", "CACHETS"] as DealCategory[]
  )
    .map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat],
      value: byCatMap.get(cat) ?? 0,
      color: CATEGORY_COLORS[cat],
    }))
    .filter((s) => s.value !== 0);

  // ── Monthly chart (marge nette par mois) ──────────────────────────────
  const monthlyMap = new Map<string, number>();
  for (const d of chartDeals) {
    if (!d.budgetPaidAt) continue;
    const key = `${d.budgetPaidAt.getFullYear()}-${String(d.budgetPaidAt.getMonth()).padStart(2, "0")}`;
    const net = computeMargeBrute(d) - computeTotalMf(d);
    monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + net);
  }
  // Tranches d'échéancier — ventilées au mois de leur date d'encaissement.
  for (const u of chartInstallmentUnits) {
    const key = `${u.paidAt.getFullYear()}-${String(u.paidAt.getMonth()).padStart(2, "0")}`;
    monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + (u.margeBrute - u.totalMf));
  }
  const monthly: MonthlyBucket[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const m = new Date(chartStart.getFullYear(), chartStart.getMonth() + i, 1);
    const key = `${m.getFullYear()}-${String(m.getMonth()).padStart(2, "0")}`;
    monthly.push({
      key,
      label: `${MONTHS_FR_SHORT[m.getMonth()]} ${String(m.getFullYear()).slice(2)}`,
      margeNette: Math.round(monthlyMap.get(key) ?? 0),
    });
  }

  return {
    kpis: {
      caHt,
      totalArtistes,
      margeBrute,
      totalMf,
      margeNette,
      margeNettePct,
      dealsCount: periodDeals.length,
    },
    monthly,
    topArtists,
    byCategory,
    artists: sortArtistsDiversLast(artistsRaw),
    rangeLabel: formatPeriodRangeLabel(period),
  };
}
