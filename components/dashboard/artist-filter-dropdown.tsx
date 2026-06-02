"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  /** Slug courant (null = aucun filtre / "Tous artistes"). */
  artistSlug: string | null;
  artists: Array<{ id: string; name: string; slug: string; color: string | null }>;
  minWidth?: number;
}

/**
 * Sélecteur d'artiste — copie fidèle KN. Pilote `?artist=<slug>` dans l'URL.
 * Pangee : la pastille couleur est unique (cf. PANGEE_ARTIST_COLOR), donc
 * on n'affiche pas le rond couleur (gardé masqué pour éviter du bruit visuel).
 */
export function ArtistFilterDropdown({ artistSlug, artists, minWidth = 160 }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setArtist(slug: string) {
    const next = new URLSearchParams(params.toString());
    if (slug === "all") next.delete("artist");
    else next.set("artist", slug);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <Select value={artistSlug ?? "all"} onValueChange={setArtist}>
      <SelectTrigger className="h-8 text-xs" style={{ minWidth }}>
        <SelectValue placeholder="Tous artistes" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Tous artistes</SelectItem>
        {artists.map((a) => (
          <SelectItem key={a.id} value={a.slug}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
