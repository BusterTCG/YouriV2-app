import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArtistEditButton } from "@/components/artists/artist-edit-button";
import { ArtistDeleteButton } from "@/components/artists/artist-delete-button";
import { formatFr } from "@/lib/dates";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Fiche artiste — Sprint 2 : infos de base (nom, couleur, notes, statut).
 *
 * Sprint 3+ : ajoutera onglets/sections pour :
 *   - Deals associés (via DealArtiste)
 *   - Stats (cachets totaux, prochain show)
 *   - Tâches en cours liées
 */
export default async function ArtistDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const artist = await prisma.artist.findFirst({
    where: { slug, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      color: true,
      notes: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!artist) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-3">
          <Link href="/artistes">
            <ChevronLeft className="h-4 w-4" />
            Tous les artistes
          </Link>
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="h-16 w-16 rounded-full"
              style={{ backgroundColor: artist.color }}
              aria-hidden
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight">{artist.name}</h1>
                {!artist.active && <Badge variant="secondary">Inactif</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">/artistes/{artist.slug}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <ArtistEditButton artist={artist} />
            <ArtistDeleteButton id={artist.id} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            {artist.notes ? (
              <p className="whitespace-pre-wrap text-sm">{artist.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune note. Clique &quot;Modifier&quot; pour en ajouter.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Métadonnées</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Créé</span>
              <span>{formatFr(artist.createdAt, "short")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Modifié</span>
              <span>{formatFr(artist.updatedAt, "short")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Couleur</span>
              <span className="flex items-center gap-2 font-mono text-xs">
                <span
                  className="h-3 w-3 rounded-full border"
                  style={{ backgroundColor: artist.color }}
                />
                {artist.color}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deals & tâches</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Cette section affichera les deals (Booking / Prod Exé / Cachets) et tâches en
            cours liés à cet artiste — à partir du Sprint 3.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
