"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPct } from "./deal-helpers";
import { useEur } from "@/lib/privacy-context";

/**
 * Section Marge Brute Pangee — variante CACHETS (Stan 2026-05-30, MAJ 2026-06-17).
 *
 * Modèle (Stan 2026-06-17) :
 *   Marge brute = Σ prestations facturées − Σ cachets bruts (GUSO).
 *   % du CA = Marge / Prestation facturée (recalculé automatiquement).
 *
 * Affichage épuré (Stan 2026-06-17) : juste le montant de marge brute + le %
 * du CA. Le détail (prestations / cachet brut) est déjà visible dans les
 * sections au-dessus.
 */
interface Props {
  totalBudget: number;
  cachetBrut: number;
  allPrestationsPaid: boolean;
}

export function CachetMargeSection({
  totalBudget,
  cachetBrut,
  allPrestationsPaid,
}: Props) {
  const eur = useEur();
  const margeBrute = Math.round(totalBudget - cachetBrut);
  const margePct = totalBudget > 0 ? (margeBrute / totalBudget) * 100 : null;

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
        <span className="text-xs uppercase tracking-wider font-semibold">
          Marge brute
        </span>
      </div>

      <div className="px-4 py-3 flex justify-between items-baseline">
        <div>
          {allPrestationsPaid ? (
            <div className="text-[11px] text-muted-foreground">
              ✓ Marge réalisée (toutes prestations encaissées)
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">
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
            {eur(margeBrute)}
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
