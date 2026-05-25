"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2, Globe } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Autocomplete d'adresses en cascade :
 *   1. **BAN** (`api-adresse.data.gouv.fr`) — France uniquement, qualité officielle
 *      (BANO + OSM), numéros de rue précis. Source primaire.
 *   2. **Photon (OSM)** (`photon.komoot.io`) — couverture monde entier. Fallback
 *      activé automatiquement quand BAN ne retourne aucun résultat.
 *
 * Les deux sources sont gratuites, sans clé d'API ni quota strict.
 *
 * UX : tape ≥ 3 caractères → suggestions. Clic sélectionne l'adresse complète
 * et appelle `onPick` pour pré-remplir les champs adjacents (ville, postcode).
 * Une petite icône 🌍 indique les résultats internationaux (Photon) pour que
 * tu saches d'où vient la donnée.
 */

interface Suggestion {
  /** Adresse complète formatée (ex. "10 Rue de Rivoli 75004 Paris"). */
  label: string;
  /** Sous-titre : contexte département/région (FR) ou pays/state (intl). */
  context: string;
  /** ID unique (BAN id ou OSM id) — clé React. */
  id: string;
  /** Ville extraite. */
  city: string;
  /** Code postal. */
  postcode: string;
  /** Source — distingue France (BAN) vs international (Photon). */
  source: "ban" | "photon";
}

/**
 * Payload renvoyé au parent quand l'utilisateur sélectionne une suggestion :
 * permet de pré-remplir d'autres champs (ville, code postal) sans re-parser
 * le label côté formulaire.
 */
export interface AddressPick {
  label: string;
  city: string;
  postcode: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Appelée quand l'utilisateur clique sur une suggestion (pas à la saisie). */
  onPick?: (pick: AddressPick) => void;
  placeholder?: string;
  /** Si true, on désactive l'autocomplete (utile en read-only). */
  disabled?: boolean;
  className?: string;
}

/**
 * Recherche BAN (France). Retourne [] si rien trouvé ou erreur réseau.
 */
async function searchBan(q: string): Promise<Suggestion[]> {
  try {
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=6`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: Array<{
        properties: {
          label: string;
          context: string;
          id: string;
          city?: string;
          postcode?: string;
        };
      }>;
    };
    return (data.features ?? []).map((f) => ({
      label: f.properties.label,
      context: f.properties.context,
      id: f.properties.id,
      city: f.properties.city ?? "",
      postcode: f.properties.postcode ?? "",
      source: "ban" as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Recherche Photon (OSM, worldwide). Retourne [] si rien ou erreur.
 *
 * On reconstruit un `label` à la BAN à partir des composants OSM
 * (housenumber + street + postcode + city). Le `context` devient le pays
 * + région pour distinguer.
 */
async function searchPhoton(q: string): Promise<Suggestion[]> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=fr&limit=6`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: Array<{
        properties: {
          osm_id?: number | string;
          name?: string;
          housenumber?: string;
          street?: string;
          city?: string;
          postcode?: string;
          state?: string;
          country?: string;
        };
      }>;
    };
    return (data.features ?? [])
      .filter((f) => Boolean(f.properties.city || f.properties.name))
      .map((f) => {
        const p = f.properties;
        const street = [p.housenumber, p.street].filter(Boolean).join(" ").trim();
        const right = [p.postcode, p.city].filter(Boolean).join(" ").trim();
        const labelParts = [street, right, p.country].filter(Boolean);
        const label =
          labelParts.length > 0
            ? labelParts.join(", ")
            : (p.name ?? q);
        const context = [p.state, p.country].filter(Boolean).join(", ");
        return {
          label,
          context,
          id: String(p.osm_id ?? `${p.name}-${p.city}`),
          city: p.city ?? "",
          postcode: p.postcode ?? "",
          source: "photon" as const,
        };
      });
  } catch {
    return [];
  }
}

export function AddressAutocomplete({
  value,
  onChange,
  onPick,
  placeholder = "Numéro et rue, ville…",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  // Token de course pour ignorer les réponses obsolètes quand le user tape vite.
  const tokenRef = useRef(0);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3) {
      // Vidage immédiat des suggestions quand l'input est trop court — évite
      // l'affichage de résultats stale d'une saisie précédente, et n'envoie
      // pas de requête réseau pour rien.
      /* eslint-disable react-hooks/set-state-in-effect */
      setSuggestions([]);
      setLoading(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    const token = ++tokenRef.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      // Cascade : BAN d'abord (qualité FR), fallback Photon si vide.
      const banResults = await searchBan(q);
      if (token !== tokenRef.current) return; // stale
      if (banResults.length > 0) {
        setSuggestions(banResults);
        setLoading(false);
        return;
      }
      // BAN sec → on tente Photon (worldwide).
      const photonResults = await searchPhoton(q);
      if (token !== tokenRef.current) return; // stale
      setSuggestions(photonResults);
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Délai pour permettre le click sur une suggestion avant de fermer.
            setTimeout(() => setOpen(false), 150);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-7"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-md border bg-popover shadow-md text-sm">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                // onMouseDown au lieu de onClick : se déclenche AVANT le blur
                // de l'input → on sélectionne la suggestion sans race.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(s.label);
                  onPick?.({
                    label: s.label,
                    city: s.city,
                    postcode: s.postcode,
                  });
                  setSuggestions([]);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-accent flex items-start gap-2"
              >
                {/* Icône différenciée : drapeau-MapPin pour FR (BAN), globe pour
                    international (Photon). Aide à comprendre la qualité de la
                    suggestion en un coup d'œil. */}
                {s.source === "photon" ? (
                  <Globe className="h-3.5 w-3.5 mt-0.5 text-[--yr-gold] shrink-0" />
                ) : (
                  <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate">{s.label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {s.context || (s.source === "photon" ? "International" : "France")}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
