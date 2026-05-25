import { Briefcase, CheckCircle2, Hourglass, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEur } from "@/components/deals/deal-helpers";
import type { BookingDealsListData } from "@/lib/deals-list-types";

interface Props {
  totals: BookingDealsListData["totals"];
  periodLabel: string;
}

/**
 * Bloc cumulés — copie fidèle KuroNeko-App `components/deals/deals-totals.tsx`.
 *
 * 4 stats sur la sélection courante (filtres appliqués) :
 *   - Montant (brut = cachet + com Pangee)
 *   - Part artiste (somme des cachets)
 *   - Commission Pangee (split encaissée / à venir)
 *   - Taux agent (com / montant en %)
 */
export function DealsTotals({ totals, periodLabel }: Props) {
  const agentRate =
    totals.gross > 0 ? (totals.totalCommission / totals.gross) * 100 : null;

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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat
          icon={<Briefcase className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Montant"
          value={formatEur(totals.gross)}
        />
        <Stat
          icon={<Wallet className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Part artiste"
          value={formatEur(totals.totalCachet)}
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
          icon={<span className="text-[--yr-gold] text-xs">★</span>}
          label="Commission Pangee"
          value={formatEur(totals.totalCommission)}
          accent
          sub={
            totals.totalCommission > 0 ? (
              <span className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  {formatEur(totals.commissionPaid)} encaissée
                </span>
                {totals.commissionTodo > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Hourglass className="h-3 w-3" />
                    {formatEur(totals.commissionTodo)} à venir
                  </span>
                )}
              </span>
            ) : null
          }
        />
        <Stat
          label="Taux agent"
          value={
            agentRate != null
              ? `${(Math.round(agentRate * 10) / 10).toString().replace(".", ",")}%`
              : "—"
          }
          sub="Commission ÷ montant"
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
          accent && "text-[--yr-gold]",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
