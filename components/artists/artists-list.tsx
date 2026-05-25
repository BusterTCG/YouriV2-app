"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArtistAvatar } from "./artist-avatar";
import { NewArtistButton } from "./new-artist-button";

/**
 * Liste artistes Youri avec recherche locale instantanée.
 *
 * La page /artistes (server component) fetch tous les artistes Pangee
 * (< 100, tient en RAM) et délègue à ce client component l'affichage +
 * filtrage. Pas d'URL state (?q=…) — c'est instantané et la liste ne
 * justifie pas une nav refresh.
 *
 * Recherche case-insensitive sur name + slug, normalisée pour matcher
 * "ganso" → "Nordine Ganso" (et un futur stageName si on l'ajoute aux
 * critères de search).
 */
export interface ArtistListItem {
  id: string;
  name: string;
  slug: string;
  color: string;
  avatarUrl: string | null;
  avatarPositionX: number;
  avatarPositionY: number;
  active: boolean;
}

interface Props {
  artists: ArtistListItem[];
}

/** Normalise une chaîne pour recherche accent-insensitive lowercase. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function ArtistsList({ artists }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return artists;
    return artists.filter((a) => {
      return normalize(a.name).includes(q) || normalize(a.slug).includes(q);
    });
  }, [artists, query]);

  return (
    <div className="space-y-6">
      {/* Barre actions empilée — Stan 2026-05-26 :
            [+ Nouvel artiste]
            [🔎 Rechercher un artiste…]
          La recherche est en dessous du bouton, pas à côté. */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <NewArtistButton />
        </div>
        <div className="relative max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un artiste…"
            className="pl-7 pr-7 h-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground"
              aria-label="Effacer la recherche"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Compteur dynamique (suit le filtre) */}
      <p className="text-xs text-muted-foreground -mt-3">
        {query
          ? `${filtered.length} résultat${filtered.length > 1 ? "s" : ""} sur ${artists.length}`
          : `${artists.length} artiste${artists.length > 1 ? "s" : ""} dans le portfolio Pangee.`}
      </p>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {query
                ? `Aucun artiste ne correspond à « ${query} ».`
                : "Aucun artiste pour l'instant. Ajoute le premier via « Nouvel artiste »."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((artist) => (
            <Link
              key={artist.id}
              href={`/artistes/${artist.slug}`}
              className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40 rounded-xl"
            >
              <Card className="h-full transition-colors hover:bg-accent/40 hover:border-foreground/30 cursor-pointer">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <ArtistAvatar
                      name={artist.name}
                      color={artist.color}
                      avatarUrl={artist.avatarUrl}
                      positionX={artist.avatarPositionX}
                      positionY={artist.avatarPositionY}
                      sizeClass="h-10 w-10"
                    />
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate">
                        {artist.name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        /{artist.slug}
                      </CardDescription>
                    </div>
                    {artist.active ? (
                      <Badge variant="secondary" className="shrink-0">
                        Actif
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0">
                        Inactif
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* KPIs deals/tâches : placeholder Sprint 3 (model Deal Pangee)
                      + Sprint 6 (model Task). Pour l'instant 0 figés. */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>0 deals</span>
                    <span>·</span>
                    <span>0 tâches</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
