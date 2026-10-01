import "server-only";

// Lecture + agrégats des Productions (portage de la refonte « Production » KN,
// Stan 2026-09-29). Utilisé par /shows (cartes) et /shows/production/[id].
//
// Les calculs financiers réutilisent les fonctions pures de
// lib/finance/production-overhead.ts → mêmes chiffres que les scalars Deal.
//
// ⚠️ Les management fees (tambouille interne Pangee) ne sont JAMAIS lues ici :
// ce module alimente les bilans / comptes de production / exports.
//
// Spécificités Youri :
// - pas de table Venue locale : lieu = snapshot `venueName` / `venueCity` ;
// - cachets artistes (`DealArtiste.cachetAmount`) = charges de la date ;
// - lignes « Pris par la salle » (`coveredByVenue`) hors calcul (comme les
//   scalars, cf. lib/finance/show-financials.ts).

import type {
  ArtistShareKind,
  BriefingStatus,
  DealStatus,
  PaymentStatus,
  Prisma,
  ProductionLineLabel,
  ProductionStatus,
  VenueDealKind,
} from "@prisma/client";
import { format } from "date-fns";
import { prisma } from "@/lib/db";
import { depositState } from "@/lib/finance/deposits";
import {
  allocateOverhead,
  dealPnl,
  performanceCountOf,
} from "@/lib/finance/production-overhead";
import { frozenShareOf } from "@/lib/finance/settlement-rules";
import { dateStage, type DateStage } from "@/lib/date-lifecycle";

export type MoneyTotals = {
  revenue: number;
  /** Charges saisies sur les dates (hors frais généraux, cachets inclus). */
  lineCost: number;
  /** Quote-part de frais généraux. */
  overhead: number;
  margin: number;
  kn: number;
  artist: number;
};

export type ProductionDealView = {
  id: string;
  /** Résidence (fiche multi-mois) — null pour une date de tournée. */
  residencyId: string | null;
  date: Date;
  showTime: string | null;
  title: string;
  city: string | null;
  venueName: string | null;
  status: DealStatus;
  isMultiDate: boolean;
  /** Représentations portées par la date (0 si annulée). */
  performances: number;
  /** Représentations déjà jouées (date < aujourd'hui). */
  performancesPlayed: number;
  /** Premier jour de représentation (1er jour coché en mois complet). */
  firstDate: Date;
  /** Dernier jour de la date (dernier jour coché en mois complet). */
  lastDate: Date;
  /** Mois de rattachement "YYYY-MM" (1er jour de représentation réel). */
  monthKey: string;
  /** Date entièrement passée (compte dans le « réalisé »). */
  isPast: boolean;
  contractSigned: boolean;
  ticketingReady: boolean;
  vhrBooked: boolean;
  /** Jauge par représentation. */
  capacity: number | null;
  /** Billetterie brute (base du ticket moyen en co-réa). */
  grossTicketing: number | null;
  /** Payants (cumul sur la série en mois complet). */
  paying: number | null;
  invited: number | null;
  briefingStatus: BriefingStatus | null;
  venueDealKind: VenueDealKind | null;
  artistShareKind: ArtistShareKind | null;
  coprodKnPct: number | null;
  prodExePct: number | null;
  unpaidLines: number;
  /** Recettes saisies non encaissées (€). */
  openRevenue: number;
  /** Charges saisies non payées (€), cachets inclus. */
  openCost: number;
  artistStatus: PaymentStatus;
  /** Date soldée (lot 3) — null sinon. */
  settledAt: Date | null;
  /** Étape du cycle de vie (lib/date-lifecycle.ts). */
  stage: DateStage;
  /** Séances (jour "YYYY-MM-DD", horaire) — non annulées, triées. */
  sessions: Array<{ day: string; time: string | null; paying: number | null; capacity: number | null }>;
  /** Montant par poste (recettes + charges saisies sur la date). */
  byLabel: Partial<Record<ProductionLineLabel, number>>;
  /** Cachets artistes de la date (charge — spécificité Youri). */
  cachets: number;
  pnl: ReturnType<typeof dealPnl>;
};

export type ProductionSummary = {
  id: string;
  name: string;
  status: ProductionStatus;
  closedAt: Date | null;
  notes: string | null;
  artist: { id: string; name: string; slug: string; color: string };
  artistShareKind: ArtistShareKind | null;
  coprodKnPct: number | null;
  prodExePct: number | null;
  /** Contrat distinct des résidences. */
  residencyContractSeparate: boolean;
  residencyArtistShareKind: ArtistShareKind | null;
  residencyCoprodKnPct: number | null;
  residencyProdExePct: number | null;
  overheads: Array<{
    id: string;
    label: string;
    date: Date | null;
    amount: number;
    status: PaymentStatus;
    comment: string | null;
  }>;
  overheadTotal: number;
  perPerformance: number;
  unallocatedOverhead: number;
  deals: ProductionDealView[];
  performancesPlanned: number;
  performancesPlayed: number;
  realized: MoneyTotals;
  forecast: MoneyTotals;
  nextDeal: ProductionDealView | null;
  firstDate: Date | null;
  lastDate: Date | null;
  missingContractCount: number;
  /** Acomptes (cautions) versés aux salles — résidences + dates (étape 3). */
  deposits: Array<{
    id: string;
    amount: number;
    paidAt: Date | null;
    /** Montant à récupérer (0 si récupéré). */
    toRecover: number;
    recovered: boolean;
    /** Engagement terminé → à récupérer maintenant. */
    finished: boolean;
    label: string;
    href: string;
  }>;
};

export type MonthRow = {
  key: string; // "2026-09"
  date: Date; // 1er du mois (UTC midi)
  performances: number;
  isPast: boolean;
  totals: MoneyTotals;
};

const emptyTotals = (): MoneyTotals => ({
  revenue: 0,
  lineCost: 0,
  overhead: 0,
  margin: 0,
  kn: 0,
  artist: 0,
});

function addTo(t: MoneyTotals, p: ProductionDealView["pnl"]) {
  t.revenue += p.revenue;
  t.lineCost += p.lineCost;
  t.overhead += p.overheadShare;
  t.margin += p.margin;
  t.kn += p.knAmount ?? 0;
  t.artist += p.artistAmount ?? 0;
}

function dec(v: Prisma.Decimal | null): number | null {
  return v != null ? Number(v) : null;
}

/** Jours "YYYY-MM-DD" cochés d'un mois complet (JSON `multiDateDates`), triés. */
function multiDateDays(v: unknown): string[] {
  return Array.isArray(v)
    ? (v as unknown[]).filter((x): x is string => typeof x === "string").sort()
    : [];
}

/**
 * Charge les productions demandées avec leurs dates et agrégats.
 * `nowMs` : référence "maintenant" (passée par l'appelant pour rester pur
 * pendant le render côté server component).
 */
export async function getProductionSummaries(
  where: Prisma.ProductionWhereInput,
  nowMs: number,
): Promise<ProductionSummary[]> {
  const productions = await prisma.production.findMany({
    where,
    include: {
      artist: { select: { id: true, name: true, slug: true, color: true } },
      overheads: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: { name: "asc" },
  });
  if (productions.length === 0) return [];

  const deals = await prisma.deal.findMany({
    where: {
      productionId: { in: productions.map((p) => p.id) },
      category: "PROD_EXE",
      deletedAt: null,
    },
    // Tiebreak id : même ordre que la répartition des frais généraux.
    orderBy: [{ date: "asc" }, { id: "asc" }],
    include: {
      briefing: { select: { status: true } },
      productionLines: {
        where: { deletedAt: null },
        select: { kind: true, label: true, amount: true, paymentStatus: true, coveredByVenue: true },
      },
      dealArtistes: {
        where: { deletedAt: null },
        select: { cachetAmount: true, paymentStatus: true },
      },
      performances: {
        where: { cancelled: false },
        select: { date: true, time: true, paying: true, capacity: true },
        orderBy: [{ date: "asc" }, { time: "asc" }],
      },
    },
  });

  // Acomptes / cautions salle des résidences et des dates de ces productions.
  const productionIds = productions.map((p) => p.id);
  const deposits = await prisma.venueDeposit.findMany({
    where: {
      OR: [
        { residency: { productionId: { in: productionIds } } },
        { deal: { productionId: { in: productionIds }, deletedAt: null } },
      ],
    },
    include: {
      residency: { select: { id: true, name: true, productionId: true } },
      deal: { select: { id: true, title: true, productionId: true, venueName: true } },
    },
  });

  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  // Clé "YYYY-MM-DD" en heure LOCALE (Europe/Paris) — toISOString décalerait
  // d'un jour (minuit Paris = 22h/23h UTC la veille).
  const todayKey = format(startOfToday, "yyyy-MM-dd");

  return productions.map((prod) => {
    const own = deals.filter((d) => d.productionId === prod.id);
    const overheadTotal = prod.overheads.reduce((s, o) => s + Number(o.amount), 0);
    const allocation = allocateOverhead(
      own.map((d) => ({
        id: d.id,
        status: d.status,
        performances: performanceCountOf(d),
        frozenShare: frozenShareOf(d),
      })),
      overheadTotal,
    );

    const prodContract = {
      artistShareKind: prod.artistShareKind,
      coprodKnPct: dec(prod.coprodKnPct),
      prodExePct: dec(prod.prodExePct),
      residencyContractSeparate: prod.residencyContractSeparate,
      residencyArtistShareKind: prod.residencyArtistShareKind,
      residencyCoprodKnPct: dec(prod.residencyCoprodKnPct),
      residencyProdExePct: dec(prod.residencyProdExePct),
    };

    const views: ProductionDealView[] = own.map((d) => {
      const multiDates = multiDateDays(d.multiDateDates);
      // Jour local de la date (Deal.date Youri porte l'heure du show).
      const dayKey = format(d.date, "yyyy-MM-dd");
      let lastDate: Date;
      if (d.isMultiDate && multiDates.length > 0) {
        lastDate = new Date(`${multiDates[multiDates.length - 1]}T12:00:00Z`);
      } else if (d.isMultiDate) {
        // Mois complet sans jours cochés → fin du mois de la date.
        lastDate = new Date(
          Date.UTC(d.date.getUTCFullYear(), d.date.getUTCMonth() + 1, 0, 12),
        );
      } else {
        lastDate = new Date(`${dayKey}T12:00:00Z`);
      }
      const cancelled = d.status === "ANNULE";
      const performances = cancelled ? 0 : performanceCountOf(d);
      const isPast = lastDate.getTime() < startOfToday.getTime();
      const performancesPlayed = cancelled
        ? 0
        : d.isMultiDate && multiDates.length > 0
          ? multiDates.filter((k) => k < todayKey).length
          : isPast
            ? performances
            : 0;

      const contract = {
        artistShareKind: d.artistShareKind,
        coprodKnPct: dec(d.coprodKnPct),
        prodExePct: dec(d.prodExePct),
      };

      // Lignes « Pris par la salle » hors calcul (cf. scalars).
      const lines = d.productionLines.filter((l) => !l.coveredByVenue);
      const cachets = d.dealArtistes.reduce((s, a) => s + (dec(a.cachetAmount) ?? 0), 0);
      const pnlLines = [
        ...lines.map((l) => ({ kind: l.kind, amount: Number(l.amount) })),
        ...(cachets ? [{ kind: "COST" as const, amount: cachets }] : []),
      ];
      // Séances (table Performance, source de vérité — étape 2) ; repli
      // historique si la date n'en a pas encore.
      const sessions = cancelled
        ? []
        : d.performances.length
          ? d.performances.map((p) => ({
              day: p.date.toISOString().slice(0, 10),
              time: p.time,
              paying: p.paying,
              capacity: p.capacity ?? d.capacity,
            }))
          : d.isMultiDate
            ? multiDates.map((day) => ({ day, time: d.showTime, paying: null, capacity: null }))
            : [{ day: dayKey, time: d.showTime, paying: d.paying, capacity: d.capacity }];
      const openCachets = d.dealArtistes
        .filter((a) => a.paymentStatus !== "PAID")
        .reduce((s, a) => s + (dec(a.cachetAmount) ?? 0), 0);
      return {
        id: d.id,
        residencyId: d.residencyId,
        date: d.date,
        showTime: d.showTime,
        title: d.title,
        city: d.venueCity,
        venueName: d.venueName,
        status: d.status,
        isMultiDate: d.isMultiDate,
        performances,
        performancesPlayed,
        firstDate: multiDates[0] ? new Date(`${multiDates[0]}T12:00:00Z`) : d.date,
        lastDate,
        monthKey: (multiDates[0] ?? dayKey).slice(0, 7),
        isPast,
        contractSigned: d.contractSigned,
        ticketingReady: d.ticketingReady,
        vhrBooked: d.vhrBooked,
        capacity: d.capacity,
        grossTicketing: d.coRealGrossCa != null ? Number(d.coRealGrossCa) : null,
        paying: d.paying,
        invited: d.invited,
        briefingStatus: d.briefing?.status ?? null,
        venueDealKind: d.venueDealKind,
        ...contract,
        openRevenue: lines
          .filter((l) => l.kind === "REVENUE" && l.paymentStatus !== "PAID")
          .reduce((s, l) => s + Number(l.amount), 0),
        openCost:
          lines
            .filter((l) => l.kind === "COST" && l.paymentStatus !== "PAID")
            .reduce((s, l) => s + Number(l.amount), 0) + openCachets,
        artistStatus: d.artistStatus,
        settledAt: d.settledAt,
        stage: dateStage({
          status: d.status,
          isPast,
          settled: d.settledAt != null,
          contractSigned: d.contractSigned,
          ticketingReady: d.ticketingReady,
          vhrBooked: d.vhrBooked,
        }),
        unpaidLines:
          lines.filter((l) => Number(l.amount) !== 0 && l.paymentStatus !== "PAID").length +
          d.dealArtistes.filter((a) => (dec(a.cachetAmount) ?? 0) !== 0 && a.paymentStatus !== "PAID")
            .length,
        sessions,
        byLabel: lines.reduce<Partial<Record<ProductionLineLabel, number>>>((acc, l) => {
          acc[l.label] = (acc[l.label] ?? 0) + Number(l.amount);
          return acc;
        }, {}),
        cachets,
        pnl: dealPnl(pnlLines, allocation.byDeal.get(d.id) ?? 0, contract),
      };
    });

    const realized = emptyTotals();
    const forecast = emptyTotals();
    for (const v of views) {
      addTo(forecast, v.pnl);
      if (v.isPast) addTo(realized, v.pnl);
    }

    const upcoming = views.filter((v) => !v.isPast && v.status !== "ANNULE");
    return {
      id: prod.id,
      name: prod.name,
      status: prod.status,
      closedAt: prod.closedAt,
      notes: prod.notes,
      artist: prod.artist,
      ...prodContract,
      overheads: prod.overheads.map((o) => ({
        id: o.id,
        label: o.label,
        date: o.date,
        amount: Number(o.amount),
        status: o.status,
        comment: o.comment,
      })),
      overheadTotal,
      perPerformance: allocation.perPerformance,
      unallocatedOverhead: allocation.unallocated,
      deals: views,
      performancesPlanned: views.reduce((s, v) => s + v.performances, 0),
      performancesPlayed: views.reduce((s, v) => s + v.performancesPlayed, 0),
      realized,
      forecast,
      nextDeal: upcoming[0] ?? null,
      firstDate: views.length
        ? new Date(Math.min(...views.map((v) => v.firstDate.getTime())))
        : null,
      lastDate: views.length
        ? new Date(Math.max(...views.map((v) => v.lastDate.getTime())))
        : null,
      missingContractCount: views.filter(
        (v) => v.status !== "ANNULE" && !v.artistShareKind,
      ).length,
      deposits: deposits
        .filter((dep) => (dep.residency?.productionId ?? dep.deal?.productionId) === prod.id)
        .map((dep) => {
          const state = depositState({ amount: Number(dep.amount), refundedAt: dep.refundedAt });
          const covered = views
            .filter((v) => (dep.residencyId ? v.residencyId === dep.residencyId : v.id === dep.dealId))
            .filter((v) => v.status !== "ANNULE");
          return {
            id: dep.id,
            amount: Number(dep.amount),
            paidAt: dep.paidAt,
            toRecover: state.toRecover,
            recovered: state.recovered,
            finished: covered.length > 0 && covered.every((v) => v.isPast),
            label: dep.residency
              ? `Résidence ${dep.residency.name}`
              : dep.deal?.venueName ?? dep.deal?.title ?? "Date",
            href: dep.residency ? `/shows/residence/${dep.residency.id}` : `/shows/${dep.deal?.id}`,
          };
        }),
    };
  });
}

/** Regroupe les dates d'une production par mois (vue mensuelle). */
export function groupByMonth(deals: ProductionDealView[]): MonthRow[] {
  const map = new Map<string, MonthRow>();
  for (const d of deals) {
    const key = d.monthKey;
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        date: new Date(`${key}-01T12:00:00Z`),
        performances: 0,
        isPast: true,
        totals: emptyTotals(),
      };
      map.set(key, row);
    }
    row.performances += d.performances;
    if (!d.isPast) row.isPast = false;
    addTo(row.totals, d.pnl);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}
