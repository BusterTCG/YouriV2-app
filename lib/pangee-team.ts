/**
 * Équipe Pangee Prod — config statique pour l'ajout rapide sur la FDR
 * (Stan 2026-05-26).
 *
 * Stan, Certe et Angath ont des numéros connus qu'on veut pouvoir injecter
 * en 1 clic dans la section Contacts d'une FDR sans repasser par l'annuaire
 * KN distant ou la saisie manuelle.
 *
 * Pas de table DB pour ces 3 entrées — ils vivent ici. Stan édite ce
 * fichier pour mettre à jour les numéros (puis redéploie).
 *
 * Pour ajouter un nouveau membre Pangee, ajouter une entrée dans
 * PANGEE_TEAM avec un `key` unique.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TODO MIGRATION FUTURE (Stan 2026-05-26) :
 *   Quand on construira `/settings/users` (gestion ADMIN), ajouter un
 *   champ `phone String?` sur le model `User`. Remplacer ce fichier par
 *   un fetch dynamique des users actifs (active=true) avec leur phone.
 *   Le composant NewPangeeContactRow tapera sur prisma.user.findMany
 *   au lieu de PANGEE_TEAM. Stan pourra éditer les numéros depuis l'UI
 *   sans repasser par du code source.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { BriefingRole } from "@prisma/client";

export interface PangeeMember {
  key: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** Rôle par défaut sur la FDR — l'user peut le changer avant submit. */
  defaultRole: BriefingRole;
}

/** Membres de l'équipe Pangee Prod (Stan / Certe / Angath). */
export const PANGEE_TEAM: PangeeMember[] = [
  {
    key: "stan",
    firstName: "Stan",
    lastName: "",
    phone: "",
    defaultRole: "PRODUCTION",
  },
  {
    key: "certe",
    firstName: "Certe",
    lastName: "",
    phone: "",
    defaultRole: "PRODUCTION",
  },
  {
    key: "angath",
    firstName: "Angath",
    lastName: "",
    phone: "",
    defaultRole: "PRODUCTION",
  },
];

/** Company affichée sur la FDR pour les contacts Pangee. */
export const PANGEE_COMPANY = "Pangee Prod";
