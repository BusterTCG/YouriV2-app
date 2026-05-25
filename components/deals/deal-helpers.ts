/**
 * Helpers Deal partagés UI — format EUR, labels enums, classes status.
 * Pas de `server-only` ni de Prisma → importable depuis client + server.
 *
 * Pattern repris à l'identique de KuroNeko-App `components/deals/deal-helpers.ts`
 * + composant PaymentStatusPill (pill custom colorée — pas Badge shadcn).
 */

import type { DealCategory, DealStatus, PaymentStatus } from "@prisma/client";

/** Format € français sans décimales par défaut. */
export function formatEur(n: number | null | undefined, opts?: { decimals?: number }): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: opts?.decimals ?? 0,
  });
}

export const DEAL_CATEGORY_LABELS: Record<DealCategory, string> = {
  BOOKING: "Booking",
  PROD_EXE: "Prod Exé",
  CACHETS: "Cachets",
};

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  LEAD: "Lead",
  EN_COURS: "En cours",
  CONFIRME: "Confirmé",
  ANNULE: "Annulé",
};

/** Emoji + label (pour les selects inline KN-style). */
export const DEAL_STATUS_DISPLAY: Record<DealStatus, string> = {
  LEAD: "💡 Lead",
  EN_COURS: "🤝 En cours",
  CONFIRME: "✅ Confirmé",
  ANNULE: "❌ Annulé",
};

/**
 * Format un pourcentage. Par défaut 1 décimale (utile pour la répartition
 * % par artiste sur la fiche détail — ex. "33,3%").
 * Pass `{ integer: true }` pour arrondir à l'entier (utilisé sur le recap
 * booking pour le taux de marge — Stan 2026-05-26 : pas de décimal).
 */
export function formatPct(
  n: number | null | undefined,
  opts?: { integer?: boolean },
): string {
  if (n == null) return "—";
  if (opts?.integer) return `${Math.round(n)}%`;
  return `${(Math.round(n * 10) / 10).toString().replace(".", ",")}%`;
}

/**
 * Normalise un format heure pour l'affichage uniforme `HH:MM`
 * (Stan 2026-05-26 : "mettre le format xx:xx dans toute l'application").
 *
 * Accepte :
 *   - `"20:30"` → `"20:30"` (déjà valide)
 *   - `"20h30"` / `"20H30"` / `"20h"` / `"20"` → `"20:30"` / `"20:00"` / `"20:00"`
 *   - `null` / `""` / format inconnu → chaîne vide (l'appelant décide du fallback)
 *
 * Sert UNIQUEMENT à l'affichage de valeurs legacy stockées en texte libre
 * (ex. seed avec "20h30"). Les inputs sont désormais `<input type="time">`
 * qui forcent le format HH:MM côté écriture.
 */
export function formatShowTime(s: string | null | undefined): string {
  if (!s) return "";
  const trimmed = s.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  // "20h30" / "9h" / "20H30" / "9 h 30"
  const m = trimmed.match(/^(\d{1,2})\s*[hH]\s*(\d{0,2})$/);
  if (m) {
    const h = m[1].padStart(2, "0");
    const mm = (m[2] || "00").padStart(2, "0").slice(0, 2);
    return `${h}:${mm}`;
  }
  // "20" seul → "20:00"
  if (/^\d{1,2}$/.test(trimmed)) {
    return `${trimmed.padStart(2, "0")}:00`;
  }
  // Format inconnu (ex. "doors 19h / show 20h") → on garde tel quel pour
  // ne pas perdre l'info. L'user pourra ressaisir au format HH:MM via le
  // form (type="time" forcera le bon format).
  return trimmed;
}

/** Variant Badge shadcn (default / secondary / outline / destructive). */
export type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export const DEAL_STATUS_VARIANT: Record<DealStatus, BadgeVariant> = {
  LEAD: "outline",
  EN_COURS: "secondary",
  CONFIRME: "default",
  ANNULE: "destructive",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  TO_INVOICE: "En cours",
  VALIDATED: "Validé",
  INVOICED: "Attente Facture",
  PAID: "Payé",
  DISPUTE: "Litige",
  N_A: "—",
};

export const PAYMENT_STATUS_VARIANT: Record<PaymentStatus, BadgeVariant> = {
  TO_INVOICE: "outline",
  VALIDATED: "secondary",
  INVOICED: "secondary",
  PAID: "default",
  DISPUTE: "destructive",
  N_A: "outline",
};

/** Emoji pour les statuts paiement. */
export const PAYMENT_STATUS_EMOJI: Record<PaymentStatus, string> = {
  TO_INVOICE: "⏳",
  VALIDATED: "👍",
  INVOICED: "📄",
  PAID: "✅",
  DISPUTE: "❌",
  N_A: "—",
};

/** Label FR pour les statuts paiement (wording artiste Stan 2026-05-26). */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  TO_INVOICE: "En cours",
  VALIDATED: "Validé",
  INVOICED: "Attente Facture",
  PAID: "Payé",
  DISPUTE: "Litige",
  N_A: "—",
};

/**
 * Options ordonnées pour les Selects inline (tableau récap budget — usage
 * générique conservé pour compat). Workflow Stan : En cours → Validé →
 * Attente Facture → Payé.
 */
export const PAYMENT_STATUS_OPTIONS: Array<{
  value: PaymentStatus;
  emoji: string;
  label: string;
}> = [
  { value: "N_A", emoji: "—", label: "—" },
  { value: "TO_INVOICE", emoji: "⏳", label: "En cours" },
  { value: "VALIDATED", emoji: "👍", label: "Validé" },
  { value: "INVOICED", emoji: "📄", label: "Attente Facture" },
  { value: "PAID", emoji: "✅", label: "Payé" },
  { value: "DISPUTE", emoji: "❌", label: "Litige" },
];

/**
 * Options ARTISTE Stan 2026-05-26 : 4 statuts spécifiques (sans N_A ni
 * DISPUTE) — workflow simplifié pour la rémunération artiste.
 *   En cours → Validé → Attente Facture → Payé
 */
export const ARTIST_STATUS_OPTIONS: Array<{
  value: PaymentStatus;
  emoji: string;
  label: string;
}> = [
  { value: "TO_INVOICE", emoji: "⏳", label: "En cours" },
  { value: "VALIDATED", emoji: "👍", label: "Validé" },
  { value: "INVOICED", emoji: "📄", label: "Attente Facture" },
  { value: "PAID", emoji: "✅", label: "Payé" },
];

export function paymentStatusLabel(s: PaymentStatus): { emoji: string; label: string } {
  return { emoji: PAYMENT_STATUS_EMOJI[s], label: PAYMENT_STATUS_LABEL[s] };
}

/**
 * Classes Tailwind par statut paiement — couleurs spécifiques KN (emerald
 * pour PAID, blue pour INVOICED, amber pour TO_INVOICE, muted pour N_A).
 */
export function paymentStatusClass(s: PaymentStatus): string {
  switch (s) {
    case "PAID":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
    case "INVOICED":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30";
    case "VALIDATED":
      return "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/30";
    case "TO_INVOICE":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
    case "DISPUTE":
      return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
    case "N_A":
    default:
      return "bg-muted/40 text-muted-foreground border-border";
  }
}

/** Label deal status (emoji + texte) — pattern KN. */
export function dealStatusLabel(s: DealStatus): { emoji: string; label: string } {
  return {
    LEAD: { emoji: "💡", label: "Lead" },
    EN_COURS: { emoji: "🤝", label: "En cours" },
    CONFIRME: { emoji: "✅", label: "Confirmé" },
    ANNULE: { emoji: "❌", label: "Annulé" },
  }[s];
}
