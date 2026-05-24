/**
 * Helpers dates centralisés — convention UTC midi.
 *
 * Pourquoi UTC midi : stocker une "date d'événement" (deal, task) à 12:00:00
 * UTC = 14h Paris été / 13h Paris hiver. Toujours le même jour partout, quel
 * que soit le fuseau du serveur ou du client. Évite les bugs de timezone vus
 * sur KN (un truc à minuit Paris = 22h UTC la veille → affiché J-1 côté SSR).
 *
 * RÈGLE : aucune `new Date(year, month, day)` dans le code métier. TOUT passe
 * par ces helpers. Cf. docs/process/code-conventions.md § Dates.
 */

import { format as fnsFormat } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * Date "calendrier" : UTC midi du jour donné.
 * Stable peu importe le fuseau d'exécution.
 */
export function calendarDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
}

/** UTC midi d'aujourd'hui (selon le fuseau Paris). */
export function todayCalendarDate(): Date {
  const now = new Date();
  return calendarDate(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Convertit une Date quelconque en UTC midi du même jour-calendrier. */
export function toUtcMidi(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      12,
      0,
      0,
      0,
    ),
  );
}

/** Premier du mois UTC midi (utile pour les ranges mensuels). */
export function firstOfMonth(year: number, month: number): Date {
  return calendarDate(year, month, 1);
}

/** Vrai si les 2 dates tombent sur le même jour-calendrier (ignore l'heure). */
export function isSameCalendarDay(a: Date | null, b: Date | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * Parse une string "YYYY-MM-DD" en UTC midi du même jour-calendrier.
 *
 * Note : on n'utilise PAS `parseISO` de date-fns car il interprète une string
 * sans timezone comme du local (Paris UTC+2 en été) → "2026-05-09" devient
 * "2026-05-08T22:00:00Z" et `toUtcMidi` rapporte au 8 mai. Bug timezone classique.
 * Donc on splitte la string nous-mêmes et on construit en UTC.
 */
export function parseCalendarDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) throw new Error(`Date invalide (attendu YYYY-MM-DD) : ${iso}`);
  const [, y, m, d] = match;
  return calendarDate(Number(y), Number(m) - 1, Number(d));
}

/** Format français court "lun 09 mai" / "lundi 9 mai 2026" / "Mai 2026" etc. */
export function formatFr(
  date: Date,
  pattern: "short" | "long" | "monthYear" | "monthShort" | "iso" = "short",
): string {
  switch (pattern) {
    case "short":
      return fnsFormat(date, "EEE d MMM", { locale: fr });
    case "long":
      return fnsFormat(date, "EEEE d MMMM yyyy", { locale: fr });
    case "monthYear":
      return capitalize(fnsFormat(date, "MMMM yyyy", { locale: fr }));
    case "monthShort":
      return capitalize(fnsFormat(date, "MMMM", { locale: fr }));
    case "iso":
      return fnsFormat(date, "yyyy-MM-dd");
  }
}

/** Format euros standard : 1 234,56 € */
export function formatEur(amount: number | string | null | undefined): string {
  if (amount == null || amount === "") return "—";
  const n = typeof amount === "number" ? amount : Number(amount);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
