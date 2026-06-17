"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Plus, UserPlus } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  addDealArtist,
  listPangeeArtists,
  type PangeeArtistOption,
} from "@/lib/actions/deals";
import { artistInitials } from "@/lib/artists";
import { NewArtistDialog } from "@/components/artists/new-artist-dialog";

/**
 * ArtistRosterPicker — combobox d'ajout d'un artiste Pangee à un deal.
 *
 * Charge la liste roster (server action listPangeeArtists) à l'ouverture
 * du Popover. Exclut les `excludeIds` déjà rattachés au deal (calculés
 * côté parent depuis `artistes[]`). Au clic : addDealArtist → router.refresh.
 *
 * Pattern UI : Button "+ Ajouter un artiste" identique à
 * deal-charges-section "Ajouter une charge" (h-7 text-xs gap-1, outline).
 */
interface Props {
  dealId: string;
  excludeIds: string[];
}

export function ArtistRosterPicker({ dealId, excludeIds }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PangeeArtistOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, startAddTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [artistDialogOpen, setArtistDialogOpen] = useState(false);
  // IDs ajoutés au deal dans cette session mais pas encore reflétés dans
  // `excludeIds` (le temps que router.refresh propage les nouvelles props).
  // Évite qu'un artiste tout juste ajouté réapparaisse dans la liste si on
  // rouvre le picker avant la fin du refresh serveur — flagrant en dev où le
  // refresh peut prendre plusieurs secondes (Stan 2026-06-17 : "la liste ne se
  // met pas à jour").
  const [pendingAdded, setPendingAdded] = useState<string[]>([]);

  // Purge les ids une fois reflétés dans excludeIds (refresh terminé). Garde la
  // même référence si rien ne change pour éviter une boucle de rendu.
  useEffect(() => {
    setPendingAdded((prev) => {
      const next = prev.filter((id) => !excludeIds.includes(id));
      return next.length === prev.length ? prev : next;
    });
  }, [excludeIds]);

  // Fetch roster à l'ouverture (exclut artistes du deal + ajouts en attente).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const exclude = [...excludeIds, ...pendingAdded];
    (async () => {
      const res = await listPangeeArtists(exclude);
      if (cancelled) return;
      setLoading(false);
      if (res.ok && res.data) {
        setItems(res.data);
      } else if (!res.ok) {
        setError(res.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, excludeIds, pendingAdded]);

  function pick(artistId: string) {
    setError(null);
    startAddTransition(async () => {
      const res = await addDealArtist({ dealId, artistId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Retrait optimiste immédiat + exclusion locale jusqu'au refresh serveur.
      setItems((prev) => prev.filter((a) => a.id !== artistId));
      setPendingAdded((prev) =>
        prev.includes(artistId) ? prev : [...prev, artistId],
      );
      setOpen(false);
      router.refresh();
    });
  }

  // Création rapide : un artiste pas encore dans le portfolio peut être créé
  // depuis le picker (Stan 2026-06-17 — même UX que le formulaire de deal). À
  // la création, on le rattache directement au deal.
  function handleArtistCreated(artist: { id: string }) {
    setError(null);
    startAddTransition(async () => {
      const res = await addDealArtist({ dealId, artistId: artist.id });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setItems((prev) => prev.filter((a) => a.id !== artist.id));
      setPendingAdded((prev) =>
        prev.includes(artist.id) ? prev : [...prev, artist.id],
      );
      router.refresh();
    });
  }

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={adding}
          className="h-7 text-xs gap-1"
        >
          {adding ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          Ajouter un artiste
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Rechercher un artiste…" />
          <CommandList>
            {loading ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground inline-flex items-center justify-center gap-2 w-full">
                <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
              </div>
            ) : (
              <>
                <CommandEmpty>
                  {items.length === 0
                    ? "Tous les artistes Pangee sont déjà sur ce deal."
                    : "Aucun artiste trouvé."}
                </CommandEmpty>
                <CommandGroup>
                  {items.map((a) => (
                    <CommandItem
                      key={a.id}
                      value={a.name}
                      onSelect={() => pick(a.id)}
                      className="cursor-pointer"
                    >
                      <span
                        className="inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-semibold text-white shrink-0 mr-2"
                        style={{ backgroundColor: a.color }}
                      >
                        {artistInitials(a.name, a.slug).slice(0, 2)}
                      </span>
                      <span className="text-sm">{a.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {error && (
              <div className="px-3 py-2 text-[11px] text-destructive border-t bg-destructive/5">
                {error}
              </div>
            )}
          </CommandList>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setArtistDialogOpen(true);
            }}
            className="flex w-full items-center gap-1.5 border-t px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <UserPlus className="h-3 w-3" />
            Créer un nouvel artiste
          </button>
        </Command>
      </PopoverContent>
    </Popover>

      <NewArtistDialog
        open={artistDialogOpen}
        onOpenChange={setArtistDialogOpen}
        onCreated={handleArtistCreated}
      />
    </>
  );
}
