"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
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
import { listPangeeArtists } from "@/lib/actions/deals";
import { createArtist } from "@/lib/actions/artists";
import { PANGEE_ARTIST_COLOR } from "@/lib/artists-constants";
import { cn } from "@/lib/utils";

/**
 * Combobox de sélection d'un artiste Pangee avec recherche live côté client
 * (Stan 2026-05-26 v4 : "mettre une recherche dans le filtre" sur le dialog
 * Nouveau deal Prod Exé).
 *
 * Fetch la liste complète au mount via `listPangeeArtists` (Pangee gère
 * < 100 artistes, pas de pagination). Filtrage par CommandInput shadcn.
 */
interface Props {
  value: string | null;
  /** Callback avec l'id sélectionné ET le nom (utile pour auto-titre). */
  onChange: (artistId: string | null, artistName?: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

interface ArtistOption {
  id: string;
  name: string;
  color: string | null;
}

export function ArtistSelect({
  value,
  onChange,
  disabled,
  placeholder = "Choisir un artiste…",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    listPangeeArtists().then((res) => {
      if (!mounted) return;
      if (res.ok && res.data) {
        setArtists(
          res.data.map((a) => ({ id: a.id, name: a.name, color: a.color })),
        );
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const selected = artists.find((a) => a.id === value);

  // Ajout rapide : si la recherche ne correspond à aucun artiste existant, on
  // propose de créer l'artiste à la volée (Stan 2026-06-16 — éviter de sortir
  // du formulaire de deal pour créer l'artiste puis revenir).
  const trimmed = search.trim();
  const exactMatch = artists.some(
    (a) => a.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const showCreate = trimmed.length > 0 && !exactMatch;

  async function handleQuickCreate() {
    if (!trimmed || creating) return;
    setCreating(true);
    setCreateError(null);
    const res = await createArtist({ name: trimmed });
    setCreating(false);
    if (res.ok && res.data) {
      const created = {
        id: res.data.id,
        name: trimmed,
        color: PANGEE_ARTIST_COLOR,
      };
      setArtists((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "fr")),
      );
      onChange(res.data.id, trimmed);
      setSearch("");
      setOpen(false);
    } else {
      setCreateError(res.ok ? null : res.error);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className={cn(
            "w-full justify-between h-9 text-sm font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="inline-flex items-center gap-2 truncate">
            {loading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Chargement…
              </>
            ) : selected ? (
              <>
                {selected.color && (
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: selected.color }}
                  />
                )}
                {selected.name}
              </>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
        <Command>
          <CommandInput
            placeholder="Rechercher ou créer un artiste…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {!showCreate && <CommandEmpty>Aucun artiste trouvé.</CommandEmpty>}
            <CommandGroup>
              {artists.map((a) => (
                <CommandItem
                  key={a.id}
                  value={a.name}
                  onSelect={() => {
                    if (a.id === value) onChange(null, null);
                    else onChange(a.id, a.name);
                    setOpen(false);
                  }}
                >
                  {a.color && (
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0 mr-2"
                      style={{ backgroundColor: a.color }}
                    />
                  )}
                  <span className="flex-1">{a.name}</span>
                  {value === a.id && <Check className="h-3.5 w-3.5 ml-2" />}
                </CommandItem>
              ))}
            </CommandGroup>
            {showCreate && (
              <CommandGroup>
                <CommandItem
                  value={trimmed}
                  onSelect={handleQuickCreate}
                  disabled={creating}
                  className="text-yr-gold data-[selected=true]:text-yr-gold"
                >
                  {creating ? (
                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 mr-2" />
                  )}
                  <span className="flex-1">
                    Créer l&apos;artiste «{" "}
                    <span className="font-medium">{trimmed}</span> »
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            {createError && (
              <div className="px-3 py-2 text-xs text-destructive">
                {createError}
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
