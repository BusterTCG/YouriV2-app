import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewArtistButton } from "@/components/artists/new-artist-button";

export const dynamic = "force-dynamic";

/**
 * Liste des artistes Pangee Prod (Youri local — séparé du roster KN).
 *
 * Affiche par défaut les artistes non-supprimés. Les actifs apparaissent en
 * premier, puis les inactifs avec opacité réduite.
 *
 * La corbeille (`/trash`) sera ajoutée Sprint 10 pour récupérer les artistes
 * soft-deletés.
 */
export default async function ArtistsPage() {
  const artists = await prisma.artist.findMany({
    where: { deletedAt: null },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      color: true,
      active: true,
      notes: true,
      createdAt: true,
    },
  });

  const activeCount = artists.filter((a) => a.active).length;
  const inactiveCount = artists.length - activeCount;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Artistes</h1>
          <p className="text-sm text-muted-foreground">
            {activeCount} actif{activeCount > 1 ? "s" : ""}
            {inactiveCount > 0 && `, ${inactiveCount} inactif${inactiveCount > 1 ? "s" : ""}`}
          </p>
        </div>
        <NewArtistButton />
      </div>

      {artists.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Aucun artiste pour l&apos;instant. Ajoute le premier via &quot;Nouvel artiste&quot;.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {artists.map((artist) => (
            <Link
              key={artist.id}
              href={`/artistes/${artist.slug}`}
              className={artist.active ? "" : "opacity-60"}
            >
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <div
                      className="h-10 w-10 shrink-0 rounded-full"
                      style={{ backgroundColor: artist.color }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-base">{artist.name}</CardTitle>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        /{artist.slug}
                      </p>
                    </div>
                    {!artist.active && (
                      <Badge variant="muted" className="shrink-0">
                        Inactif
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                {artist.notes && (
                  <CardContent>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {artist.notes}
                    </p>
                  </CardContent>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
