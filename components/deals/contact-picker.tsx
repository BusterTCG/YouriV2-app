"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ChevronsUpDown, Users, X } from "lucide-react";
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
import { searchKnContacts } from "@/lib/actions/deals";
import { cn } from "@/lib/utils";
import type { KnContact } from "@/lib/kn-client";

/**
 * ContactPicker — combobox avec recherche depuis l'annuaire KN distant.
 *
 * Fetch debounced 250ms côté server action `searchKnContacts`. Affiche
 * "Nom Prénom · Société · Ville" dans la liste. Stocke un snapshot
 * (id + name + company + city) côté caller pour persistance.
 */
export interface ContactSnapshot {
  id: string;
  name: string;
  company: string | null;
  city: string | null;
}

interface Props {
  value: ContactSnapshot | null;
  onChange: (next: ContactSnapshot | null) => void;
  className?: string;
}

export function ContactPicker({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<KnContact[]>([]);
  const [, startTransition] = useTransition();

  // Debounce 250ms côté search
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      startTransition(async () => {
        const res = await searchKnContacts(query);
        if (res.ok && res.data) setItems(res.data);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

  function pick(c: KnContact) {
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.company || "—";
    onChange({
      id: c.id,
      name: fullName,
      company: c.company,
      city: c.city,
    });
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
            <Users className="h-3.5 w-3.5 shrink-0" />
            {value ? value.name : "Choisir un contact…"}
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
            placeholder="Rechercher (nom, société, ville…)"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>Aucun contact trouvé.</CommandEmpty>
            <CommandGroup>
              {items.map((c) => {
                const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
                return (
                  <CommandItem key={c.id} value={c.id} onSelect={() => pick(c)}>
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value?.id === c.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {fullName || c.company || "(sans nom)"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[c.company, c.city, c.profession].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
