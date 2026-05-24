/**
 * Génère un slug URL-safe depuis une string (typiquement un nom d'artiste).
 *
 * - Lowercase
 * - Retire les diacritiques (é → e, ç → c, etc.)
 * - Remplace les espaces / ponctuation par des tirets
 * - Squash les tirets multiples + trim les tirets en bordure
 *
 * Pour garantir l'unicité en BDD : l'appelant peut suffixer -2, -3, etc.
 * via `uniqueSlug()` qui prend une liste de slugs existants.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // tout ce qui n'est pas alphanum → tiret
    .replace(/^-+|-+$/g, "") // trim tirets en bordure
    .replace(/-{2,}/g, "-"); // squash tirets multiples
}

/**
 * Renvoie un slug unique en suffixant -2, -3, etc. si nécessaire.
 *
 * @param input texte source (ex. "Jean Dupont")
 * @param existing tableau de slugs déjà pris en BDD
 */
export function uniqueSlug(input: string, existing: string[]): string {
  const base = slugify(input);
  if (!base) return "x"; // fallback si input vide après nettoyage
  if (!existing.includes(base)) return base;

  let n = 2;
  while (existing.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
