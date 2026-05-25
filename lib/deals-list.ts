import "server-only";

import { prisma } from "@/lib/db";
import type { Prisma, DealCategory, PaymentStatus } from "@prisma/client";
import { sortArtistsDiversLast } from "@/lib/artists";
import { getPeriodRange, type PeriodPreset } from "@/lib/period-presets";
import type {
  BookingDealRow,
  BookingDealArtistRow,
  BookingDealsListData,
  DealsListStatus,
} from "./deals-list-types";

/**
 * Helper de liste des deals Booking — server-only, accès Prisma.
 *
 * Les types et constantes UI vivent dans `deals-list-types.ts` (sans
 * server-only, importable depuis composants client).
 *
 * Adapté de KuroNeko-App `lib/deals-list.ts` avec :
 *   - Filtre strict `category=BOOKING` (Sprint 3)
 *   - Multi-artiste : projection `dealArtistes[]` + agrégats sommés
 *   - Snapshots organizer/venue (pas de relation Prisma)
 */

// Ré-export pour les pages serveur qui font un seul import
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
  BookingDealsListData,
  PeriodPreset,
} from "./deals-list-types";

function statusFilter(status: DealsListStatus): Prisma.DealWhereInput {
  if (status === "all") return {};
  const ACTIONABLE: PaymentStatus[] = ["TO_INVOICE", "INVOICED"];
  if (status === "todo") {
    return {
      dealArtistes: {
        some: {
          deletedAt: null,
          OR: [
            { paymentStatus: { in: ACTIONABLE } },
            { commissionStatus: { in: ACTIONABLE } },
          ],
        },
      },
    };
  }
  return {
    dealArtistes: {
      none: {
        deletedAt: null,
        OR: [
          { paymentStatus: { in: ACTIONABLE } },
          { commissionStatus: { in: ACTIONABLE } },
        ],
      },
    },
  };
}

function artistFilter(artistSlug: string | null): Prisma.DealWhereInput {
  if (!artistSlug || artistSlug === "all") return {};
  return { dealArtistes: { some: { artist: { slug: artistSlug }, deletedAt: null } } };
}

/**
 * Charge la liste de deals Booking filtrée + agrégats.
 * Strictement filtré sur `category=BOOKING` (Sprint 3 — Phase 3.4).
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

  // Liste des artistes affichés dans le combobox : uniquement ceux qui ont
  // au moins un deal Booking visible dans la sélection courante (période +
  // statut), MAIS sans appliquer le filtre artiste lui-même (sinon
  // l'utilisateur ne peut plus changer de sélection). Stan 2026-05-26.
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
      },
    }),
    prisma.artist.findMany({
      where: {
        active: true,
        deletedAt: null,
        dealArtistes: {
          some: {
            deletedAt: null,
            deal: whereForArtists,
          },
        },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, color: true },
    }),
  ]);

  const deals: BookingDealRow[] = dealsRaw.map((d) => {
    const dealArtistes: BookingDealArtistRow[] = d.dealArtistes.map((da) => ({
      id: da.id,
      cachetAmount: da.cachetAmount != null ? Number(da.cachetAmount) : null,
      paymentStatus: da.paymentStatus,
      commissionPct: da.commissionPct != null ? Number(da.commissionPct) : null,
      commissionAmount: da.commissionAmount != null ? Number(da.commissionAmount) : null,
      commissionStatus: da.commissionStatus,
      commissionPaidAt: da.commissionPaidAt,
      artist: da.artist,
    }));
    const totalCachet = dealArtistes.reduce((acc, x) => acc + (x.cachetAmount ?? 0), 0);
    const totalCommission = dealArtistes.reduce((acc, x) => acc + (x.commissionAmount ?? 0), 0);
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
      dealArtistes,
      totalCachet,
      totalCommission,
    };
  });

  // Agrégats : on exclut les ANNULE des totaux financiers (cf. KN pattern).
  let gross = 0;
  let totalCachet = 0;
  let totalCommission = 0;
  let commissionPaid = 0;
  let commissionTodo = 0;
  let artistOwed = 0;
  for (const d of deals) {
    if (d.status === "ANNULE") continue;
    totalCachet += d.totalCachet;
    totalCommission += d.totalCommission;
    gross += d.totalCachet + d.totalCommission;
    for (const da of d.dealArtistes) {
      if (da.commissionAmount != null) {
        if (da.commissionStatus === "PAID") commissionPaid += da.commissionAmount;
        else if (da.commissionStatus === "TO_INVOICE" || da.commissionStatus === "INVOICED") {
          commissionTodo += da.commissionAmount;
        }
      }
      // "À reverser à l'artiste" : règle cash-flow (cf. KN).
      // Com encaissée mais cachet pas encore versé → cet argent est dans
      // la trésorerie de Pangee et doit être reversé.
      if (
        da.cachetAmount != null &&
        da.commissionStatus === "PAID" &&
        da.paymentStatus !== "PAID"
      ) {
        artistOwed += da.cachetAmount;
      }
    }
  }

  return {
    deals,
    totals: {
      count: deals.length,
      gross,
      totalCachet,
      totalCommission,
      commissionPaid,
      commissionTodo,
      artistOwed,
    },
    artists: sortArtistsDiversLast(artistsRaw),
  };
}

/**
 * Compte les deals + somme commissions par catégorie pour la page parent
 * `/deals` (3 cards Booking / Prod Exé / Cachet).
 */
export async function getDealsCategoryRecap(): Promise<
  Array<{ category: DealCategory; count: number; totalCommission: number }>
> {
  const grouped = await prisma.deal.findMany({
    where: { deletedAt: null, status: { not: "ANNULE" } },
    select: {
      category: true,
      dealArtistes: {
        where: { deletedAt: null },
        select: { commissionAmount: true },
      },
    },
  });

  const byCategory = new Map<DealCategory, { count: number; totalCommission: number }>();
  for (const cat of ["BOOKING", "PROD_EXE", "CACHETS"] as DealCategory[]) {
    byCategory.set(cat, { count: 0, totalCommission: 0 });
  }
  for (const d of grouped) {
    const entry = byCategory.get(d.category)!;
    entry.count += 1;
    for (const da of d.dealArtistes) {
      if (da.commissionAmount != null) {
        entry.totalCommission += Number(da.commissionAmount);
      }
    }
  }

  return Array.from(byCategory.entries()).map(([category, v]) => ({
    category,
    count: v.count,
    totalCommission: v.totalCommission,
  }));
}
