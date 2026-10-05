"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ChevronsUpDown, MapPin, Plus, Type, X } from "lucide-react";
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
import { VenueFormDialog } from "@/components/venues/venue-form-dialog";
import { searchKnVenues } from "@/lib/actions/deals";
import { cn } from "@/lib/utils";
import type { KnVenue } from "@/lib/kn-client";

/** VenuePicker — combobox avec recherche depuis l'annuaire KN (lib/kn-client).
 *
 * Stan 2026-05-26 : enrichi avec `address` + `capacity` snapshot pour la FDR :
 *   - `address` : adresse complète du lieu KN (utilisée pour le champ
 *     "Adresse du lieu" de la FDR sans avoir à re-saisir)
 *   - `capacity` : jauge du lieu KN (utilisée pour le champ "Jauge" FDR)
 * Ces champs sont OPTIONNELS côté snapshot pour rester compatible avec les
 * callers qui n'en ont pas besoin (form deal de base) — ils ne changent pas
 * le contrat existant.
 */
export interface VenueSnapshot {
  /** Vide = nom saisi librement, hors annuaire (option `allowFreeText`). */
  id: string;
  name: string;
  city: string;
  /** Adresse complète (optionnel — peuplé si dispo côté annuaire KN). */
  address?: string | null;
  /** Jauge / capacité (optionnel — peuplé si dispo côté annuaire KN). */
  capacity?: number | null;
}

interface Props {
  value: VenueSnapshot | null;
  onChange: (next: VenueSnapshot | null) => void;
  className?: string;
  /**
   * Stan 2026-10-05 (FDR) : options en bas de liste pour créer le lieu dans
   * l'annuaire, ou garder le nom tapé sans l'enregistrer (lieu ponctuel,
   * non dédié au spectacle) → snapshot avec `id: ""`.
   */
  allowCreate?: boolean;
  allowFreeText?: boolean;
}

export function VenuePicker({
  value,
  onChange,
  className,
  allowCreate,
  allowFreeText,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
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
    // Stan 2026-05-26 : on peuple aussi address + capacity pour que la FDR
    // récupère l'info complète automatiquement (sans re-fetch côté caller).
    onChange({
      id: v.id,
      name: v.name,
      city: v.city,
      address: v.address ?? null,
      capacity: v.capacity ?? null,
    });
    setOpen(false);
  }

  const typed = query.trim();

  return (
    <>
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
              {value
                ? [value.name, value.city].filter(Boolean).join(" · ")
                : "Choisir un lieu…"}
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
        <PopoverContent
          className="w-[calc(100vw-2rem)] sm:w-[380px] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Rechercher (nom, ville, +250)…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {!allowCreate && !allowFreeText && (
                <CommandEmpty>Aucun lieu trouvé.</CommandEmpty>
              )}
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
                      <div className="text-sm font-medium truncate">
                        {v.name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {v.city}
                        {v.capacity != null && ` · ${v.capacity} pl`}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              {(allowCreate || (allowFreeText && typed)) && (
                <CommandGroup
                  heading={items.length === 0 ? "Aucun lieu trouvé" : undefined}
                >
                  {allowFreeText && typed && (
                    <CommandItem
                      value="__free__"
                      onSelect={() => {
                        onChange({ id: "", name: typed, city: "" });
                        setOpen(false);
                      }}
                    >
                      <Type className="mr-2 h-4 w-4" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">
                          Utiliser « {typed} »
                        </div>
                        <div className="text-xs text-muted-foreground">
                          sans l&apos;enregistrer dans l&apos;annuaire
                        </div>
                      </div>
                    </CommandItem>
                  )}
                  {allowCreate && (
                    <CommandItem
                      value="__create__"
                      onSelect={() => {
                        setOpen(false);
                        setCreateOpen(true);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      <span className="text-sm truncate">
                        {typed
                          ? `Créer « ${typed} » dans l'annuaire…`
                          : "Créer un nouveau lieu…"}
                      </span>
                    </CommandItem>
                  )}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {allowCreate && (
        <VenueFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          defaultName={typed}
          onCreated={(v) => onChange(v)}
        />
      )}
    </>
  );
}
