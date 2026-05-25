"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LayoutDashboard, IdCard } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Onglets de la fiche artiste — copie fidèle de KuroNeko-App
 * `components/artists/artist-tabs.tsx` (path `/artists/` → `/artistes/`).
 *
 * Tab "Vue d'ensemble" = onglet par défaut (KPIs deals — placeholder Sprint 3
 * côté Youri V2 jusqu'à ce que le model `Deal` Pangee soit livré).
 * Tab "Infos" = fiche ArtistProfile complète.
 */
interface ArtistTabsProps {
  slug: string;
}

const TABS = [
  { value: "overview", label: "Vue d'ensemble", icon: LayoutDashboard },
  { value: "info", label: "Infos", icon: IdCard },
] as const;

export function ArtistTabs({ slug }: ArtistTabsProps) {
  const params = useSearchParams();
  const current = params.get("tab") || "overview";

  return (
    <div className="inline-flex rounded-md border bg-muted/40 p-0.5 overflow-x-auto">
      {TABS.map((t) => {
        const Icon = t.icon;
        const active = current === t.value;
        const next = new URLSearchParams(params.toString());
        next.set("tab", t.value);
        return (
          <Link
            key={t.value}
            href={`/artistes/${slug}?${next.toString()}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors whitespace-nowrap",
              active
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
