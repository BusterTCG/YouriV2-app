"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { Search, Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Search bar Venue avec **recherche multi-token** (parseur côté server,
 * cf. lib/venue-search.ts) — COPIE FIDÈLE de KuroNeko-App venues-search.tsx.
 *
 * Stan peut combiner capacité + ville dans une seule recherche :
 *   "moins de 250 places, paris"
 *   "+250 paris"
 *   "entre 200 et 800"
 *   ">=1000 cigale"
 *
 * Sync URL via `?q=` + debounce 250ms.
 */
export function VenuesSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [value, setValue] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) {
        params.set("q", value.trim());
      } else {
        params.delete("q");
      }
      startTransition(() => {
        router.push(`/lieux?${params.toString()}`);
      });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="space-y-1.5">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder='Nom, ville, ou « moins de 250 places à Paris »…'
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="pl-9 pr-9"
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setValue("")}
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            aria-label="Effacer la recherche"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
        <Sparkles className="h-3 w-3 text-[--yr-gold]" />
        Recherche intelligente : combine capacité + ville. Ex :{" "}
        <code className="text-[10px] bg-muted/60 px-1 rounded">
          moins de 250 places, paris
        </code>{" "}
        <code className="text-[10px] bg-muted/60 px-1 rounded">
          entre 200 et 800
        </code>{" "}
        <code className="text-[10px] bg-muted/60 px-1 rounded">
          &gt;=1000 cigale
        </code>
      </p>
    </div>
  );
}
