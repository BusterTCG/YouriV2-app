"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CONTACT_FILTER_OPTIONS,
  DEFAULT_TYPE_FILTER,
  type ContactsListType,
} from "@/lib/contacts-types";
import type { KnContactsCounts } from "@/lib/kn-client";

interface Props {
  currentType: ContactsListType;
  currentSearch: string;
  countsByType: KnContactsCounts;
}

/**
 * Barre de filtres /contacts : segmented control par type + champ de recherche.
 * COPIE FIDÈLE de KuroNeko-App ContactsFilters (cf. AGENTS.md règle copie fidèle).
 *
 * Le filtre est synchronisé via les searchParams (URL = state).
 * La recherche est debounced à 300 ms côté client.
 */
export function ContactsFilters({ currentType, currentSearch, countsByType }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [searchInput, setSearchInput] = useState(currentSearch);

  useEffect(() => {
    setSearchInput(currentSearch);
  }, [currentSearch]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput === currentSearch) return;
      const next = new URLSearchParams(params.toString());
      if (searchInput.trim()) next.set("q", searchInput.trim());
      else next.delete("q");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function setType(t: ContactsListType) {
    const next = new URLSearchParams(params.toString());
    if (t === DEFAULT_TYPE_FILTER) next.delete("type");
    else next.set("type", t);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="space-y-2.5">
      {/* Barre de recherche */}
      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Rechercher (nom, société, email, téléphone…)"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9 h-9"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Effacer la recherche"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Vue MOBILE : dropdown compact */}
      <div className="md:hidden space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Type
        </label>
        <Select value={currentType} onValueChange={(v) => setType(v as ContactsListType)}>
          <SelectTrigger className="h-9 text-sm w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTACT_FILTER_OPTIONS.map((o) => {
              const count = countsByType[o.value];
              return (
                <SelectItem key={o.value} value={o.value}>
                  {o.label} ({count})
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Vue DESKTOP : segmented avec badge de count */}
      <div className="hidden md:inline-flex rounded-md border bg-muted/40 p-0.5 flex-wrap">
        {CONTACT_FILTER_OPTIONS.map((o) => {
          const count = countsByType[o.value];
          const active = currentType === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setType(o.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors whitespace-nowrap",
                active
                  ? "bg-background shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>{o.label}</span>
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  active ? "text-muted-foreground" : "text-muted-foreground/70",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
