"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEur, formatPct } from "./deal-helpers";

/**
 * Section Marge Brute Pangee — variante CACHETS (Stan 2026-05-30).
 *
 * Calque visuel de `DealResultSection` (Booking) / "box gold" Prod Exé :
 *   - Card neutre avec accents doré (--yr-gold)
 *   - Bandeau bas "= Marge Brute" en gros, vert si positif, rouge si négatif
 *
 * Calcul Cachets :
 *   CA total (Σ prestations) × cachetsFeesPct%  =  Marge Brute Pangee
 *
 * Affichée avant la section Management Fees pour cohérence Booking/Prod Exé.
 */
interface Props {
  totalBudget: number;
  cachetsFeesPct: number;
  allPrestationsPaid: boolean;
}

export function CachetMargeSection({
  totalBudget,
  cachetsFeesPct,
  allPrestationsPaid,
}: Props) {
  const margeBrute =
    totalBudget > 0 ? Math.round((totalBudget * cachetsFeesPct) / 100) : 0;
  const margePct = totalBudget > 0 ? (margeBrute / totalBudget) * 100 : null;

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
        <span className="text-xs uppercase tracking-wider font-semibold">
          Répartition — Marge Brute
        </span>
      </div>

      <div className="px-4 py-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span>CA total facturé</span>
          <span className="tabular-nums">{formatEur(totalBudget)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>× Frais Pangee {cachetsFeesPct}%</span>
          <span className="tabular-nums">
            ↳ {formatEur(margeBrute)}
          </span>
        </div>
      </div>

      <div className="border-t px-4 py-3 flex justify-between items-baseline">
        <div>
          <div
            className={cn(
              "text-xs uppercase tracking-wider font-semibold",
              margeBrute >= 0
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-red-700 dark:text-red-400",
            )}
          >
            = Marge Brute
          </div>
          {allPrestationsPaid ? (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              ✓ Marge réalisée (toutes prestations encaissées)
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              ⏳ En attente (prestations non encaissées)
            </div>
          )}
        </div>
        <div className="text-right">
          <div
            className={cn(
              "text-2xl font-semibold tabular-nums",
              margeBrute >= 0
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-red-700 dark:text-red-400",
            )}
          >
            {formatEur(margeBrute)}
          </div>
          {margePct != null && (
            <div className="text-xs text-muted-foreground tabular-nums">
              {formatPct(margePct, { integer: true })} du CA
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
