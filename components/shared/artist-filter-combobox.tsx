"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Mic2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

/**
 * Combobox filtre artiste avec recherche texte intégrée.
 *
 * Stan 2026-05-26 : "dans le bouton artiste, ajouter la recherche aussi à
 * l'écrit pour retrouver l'artiste". Pattern shadcn Command + Popover —
 * l'user tape les premières lettres et la liste se filtre.
 *
 * Source = list d'artistes passée en prop. Sélection = écrit `?artist=<slug>`
 * dans l'URL (pas de state local — URL = source de vérité comme les autres
 * filtres).
 */
interface Artist {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  artists: Artist[];
  /** Slug sélectionné ou null pour "Tous". */
  value: string | null;
  onChange: (slug: string | null) => void;
  /** Label optionnel (défaut "Artiste"). */
  label?: string;
  /** Class additionnelle sur le bouton trigger. */
  className?: string;
}

export function ArtistFilterCombobox({
  artists,
  value,
  onChange,
  label = "Artiste",
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  const selected = value ? artists.find((a) => a.slug === value) : null;

  return (
    <div className="flex items-center gap-1.5">
      <label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "h-8 justify-between gap-2 min-w-[160px] font-normal",
              !selected && "text-muted-foreground",
              className,
            )}
          >
            <span className="inline-flex items-center gap-1.5 truncate">
              <Mic2 className="h-3.5 w-3.5 shrink-0" />
              {selected ? selected.name : "Tous"}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Rechercher un artiste…" />
            <CommandList>
              <CommandEmpty>Aucun artiste trouvé.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__all__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      !value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  Tous les artistes
                </CommandItem>
                {artists.map((artist) => (
                  <CommandItem
                    key={artist.id}
                    value={artist.name}
                    onSelect={() => {
                      onChange(artist.slug);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === artist.slug ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {artist.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
