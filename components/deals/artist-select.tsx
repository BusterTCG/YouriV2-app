"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
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
import { cn } from "@/lib/utils";

/**
 * Combobox de sélection d'un artiste Pangee avec recherche live côté client
 * (Stan 2026-05-26 v4 : "mettre une recherche dans le filtre" sur le dialog
 * Nouveau deal Prod Exé).
 *
 * Fetch la liste complète au mount via `listPangeeArtists` (Pangee gère
 * < 100 artistes, pas de pagination). Filtrage par CommandInput shadcn.
 *
 * `reloadSignal` : incrémenté par le parent après une création rapide d'artiste
 * (bouton "+ Nouvel artiste" du formulaire de deal) → re-fetch la liste pour que
 * le nouvel artiste apparaisse et puisse être affiché comme sélectionné.
 */
interface Props {
  value: string | null;
  /** Callback avec l'id sélectionné ET le nom (utile pour auto-titre). */
  onChange: (artistId: string | null, artistName?: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  reloadSignal?: number;
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
  reloadSignal = 0,
}: Props) {
  const [open, setOpen] = useState(false);
  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [loading, setLoading] = useState(true);

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
  }, [reloadSignal]);

  const selected = artists.find((a) => a.id === value);

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
          <CommandInput placeholder="Rechercher un artiste…" />
          <CommandList>
            <CommandEmpty>Aucun artiste trouvé.</CommandEmpty>
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
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
