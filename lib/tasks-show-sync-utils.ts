/**
 * Helpers purs pour la synchronisation bidirectionnelle fiche show ↔ tâches
 * du pipeline (Sprint 6 v3 — Stan 2026-05-31).
 *
 * Pas `"use server"` ni `server-only` — utilisé côté server actions (tasks +
 * sync-show-tasks). Sans état, sans import Prisma.
 */

export type ShowTaskKey = "contractSigned" | "ticketingReady" | "vhrBooked";

/**
 * Matchers (regex compilées, case-insensitive) pour le matching label → tâche.
 *
 * Stan 2026-05-31 v4 audit : on utilise des word-boundaries pour les acronymes
 * courts (`mev`, `vhr`) afin d'éviter les faux positifs (ex. "mev" qui aurait
 * matché "Améliorer..." ou "vhr" dans un mot plus long). Les libellés longs
 * ("signature", "billetterie", "mise en ligne") restent en `includes` car
 * peu de risque de collision.
 */
const MATCHERS: Record<ShowTaskKey, RegExp[]> = {
  contractSigned: [/signature/i, /contrat\s+signé/i],
  ticketingReady: [/mise\s+en\s+ligne/i, /\bmev\b/i, /billetterie/i],
  vhrBooked: [/\bvhr\b/i, /gestion\s+vhr/i],
};

export function labelMatchesShowKey(
  label: string,
  key: ShowTaskKey,
): boolean {
  return MATCHERS[key].some((re) => re.test(label));
}

/**
 * Retourne le `ShowTaskKey` correspondant au label de la tâche, ou null si
 * aucun match. Utilisé dans `markTaskDone` pour synchroniser le flag Deal
 * quand l'user valide une tâche directement depuis le pipeline.
 */
export function getShowKeyFromLabel(label: string): ShowTaskKey | null {
  const keys: ShowTaskKey[] = [
    "contractSigned",
    "ticketingReady",
    "vhrBooked",
  ];
  return keys.find((k) => labelMatchesShowKey(label, k)) ?? null;
}
