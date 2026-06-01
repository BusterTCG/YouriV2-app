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
  /** Couleur d'identification (hex) — chip/avatar associé. Stan 2026-05-31. */
  color: string;
}

/**
 * Membres de l'équipe Pangee Prod — **ordre alphabétique** par firstName
 * (Stan 2026-05-26). Tout caller qui itère sur PANGEE_TEAM aura les chips /
 * listes / pickers triés alphabétiquement par défaut.
 */
export const PANGEE_TEAM: PangeeMember[] = [
  {
    key: "angath",
    firstName: "Angath",
    lastName: "",
    phone: "",
    defaultRole: "PRODUCTION",
    color: "#10b981", // emerald
  },
  {
    key: "certe",
    firstName: "Certe",
    lastName: "",
    phone: "",
    defaultRole: "PRODUCTION",
    color: "#8b5cf6", // violet
  },
  {
    key: "stan",
    firstName: "Stan",
    lastName: "",
    phone: "",
    defaultRole: "PRODUCTION",
    color: "#f59e0b", // amber
  },
];

/**
 * Map indexée par `key` pour résolution O(1).
 * Stan 2026-05-31 : utilisé par `getAssigneeName()` partagé client/serveur.
 */
const TEAM_BY_KEY = new Map(PANGEE_TEAM.map((m) => [m.key, m]));

/**
 * Retourne le prénom de l'associé Pangee à partir de sa key (stan/certe/angath),
 * ou "Non attribué" si null. Sûr côté serveur ET client (pas de "use client").
 */
export function getAssigneeName(key: string | null | undefined): string {
  if (!key) return "Non attribué";
  return TEAM_BY_KEY.get(key)?.firstName ?? key;
}

/**
 * Retourne la couleur (hex) de l'associé Pangee, ou null si key non
 * reconnue / non attribuée. Stan 2026-05-31 : ronds de couleur visuels.
 */
export function getAssigneeColor(key: string | null | undefined): string | null {
  if (!key) return null;
  return TEAM_BY_KEY.get(key)?.color ?? null;
}

/** Company affichée sur la FDR pour les contacts Pangee. */
export const PANGEE_COMPANY = "Pangee Prod";
