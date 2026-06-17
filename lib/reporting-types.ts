/**
 * Types + constantes pures pour /reporting (Sprint 9 — Stan 2026-06-02).
 *
 * Copie fidèle de la structure KuroNeko `lib/reporting-types.ts` adaptée
 * Pangee Prod :
 *   - 3 catégories Deal (BOOKING / PROD_EXE / CACHETS) au lieu des 5 KN
 *   - KPIs orientés Marge Pangee (vs Commission KN)
 *   - Axe temporel : `budgetPaidAt` (cash-flow encaissement Pangee)
 *
 * Pas de `server-only` ni Prisma → importable depuis composants client.
 */

import type { DealCategory } from "@prisma/client";
import {
  PERIOD_PRESET_OPTIONS,
  parsePeriodPreset,
  type PeriodPreset,
} from "./period-presets";

export type ReportingPeriod = PeriodPreset;

export const REPORTING_PERIOD_OPTIONS = PERIOD_PRESET_OPTIONS;

export const DEFAULT_REPORTING_PERIOD: ReportingPeriod = "this-year";

export function parseReportingPeriod(v: string | undefined): ReportingPeriod {
  return parsePeriodPreset(v, DEFAULT_REPORTING_PERIOD);
}

/** Labels lisibles par catégorie (cohérent avec UI Pangee). */
export const CATEGORY_LABELS: Record<DealCategory, string> = {
  BOOKING: "Booking",
  PROD_EXE: "Prod Exécutive",
  CACHETS: "Cachets",
};

/** Couleurs assignées à chaque catégorie pour le donut breakdown. */
export const CATEGORY_COLORS: Record<DealCategory, string> = {
  BOOKING: "#2563eb",   // bleu
  PROD_EXE: "#f59e0b",  // amber
  CACHETS: "#10b981",   // emerald
};

/** Une rangée du top deals (Stan 2026-06-17 — remplace le top artistes :
 *  classement des deals par marge nette générée sur la période). */
export type TopDealRow = {
  id: string;
  title: string;
  category: DealCategory;
  /** Marge nette du deal sur la période (= marge brute − management fees ;
   *  pour les deals BOOKING à échéancier, somme des tranches encaissées). */
  margeNette: number;
  /** Part en % de la marge nette totale Pangee de la période. */
  pct: number;
};

/** Une part du donut chart par catégorie. */
export type CategoryBreakdownSlice = {
  category: DealCategory;
  label: string;
  /** Marge nette de cette catégorie sur la période (€). */
  value: number;
  /** Couleur d'affichage. */
  color: string;
};

/** Une barre du chart mensuel. */
export type MonthlyBucket = {
  /** Clé "YYYY-MM" — tri stable + tooltip "année". */
  key: string;
  /** Label court "Mai 26". */
  label: string;
  /** Marge nette encaissée sur ce mois (€). */
  margeNette: number;
};

export interface ReportingData {
  /** KPIs globaux pour la période sélectionnée.
   *  Tous calculés sur le même set : deals encaissés (budgetPaymentStatus=PAID
   *  + budgetPaidAt dans la fenêtre + status≠ANNULE). */
  kpis: {
    /** Σ budgets reçus (CA HT). */
    caHt: number;
    /** Σ cachets versés aux artistes. */
    totalArtistes: number;
    /** Marge Pangee BRUTE (= Σ margeBrute). */
    margeBrute: number;
    /** Σ Management fees reversés aux associés. */
    totalMf: number;
    /** Marge Pangee NETTE (= margeBrute − totalMf). */
    margeNette: number;
    /** Taux marge nette = margeNette / caHt × 100. Null si caHt = 0. */
    margeNettePct: number | null;
    /** Nombre de deals encaissés contributeurs. */
    dealsCount: number;
  };

  /** Chart mensuel (fenêtre alignée sur le préset période). */
  monthly: MonthlyBucket[];

  /** Top 10 deals par marge nette générée sur la période. */
  topDeals: TopDealRow[];

  /** Répartition de la marge nette par catégorie. */
  byCategory: CategoryBreakdownSlice[];

  /** Catalogue artistes pour le sélecteur de filtre. */
  artists: Array<{ id: string; name: string; slug: string; color: string | null }>;

  /** Libellé court de la plage (pour les titres). */
  rangeLabel: string;
}
