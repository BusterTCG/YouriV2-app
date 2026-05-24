/**
 * Types + constantes pures pour les contacts.
 * Repris à l'identique de KuroNeko-App contacts-types.ts (les types de contact
 * sont partagés entre les 2 apps puisque l'annuaire est mutualisé).
 *
 * Sans dépendance Prisma client/concrète, importable depuis du code client.
 */

import type { ContactType } from "@/lib/kn-client";

export type ContactsListType = "all" | ContactType;

/**
 * Libellés et emojis pour chaque type de contact.
 * Ordre d'affichage : alphabétique sur le label, **sauf "Autre" toujours en
 * dernier** (catch-all visuellement séparé du reste).
 */
export const CONTACT_TYPE_OPTIONS: Array<{
  value: ContactType;
  label: string;
  emoji: string;
  /** Description courte pour l'utilisateur (form, tooltips). */
  hint: string;
}> = [
  { value: "AGENCY",     label: "Agence",       emoji: "🏢",  hint: "Agence de pub, communication, gestion d'image" },
  { value: "ARTIST",     label: "Artiste",      emoji: "🌟",  hint: "Stand-uppeur, comédien, musicien, etc." },
  { value: "BRAND",      label: "Marque",       emoji: "🥷🏾", hint: "Marque ou sponsor (client final OP marque)" },
  { value: "ORGANIZER",  label: "Organisateur", emoji: "🎫",  hint: "Plateaux, festivals, programmateurs de salles" },
  { value: "PRESS",      label: "Presse",       emoji: "📰",  hint: "Journaliste, attaché de presse, média" },
  { value: "PRODUCTION", label: "Production",   emoji: "🎬",  hint: "Boîte de production (société tierce)" },
  { value: "TECHNICAL",  label: "Technique",    emoji: "🔧",  hint: "Régie, technique, captation, VTC, photographe" },
  { value: "OTHER",      label: "Autre",        emoji: "•",   hint: "Avocat, comptable, divers" },
];

/** Options pour le filtre (préfixe "all" + tous les types). */
export const CONTACT_FILTER_OPTIONS: Array<{ value: ContactsListType; label: string }> = [
  { value: "all", label: "Tous" },
  ...CONTACT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: `${o.emoji} ${o.label}` })),
];

export function contactTypeLabel(t: ContactType): string {
  return CONTACT_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? "Autre";
}

export function contactTypeEmoji(t: ContactType): string {
  return CONTACT_TYPE_OPTIONS.find((o) => o.value === t)?.emoji ?? "•";
}

/** Option `Venue` pour le select dans le formulaire contact. */
export type VenueOption = {
  id: string;
  name: string;
  city: string;
};

export const DEFAULT_TYPE_FILTER: ContactsListType = "all";

export function parseTypeFilter(v: string | undefined): ContactsListType {
  if (v === "all") return "all";
  if (CONTACT_TYPE_OPTIONS.some((o) => o.value === v)) return v as ContactType;
  return DEFAULT_TYPE_FILTER;
}

/**
 * Nom complet d'un contact : "Prénom Nom" si lastName, sinon "Prénom".
 * Si une `company` existe et qu'il n'y a pas de nom, on retombe sur la société.
 */
export function contactDisplayName(c: {
  firstName: string;
  lastName: string | null;
  company: string | null;
}): string {
  const fullName = c.lastName ? `${c.firstName} ${c.lastName}` : c.firstName;
  if (fullName.trim()) return fullName.trim();
  return c.company ?? "(Sans nom)";
}

/** Initiales (2 lettres max) pour l'avatar du contact. */
export function contactInitials(c: {
  firstName: string;
  lastName: string | null;
}): string {
  const f = c.firstName.charAt(0).toUpperCase();
  const l = c.lastName ? c.lastName.charAt(0).toUpperCase() : "";
  return (f + l) || "?";
}
