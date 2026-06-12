import { Sparkles } from "lucide-react";
import { formatPct } from "./deal-helpers";
import { cn } from "@/lib/utils";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";

/**
 * Section Résultat — style KN show "RÉPARTITION CO-PROD".
 *
 * Calcul affiché : Budget Youri − Total artistes − Total charges = Marge Youri.
 * + % marge (= marge / budget * 100).
 *
 * Card neutre bordée avec accents doré (--yr-gold) pour la marge finale.
 */
interface Props {
  budgetAmount: number | null;
  totalArtistes: number;
  totalCharges: number;
  isEncaisse: boolean;
}

export function DealResultSection({
  budgetAmount,
  totalArtistes,
  totalCharges,
  isEncaisse,
}: Props) {
  const budget = budgetAmount ?? 0;
  const marge = budget - totalArtistes - totalCharges;
  const margePct = budget > 0 ? (marge / budget) * 100 : null;

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
          <span>Budget Youri</span>
          <span className="tabular-nums">
            <SensitiveAmount value={budgetAmount} />
          </span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>− Total artistes</span>
          <span className="tabular-nums">
            {totalArtistes > 0 && "- "}
            <SensitiveAmount value={totalArtistes} />
          </span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>− Total charges</span>
          <span className="tabular-nums">
            {totalCharges > 0 && "- "}
            <SensitiveAmount value={totalCharges} />
          </span>
        </div>
      </div>

      {/* Bandeau "= Marge Youri" — vert si positif, rouge si négatif
          (Stan 2026-05-26). */}
      <div className="border-t px-4 py-3 flex justify-between items-baseline">
        <div>
          <div
            className={cn(
              "text-xs uppercase tracking-wider font-semibold",
              marge >= 0
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-red-700 dark:text-red-400",
            )}
          >
            = Marge Brute
          </div>
          {isEncaisse ? (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              ✓ Marge réalisée (budget encaissé)
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              ⏳ En attente (budget non encaissé)
            </div>
          )}
        </div>
        <div className="text-right">
          <div
            className={cn(
              "text-2xl font-semibold tabular-nums",
              marge >= 0
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-red-700 dark:text-red-400",
            )}
          >
            <SensitiveAmount value={marge} />
          </div>
          {margePct != null && (
            <div className="text-xs text-muted-foreground tabular-nums">
              {formatPct(margePct, { integer: true })} du budget
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
