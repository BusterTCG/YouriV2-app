"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/** Filtres catégorie Pangee — propre à Youri V2 (KN n'a pas cette notion). */
const CATEGORIES = [
  { value: "all", label: "Toutes" },
  { value: "BOOKING", label: "Booking" },
  { value: "PROD_EXE", label: "Prod Exé" },
  { value: "CACHETS", label: "Cachets" },
] as const;

/**
 * Toggle Catégorie du dashboard — Stan 2026-06-02 ajustement Pangee.
 * Sync via `?cat=BOOKING|PROD_EXE|CACHETS` dans l'URL. "all" = défaut absent.
 */
export function CategoryFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("cat") ?? "all";
  const current =
    CATEGORIES.find((c) => c.value === raw)?.value ?? "all";

  function set(v: string) {
    const next = new URLSearchParams(params.toString());
    if (v === "all") next.delete("cat");
    else next.set("cat", v);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
      {CATEGORIES.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => set(c.value)}
          className={cn(
            "inline-flex items-center rounded px-3 py-1 text-xs transition-colors whitespace-nowrap",
            current === c.value
              ? "bg-background shadow-sm font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
