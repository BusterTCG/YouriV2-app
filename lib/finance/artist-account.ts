// Compte artiste d'une production (portage KN, Stan 2026-09-28) — calculs purs.
//
// Règles métier :
//   - Part acquise = part artiste des dates JOUÉES (co-prod : % du résultat,
//     frais généraux inclus ; prod-exé : net artiste). Peut être négative.
//   - Quote-part APPELABLE = uniquement les dates jouées dont la billetterie
//     est encaissée (« appel de quote-part », pas une avance).
//   - Solde = appelable − (quote-parts versées − remboursements de l'artiste).
//     > 0 : Pangee doit à l'artiste ; < 0 : l'artiste doit à Pangee.
//   - Statut « réglé » de chaque date (Deal.artistStatus) DÉRIVÉ : les
//     versements nets couvrent les dates appelables dans l'ordre
//     chronologique (cumul) ; une date non appelable reste « à régler ».

export type AccountDeal = {
  id: string;
  date: Date;
  /** Date entièrement passée. */
  isPast: boolean;
  cancelled: boolean;
  /** Part artiste de la date (scalar Deal.artistAmount, frais généraux inclus). */
  artistAmount: number;
  /** Toutes les recettes saisies sont encaissées (billetterie reçue). */
  collected: boolean;
  /** Date soldée (lot 3 — comptes clos, en général via un appel de quote-part). */
  settled?: boolean;
};

export type AccountMovement = { kind: "PAYMENT" | "REFUND"; amount: number };

export type ArtistAccount = {
  /** Part artiste des dates jouées. */
  acquired: number;
  /** Dont appelable (billetterie encaissée). */
  callable: number;
  /** Part des dates jouées pas encore appelable (billetterie non reçue). */
  pendingCollection: number;
  /** Part artiste estimée sur toute l'exploitation. */
  forecast: number;
  paid: number;
  refunded: number;
  /** Solde : > 0 Pangee doit à l'artiste, < 0 l'artiste doit à Pangee. */
  balance: number;
  /** Statut artiste dérivé par date. */
  statuses: Map<string, "PAID" | "TO_INVOICE">;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeArtistAccount(
  deals: AccountDeal[],
  movements: AccountMovement[],
): ArtistAccount {
  // Dates annulées : comptées seulement si elles portent un montant (frais
  // réellement engagés) — même règle que le bilan d'exploitation.
  const active = deals.filter((d) => !d.cancelled || Math.round(d.artistAmount) !== 0);
  const played = active.filter((d) => d.isPast);
  const callableDeals = played
    .filter((d) => d.collected || d.settled)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const settledDeals = callableDeals.filter((d) => d.settled);
  const sum = (xs: AccountDeal[]) => xs.reduce((s, d) => s + d.artistAmount, 0);

  const paid = movements.filter((m) => m.kind === "PAYMENT").reduce((s, m) => s + m.amount, 0);
  const refunded = movements.filter((m) => m.kind === "REFUND").reduce((s, m) => s + m.amount, 0);
  const net = paid - refunded;

  const statuses = new Map<string, "PAID" | "TO_INVOICE">();
  for (const d of deals) statuses.set(d.id, "TO_INVOICE");
  // Cumul chronologique : une date est réglée quand tout ce qui était dû
  // jusqu'à elle (incluse) est couvert par les versements nets. Date en perte
  // (part négative) : réglée seulement quand l'artiste a remboursé (le net
  // versé est descendu jusqu'au cumul dû).
  // Date soldée : réglée d'office (le versement qui l'a soldée la couvre) ; le
  // cumul chronologique porte sur les dates non soldées (lot 3, Stan 2026-10-01).
  for (const d of settledDeals) statuses.set(d.id, "PAID");
  const netLeft = round2(net - settledDeals.reduce((s, d) => s + d.artistAmount, 0));
  let cumulative = 0;
  for (const d of callableDeals.filter((x) => !x.settled)) {
    cumulative = round2(cumulative + d.artistAmount);
    const settled =
      Math.round(d.artistAmount) === 0 ||
      (d.artistAmount > 0
        ? cumulative <= netLeft + 0.005
        : netLeft <= cumulative + 0.005);
    if (settled) statuses.set(d.id, "PAID");
  }

  const acquired = round2(sum(played));
  const callable = round2(sum(callableDeals));
  return {
    acquired,
    callable,
    pendingCollection: round2(acquired - callable),
    forecast: round2(sum(active)),
    paid: round2(paid),
    refunded: round2(refunded),
    balance: round2(callable - net),
    statuses,
  };
}
