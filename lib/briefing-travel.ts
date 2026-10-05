import type { TravelDirection } from "@prisma/client";

/**
 * Lecture des champs JSON d'un trajet FDR (BriefingTravel.runs / travelers).
 * Partagé entre l'éditeur, la vue print et les pages serveur.
 */

/** Run / transfert voiture : point de départ → point d'arrivée + heure pickup. */
export type TravelRun = { from: string; to: string; time: string };

/** Voyageur d'un trajet : artiste du deal (artistId) ou nom libre. */
export type TravelTraveler = { artistId?: string; name: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Normalise `runs` JSON. Lit aussi l'ancien format `{ location, time }`
 * (avant Stan 2026-10-05) : `location` était la destination à l'aller /
 * entre étapes, le lieu de pickup au retour (la gare étant implicite).
 */
export function parseRuns(raw: unknown, direction: TravelDirection): TravelRun[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((r) => {
    if ("from" in r || "to" in r) {
      return { from: str(r.from), to: str(r.to), time: str(r.time) };
    }
    const location = str(r.location);
    return direction === "RETURN"
      ? { from: location, to: "", time: str(r.time) }
      : { from: "", to: location, time: str(r.time) };
  });
}

/** Normalise `travelers` JSON (null / invalide → []). */
export function parseTravelers(raw: unknown): TravelTraveler[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .filter((t) => typeof t.name === "string" && t.name.trim())
    .map((t) => ({
      ...(typeof t.artistId === "string" && t.artistId ? { artistId: t.artistId } : {}),
      name: (t.name as string).trim(),
    }));
}

/** « Boriss, Nordine, Jean » — vide si personne de précisé (= tout le monde). */
export function travelersLabel(travelers: TravelTraveler[]): string {
  return travelers.map((t) => t.name).join(", ");
}
