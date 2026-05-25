/**
 * Types + constantes pures pour les pages /deals/*.
 *
 * Refonte modèle 2026-05-26 (Stan) : Pangee touche un BUDGET de
 * l'organisateur, paie les artistes + charges diverses, et garde la
 * différence = MARGE Pangee. Plus de commission % par artiste.
 *
 * Ce fichier est SANS `server-only` ni Prisma (importable côté client).
 * Le data-fetcher vit dans `lib/deals-list.ts`.
 */

import type { DealCategory, DealStatus, PaymentStatus } from "@prisma/client";
import {
  PERIOD_PRESET_OPTIONS,
  parsePeriodPreset,
  type PeriodPreset,
} from "./period-presets";

/**
 * Filtre statut sur /deals/booking. Pattern KN repris.
 * - todo : au moins une action en attente (budget non encaissé, artiste non payé,
 *          charge non payée — quel que soit le statut spécifique parmi
 *          TO_INVOICE/INVOICED/DISPUTE).
 * - paid : tout encaissé (budget PAID + tous artistes PAID + toutes charges PAID).
 */
export type DealsListStatus = "all" | "todo" | "paid";

export const STATUS_OPTIONS: Array<{ value: DealsListStatus; label: string; emoji?: string }> = [
  { value: "all", label: "Tous" },
  { value: "todo", label: "En attente", emoji: "⏳" },
  { value: "paid", label: "Encaissé", emoji: "✅" },
];

export { PERIOD_PRESET_OPTIONS };
export type { PeriodPreset };

/** Ligne projetée DealArtiste (nouveau modèle Budget/Marge). */
export type BookingDealArtistRow = {
  id: string;
  /** Montant artiste (champ DB `cachetAmount`, label UI "Montant"). */
  amount: number | null;
  /** Part de l'artiste sur le budget (%, ex. 75 = 75 %). */
  sharePct: number | null;
  paymentStatus: PaymentStatus;
  /** Mois où l'artiste a été payé par Pangee. */
  paidAt: Date | null;
  notes: string | null;
  artist: { id: string; name: string; slug: string; color: string | null };
};

/** Ligne projetée DealCharge (charges diverses). */
export type BookingDealChargeRow = {
  id: string;
  label: string;
  amount: number | null;
  paymentStatus: PaymentStatus;
  paidAt: Date | null;
  notes: string | null;
};

/** Ligne projetée Deal Booking — vue tableau récap. */
export type BookingDealRow = {
  id: string;
  date: Date;
  title: string;
  description: string | null;
  showTime: string | null;
  status: DealStatus;
  category: DealCategory;
  organizerName: string | null;
  organizerCompany: string | null;
  organizerCity: string | null;
  venueName: string | null;
  venueCity: string | null;
  notes: string | null;

  // ── Budget Pangee ──
  budgetAmount: number | null;
  budgetPaymentStatus: PaymentStatus;
  budgetPaidAt: Date | null;

  // ── Multi-artiste ──
  dealArtistes: BookingDealArtistRow[];

  // ── Charges diverses ──
  dealCharges: BookingDealChargeRow[];

  // ── Totaux pré-calculés (par deal) ──
  /** Somme des montants artistes. */
  totalArtistes: number;
  /** Somme des charges diverses. */
  totalCharges: number;
  /** Marge Pangee = budget − artistes − charges (peut être négative). */
  margePangee: number;
  /** % marge = marge / budget * 100, null si budget vide/zéro. */
  margePct: number | null;
};

export interface BookingDealsListData {
  deals: BookingDealRow[];
  totals: {
    count: number;
    /** Somme des budgets sur tous les deals non annulés. */
    totalBudget: number;
    /** Somme des rémunérations artistes. */
    totalArtistes: number;
    /** Somme des charges diverses. */
    totalCharges: number;
    /** Marge Pangee globale. */
    totalMarge: number;
    /** Marge réalisée (sur les deals où budget = PAID). */
    margeRealisee: number;
    /** Marge en attente (sur les deals où budget ≠ PAID). */
    margeAttente: number;
    /** Cachets que Youri doit reverser à l'artiste : budget encaissé MAIS
     *  artiste pas encore payé (cash-flow réel à débourser). */
    artistOwed: number;
  };
  artists: Array<{ id: string; name: string; slug: string; color: string | null }>;
}

export const DEFAULT_PERIOD: PeriodPreset = "all";
export const DEFAULT_STATUS: DealsListStatus = "all";

export function parsePeriod(v: string | undefined): PeriodPreset {
  return parsePeriodPreset(v, DEFAULT_PERIOD);
}
export function parseStatus(v: string | undefined): DealsListStatus {
  return STATUS_OPTIONS.some((o) => o.value === v) ? (v as DealsListStatus) : DEFAULT_STATUS;
}
