/**
 * Helpers pour la liste d'artistes Youri (Pangee).
 *
 * Copie fidèle de KuroNeko-App `lib/artists.ts` (cf. AGENTS.md règle copie
 * fidèle KN). Adapté : pas de slug "divers" réservé côté Pangee pour
 * l'instant — mais on garde le helper sortArtistsDiversLast tel quel pour
 * être prêt si Stan en ajoute un.
 */

export type ArtistSortable = { name: string; slug: string };

/**
 * Règle métier KN reprise telle quelle : "Divers" est toujours affiché en
 * dernier (fourre-tout, donc visuellement à part). Pour les autres,
 * tri alphabétique français.
 */
export function sortArtistsDiversLast<T extends ArtistSortable>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.slug === "divers") return 1;
    if (b.slug === "divers") return -1;
    return a.name.localeCompare(b.name, "fr");
  });
}

/**
 * Initiales d'un artiste pour affichage compact en tableau.
 * - "Nordine Ganso"          → "NG"
 * - "Rey Mendes"             → "RM"
 * - "Jean-Pierre Polnareff"  → "JP" (split sur espace uniquement, max 3 lettres)
 * - "Divers" (slug=divers)   → "Divers" (cas spécial : on garde le mot complet)
 */
export function artistInitials(name: string, slug: string): string {
  if (slug === "divers") return "Divers";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 3);
}
