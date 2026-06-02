"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const PERIODS = [
  { value: "month", label: "Mois" },
  { value: "year", label: "Année" },
] as const;

/**
 * Toggle Période (Mois / Année) du dashboard — copie fidèle KN.
 * Sync via `?period=month` dans l'URL.
 *
 * Stan 2026-06-02 : défaut inversé en "year" (vue annuelle prioritaire pour
 * piloter Pangee). On retire le param URL quand on est en year (URL propre).
 */
export function PeriodToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("period") === "month" ? "month" : "year";

  function set(v: string) {
    const next = new URLSearchParams(params.toString());
    if (v === "year") next.delete("period");
    else next.set("period", v);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => set(p.value)}
          className={cn(
            "inline-flex items-center rounded px-3 py-1 text-xs transition-colors",
            current === p.value
              ? "bg-background shadow-sm font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
