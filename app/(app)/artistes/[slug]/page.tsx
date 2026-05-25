import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mic2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { ArtistTabs } from "@/components/artists/artist-tabs";
import { ArtistInfoSection } from "@/components/artists/artist-info-section";
import { ArtistAvatar } from "@/components/artists/artist-avatar";
import { OverviewSection } from "@/components/artists/overview-section";
import { ArtistEditButton } from "@/components/artists/artist-edit-button";
import { ArtistDeleteButton } from "@/components/artists/artist-delete-button";

export const dynamic = "force-dynamic";

interface ArtistPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}

/**
 * Fiche artiste détail — copie fidèle de KuroNeko-App
 * `app/(app)/artists/[slug]/page.tsx` (cf. AGENTS.md règle copie fidèle).
 *
 * Adaptations Youri V2 :
 *   - `where: { slug, deletedAt: null }` (soft-delete Youri en plus de active).
 *   - Onglet "Vue d'ensemble" = placeholder Sprint 3 (model Deal Pangee à venir).
 *   - Pas de bandeau "Mémoire IA" / bioShort warning (pas d'AI dans V2).
 *   - Boutons Edit/Delete artiste exposés côté header (n'existent pas dans
 *     KN car édition via le bouton "Modifier" qui rouvre new-artist-button
 *     pattern — à harmoniser plus tard si besoin).
 */
export default async function ArtistPage({ params, searchParams }: ArtistPageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const tab = sp.tab || "overview";

  const artist = await prisma.artist.findFirst({
    where: { slug, deletedAt: null },
    include: {
      profile: true,
    },
  });
  if (!artist) notFound();

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <Link
          href="/artistes"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Tous les artistes
        </Link>
      </div>

      {/* Header : avatar + titre en haut, boutons d'action sur une ligne
          dédiée en dessous. Layout uniforme avec les pages liste
          (/contacts, /lieux, /artistes). */}
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <ArtistAvatar
            editable
            artistId={artist.id}
            name={artist.name}
            color={artist.color}
            avatarUrl={artist.avatarUrl}
            positionX={artist.avatarPositionX}
            positionY={artist.avatarPositionY}
            sizeClass="h-14 w-14"
            textClass="text-lg"
          />
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
              <Mic2 className="h-3.5 w-3.5" />
              Artiste · /{artist.slug}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{artist.name}</h1>
          </div>
        </div>
        {/* Actions méta de l'artiste (nom/couleur/notes/active). La fiche
            ArtistProfile riche (30 champs) est éditée depuis l'onglet Infos. */}
        <div className="flex items-center gap-2 flex-wrap">
          <ArtistEditButton
            artist={{
              id: artist.id,
              name: artist.name,
              color: artist.color,
              notes: artist.notes,
              active: artist.active,
            }}
          />
          <ArtistDeleteButton id={artist.id} />
        </div>
      </div>

      <ArtistTabs slug={artist.slug} />

      {tab === "overview" && <OverviewSection artistName={artist.name} />}

      {tab === "info" && (
        <ArtistInfoSection
          artistId={artist.id}
          artistName={artist.name}
          profile={artist.profile}
        />
      )}
    </div>
  );
}
