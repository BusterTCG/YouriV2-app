"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Barre de recherche sticky URL pour /venues — supporte la recherche en
 * langage naturel.
 *
 * Le serveur parse la query via `parseVenueQuery` (lib/venues.ts) qui extrait
 * automatiquement les filtres de capacité ("moins de 250 places", "entre 200
 * et 800", ">=1000", etc.) puis filtre le reste comme texte libre sur
 * nom/ville/adresse.
 *
 * Debounce 250ms pour ne pas spam le router à chaque frappe.
 */
export function VenuesSearch({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [local, setLocal] = useState(defaultValue);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (local) next.set("q", local);
      else next.delete("q");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return (
    <div className="space-y-1.5 max-w-md">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder="Nom, ville, ou « moins de 250 places à Paris »…"
          className="pl-7 pr-7"
        />
        {local && (
          <button
            type="button"
            onClick={() => setLocal("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground"
            aria-label="Effacer"
          >
            <X className="h-4 w-4" />
          </button>
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
