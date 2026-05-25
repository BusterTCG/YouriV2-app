import { Mic2 } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { sortArtistsDiversLast } from "@/lib/artists";
import { ArtistAvatar } from "@/components/artists/artist-avatar";
import { NewArtistButton } from "@/components/artists/new-artist-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Artistes — Pangee Prod",
};

/**
 * Liste des artistes Pangee Prod — copie fidèle de KuroNeko-App
 * `app/(app)/artists/page.tsx`. Différences inévitables Youri V2 :
 *   - Soft-delete via `deletedAt` (en plus de `active`) → filtré côté query.
 *   - Footer KPIs "X deals · X tâches" : placeholder 0 pour l'instant —
 *     le model `Deal` Youri (Pangee) arrivera au Sprint 3, `Task` au Sprint 6.
 *     À ce moment-là, on rebranchera `_count: { deals: true, tasks: true }`.
 */
export default async function ArtistsPage() {
  const artistsRaw = await prisma.artist.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      color: true,
      avatarUrl: true,
      avatarPositionX: true,
      avatarPositionY: true,
      active: true,
    },
  });
  const artists = sortArtistsDiversLast(artistsRaw);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <Mic2 className="h-3.5 w-3.5" />
            Référentiel
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Artistes</h1>
          <p className="text-muted-foreground">
            {artists.length} artiste{artists.length > 1 ? "s" : ""} dans le portfolio Pangee.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <NewArtistButton />
        </div>
      </div>

      {artists.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Aucun artiste pour l&apos;instant. Ajoute le premier via
              &quot;Nouvel artiste&quot;.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {artists.map((artist) => (
            // Toute la card est cliquable → /artistes/[slug]. L'affordance
            // est l'hover sur la card elle-même (pas de CTA séparé).
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
                      <CardTitle className="text-base truncate">{artist.name}</CardTitle>
                      <CardDescription className="text-xs">/{artist.slug}</CardDescription>
                    </div>
                    {artist.active ? (
                      <Badge variant="secondary" className="shrink-0">Actif</Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0">Inactif</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* KPIs deals/tâches : placeholder Sprint 3 (model Deal Pangee)
                      + Sprint 6 (model Task). Pour l'instant 0 figés pour
                      garder la structure visuelle identique KN. */}
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
