/**
 * Formatage des identifiants administratifs français à la saisie et à
 * l'affichage (groupes de chiffres fixes). Copie fidèle de
 * KuroNeko-App `lib/id-format.ts`.
 *
 *   N° Sécurité sociale (NIR, 15 chiffres) → "X XX XX XX XXX XXX XX"
 *   SIRET (14 chiffres)                    → "XXX XXX XXX XXXXX"
 *   SIREN (9 chiffres)                     → "XXX XXX XXX"
 *   IBAN (alphanumérique, FR = 27 car.)    → "XXXX XXXX XXXX XXXX XXXX XXXX XXX"
 *
 * Tolérant et idempotent : on repart toujours des caractères bruts, donc
 * re-formater une valeur déjà formatée redonne le même résultat. Ne jette
 * jamais — une saisie incomplète est regroupée au mieux (s'arrête sur place).
 *
 * Convention (cf. lib/format-phone) : on FORMATE à la saisie (onChange) et à
 * l'affichage, mais on STOCKE normalisé (chiffres seuls, IBAN en majuscules
 * sans espaces) via les fonctions normalize* appelées au submit.
 */

/**
 * Regroupe une chaîne selon des tailles de blocs fixes. S'arrête proprement sur
 * une saisie partielle (ne complète pas). Le surplus éventuel est ignoré —
 * l'appelant tronque en amont à la longueur officielle.
 */
function groupBySizes(value: string, sizes: number[]): string {
  const out: string[] = [];
  let i = 0;
  for (const size of sizes) {
    if (i >= value.length) break;
    out.push(value.slice(i, i + size));
    i += size;
  }
  return out.join(" ");
}

const onlyDigits = (raw: string | null | undefined): string =>
  (raw ?? "").replace(/\D/g, "");

/** N° Sécurité sociale (NIR, 15 chiffres) → "X XX XX XX XXX XXX XX". */
export function formatNir(raw: string | null | undefined): string {
  return groupBySizes(onlyDigits(raw).slice(0, 15), [1, 2, 2, 2, 3, 3, 2]);
}

/** SIRET (14 chiffres) → "XXX XXX XXX XXXXX". */
export function formatSiret(raw: string | null | undefined): string {
  return groupBySizes(onlyDigits(raw).slice(0, 14), [3, 3, 3, 5]);
}

/** SIREN (9 chiffres) → "XXX XXX XXX". */
export function formatSiren(raw: string | null | undefined): string {
  return groupBySizes(onlyDigits(raw).slice(0, 9), [3, 3, 3]);
}

/**
 * IBAN (alphanumérique) → groupes de 4 : "XXXX XXXX XXXX …".
 * Conserve les lettres (FR…), met en majuscules, retire les séparateurs.
 * IBAN FR = 27 caractères → 6 groupes de 4 + 1 groupe de 3.
 */
export function formatIban(raw: string | null | undefined): string {
  const clean = (raw ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 34); // longueur IBAN max (norme ISO 13616)
  return clean.replace(/(.{4})(?=.)/g, "$1 ");
}

/** Normalise pour le stockage : chiffres seuls (Sécu, SIRET, SIREN). */
export function normalizeDigits(raw: string | null | undefined): string {
  return onlyDigits(raw);
}

/** Normalise un IBAN pour le stockage : alphanumérique, majuscules, sans espaces. */
export function normalizeIban(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}
