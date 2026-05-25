import { Briefcase, CheckCircle2, Hourglass, Percent, Receipt, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEur } from "@/components/deals/deal-helpers";
import type { BookingDealsListData } from "@/lib/deals-list-types";

interface Props {
  totals: BookingDealsListData["totals"];
  periodLabel: string;
}

/**
 * Bloc cumulés — refonte modèle Budget/Marge (Stan 2026-05-26).
 *
 * 4 KPI :
 *   - Budget       — total budgets reçus de l'organisateur
 *   - Artistes     — total rémunérations versées
 *   - Charges      — total charges diverses
 *   - Marge Youri — split réalisée (budget encaissé) vs en attente
 */
export function DealsTotals({ totals, periodLabel }: Props) {
  const margePct =
    totals.totalBudget > 0 ? (totals.totalMarge / totals.totalBudget) * 100 : null;

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
          label="Budget"
          value={formatEur(totals.totalBudget)}
        />
        <Stat
          icon={<Sparkles className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Artistes"
          value={formatEur(totals.totalArtistes)}
          sub={
            totals.artistOwed > 0 ? (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Hourglass className="h-3 w-3" />
                {formatEur(totals.artistOwed)} à reverser
              </span>
            ) : null
          }
        />
        <Stat
          icon={<Receipt className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Charges diverses"
          value={formatEur(totals.totalCharges)}
        />
        <Stat
          icon={<span className="text-emerald-600 text-xs">★</span>}
          label="Marge Youri"
          value={formatEur(totals.totalMarge)}
          sub={
            totals.totalMarge !== 0 ? (
              <span className="flex items-center gap-2 flex-wrap">
                {totals.margeRealisee !== 0 && (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    {formatEur(totals.margeRealisee)} réalisée
                  </span>
                )}
                {totals.margeAttente !== 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Hourglass className="h-3 w-3" />
                    {formatEur(totals.margeAttente)} en attente
                  </span>
                )}
              </span>
            ) : null
          }
        />
        <Stat
          icon={<Percent className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Taux marge"
          value={
            margePct != null
              ? `${(Math.round(margePct * 10) / 10).toString().replace(".", ",")}%`
              : "—"
          }
          sub="Marge ÷ budget"
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
  value: string;
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
