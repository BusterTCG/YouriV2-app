/**
 * Types + fonctions pures pour la Vue d'ensemble fiche artiste.
 *
 * Pas de `server-only` ni de dépendance Prisma → importable depuis le
 * composant client `overview-section.tsx`. Le data-fetcher Prisma vit dans
 * `lib/artist-overview.ts` (server-only).
 *
 * Pattern : le server fetcher retourne les ROWS bruts (1 par DealArtiste
 * non-soft-deleted sur un deal non-annulé), et le client component les
 * filtre par période + recalcule les agrégats via les fonctions pures
 * d'ici. Ça évite un round-trip serveur à chaque clic sur le period selector
 * (< 200 deals par artiste max — tient largement en RAM).
 */

import type { DealCategory, DealStatus, PaymentStatus } from "@prisma/client";

export interface ArtistOverviewRow {
  /** ID DealArtiste (clé React). */
  dealArtisteId: string;
  /** ID du Deal parent — pour la fiche détail. */
  dealId: string;
  date: Date;
  title: string;
  category: DealCategory;
  status: DealStatus;
  /** Montant artiste (cachetAmount, € entiers). null si vide. */
  amount: number | null;
  paymentStatus: PaymentStatus;
}

export interface ArtistOverviewBreakdown {
  total: number;
  paid: number;
  pending: number;
}

export interface ArtistOverviewTotals {
  total: ArtistOverviewBreakdown;
  booking: ArtistOverviewBreakdown;
  spectacle: ArtistOverviewBreakdown;
  cachet: ArtistOverviewBreakdown;
}

/** Ligne d'une catégorie dans le pie chart répartition (Stan 2026-05-26). */
export interface ArtistOverviewCategorySlice {
  category: DealCategory;
  label: string;
  value: number;
  color: string;
}

export interface ArtistOverviewComputed {
  totals: ArtistOverviewTotals;
  /** Nombre de deals filtrés (sur la période). */
  dealsCount: number;
  /** Toutes les rows filtrées par période, triées date desc — la UI peut
   *  slice(0, 8) pour la liste "Derniers deals". */
  filteredRows: ArtistOverviewRow[];
  /** Breakdown pour le pie chart (catégories avec valeur > 0, triées desc). */
  categoryBreakdown: ArtistOverviewCategorySlice[];
}

/** Couleurs du pie chart par catégorie (alignées sur la charte Youri). */
export const ARTIST_CATEGORY_COLORS: Record<DealCategory, string> = {
  BOOKING: "#2563eb", // bleu Pangee (cohérent couleur unique artiste)
  PROD_EXE: "#7c3aed", // violet (Spectacle)
  CACHETS: "#d4a93a", // or Youri (Cachet)
};

export const ARTIST_CATEGORY_LABELS: Record<DealCategory, string> = {
  BOOKING: "Booking",
  PROD_EXE: "Spectacle",
  CACHETS: "Cachet",
};

function emptyBreakdown(): ArtistOverviewBreakdown {
  return { total: 0, paid: 0, pending: 0 };
}

/**
 * Calcule l'agrégat (totals + categoryBreakdown + filteredRows) à partir
 * des rows brutes et d'une fenêtre de période optionnelle.
 *
 * `range.start = null` ET `range.end = null` → pas de filtre temporel
 * ("Tout l'historique"). Filtre `[start, end[` (borne haute exclue).
 *
 * Le filtre temporel se base sur **deal.date** (date du show/booking),
 * pas paidAt — c'est ce qui parle à Stan ("ses deals de cette année").
 */
export function computeArtistOverview(
  rows: ArtistOverviewRow[],
  range: { start: Date | null; end: Date | null },
): ArtistOverviewComputed {
  // 1. Filtre période
  const filteredRows = rows.filter((r) => {
    if (range.start && r.date < range.start) return false;
    if (range.end && r.date >= range.end) return false;
    return true;
  });

  // 2. Totals + paid/pending par catégorie
  const totals: ArtistOverviewTotals = {
    total: emptyBreakdown(),
    booking: emptyBreakdown(),
    spectacle: emptyBreakdown(),
    cachet: emptyBreakdown(),
  };

  for (const r of filteredRows) {
    const amount = r.amount ?? 0;
    if (amount === 0) continue;
    const isPaid = r.paymentStatus === "PAID";

    let bucket: ArtistOverviewBreakdown;
    switch (r.category) {
      case "BOOKING":
        bucket = totals.booking;
        break;
      case "PROD_EXE":
        bucket = totals.spectacle;
        break;
      case "CACHETS":
        bucket = totals.cachet;
        break;
      default:
        continue;
    }
    bucket.total += amount;
    totals.total.total += amount;
    if (isPaid) {
      bucket.paid += amount;
      totals.total.paid += amount;
    } else {
      bucket.pending += amount;
      totals.total.pending += amount;
    }
  }

  // 3. Pie chart breakdown : catégories non nulles, triées desc
  const categoryBreakdown: ArtistOverviewCategorySlice[] = (
    ["BOOKING", "PROD_EXE", "CACHETS"] as DealCategory[]
  )
    .map((cat) => ({
      category: cat,
      label: ARTIST_CATEGORY_LABELS[cat],
      value:
        cat === "BOOKING"
          ? totals.booking.total
          : cat === "PROD_EXE"
            ? totals.spectacle.total
            : totals.cachet.total,
      color: ARTIST_CATEGORY_COLORS[cat],
    }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);

  return {
    totals,
    dealsCount: filteredRows.length,
    filteredRows,
    categoryBreakdown,
  };
}
