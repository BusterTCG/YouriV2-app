import "server-only";

import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { sortArtistsDiversLast } from "@/lib/artists";
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
 * Helper liste des deals CACHETS — server-only (Sprint 5, Stan 2026-05-28).
 *
 * Modèle métier validé :
 *   - Pangee facture un tiers pour le compte d'un artiste (= `budgetAmount`)
 *   - Pangee conserve `cachetsFeesPct` % (défaut 10) → Marge Brute
 *   - Reste = cachet versé à l'artiste (= `DealArtiste.cachetAmount`)
 *   - MF appliqués sur la Marge Brute (pattern habituel Apport + Travail)
 *   - 1 artiste = 1 deal (pas de multi-artiste, pas de sharePct)
 *   - Pas de `DealCharge`, pas de FDR
 *
 * Statut global "Encaissé" CACHETS — AND strict des 2 conditions :
 *   1. `budgetPaymentStatus === PAID` (tiers a payé Pangee)
 *   2. `allArtistesPaid` (Pangee a versé le cachet à l'artiste)
 *
 * Pattern aligné sur `lib/prod-executive-list.ts` (filtre status en mémoire).
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

/** Ligne projetée d'une prestation Cachet (1 facture à 1 prestataire). */
export interface CachetPrestationRow {
  id: string;
  prestataire: string;
  amount: number | null;
  paymentStatus: string;
  paidAt: Date | null;
  notes: string | null;
  order: number;
}

export interface CachetsDealRow {
  id: string;
  date: Date;
  title: string;
  status: string;
  // Budget (= Σ prestations.amount, recalculé server-side)
  budgetAmount: number | null;
  budgetPaymentStatus: string;
  budgetPaidAt: Date | null;
  // Multi-date
  isMultiDate: boolean;
  performanceCount: number | null;
  // % Pangee (default 10)
  cachetsFeesPct: number;
  /** Stan 2026-05-28 : cachet versé dans le cadre d'un spectacle produit
   *  par Pangee elle-même → 0 marge, 0 MF, juste trace paie GUSO. */
  linkedToOwnProd: boolean;
  // Artiste unique (1 par deal)
  dealArtistes: BookingDealArtistRow[];
  /** Nom du 1er artiste actif (pour la colonne "Projet"). */
  primaryArtistName: string | null;
  /** Σ des cachetAmount des dealArtistes actifs (en pratique = montant artiste unique). */
  totalArtistes: number;
  /** true si tous les artistes (montant > 0) sont PAID. */
  allArtistesPaid: boolean;
  // ── Prestations (Sprint 5 v2 Stan 2026-05-28) ──
  prestations: CachetPrestationRow[];
  /** true si toutes les prestations actives (amount > 0) sont PAID. */
  allPrestationsPaid: boolean;
  /** Date max paidAt des prestations encaissées (pour la colonne Encaiss.). */
  prestationsPaidAt: Date | null;
  // ── Calculs financiers ──
  /** Marge Brute Pangee = budget × cachetsFeesPct / 100. 0 si linkedToOwnProd. */
  margeBrute: number;
  /** Σ Management Fees du deal. */
  totalMf: number;
  /** Marge Nette = Marge Brute − MF. */
  margeNette: number;
  /** % Marge Nette = margeNette / budget × 100, null si budget vide. */
  margeNettePct: number | null;
}

export interface CachetsDealsListData {
  deals: CachetsDealRow[];
  totals: {
    count: number;
    totalBudget: number;
    totalArtistes: number;
    /** Σ cachetAmount sur les deals où budget PAID mais artiste pas encore payé
     *  (cash-flow réel à reverser). */
    artistOwed: number;
    /** Marge Brute globale (= Σ margeBrute). */
    totalMargeBrute: number;
    /** Marge NETTE réalisée — utilisée dans la card KPI top. */
    margeRealisee: number;
    /** Marge NETTE en attente — utilisée dans la card KPI top. */
    margeAttente: number;
    /** Marge BRUTE réalisée — utilisée dans le footer du tableau (sous St.
     *  Marge, à droite de Marge Brute). Stan 2026-06-01. */
    margeBruteRealisee: number;
    /** Marge BRUTE en attente. */
    margeBruteAttente: number;
    totalMf: number;
    totalMargeNette: number;
    /** % Marge Nette globale = totalMargeNette / totalBudget × 100. */
    margeNettePctGlobal: number | null;
  };
  artists: Array<{ id: string; name: string; slug: string; color: string | null }>;
}

/**
 * Statut global "Encaissé" CACHETS.
 *
 * Mode standard (Stan 2026-05-28 v2 multi-prestations) — AND strict :
 *   1. `allPrestationsPaid` (toutes les prestations encaissées par Pangee)
 *   2. `allArtistesPaid` (Pangee a versé le cachet à l'artiste)
 *
 * Mode `linkedToOwnProd = true` (spectacle interne) — pas de prestation donc
 * seul le paiement de l'artiste compte.
 */
function isDealPaid(d: CachetsDealRow): boolean {
  if (d.linkedToOwnProd) return d.allArtistesPaid;
  return d.allPrestationsPaid && d.allArtistesPaid;
}

function artistFilter(artistSlug: string | null): Prisma.DealWhereInput {
  if (!artistSlug || artistSlug === "all") return {};
  return {
    dealArtistes: { some: { artist: { slug: artistSlug }, deletedAt: null } },
  };
}

export async function getCachetsDealsList(opts: {
  period: PeriodPreset;
  status: DealsListStatus;
  artistSlug: string | null;
}): Promise<CachetsDealsListData> {
  const { period, status, artistSlug } = opts;
  const { start, end } = getPeriodRange(period);

  const dateFilter: Prisma.DealWhereInput =
    start || end
      ? { date: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } }
      : {};

  // Pareil que Prod Exé : on retire le filtre status SQL, on le fait en
  // mémoire après calcul des flags (`budgetPaymentStatus` + `allArtistesPaid`).
  const where: Prisma.DealWhereInput = {
    AND: [
      { category: "CACHETS" },
      { deletedAt: null },
      dateFilter,
      artistFilter(artistSlug),
    ],
  };

  const whereForArtists: Prisma.DealWhereInput = {
    AND: [
      { category: "CACHETS" },
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
        cachetPrestations: {
          where: { deletedAt: null },
          orderBy: { order: "asc" },
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

  const deals: CachetsDealRow[] = dealsRaw.map((d) => {
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
    // Stan 2026-05-28 audit : ignorer les artistes sans cachet pour le statut
    // (cohérent avec règle "dispo paiement" management-fees-list.ts).
    const significantArtistes = dealArtistes.filter((a) => (a.amount ?? 0) > 0);
    const allArtistesPaid =
      significantArtistes.length > 0 &&
      significantArtistes.every((a) => a.paymentStatus === "PAID");

    const prestations: CachetPrestationRow[] = d.cachetPrestations.map((p) => ({
      id: p.id,
      prestataire: p.prestataire,
      amount: p.amount != null ? Number(p.amount) : null,
      paymentStatus: p.paymentStatus,
      paidAt: p.paidAt,
      notes: p.notes,
      order: p.order,
    }));

    // Σ prestations actives = montant total facturé sur ce mois.
    const prestationsTotal = prestations.reduce(
      (acc, p) => acc + (p.amount ?? 0),
      0,
    );
    const significantPrestations = prestations.filter((p) => (p.amount ?? 0) > 0);
    const allPrestationsPaid =
      significantPrestations.length > 0 &&
      significantPrestations.every((p) => p.paymentStatus === "PAID");
    // Date max paidAt des prestations encaissées.
    let prestationsPaidAt: Date | null = null;
    for (const p of significantPrestations) {
      if (p.paymentStatus === "PAID" && p.paidAt) {
        if (!prestationsPaidAt || p.paidAt > prestationsPaidAt) {
          prestationsPaidAt = p.paidAt;
        }
      }
    }

    // budgetAmount = scalar recalculé server-side (= Σ prestations). On lit
    // depuis Deal.budgetAmount qui est mis à jour par `recomputeCachetsBudget`,
    // avec fallback sur le calcul local si désynchronisé.
    const budgetAmount =
      d.budgetAmount != null ? Number(d.budgetAmount) : prestationsTotal;
    const cachetsFeesPct =
      d.cachetsFeesPct != null ? Number(d.cachetsFeesPct) : 10;
    const linkedToOwnProd = d.linkedToOwnProd ?? false;

    // Marge Brute = budget × cachetsFeesPct / 100 (Pangee garde X% du budget).
    // Stan 2026-05-28 : si lié à un spectacle produit par Pangee → marge = 0
    // (pas de tiers facturé, juste trace administrative paie GUSO).
    const margeBrute =
      !linkedToOwnProd && budgetAmount > 0
        ? Math.round((budgetAmount * cachetsFeesPct) / 100)
        : 0;

    const totalMf = d.managementFees.reduce(
      (acc, mf) => acc + (mf.amount != null ? Number(mf.amount) : 0),
      0,
    );
    const margeNette = margeBrute - totalMf;
    // % Marge Nette = margeNette / budget × 100 (cohérent avec Prod Exé v5).
    const margeNettePct =
      budgetAmount != null && budgetAmount > 0
        ? (margeNette / budgetAmount) * 100
        : null;

    return {
      id: d.id,
      date: d.date,
      title: d.title,
      status: d.status,
      budgetAmount,
      budgetPaymentStatus: d.budgetPaymentStatus,
      budgetPaidAt: d.budgetPaidAt,
      isMultiDate: d.isMultiDate,
      performanceCount: d.performanceCount,
      cachetsFeesPct,
      linkedToOwnProd,
      dealArtistes,
      primaryArtistName: dealArtistes[0]?.artist.name ?? null,
      totalArtistes,
      allArtistesPaid,
      prestations,
      allPrestationsPaid,
      prestationsPaidAt,
      margeBrute,
      totalMf,
      margeNette,
      margeNettePct,
    };
  });

  // Filtre status en mémoire (Stan 2026-05-28 — pattern Prod Exé v5).
  const filteredDeals = (() => {
    if (status === "all") return deals;
    if (status === "paid") return deals.filter(isDealPaid);
    return deals.filter((d) => !isDealPaid(d));
  })();

  // Agrégats globaux — exclure les ANNULE des totaux financiers.
  let totalBudget = 0;
  let totalArtistes = 0;
  let artistOwed = 0;
  let totalMargeBrute = 0;
  let margeRealisee = 0;
  let margeAttente = 0;
  let margeBruteRealisee = 0;
  let margeBruteAttente = 0;
  let totalMf = 0;
  let totalMargeNette = 0;
  for (const d of filteredDeals) {
    if (d.status === "ANNULE") continue;
    totalBudget += d.budgetAmount ?? 0;
    totalArtistes += d.totalArtistes;
    totalMargeBrute += d.margeBrute;
    totalMf += d.totalMf;
    totalMargeNette += d.margeNette;
    // Cash-flow : si toutes prestations encaissées mais artiste pas encore
    // payé → à reverser. Pour linkedToOwnProd, pas de prestations donc
    // déclencheur = juste "deal existant non payé".
    const collectedFromPrestas = d.linkedToOwnProd || d.allPrestationsPaid;
    if (collectedFromPrestas) {
      for (const da of d.dealArtistes) {
        if ((da.amount ?? 0) > 0 && da.paymentStatus !== "PAID") {
          artistOwed += da.amount ?? 0;
        }
      }
    }
    // Split réalisée/attente sur margeNette selon allPrestationsPaid (= encaissement Pangee).
    // Stan 2026-06-01 fix : on calcule aussi le split de la marge BRUTE pour
    // le footer du tableau (colonne St. Marge à droite de Marge Brute).
    if (d.allPrestationsPaid) {
      margeRealisee += d.margeNette;
      margeBruteRealisee += d.margeBrute;
    } else {
      margeAttente += d.margeNette;
      margeBruteAttente += d.margeBrute;
    }
  }

  const margeNettePctGlobal =
    totalBudget > 0 ? (totalMargeNette / totalBudget) * 100 : null;

  return {
    deals: filteredDeals,
    totals: {
      count: filteredDeals.length,
      totalBudget,
      totalArtistes,
      artistOwed,
      totalMargeBrute,
      margeRealisee,
      margeAttente,
      margeBruteRealisee,
      margeBruteAttente,
      totalMf,
      totalMargeNette,
      margeNettePctGlobal,
    },
    artists: sortArtistsDiversLast(artistsRaw),
  };
}
