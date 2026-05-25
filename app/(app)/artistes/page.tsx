import { Mic2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { sortArtistsDiversLast } from "@/lib/artists";
import { ArtistsList } from "@/components/artists/artists-list";

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
 *   - Recherche locale instantanée + bouton "Nouvel artiste" sur la même
 *     ligne (Stan 2026-05-26). Toute la section actions+grid vit dans le
 *     client component <ArtistsList> pour pouvoir partager le state search.
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
      // Phase 3.6+ — compteur deals réel (filtré soft-delete + non annulés)
      // pour aligner avec la fiche artiste Vue d'ensemble.
      _count: {
        select: {
          dealArtistes: {
            where: {
              deletedAt: null,
              deal: { deletedAt: null, status: { not: "ANNULE" } },
            },
          },
        },
      },
    },
  });
  const artists = sortArtistsDiversLast(
    artistsRaw.map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      color: a.color,
      avatarUrl: a.avatarUrl,
      avatarPositionX: a.avatarPositionX,
      avatarPositionY: a.avatarPositionY,
      active: a.active,
      dealsCount: a._count.dealArtistes,
    })),
  );

  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          <Mic2 className="h-3.5 w-3.5" />
          Référentiel
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Artistes</h1>
      </div>

      <ArtistsList artists={artists} />
    </div>
  );
}
