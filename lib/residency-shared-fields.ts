// Portage KN — champs d'un mois de résidence répercutés par défaut sur tous les mois de
// la résidence quand on les modifie depuis la page du mois (Stan
// 2026-10-01 : « par défaut sur tous les mois, avec le choix au moment de la
// modif »). Séances, payants, billetterie, recettes et charges restent
// propres à chaque mois.

export const RESIDENCY_SHARED_FIELDS = [
  "contractSigned",
  "ticketingReady",
  "ticketingUrl",
  "vhrBooked",
  "venueDealKind",
  "coRealKnPct",
  "capacity",
  "venueRoomId",
] as const;

export type ResidencySharedField = (typeof RESIDENCY_SHARED_FIELDS)[number];

export function isResidencySharedField(k: string): k is ResidencySharedField {
  return (RESIDENCY_SHARED_FIELDS as readonly string[]).includes(k);
}
