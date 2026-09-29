// Acomptes versés aux salles (portage KN, Stan 2026-09-28) — fonctionnent comme une
// CAUTION : versés, puis récupérés en fin d'exploitation. Jamais imputés sur
// les loyers ni les séances, aucun impact sur le résultat. Seul enjeu : ne
// pas oublier de les récupérer (warning tant que non récupérés).

export type DepositState = {
  /** Montant à récupérer auprès de la salle (0 si déjà récupéré). */
  toRecover: number;
  recovered: boolean;
};

export function depositState(d: { amount: number; refundedAt: Date | null }): DepositState {
  const recovered = d.refundedAt != null;
  return { recovered, toRecover: recovered ? 0 : d.amount };
}

/** Total des acomptes restant à récupérer. */
export function totalToRecover(deposits: Array<{ amount: number; refundedAt: Date | null }>): number {
  return deposits.reduce((s, d) => s + depositState(d).toRecover, 0);
}
