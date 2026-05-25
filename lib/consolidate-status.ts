import type { PaymentStatus } from "@prisma/client";

/**
 * Consolide les statuts paiement de plusieurs DealArtiste en un statut deal.
 *
 * Règle Stan 2026-05-26 :
 *   - Si TOUS les artistes ont le même statut → on retourne ce statut
 *   - Sinon → "MIXED" (affiché "En cours" dans l'UI)
 *
 * Utilisé pour consolider les badges sur le tableau /deals/booking — 2 badges
 * par deal (cachet consolidé + com Pangee consolidée), comme KN affiche
 * artistStatus + commissionStatus mais ici dérivé du multi-artiste.
 *
 * Cas vide (aucun DealArtiste actif) → "N_A".
 */
export type ConsolidatedStatus = PaymentStatus | "MIXED";

export function consolidateStatus(statuses: PaymentStatus[]): ConsolidatedStatus {
  if (statuses.length === 0) return "N_A";
  const first = statuses[0];
  if (statuses.every((s) => s === first)) return first;
  return "MIXED";
}

/** Label FR pour l'affichage badge — wording Stan 2026-05-26 (statuts artiste). */
export const CONSOLIDATED_STATUS_LABELS: Record<ConsolidatedStatus, string> = {
  TO_INVOICE: "En cours",
  VALIDATED: "Validé",
  INVOICED: "Attente Facture",
  PAID: "Payé",
  DISPUTE: "Litige",
  N_A: "—",
  MIXED: "En cours",
};

/** Badge variant pour l'affichage. */
export const CONSOLIDATED_STATUS_VARIANT: Record<
  ConsolidatedStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  TO_INVOICE: "outline",
  VALIDATED: "secondary",
  INVOICED: "secondary",
  PAID: "default",
  DISPUTE: "destructive",
  N_A: "outline",
  MIXED: "secondary",
};
