// Compte artiste d'une production (portage KN, Stan 2026-09-28) — calculs purs.
//
// Règles métier :
//   - Part acquise = part artiste des dates JOUÉES (co-prod : % du résultat,
//     frais généraux inclus ; prod-exé : net artiste). Peut être négative.
//   - Quote-part APPELABLE = uniquement les dates jouées dont la billetterie
//     est encaissée (« appel de quote-part », pas une avance) ; une date
//     jouée en DÉFICIT compte d'office (la perte est acquise, Stan 2026-10-16).
//   - Solde = appelable − (quote-parts versées − remboursements de l'artiste).
//     > 0 : Pangee doit à l'artiste ; < 0 : l'artiste doit à Pangee.
//     Une date en déficit se compense d'abord avec les dates positives ; en
//     fin d'exploitation, un solde négatif est dû par l'artiste (il le
//     rembourse : REFUND, « solde d'exploitation »).
//   - Avance de trésorerie de l'artiste (CASH_ADVANCE, Stan 2026-10-12) :
//     Pangee la doit à l'artiste, rendue comme les frais avancés.
//   - Frais avancés par l'artiste (Stan 2026-10-12) : dus dès la saisie (pas
//     d'appel de billetterie). Remboursés avec une quote-part (part
//     `advanceAmount` du versement) ou par un versement séparé (EXPENSES).
//     Ils s'ajoutent au solde mais n'entrent pas dans le règlement des dates.
//   - Statut « réglé » de chaque date (Deal.artistStatus) DÉRIVÉ : les
//     versements nets couvrent les dates appelables dans l'ordre
//     chronologique (cumul) ; une date est réglée dès qu'un cumul à partir
//     d'elle est couvert (une date en déficit compensée par une date positive
//     suivante est réglée) ; une date non appelable reste « à régler ».

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

export type AccountMovement = {
  kind: "PAYMENT" | "REFUND" | "EXPENSES" | "CASH_ADVANCE";
  amount: number;
  /** Part qui rembourse des frais avancés (PAYMENT ; EXPENSES = amount). */
  advanceAmount?: number;
};

/** Libellés des mouvements (sens de l'argent explicite, Stan 2026-10-12). */
export const ARTIST_MOVEMENT_LABEL: Record<AccountMovement["kind"], string> = {
  PAYMENT: "Versement de quote-part",
  REFUND: "Versement de l'artiste · règlement du déficit",
  CASH_ADVANCE: "Avance virée par l'artiste",
  EXPENSES: "Remboursement à l'artiste",
};

/** Frais avancé par l'artiste (charge d'une date ou frais général). */
export type AccountAdvance = { amount: number };

/** Part d'un versement qui rembourse des frais avancés. */
export function advancePartOf(m: AccountMovement): number {
  if (m.kind === "EXPENSES") return m.amount;
  if (m.kind === "PAYMENT") return Math.min(m.amount, m.advanceAmount ?? 0);
  return 0;
}

export type ArtistAccount = {
  /** Part artiste des dates jouées. */
  acquired: number;
  /** Dont appelable (billetterie encaissée). */
  callable: number;
  /** Part des dates jouées pas encore appelable (billetterie non reçue). */
  pendingCollection: number;
  /** Part artiste estimée sur toute l'exploitation. */
  forecast: number;
  /** Quote-parts versées (hors remboursement de frais). */
  paid: number;
  refunded: number;
  /** Dates pas encore jouées (le déficit à date peut encore se compenser). */
  upcoming: number;
  /** Avances de trésorerie reçues de l'artiste (incluses dans `advances`). */
  cashAdvances: number;
  /** Frais avancés + avances de trésorerie de l'artiste (total). */
  advances: number;
  /** Frais avancés déjà remboursés. */
  advancesPaid: number;
  /** Frais avancés restant à rembourser. */
  advancesDue: number;
  /** Solde quote-part seule : appelable − (versé − remboursé). */
  quotePartBalance: number;
  /** Solde : > 0 Pangee doit à l'artiste, < 0 l'artiste doit à Pangee
   *  (quote-part + frais avancés à rembourser). */
  balance: number;
  /** Statut artiste dérivé par date. */
  statuses: Map<string, "PAID" | "TO_INVOICE">;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeArtistAccount(
  deals: AccountDeal[],
  movements: AccountMovement[],
  advanceItems: AccountAdvance[] = [],
): ArtistAccount {
  // Dates annulées : comptées seulement si elles portent un montant (frais
  // réellement engagés) — même règle que le bilan d'exploitation.
  const active = deals.filter((d) => !d.cancelled || Math.round(d.artistAmount) !== 0);
  const played = active.filter((d) => d.isPast);
  // Une date en déficit est acquise contre l'artiste dès qu'elle est jouée,
  // sans attendre la billetterie (Stan 2026-10-16 : solde = avance − perte).
  const callableDeals = played
    .filter((d) => d.collected || d.settled || d.artistAmount < 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const settledDeals = callableDeals.filter((d) => d.settled);
  const sum = (xs: AccountDeal[]) => xs.reduce((s, d) => s + d.artistAmount, 0);

  const paid = movements
    .filter((m) => m.kind === "PAYMENT")
    .reduce((s, m) => s + m.amount - advancePartOf(m), 0);
  const cashAdvances = movements
    .filter((m) => m.kind === "CASH_ADVANCE")
    .reduce((s, m) => s + m.amount, 0);
  const advances = advanceItems.reduce((s, a) => s + a.amount, 0) + cashAdvances;
  const advancesPaid = movements.reduce((s, m) => s + advancePartOf(m), 0);
  const refunded = movements.filter((m) => m.kind === "REFUND").reduce((s, m) => s + m.amount, 0);
  const net = paid - refunded;

  const statuses = new Map<string, "PAID" | "TO_INVOICE">();
  for (const d of deals) statuses.set(d.id, "TO_INVOICE");
  // Cumul chronologique : un cumul est couvert quand les versements nets le
  // couvrent (cumul négatif : quand l'artiste a remboursé). Une date est
  // réglée dès qu'un cumul à partir d'elle est couvert — une date en déficit
  // est compensée par les dates positives qui la suivent (Stan 2026-10-12).
  // Date soldée : réglée d'office (le versement qui l'a soldée la couvre) ; le
  // cumul chronologique porte sur les dates non soldées (lot 3, Stan 2026-10-01).
  for (const d of settledDeals) statuses.set(d.id, "PAID");
  const netLeft = round2(net - settledDeals.reduce((s, d) => s + d.artistAmount, 0));
  const open = callableDeals.filter((x) => !x.settled);
  let cumulative = 0;
  const covered = open.map((d) => {
    cumulative = round2(cumulative + d.artistAmount);
    return cumulative >= 0 ? cumulative <= netLeft + 0.005 : netLeft <= cumulative + 0.005;
  });
  let coveredFromHere = false;
  for (let i = open.length - 1; i >= 0; i--) {
    coveredFromHere = coveredFromHere || covered[i];
    if (coveredFromHere || Math.round(open[i].artistAmount) === 0) statuses.set(open[i].id, "PAID");
  }

  const acquired = round2(sum(played));
  const callable = round2(sum(callableDeals));
  return {
    acquired,
    callable,
    pendingCollection: round2(acquired - callable),
    forecast: round2(sum(active)),
    upcoming: active.filter((d) => !d.isPast).length,
    cashAdvances: round2(cashAdvances),
    paid: round2(paid),
    refunded: round2(refunded),
    advances: round2(advances),
    advancesPaid: round2(advancesPaid),
    advancesDue: round2(advances - advancesPaid),
    quotePartBalance: round2(callable - net),
    balance: round2(callable - net + advances - advancesPaid),
    statuses,
  };
}
