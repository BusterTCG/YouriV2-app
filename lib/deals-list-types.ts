/**
 * Types + constantes pures pour les pages /deals/*.
 * Ce fichier est volontairement SANS `server-only` ni dépendance Prisma
 * concrète, pour pouvoir être importé depuis des composants client
 * (deals-filters.tsx) sans tirer le code DB dans le bundle navigateur.
 *
 * Le data-fetcher vit dans `lib/deals-list.ts` (server-only) et ré-exporte
 * ces symboles pour les pages serveur.
 *
 * Copié du pattern KuroNeko-App `lib/deals-list-types.ts`.
 */

import type { DealCategory, DealStatus, PaymentStatus } from "@prisma/client";
import {
  PERIOD_PRESET_OPTIONS,
  parsePeriodPreset,
  type PeriodPreset,
} from "./period-presets";

/**
 * Filtre statut Booking — vue combinée cachet + commission par artiste.
 * - all  : pas de filtre
 * - todo : au moins une ligne DealArtiste a un statut actionnable
 *          (cachet OU commission ∈ TO_INVOICE / INVOICED)
 * - paid : aucune ligne actionnable (deal soldé)
 */
export type DealsListStatus = "all" | "todo" | "paid";

export const STATUS_OPTIONS: Array<{ value: DealsListStatus; label: string; emoji?: string }> = [
  { value: "all", label: "Tous" },
  { value: "todo", label: "En attente", emoji: "⏳" },
  { value: "paid", label: "Encaissé", emoji: "✅" },
];

/** Période et options (re-exportées depuis period-presets). */
export { PERIOD_PRESET_OPTIONS };
export type { PeriodPreset };

/** Ligne projetée DealArtiste. */
export type BookingDealArtistRow = {
  id: string;
  cachetAmount: number | null;
  paymentStatus: PaymentStatus;
  /** % com Pangee (peut être null si saisi direct en €). */
  commissionPct: number | null;
  commissionAmount: number | null;
  commissionStatus: PaymentStatus;
  /** Mois d'encaissement de la com Pangee (cash-flow réel). */
  commissionPaidAt: Date | null;
  artist: { id: string; name: string; slug: string; color: string | null };
};

/** Ligne projetée Deal Booking — la vue card. */
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
  dealArtistes: BookingDealArtistRow[];
  totalCachet: number;
  totalCommission: number;
};

export interface BookingDealsListData {
  deals: BookingDealRow[];
  totals: {
    count: number;
    /** Total brut (somme des cachet+com par deal — équiv. grossAmount KN). */
    gross: number;
    /** Total cachets artistes (équiv. artistAmount KN — "part artiste"). */
    totalCachet: number;
    /** Total commission Pangee (toutes lignes confondues). */
    totalCommission: number;
    /** Com Pangee encaissée (commissionStatus = PAID). */
    commissionPaid: number;
    /** Com Pangee en attente (TO_INVOICE / INVOICED). */
    commissionTodo: number;
    /** Cachets que Pangee doit reverser à l'artiste : com encaissée mais
     *  cachet pas encore payé (cash-flow réel à débourser, copie pattern KN). */
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
