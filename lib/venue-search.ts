/**
 * Parser de la recherche multi-token Venue.
 *
 * COPIE FIDÈLE de `parseVenueQuery()` côté KuroNeko-App (`lib/venues.ts`).
 * Voir AGENTS.md règle "copie fidèle de KN".
 *
 * Stan tape par exemple "paris +250" → on extrait { capacityMin: 250,
 * freeText: "paris" } pour interroger l'API KN avec `?q=paris&capacityMin=250`.
 *
 * Côté KN, l'endpoint `/api/external/venues` (modifié dans le même sprint)
 * accepte ces 3 params et applique le filtre OR (Venue.capacity OU
 * n'importe quelle VenueRoom.capacity dans la borne).
 *
 * Exemples acceptés :
 *   "moins de 250 places, paris"  → { capacityMax: 250, freeText: "paris" }
 *   "plus de 500"                 → { capacityMin: 500, freeText: "" }
 *   "entre 200 et 800 places"     → { capacityMin: 200, capacityMax: 800, freeText: "" }
 *   "<150 lyon"                   → { capacityMax: 150, freeText: "lyon" }
 *   ">=1000 cigale"               → { capacityMin: 1000, freeText: "cigale" }
 *   "+250 paris"                  → { capacityMin: 250, freeText: "paris" }
 *   "olympia"                     → { freeText: "olympia" }
 */

export interface ParsedVenueQuery {
  capacityMin?: number;
  capacityMax?: number;
  freeText: string;
}

export function parseVenueQuery(input: string): ParsedVenueQuery {
  let remaining = input.trim();
  if (!remaining) return { freeText: "" };

  let capacityMin: number | undefined;
  let capacityMax: number | undefined;

  // 1) Range "entre N et M (places)" — testé en premier car il consomme 2 nombres.
  const range =
    /entre\s+(\d+)\s+et\s+(\d+)\s*(?:places?|pl|p)?/i.exec(remaining);
  if (range) {
    const a = parseInt(range[1], 10);
    const b = parseInt(range[2], 10);
    capacityMin = Math.min(a, b);
    capacityMax = Math.max(a, b);
    remaining = remaining.replace(range[0], " ");
  }

  // 2) Borne supérieure : "moins de N", "inférieur à N", "<N", "<=N".
  if (capacityMax == null) {
    const less =
      /(?:moins\s+de|inf[ée]rieur(?:e)?\s+[àa]|<=?)\s*(\d+)\s*(?:places?|pl|p)?/i.exec(
        remaining,
      );
    if (less) {
      capacityMax = parseInt(less[1], 10);
      remaining = remaining.replace(less[0], " ");
    }
  }

  // 3) Borne inférieure : "plus de N", "supérieur à N", ">N", ">=N", "+N".
  if (capacityMin == null) {
    const more =
      /(?:plus\s+de|sup[ée]rieur(?:e)?\s+[àa]|>=?|\+)\s*(\d+)\s*(?:places?|pl|p)?/i.exec(
        remaining,
      );
    if (more) {
      capacityMin = parseInt(more[1], 10);
      remaining = remaining.replace(more[0], " ");
    }
  }

  // Nettoyage : virgules → espaces, espaces multiples → un seul.
  const freeText = remaining.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  return { capacityMin, capacityMax, freeText };
}
