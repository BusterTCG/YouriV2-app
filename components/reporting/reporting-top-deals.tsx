import Link from "next/link";
import { Award, ArrowRight } from "lucide-react";
import {
  DEAL_CATEGORY_LABELS,
  dealHref,
  formatPct,
} from "@/components/deals/deal-helpers";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import { cn } from "@/lib/utils";
import type { TopDealRow } from "@/lib/reporting-types";

interface Props {
  rows: TopDealRow[];
  rangeLabel: string;
}

/**
 * Top 10 deals par MARGE NETTE générée sur la période (Stan 2026-06-17 —
 * remplace le top artistes ; raccord avec le chart mensuel + le breakdown
 * par catégorie, tous en marge nette).
 */
export function ReportingTopDeals({ rows, rangeLabel }: Props) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Award className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wider">
          Top deals
        </h2>
        <span className="text-[11px] text-muted-foreground">
          · {rangeLabel}
        </span>
      </div>
      <div className="rounded-md border overflow-hidden bg-card">
        {rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground italic">
            Aucun deal encaissé sur cette période.
          </div>
        ) : (
          <div className="divide-y">
            {rows.map((r, i) => (
              <Link
                key={r.id}
                href={dealHref(r.category, r.id)}
                className="flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors text-sm"
              >
                <div className="shrink-0 w-5 text-center text-xs text-muted-foreground tabular-nums">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium leading-tight truncate">
                    {r.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {DEAL_CATEGORY_LABELS[r.category]} ·{" "}
                    {formatPct(r.pct, { integer: true })} de la marge
                  </div>
                </div>
                <div
                  className={cn(
                    "text-sm font-semibold tabular-nums shrink-0",
                    r.margeNette < 0 && "text-red-700 dark:text-red-400",
                  )}
                >
                  <SensitiveAmount value={r.margeNette} />
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
