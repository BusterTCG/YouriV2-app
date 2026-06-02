import { Briefcase, CheckCircle2, HandCoins, Hourglass, Percent, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPct } from "@/components/deals/deal-helpers";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import type { BookingDealsListData } from "@/lib/deals-list-types";

interface Props {
  totals: BookingDealsListData["totals"];
  periodLabel: string;
}

/**
 * Bloc cumulés (Stan 2026-05-27 v5) — 5 KPI alignés Booking + Prod Exé :
 *   - CA HT           — total budgets reçus de l'organisateur (= CA Pangee)
 *   - Artistes        — total rémunérations versées
 *   - Management Fees — total reversé aux associés (Stan/Certe/Angath)
 *   - Marge Nette     — Marge Pangee − Management Fees (split réalisée/attente)
 *   - Taux Marge Nette — Marge nette ÷ CA HT × 100
 */
export function DealsTotals({ totals, periodLabel }: Props) {
  const margeNettePct =
    totals.totalBudget > 0
      ? (totals.totalMargeNette / totals.totalBudget) * 100
      : null;

  return (
    <div className="rounded-md border-2 border-[--yr-gold]/30 bg-card p-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Total · {periodLabel}
        </div>
        <div className="text-xs text-muted-foreground">
          {totals.count} deal{totals.count > 1 ? "s" : ""}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Stat
          icon={<Briefcase className="h-3.5 w-3.5 text-muted-foreground" />}
          label="CA HT"
          value={<SensitiveAmount value={totals.totalBudget} />}
        />
        <Stat
          icon={<Sparkles className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Artistes"
          value={<SensitiveAmount value={totals.totalArtistes} />}
          sub={
            totals.artistOwed > 0 ? (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Hourglass className="h-3 w-3" />
                <SensitiveAmount value={totals.artistOwed} /> à reverser
              </span>
            ) : null
          }
        />
        <Stat
          icon={<HandCoins className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Management Fees"
          value={<SensitiveAmount value={totals.totalMf} />}
        />
        <Stat
          icon={<span className="text-emerald-600 text-xs">★</span>}
          label="Marge Nette"
          value={<SensitiveAmount value={totals.totalMargeNette} />}
          sub={
            totals.totalMarge !== 0 ? (
              <span className="flex items-center gap-2 flex-wrap">
                {totals.margeRealisee !== 0 && (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    <SensitiveAmount value={totals.margeRealisee} /> encaissée
                  </span>
                )}
                {totals.margeAttente !== 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Hourglass className="h-3 w-3" />
                    <SensitiveAmount value={totals.margeAttente} /> à venir
                  </span>
                )}
              </span>
            ) : null
          }
        />
        <Stat
          icon={<Percent className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Taux Marge Nette"
          value={formatPct(margeNettePct, { integer: true })}
          sub="Marge nette ÷ CA HT"
        />
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
  sub,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent?: boolean;
  sub?: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5 min-w-0">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "text-xl font-semibold tabular-nums truncate",
          accent && "text-emerald-700 dark:text-emerald-400",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
