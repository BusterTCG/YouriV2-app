"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ChevronsUpDown, MapPin, X } from "lucide-react";
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
import { searchKnVenues } from "@/lib/actions/deals";
import { cn } from "@/lib/utils";
import type { KnVenue } from "@/lib/kn-client";

/** VenuePicker — combobox avec recherche depuis l'annuaire KN (lib/kn-client). */
export interface VenueSnapshot {
  id: string;
  name: string;
  city: string;
}

interface Props {
  value: VenueSnapshot | null;
  onChange: (next: VenueSnapshot | null) => void;
  className?: string;
}

export function VenuePicker({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<KnVenue[]>([]);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      startTransition(async () => {
        const res = await searchKnVenues(query);
        if (res.ok && res.data) setItems(res.data);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

  function pick(v: KnVenue) {
    onChange({ id: v.id, name: v.name, city: v.city });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 w-full justify-between gap-2 font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="inline-flex items-center gap-1.5 truncate">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {value ? `${value.name} · ${value.city}` : "Choisir un lieu…"}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {value && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                className="rounded p-0.5 hover:bg-accent"
                role="button"
                aria-label="Effacer"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Rechercher (nom, ville, +250)…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>Aucun lieu trouvé.</CommandEmpty>
            <CommandGroup>
              {items.map((v) => (
                <CommandItem key={v.id} value={v.id} onSelect={() => pick(v)}>
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value?.id === v.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{v.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {v.city}
                      {v.capacity != null && ` · ${v.capacity} pl`}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
