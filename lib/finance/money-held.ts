/**
 * Argent « à reverser » (Stan 2026-10-16, même logique que KN) — l'argent
 * présent sur le compte Pangee qui ne lui appartient pas : reçu, mais pas
 * encore versé aux artistes, aux fournisseurs ni aux associés (management
 * fees).
 *
 * Règle unique : seul ce qui est RÉELLEMENT reçu compte, et un versement est
 * dû tant que son statut n'est pas « Payé ». Chiffre à date (pas de période).
 *
 *   - Booking : budget reçu (ou tranches d'échéancier encaissées) → cachets,
 *     charges et MF non payés, au prorata de ce qui est reçu (acompte de 50 %
 *     → 50 % de chaque versement).
 *   - Cachets : prestations encaissées → cachet artiste, charges et MF, au
 *     prorata.
 *   - Production : recettes encaissées → charges des dates et MF, au prorata ;
 *     la part artiste passe par le compte artiste de la production (solde > 0,
 *     cf. money-held-server.ts). Date hors production : part artiste du deal.
 *
 * Management fees : ici seulement pour le compte en banque — ils n'entrent
 * jamais dans les bilans / exports / compte artiste.
 *
 * Module pur : importable côté client, serveur et tests.
 */

import type { PaymentStatus } from "@prisma/client";

/** Taux de TVA indicatif affiché sous le total (Stan 2026-10-16). */
export const HELD_VAT_RATE = 0.2;

export type OwedLine = { amount: number | null; status: PaymentStatus };

export type HeldDealInput = {
  /** Ce que Pangee doit recevoir (budget, prestations, recettes). */
  expected: number;
  /** Ce que Pangee a réellement reçu. */
  received: number;
  artists: OwedLine[];
  charges: OwedLine[];
  fees: OwedLine[];
};

export type HeldAmounts = { artists: number; charges: number; fees: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Part reçue de ce qui est attendu (0 → 1). */
export function receivedRatio(expected: number, received: number): number {
  if (expected <= 0 || received <= 0) return 0;
  return Math.min(1, received / expected);
}

/** Versement encore dû : tant que ce n'est pas « Payé ». */
export function owedTotal(lines: OwedLine[]): number {
  return lines.reduce(
    (s, l) => (l.status !== "PAID" && l.amount != null && l.amount > 0 ? s + l.amount : s),
    0,
  );
}

/** Argent reçu par Pangee sur un deal et pas encore reversé. */
export function heldOnDeal(d: HeldDealInput): HeldAmounts {
  const ratio = receivedRatio(d.expected, d.received);
  return {
    artists: round2(owedTotal(d.artists) * ratio),
    charges: round2(owedTotal(d.charges) * ratio),
    fees: round2(owedTotal(d.fees) * ratio),
  };
}

/** Ligne « TVA » indicative sous le total : impact et montant TTC. */
export function withVat(total: number): { vat: number; ttc: number } {
  const vat = round2(total * HELD_VAT_RATE);
  return { vat, ttc: round2(total + vat) };
}
