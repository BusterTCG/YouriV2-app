/**
 * Presets de période — copie fidèle de KuroNeko-App `lib/period-presets.ts`.
 * Base commune pour toutes les vues qui filtrent dans le temps (Dashboard,
 * /reporting, /deals, fiche artiste Vue d'ensemble).
 *
 * Pas de `server-only` ni de dépendance Prisma → importable depuis n'importe
 * où, y compris les composants client.
 *
 * Sémantique : fenêtre `[start, end[` (borne haute exclue).
 */

export type PeriodPreset =
  | "this-month"
  | "last-month"
  | "this-year"
  | "12m"
  | "last-year"
  | "all";

export const PERIOD_PRESET_OPTIONS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "this-month", label: "Ce mois" },
  { value: "last-month", label: "Mois précédent" },
  { value: "this-year", label: "Cette année" },
  { value: "12m", label: "12 derniers mois" },
  { value: "last-year", label: "Année précédente" },
  { value: "all", label: "Tout" },
];

const MONTHS_FR_LONG = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const MONTHS_FR_SHORT = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sept", "Oct", "Nov", "Déc",
];

export function getPeriodRange(
  preset: PeriodPreset,
  now: Date = new Date(),
): { start: Date | null; end: Date | null } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "this-month":
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
    case "last-month":
      return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
    case "this-year":
      return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
    case "12m":
      return { start: new Date(y, m - 11, 1), end: new Date(y, m + 1, 1) };
    case "last-year":
      return { start: new Date(y - 1, 0, 1), end: new Date(y, 0, 1) };
    case "all":
    default:
      return { start: null, end: null };
  }
}

export function formatPeriodRangeLabel(
  preset: PeriodPreset,
  now: Date = new Date(),
): string {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "this-month":
      return `${MONTHS_FR_LONG[m]} ${y}`;
    case "last-month": {
      const lm = m === 0 ? 11 : m - 1;
      const ly = m === 0 ? y - 1 : y;
      return `${MONTHS_FR_LONG[lm]} ${ly}`;
    }
    case "this-year":
      return String(y);
    case "12m": {
      const startM = (m + 1) % 12;
      const startY = m === 11 ? y : y - 1;
      return `${MONTHS_FR_SHORT[startM]} ${startY} – ${MONTHS_FR_SHORT[m]} ${y}`;
    }
    case "last-year":
      return String(y - 1);
    case "all":
    default:
      return "Tout l'historique";
  }
}

export function parsePeriodPreset(
  v: string | undefined,
  fallback: PeriodPreset,
): PeriodPreset {
  return PERIOD_PRESET_OPTIONS.some((o) => o.value === v)
    ? (v as PeriodPreset)
    : fallback;
}
