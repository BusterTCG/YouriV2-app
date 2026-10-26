// Cycle de vie d'une date de production (Stan 2026-10-01, lot 3) — calculé
// en UN SEUL endroit et lu par toutes les listes, pastilles et onglets :
//
//   À confirmer → En préparation → Prête → (date jouée) → À solder → Soldée
//                                                      (+ Annulée)
//
//   - À confirmer    : statut lead / en négo.
//   - En préparation : confirmée, une étape manque (Contrat → MEV → VHR).
//   - Prête          : confirmée, contrat signé, billetterie en ligne, VHR pris.
//   - À solder       : jouée, comptes pas encore clos.
//   - Soldée         : comptes clos — quote-part artiste réglée (settledAt)
//                      ET plus rien à payer ni à encaisser sur la date
//                      (Stan 2026-10-26 : un appel de quote-part versé avant
//                      la dernière charge laisse la date « À solder »).
//
// Module pur, identique dans KuroNeko-App et YouriV2-app (statuts des deux
// apps reconnus).

export type DateStage =
  | "A_CONFIRMER"
  | "EN_PREPARATION"
  | "PRETE"
  | "A_SOLDER"
  | "SOLDEE"
  | "ANNULEE";

export type LifecycleSource = {
  status: string;
  isPast: boolean;
  settled: boolean;
  /** Recettes non encaissées ou charges non payées sur la date. */
  openMoney: boolean;
  contractSigned: boolean;
  ticketingReady: boolean;
  vhrBooked: boolean;
};

const CANCELLED = new Set(["CANCELLED", "ANNULE"]);
const UNCONFIRMED = new Set(["LEAD", "NEGOTIATING", "EN_COURS"]);

export function isCancelledStatus(status: string): boolean {
  return CANCELLED.has(status);
}

/** Prochaine étape de préparation manquante (Contrat → MEV → VHR), ou null. */
export function nextPrepStep(d: Pick<LifecycleSource, "contractSigned" | "ticketingReady" | "vhrBooked">):
  | "Contrat"
  | "MEV"
  | "VHR"
  | null {
  if (!d.contractSigned) return "Contrat";
  if (!d.ticketingReady) return "MEV";
  if (!d.vhrBooked) return "VHR";
  return null;
}

/** Reste-t-il de l'argent à encaisser ou à payer (arrondi à l'euro) ? */
export function hasOpenMoney(openRevenue: number, openCost: number): boolean {
  return Math.round(openRevenue) !== 0 || Math.round(openCost) !== 0;
}

export function dateStage(d: LifecycleSource): DateStage {
  if (d.settled && !d.openMoney) return "SOLDEE";
  if (CANCELLED.has(d.status)) return "ANNULEE";
  if (d.isPast || d.settled) return "A_SOLDER";
  if (UNCONFIRMED.has(d.status)) return "A_CONFIRMER";
  return nextPrepStep(d) ? "EN_PREPARATION" : "PRETE";
}

export const DATE_STAGE_META: Record<
  DateStage,
  { label: string; tone: "slate" | "amber" | "sky" | "emerald" | "red" | "violet" }
> = {
  A_CONFIRMER: { label: "À confirmer", tone: "slate" },
  EN_PREPARATION: { label: "En préparation", tone: "amber" },
  PRETE: { label: "Prête", tone: "emerald" },
  A_SOLDER: { label: "À solder", tone: "red" },
  SOLDEE: { label: "Soldée", tone: "violet" },
  ANNULEE: { label: "Annulée", tone: "slate" },
};

/** Classes Tailwind d'une pastille d'étape (texte + fond + bordure, clair/sombre). */
export const STAGE_PILL_CLASS: Record<(typeof DATE_STAGE_META)[DateStage]["tone"], string> = {
  slate: "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300",
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  sky: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  red: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  violet: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};
