/**
 * Helpers de formatage téléphone — règle Stan 2026-05-26 :
 * "les numéros doivent toujours ressortir au format xx xx xx xx xx".
 *
 * Pas de `server-only` ni de dépendance Prisma → importable côté client +
 * server. Pas dans deal-helpers.ts car utilisé hors du domaine /deals
 * (annuaire contacts + FDR contacts).
 *
 * Stratégie :
 *   - Strip tous les caractères non-numériques (espaces, points, tirets, +)
 *   - Convertit le préfixe FR international (+33, 0033) en `0`
 *   - Si 10 chiffres FR → format "06 12 34 56 78"
 *   - Sinon → garde la valeur d'origine nettoyée (numéros internationaux,
 *     formats entreprise 3-4 chiffres, etc.)
 */

/** Strip tout sauf les digits. */
function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Formate un numéro de téléphone pour l'affichage UI.
 *
 *   "0612345678"        → "06 12 34 56 78"
 *   "06.12.34.56.78"    → "06 12 34 56 78"
 *   "06-12-34-56-78"    → "06 12 34 56 78"
 *   "06 12 34 56 78"    → "06 12 34 56 78"
 *   "+33612345678"      → "06 12 34 56 78"
 *   "+33 6 12 34 56 78" → "06 12 34 56 78"
 *   "0033612345678"     → "06 12 34 56 78"
 *   "+44 20 7946 0958"  → "+44 20 7946 0958"  (UK, gardé tel quel)
 *   ""                  → ""
 *   null                → ""
 */
export function formatPhone(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = input.trim();
  let digits = digitsOnly(trimmed);

  // Préfixe international FR : "+33 6 12 34 56 78" / "0033 6..." → "0612345678"
  if (digits.startsWith("0033") && digits.length === 13) {
    digits = "0" + digits.slice(4);
  } else if (digits.startsWith("33") && digits.length === 11) {
    // Vient de "+33..." nettoyé (le + a été stripé)
    digits = "0" + digits.slice(2);
  }

  // Format FR standard : 10 chiffres → "06 12 34 56 78"
  if (/^\d{10}$/.test(digits)) {
    return digits.replace(
      /(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
      "$1 $2 $3 $4 $5",
    );
  }

  // Format non-standard (international non-FR, entreprise 3/4 chiffres, etc.) :
  // on garde la saisie d'origine en normalisant juste les espaces multiples.
  return trimmed.replace(/\s+/g, " ");
}

/**
 * Retourne une string utilisable dans `href="tel:..."`. On strip tous les
 * caractères non-numériques pour que les apps de téléphonie composent le
 * numéro sans ambiguïté. Préserve le préfixe `+` initial s'il est présent
 * (utile pour les numéros internationaux gardés bruts).
 */
export function phoneHref(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = digitsOnly(trimmed);
  return hasPlus ? `+${digits}` : digits;
}
