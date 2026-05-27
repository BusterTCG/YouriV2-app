import "server-only";

import { prisma } from "@/lib/db";
import type { Prisma, VenueDealKind } from "@prisma/client";
import { sortArtistsDiversLast } from "@/lib/artists";
import { computeProdExeBrute } from "@/lib/finance/show-financials";
import { getPeriodRange, type PeriodPreset } from "@/lib/period-presets";
import {
  STATUS_OPTIONS,
  PERIOD_PRESET_OPTIONS,
  DEFAULT_PERIOD,
  DEFAULT_STATUS,
  parsePeriod,
  parseStatus,
  type DealsListStatus,
  type BookingDealArtistRow,
} from "./deals-list-types";

/**
 * Helper liste des deals Prod Exécutive — server-only (Sprint 4).
 *
 * Pattern identique à `lib/deals-list.ts` (Booking) : filtres period/status/
 * artist URL-driven, KPIs agrégés, tri date asc.
 *
 * Spécificités Prod Exé :
 *   - Lignes de prod (`ProductionLine`) au lieu de DealCharge (mais on garde
 *     DealCharge dispo si Stan en a besoin pour des frais "Pangee" hors prod).
 *   - Multi-date (`multiDateDates` JSON sur Deal) — affiche la 1re date dans
 *     le tableau + badge "+N représentations" si série.
 *   - Marge = grossAmount − Σ COST − Σ DealArtiste.cachetAmount (scalars
 *     pré-calculés par recomputeShowFinancials, lus directement).
 *
 * Re-exports communs (period, status helpers) — pour permettre à la page
 * server d'utiliser les mêmes labels que Booking.
 */

export {
  STATUS_OPTIONS,
  PERIOD_PRESET_OPTIONS,
  DEFAULT_PERIOD,
  DEFAULT_STATUS,
  parsePeriod,
  parseStatus,
};
export type { DealsListStatus, BookingDealArtistRow };

export interface ProdExeProductionLineRow {
  id: string;
  kind: "REVENUE" | "COST";
  label: string;
  customLabel: string | null;
  amount: number | null;
  paymentStatus: string;
  paidAt: Date | null;
  comment: string | null;
  coveredByVenue: boolean;
  order: number;
}

export interface ProdExeDealRow {
  id: string;
  date: Date;
  title: string;
  showName: string | null;
  status: string;
  // Lieu
  venueName: string | null;
  venueCity: string | null;
  // Modèle salle
  venueDealKind: VenueDealKind | null;
  // Jauge
  capacity: number | null;
  paying: number | null;
  invited: number | null;
  // Multi-date
  isMultiDate: boolean;
  performanceCount: number | null;
  // Suivi opérationnel
  contractSigned: boolean;
  ticketingReady: boolean;
  vhrBooked: boolean;
  // Scalars financiers (recalculés)
  grossAmount: number | null;
  commissionPct: number | null;
  commissionAmount: number | null;
  artistAmount: number | null;
  /** Statut consolidé Part Artiste (driver UI, séparé des cachets). */
  artistStatus: "PAID" | "TO_INVOICE" | "VALIDATED" | "INVOICED" | "DISPUTE" | "N_A";
  // Artistes (multi)
  dealArtistes: BookingDealArtistRow[];
  totalArtistes: number;
  /** Nom du 1er artiste actif (pour la colonne "Projet : Artiste - Spectacle"). */
  primaryArtistName: string | null;
  // Lignes prod agrégées
  totalRevenue: number;
  totalCost: number;
  margePangee: number;
  margePct: number | null;
  // ── Colonnes tableau Stan 2026-05-27 ──
  /** Σ recettes (= grossAmount actif). */
  caHt: number;
  /** Part Artiste = CA − Charges − Commission Pangee. */
  partArtiste: number;
  /** Marge Brute = commission Pangee = 15% × CA. */
  margeBrute: number;
  /** true si toutes les RECETTES (REVENUE) actives sont PAID. */
  allRevenuePaid: boolean;
  /** Date max paidAt des recettes encaissées (null si aucune). */
  encaissementDate: Date | null;
  /** Nombre de lignes COST + Cachet non encore réglées (charges + cachets artistes). */
  linesToPay: number;
  /** Σ Management Fees du deal. */
  totalMf: number;
  /** Marge Nette = Marge Brute − MF. */
  margeNette: number;
  /** % marge nette / (part artiste + marge nette). */
  margeNettePct: number | null;
}

export interface ProdExeDealsListData {
  deals: ProdExeDealRow[];
  totals: {
    count: number;
    totalRevenue: number;
    totalCost: number;
    totalCommission: number;
    margeRealisee: number;
    margeAttente: number;
    /** Stan 2026-05-27 v3 — KPI top tableau Prod Exé. */
    totalPartArtiste: number;
    /** Σ partArtiste des deals dont artistStatus !== PAID (à reverser). */
    partArtisteARegler: number;
    totalMf: number;
    totalMargeNette: number;
    /** % marge nette / (part artiste + marge nette) global. */
    margeNettePctGlobal: number | null;
  };
  artists: Array<{ id: string; name: string; slug: string; color: string | null }>;
}

/**
 * Statut global "Encaissé" Prod Exé (Stan 2026-05-27 v5) — AND strict des 3 :
 *   1. `artistStatus === PAID`            (driver UI "Part Artiste")
 *   2. `allRevenuePaid` (= St. Marge ✅)  (toutes les recettes REVENUE encaissées)
 *   3. `linesToPay === 0` (= Paiements Soldé) (toutes charges + cachets payés)
 *
 * Si l'une des 3 conditions manque → le deal reste en "En cours".
 *
 * Implémenté en mémoire après le mapping (les 3 flags sont calculés à partir
 * des productionLines + dealArtistes) — la query Prisma ne filtre pas par
 * statut, c'est `filterDealsByStatus` qui s'en charge ensuite.
 */
function isDealPaid(d: ProdExeDealRow): boolean {
  return (
    d.artistStatus === "PAID" &&
    d.allRevenuePaid &&
    d.linesToPay === 0
  );
}

function artistFilter(artistSlug: string | null): Prisma.DealWhereInput {
  if (!artistSlug || artistSlug === "all") return {};
  return {
    dealArtistes: { some: { artist: { slug: artistSlug }, deletedAt: null } },
  };
}

export async function getProdExeDealsList(opts: {
  period: PeriodPreset;
  status: DealsListStatus;
  artistSlug: string | null;
}): Promise<ProdExeDealsListData> {
  const { period, status, artistSlug } = opts;
  const { start, end } = getPeriodRange(period);

  const dateFilter: Prisma.DealWhereInput =
    start || end
      ? { date: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } }
      : {};

  // Stan 2026-05-27 v5 : le filtre status est appliqué EN MÉMOIRE après calcul
  // des 3 flags (artistStatus + allRevenuePaid + linesToPay), car la règle ne
  // s'exprime pas proprement en SQL pur sans dupliquer la logique de mapping.
  const where: Prisma.DealWhereInput = {
    AND: [
      { category: "PROD_EXE" },
      { deletedAt: null },
      dateFilter,
      artistFilter(artistSlug),
    ],
  };

  // Pour la liste des artistes (combobox filtre) — on garde le périmètre
  // "tous les artistes du périmètre Prod Exé sur la période", peu importe le
  // statut courant. Ça évite que le combobox se vide quand on switche En cours
  // → Encaissé.
  const whereForArtists: Prisma.DealWhereInput = {
    AND: [
      { category: "PROD_EXE" },
      { deletedAt: null },
      dateFilter,
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
        productionLines: {
          where: { deletedAt: null },
          orderBy: [{ kind: "asc" }, { order: "asc" }],
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

  const deals: ProdExeDealRow[] = dealsRaw.map((d) => {
    const dealArtistes: BookingDealArtistRow[] = d.dealArtistes.map((da) => ({
      id: da.id,
      amount: da.cachetAmount != null ? Number(da.cachetAmount) : null,
      sharePct: da.sharePct != null ? Number(da.sharePct) : null,
      paymentStatus: da.paymentStatus,
      paidAt: da.paidAt,
      notes: da.notes,
      artist: da.artist,
    }));
    const totalArtistes = dealArtistes.reduce(
      (acc, x) => acc + (x.amount ?? 0),
      0,
    );

    let totalRevenue = 0;
    let totalCost = 0;
    let allRevenuePaid = false;
    let revenuePaidCount = 0;
    let revenueLineCount = 0;
    let encaissementDate: Date | null = null;
    let linesToPay = 0;
    for (const l of d.productionLines) {
      if (l.coveredByVenue) continue;
      const amt = l.amount != null ? Number(l.amount) : 0;
      if (l.kind === "REVENUE") {
        totalRevenue += amt;
        if (amt > 0) {
          revenueLineCount += 1;
          if (l.paymentStatus === "PAID") {
            revenuePaidCount += 1;
            if (l.paidAt && (!encaissementDate || l.paidAt > encaissementDate)) {
              encaissementDate = l.paidAt;
            }
          }
        }
      } else {
        totalCost += amt;
        if (amt > 0 && l.paymentStatus !== "PAID") linesToPay += 1;
      }
    }
    allRevenuePaid = revenueLineCount > 0 && revenuePaidCount === revenueLineCount;
    // Compte aussi les cachets artistes non payés dans "linesToPay"
    for (const da of dealArtistes) {
      if ((da.amount ?? 0) > 0 && da.paymentStatus !== "PAID") linesToPay += 1;
    }

    const margePangee = totalRevenue - totalCost - totalArtistes;
    const margePct =
      totalRevenue > 0 ? (margePangee / totalRevenue) * 100 : null;

    // Marge Brute = commission = % × CA
    const pct =
      d.prodExePct != null
        ? Number(d.prodExePct)
        : d.commissionPct != null
          ? Number(d.commissionPct)
          : 15;
    const margeBrute = computeProdExeBrute(totalRevenue, pct);
    // Part Artiste = CA − Charges − Cachet Art. − Commission Pangee
    // (Stan 2026-05-27 v2 : Cachet Art. inclus dans les charges, donc déduit
    // aussi de la Part Artiste pour cohérence avec la fiche show).
    const partArtiste = totalRevenue - totalCost - totalArtistes - margeBrute;
    // Management Fees totaux du deal
    const totalMf = d.managementFees.reduce(
      (acc, mf) => acc + (mf.amount != null ? Number(mf.amount) : 0),
      0,
    );
    const margeNette = margeBrute - totalMf;
    // Stan 2026-05-27 v5 : % = marge nette / CA HT (vs % anciennement
    // marge nette / (part artiste + marge nette)). Plus lisible côté business :
    // on mesure ce que Pangee garde net rapporté au volume total du show.
    const margeNettePct =
      totalRevenue > 0 ? (margeNette / totalRevenue) * 100 : null;

    return {
      id: d.id,
      date: d.date,
      title: d.title,
      showName: d.showName,
      status: d.status,
      venueName: d.venueName,
      venueCity: d.venueCity,
      venueDealKind: d.venueDealKind,
      capacity: d.capacity,
      paying: d.paying,
      invited: d.invited,
      isMultiDate: d.isMultiDate,
      performanceCount: d.performanceCount,
      contractSigned: d.contractSigned,
      ticketingReady: d.ticketingReady,
      vhrBooked: d.vhrBooked,
      grossAmount: d.grossAmount != null ? Number(d.grossAmount) : null,
      commissionPct: d.commissionPct != null ? Number(d.commissionPct) : null,
      commissionAmount:
        d.commissionAmount != null ? Number(d.commissionAmount) : null,
      artistAmount: d.artistAmount != null ? Number(d.artistAmount) : null,
      artistStatus: d.artistStatus,
      dealArtistes,
      totalArtistes,
      primaryArtistName: dealArtistes[0]?.artist.name ?? null,
      totalRevenue,
      totalCost,
      margePangee,
      margePct,
      caHt: totalRevenue,
      partArtiste,
      margeBrute,
      allRevenuePaid,
      encaissementDate,
      linesToPay,
      totalMf,
      margeNette,
      margeNettePct,
    };
  });

  // Stan 2026-05-27 v5 — Filtre status appliqué en mémoire, après calcul des
  // 3 flags `artistStatus` / `allRevenuePaid` / `linesToPay`.
  //   - "paid"  → AND strict (les 3 doivent être OK)
  //   - "todo"  → au moins une des 3 conditions manquante
  //   - "all"   → tout passe
  const filteredDeals = (() => {
    if (status === "all") return deals;
    if (status === "paid") return deals.filter(isDealPaid);
    return deals.filter((d) => !isDealPaid(d));
  })();

  // Agrégats globaux — on exclut les ANNULE des totaux financiers (idem Booking).
  let totalRevenue = 0;
  let totalCost = 0;
  let totalCommission = 0;
  let margeRealisee = 0;
  let margeAttente = 0;
  let totalPartArtiste = 0;
  let partArtisteARegler = 0;
  let totalMf = 0;
  let totalMargeNette = 0;
  for (const d of filteredDeals) {
    if (d.status === "ANNULE") continue;
    totalRevenue += d.totalRevenue;
    totalCost += d.totalCost;
    totalCommission += d.commissionAmount ?? 0;
    totalPartArtiste += d.partArtiste;
    totalMf += d.totalMf;
    totalMargeNette += d.margeNette;
    if (d.artistStatus !== "PAID" && d.partArtiste > 0) {
      partArtisteARegler += d.partArtiste;
    }
    // Stan 2026-05-27 v4 : split la marge NETTE (= margeBrute − MF) entre
    // réalisée / à venir, pour rester cohérent avec le KPI "Marge Nette"
    // affiché en gros (sinon margeRealisee peut dépasser totalMargeNette).
    // Seuil = toutes les recettes encaissées (allRevenuePaid).
    if (d.allRevenuePaid) {
      margeRealisee += d.margeNette;
    } else {
      margeAttente += d.margeNette;
    }
  }
  // Stan 2026-05-27 v5 : % marge nette globale = totalMargeNette / totalCA HT.
  const margeNettePctGlobal =
    totalRevenue > 0 ? (totalMargeNette / totalRevenue) * 100 : null;

  return {
    deals: filteredDeals,
    totals: {
      count: filteredDeals.length,
      totalRevenue,
      totalCost,
      totalCommission,
      margeRealisee,
      margeAttente,
      totalPartArtiste,
      partArtisteARegler,
      totalMf,
      totalMargeNette,
      margeNettePctGlobal,
    },
    artists: sortArtistsDiversLast(artistsRaw),
  };
}
