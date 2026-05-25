import "server-only";

import { prisma } from "@/lib/db";
import type { Prisma, DealCategory, PaymentStatus } from "@prisma/client";
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

const ACTIONABLE: PaymentStatus[] = ["TO_INVOICE", "INVOICED", "DISPUTE"];

function statusFilter(status: DealsListStatus): Prisma.DealWhereInput {
  if (status === "all") return {};
  if (status === "todo") {
    // Au moins une action en attente sur le deal :
    // - Budget pas encaissé (statut actionnable)
    // - OU au moins un artiste pas payé
    // - OU au moins une charge pas payée
    return {
      OR: [
        { budgetPaymentStatus: { in: ACTIONABLE } },
        {
          dealArtistes: {
            some: { deletedAt: null, paymentStatus: { in: ACTIONABLE } },
          },
        },
        {
          dealCharges: {
            some: { deletedAt: null, paymentStatus: { in: ACTIONABLE } },
          },
        },
      ],
    };
  }
  // "paid" : aucune action en attente (tout réglé).
  return {
    AND: [
      { budgetPaymentStatus: { notIn: ACTIONABLE } },
      {
        dealArtistes: {
          none: { deletedAt: null, paymentStatus: { in: ACTIONABLE } },
        },
      },
      {
        dealCharges: {
          none: { deletedAt: null, paymentStatus: { in: ACTIONABLE } },
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
    };
  });

  // Agrégats globaux : on exclut les ANNULE des totaux financiers.
  let totalBudget = 0;
  let totalArtistes = 0;
  let totalCharges = 0;
  let totalMarge = 0;
  let margeRealisee = 0;
  let margeAttente = 0;
  let artistOwed = 0;
  for (const d of deals) {
    if (d.status === "ANNULE") continue;
    totalBudget += d.budgetAmount ?? 0;
    totalArtistes += d.totalArtistes;
    totalCharges += d.totalCharges;
    totalMarge += d.margePangee;
    const budgetPaid = d.budgetPaymentStatus === "PAID";
    if (budgetPaid) {
      margeRealisee += d.margePangee;
    } else {
      margeAttente += d.margePangee;
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
      artistOwed,
    },
    artists: sortArtistsDiversLast(artistsRaw),
  };
}

/**
 * Récap par catégorie pour la page parent /deals (3 cards Booking / Prod Exé /
 * Cachet) — affiche le total Marge Pangee par catégorie.
 */
export async function getDealsCategoryRecap(): Promise<
  Array<{ category: DealCategory; count: number; totalMarge: number }>
> {
  const grouped = await prisma.deal.findMany({
    where: { deletedAt: null, status: { not: "ANNULE" } },
    select: {
      category: true,
      budgetAmount: true,
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

  return Array.from(byCategory.entries()).map(([category, v]) => ({
    category,
    count: v.count,
    totalMarge: v.totalMarge,
  }));
}
