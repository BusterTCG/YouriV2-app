import "server-only";

import { listVenues, type KnVenue } from "@/lib/kn-client";
import { parseVenueQuery, type ParsedVenueQuery } from "@/lib/venue-search";

/**
 * Wrapper Youri qui combine la liste KN authoritative (annuaire) avec les
 * compteurs locaux Youri (deals Pangee). Pour l'instant `dealsCount` est
 * toujours 0 — le model `Deal` Youri arrivera au Sprint 3+, à ce moment
 * on remplacera par `prisma.deal.groupBy({ by: venueId, where: deletedAt: null })`.
 *
 * Pourquoi ce helper : la page /lieux affiche un footer "X contacts · X deals"
 * sur chaque card. `contactsCount` vient de KN (annuaire partagé), `dealsCount`
 * doit refléter les deals Pangee (table Deal locale), pas les deals KN.
 *
 * Copie fidèle KN : cf. `KuroNeko-App/lib/venues.ts § getVenuesList`. La
 * différence d'archi : KN parse + query Prisma direct, Youri parse + appelle
 * l'API KN (annuaire distant) + enrichit avec dealsCount local.
 */
export interface VenueListItem extends KnVenue {
  /** Nombre de deals Youri (Pangee) liés à ce lieu. 0 jusqu'au Sprint 3. */
  dealsCount: number;
}

export interface VenuesListData {
  venues: VenueListItem[];
  total: number;
  /** Filtres parsés depuis la query, exposés pour affichage UI. */
  parsedQuery: ParsedVenueQuery;
}

export async function getVenuesList(opts: {
  search?: string;
  limit?: number;
}): Promise<VenuesListData> {
  const raw = opts.search?.trim() ?? "";
  const parsed = parseVenueQuery(raw);

  const result = await listVenues({
    q: parsed.freeText || undefined,
    capacityMin: parsed.capacityMin,
    capacityMax: parsed.capacityMax,
    limit: opts.limit ?? 100,
  });

  // TODO Sprint 3+ : grouper par venueId et fusionner les counts.
  //   const deals = await prisma.deal.groupBy({
  //     by: ["venueId"], _count: { _all: true },
  //     where: { deletedAt: null, venueId: { in: ids } },
  //   });
  const venues: VenueListItem[] = result.items
    .map((v) => ({ ...v, dealsCount: 0 }))
    // Tri alphabétique français insensible à la casse/accents (Église ≈ église,
    // Avant-Scène triée comme "AvantScene"). Reproduit le comportement KN local
    // (`KuroNeko-App/lib/venues.ts § getVenuesList`). L'API KN renvoie trié par
    // (city asc, name asc) — on re-trie ici sur le nom uniquement.
    .sort((a, b) =>
      a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
    );

  return { venues, total: result.total, parsedQuery: parsed };
}
