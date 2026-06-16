import "server-only";

import { prisma } from "@/lib/db";
import type { Prisma, DealCategory } from "@prisma/client";
import { sortArtistsDiversLast } from "@/lib/artists";
import { getPeriodRange, type PeriodPreset } from "@/lib/period-presets";
import type {
  BookingDealRow,
  BookingDealArtistRow,
  BookingDealChargeRow,
  BookingDealsListData,
  DealsListStatus,
} from "./deals-list-types";

/**
 * Helper de liste des deals Booking — server-only.
 *
 * Modèle 2026-05-26 (Stan) : budget Pangee → réparti en artistes + charges,
 * marge Pangee = budget - artistes - charges. Filtres status/period adaptés.
 */

export {
  STATUS_OPTIONS,
  PERIOD_PRESET_OPTIONS,
  DEFAULT_PERIOD,
  DEFAULT_STATUS,
  parsePeriod,
  parseStatus,
} from "./deals-list-types";
export type {
  DealsListStatus,
  BookingDealRow,
  BookingDealArtistRow,
  BookingDealChargeRow,
  BookingDealsListData,
  PeriodPreset,
} from "./deals-list-types";

/**
 * Filtre statut du tableau booking (Stan 2026-05-26 v3).
 *
 * Règle stricte alignée avec les RecapStatusPill du tableau :
 *   - "Encaissé" = budgetPaymentStatus PAID **strict** + AU MOINS 1 artiste
 *     actif **et** TOUS les artistes actifs PAID **strict**
 *   - "En cours" = tout le reste (budget pas PAID, ou pas d'artiste, ou
 *     au moins 1 artiste non-PAID)
 *
 * Charges et management fees sont **hors scope** de ce filtre — la règle
 * porte uniquement sur le statut budget + statut artiste, identique à ce
 * qu'affichent les colonnes ST. MARGE et ST. ARTISTE.
 */
function statusFilter(status: DealsListStatus): Prisma.DealWhereInput {
  if (status === "all") return {};
  if (status === "paid") {
    return {
      AND: [
        { budgetPaymentStatus: "PAID" },
        // Au moins 1 artiste actif (sinon ST. ARTISTE = "En cours" côté UI).
        { dealArtistes: { some: { deletedAt: null } } },
        // Aucun artiste actif avec un statut ≠ PAID.
        {
          dealArtistes: {
            none: { deletedAt: null, paymentStatus: { not: "PAID" } },
          },
        },
      ],
    };
  }
  // "todo" : NOT paid → OU(budget ≠ PAID, pas d'artiste, ≥1 artiste non-PAID).
  return {
    OR: [
      { budgetPaymentStatus: { not: "PAID" } },
      { dealArtistes: { none: { deletedAt: null } } },
      {
        dealArtistes: {
          some: { deletedAt: null, paymentStatus: { not: "PAID" } },
        },
      },
    ],
  };
}

function artistFilter(artistSlug: string | null): Prisma.DealWhereInput {
  if (!artistSlug || artistSlug === "all") return {};
  return {
    dealArtistes: { some: { artist: { slug: artistSlug }, deletedAt: null } },
  };
}

/**
 * Liste des deals Booking + agrégats. Strict `category=BOOKING`.
 */
export async function getBookingDealsList(opts: {
  period: PeriodPreset;
  status: DealsListStatus;
  artistSlug: string | null;
}): Promise<BookingDealsListData> {
  const { period, status, artistSlug } = opts;
  const { start, end } = getPeriodRange(period);

  const dateFilter: Prisma.DealWhereInput =
    start || end
      ? { date: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } }
      : {};

  const where: Prisma.DealWhereInput = {
    AND: [
      { category: "BOOKING" },
      { deletedAt: null },
      dateFilter,
      statusFilter(status),
      artistFilter(artistSlug),
    ],
  };

  // Liste des artistes du combobox = uniquement ceux ayant ≥1 deal dans la
  // sélection courante (SANS le filtre artiste lui-même).
  const whereForArtists: Prisma.DealWhereInput = {
    AND: [
      { category: "BOOKING" },
      { deletedAt: null },
      dateFilter,
      statusFilter(status),
    ],
  };

  const [dealsRaw, artistsRaw] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy: { date: "asc" },
      include: {
        dealArtistes: {
          where: { deletedAt: null },
          include: {
            artist: { select: { id: true, name: true, slug: true, color: true } },
          },
        },
        dealCharges: {
          where: { deletedAt: null },
        },
        managementFees: {
          where: { deletedAt: null },
          select: { amount: true },
        },
      },
    }),
    prisma.artist.findMany({
      where: {
        active: true,
        deletedAt: null,
        dealArtistes: {
          some: { deletedAt: null, deal: whereForArtists },
        },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, color: true },
    }),
  ]);

  const deals: BookingDealRow[] = dealsRaw.map((d) => {
    const dealArtistes: BookingDealArtistRow[] = d.dealArtistes.map((da) => ({
      id: da.id,
      amount: da.cachetAmount != null ? Number(da.cachetAmount) : null,
      sharePct: da.sharePct != null ? Number(da.sharePct) : null,
      paymentStatus: da.paymentStatus,
      paidAt: da.paidAt,
      notes: da.notes,
      artist: da.artist,
    }));
    const dealCharges: BookingDealChargeRow[] = d.dealCharges.map((c) => ({
      id: c.id,
      label: c.label,
      amount: c.amount != null ? Number(c.amount) : null,
      paymentStatus: c.paymentStatus,
      paidAt: c.paidAt,
      notes: c.notes,
    }));
    const totalArtistes = dealArtistes.reduce((acc, x) => acc + (x.amount ?? 0), 0);
    const totalCharges = dealCharges.reduce((acc, x) => acc + (x.amount ?? 0), 0);
    const budget = d.budgetAmount != null ? Number(d.budgetAmount) : 0;
    const margePangee = budget - totalArtistes - totalCharges;
    const margePct = budget > 0 ? (margePangee / budget) * 100 : null;
    // Stan 2026-05-26 : tableau récap booking expose les MF et la marge nette.
    // Si margePangee ≤ 0, on considère que les MF sont à 0 (le helper
    // recomputeMfForDeal a déjà mis les amounts à 0 dans ce cas).
    const totalMf = d.managementFees.reduce(
      (acc, mf) => acc + (mf.amount != null ? Number(mf.amount) : 0),
      0,
    );
    const margeNette = margePangee - totalMf;
    const margeNettePct = budget > 0 ? (margeNette / budget) * 100 : null;
    return {
      id: d.id,
      date: d.date,
      title: d.title,
      description: d.description,
      showTime: d.showTime,
      status: d.status,
      category: d.category,
      organizerName: d.organizerName,
      organizerCompany: d.organizerCompany,
      organizerCity: d.organizerCity,
      venueName: d.venueName,
      venueCity: d.venueCity,
      notes: d.notes,
      budgetAmount: d.budgetAmount != null ? Number(d.budgetAmount) : null,
      budgetPaymentStatus: d.budgetPaymentStatus,
      budgetPaidAt: d.budgetPaidAt,
      dealArtistes,
      dealCharges,
      totalArtistes,
      totalCharges,
      margePangee,
      margePct,
      totalMf,
      margeNette,
      margeNettePct,
    };
  });

  // Agrégats globaux : on exclut les ANNULE des totaux financiers.
  let totalBudget = 0;
  let totalArtistes = 0;
  let totalCharges = 0;
  let totalMarge = 0;
  let margeRealisee = 0;
  let margeAttente = 0;
  let margeBruteRealisee = 0;
  let margeBruteAttente = 0;
  let artistOwed = 0;
  let totalMf = 0;
  for (const d of deals) {
    if (d.status === "ANNULE") continue;
    totalBudget += d.budgetAmount ?? 0;
    totalArtistes += d.totalArtistes;
    totalCharges += d.totalCharges;
    totalMarge += d.margePangee;
    totalMf += d.totalMf;
    const budgetPaid = d.budgetPaymentStatus === "PAID";
    // Stan 2026-05-26 v4 : on split la marge NETTE (= margePangee − MF) entre
    // réalisée / à venir, pour rester cohérent avec le KPI "Marge Nette"
    // affiché en gros (sinon margeRealisee peut dépasser totalMargeNette).
    // Stan 2026-06-01 fix : on calcule aussi le split de la marge BRUTE pour
    // le footer du tableau (colonne St. Marge à droite de Marge Brute).
    if (budgetPaid) {
      margeRealisee += d.margeNette;
      margeBruteRealisee += d.margePangee;
    } else {
      margeAttente += d.margeNette;
      margeBruteAttente += d.margePangee;
    }
    // "À reverser à l'artiste" : Youri a encaissé le budget mais n'a pas
    // encore payé l'artiste → cet argent est en trésorerie Youri.
    if (budgetPaid) {
      for (const da of d.dealArtistes) {
        if (da.amount != null && da.paymentStatus !== "PAID") {
          artistOwed += da.amount;
        }
      }
    }
  }
  const totalMargeNette = totalMarge - totalMf;

  return {
    deals,
    totals: {
      count: deals.length,
      totalBudget,
      totalArtistes,
      totalCharges,
      totalMarge,
      margeRealisee,
      margeAttente,
      margeBruteRealisee,
      margeBruteAttente,
      artistOwed,
      totalMf,
      totalMargeNette,
    },
    artists: sortArtistsDiversLast(artistsRaw),
  };
}

/**
 * Récap par catégorie pour la page parent /deals (3 cards Booking / Prod Exé /
 * Cachet) — affiche le total Marge Pangee par catégorie.
 *
 * Stan 2026-05-27 audit : la formule diffère par catégorie. Alignée sur
 * computeMargeBrute (lib/dashboard.ts) — fix marge CACHETS audit 2026-06-15.
 *   - BOOKING  : budget − Σ artistes − Σ charges (modèle classique)
 *   - PROD_EXE : commissionAmount scalar (= 15% × CA HT, snapshot recalculé
 *                par recomputeShowFinancials). Sinon marge toujours négative
 *                car budgetAmount est null sur cette catégorie.
 *   - CACHETS  : budget × cachetsFeesPct% (0 si linkedToOwnProd), défaut 10%.
 *                Avant le fix : budget − artistes − charges, ce qui surévaluait
 *                la marge ~37% au lieu de ~10% du budget.
 */
export async function getDealsCategoryRecap(): Promise<
  Array<{ category: DealCategory; count: number; totalMarge: number }>
> {
  const grouped = await prisma.deal.findMany({
    where: { deletedAt: null, status: { not: "ANNULE" } },
    select: {
      category: true,
      budgetAmount: true,
      commissionAmount: true,
      // Scalars nécessaires à la marge CACHETS (budget × cachetsFeesPct%).
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
    },
  });

  const byCategory = new Map<DealCategory, { count: number; totalMarge: number }>();
  for (const cat of ["BOOKING", "PROD_EXE", "CACHETS"] as DealCategory[]) {
    byCategory.set(cat, { count: 0, totalMarge: 0 });
  }
  for (const d of grouped) {
    const entry = byCategory.get(d.category)!;
    entry.count += 1;
    if (d.category === "PROD_EXE") {
      // Marge Brute Pangee = commission scalar (snapshot recompute).
      entry.totalMarge +=
        d.commissionAmount != null ? Number(d.commissionAmount) : 0;
    } else if (d.category === "CACHETS") {
      // Marge CACHETS = budget × cachetsFeesPct% (0 si lié à une prod Pangee).
      // Aligné sur computeMargeBrute (lib/dashboard.ts) — audit 2026-06-15.
      const budget = d.budgetAmount != null ? Number(d.budgetAmount) : 0;
      if (!d.linkedToOwnProd && budget > 0) {
        const pct = d.cachetsFeesPct != null ? Number(d.cachetsFeesPct) : 10;
        entry.totalMarge += Math.round((budget * pct) / 100);
      }
    } else {
      // BOOKING : budget − artistes − charges.
      const budget = d.budgetAmount != null ? Number(d.budgetAmount) : 0;
      const artistes = d.dealArtistes.reduce(
        (acc, da) => acc + (da.cachetAmount != null ? Number(da.cachetAmount) : 0),
        0,
      );
      const charges = d.dealCharges.reduce(
        (acc, c) => acc + (c.amount != null ? Number(c.amount) : 0),
        0,
      );
      entry.totalMarge += budget - artistes - charges;
    }
  }

  return Array.from(byCategory.entries()).map(([category, v]) => ({
    category,
    count: v.count,
    totalMarge: v.totalMarge,
  }));
}
