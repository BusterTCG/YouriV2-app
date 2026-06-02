"use client";

import { Briefcase, HandCoins, Hash, Percent, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { formatPct } from "@/components/deals/deal-helpers";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import type { ReportingData } from "@/lib/reporting-types";

interface Props {
  kpis: ReportingData["kpis"];
  rangeLabel: string;
}

/**
 * 6 KPI cards top de /reporting — Stan 2026-06-02.
 *
 * Pangee : CA HT / Total Artistes / Marge Brute / Management Fees / Marge
 * Nette / Taux Marge Nette. Tous calculés sur les deals encaissés
 * (budgetPaymentStatus=PAID + budgetPaidAt ∈ période).
 *
 * Affiche aussi le nombre de deals contributeurs en sub du dernier KPI.
 */
export function ReportingKpis({ kpis, rangeLabel }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <Card
        icon={<Briefcase className="h-3.5 w-3.5 text-muted-foreground" />}
        label="CA HT"
        value={<SensitiveAmount value={kpis.caHt} />}
      />
      <Card
        icon={<TrendingDown className="h-3.5 w-3.5 text-red-500" />}
        label="Total Artistes"
        value={<SensitiveAmount value={kpis.totalArtistes} />}
      />
      <Card
        icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
        label="Marge Brute"
        value={<SensitiveAmount value={kpis.margeBrute} />}
        accent="positive"
      />
      <Card
        icon={<HandCoins className="h-3.5 w-3.5 text-muted-foreground" />}
        label="Management Fees"
        value={<SensitiveAmount value={kpis.totalMf} />}
      />
      <Card
        icon={<Sparkles className="h-3.5 w-3.5 text-emerald-500" />}
        label="Marge Nette"
        value={<SensitiveAmount value={kpis.margeNette} />}
        accent={kpis.margeNette >= 0 ? "positive" : "negative"}
      />
      <Card
        icon={<Percent className="h-3.5 w-3.5 text-muted-foreground" />}
        label="Marge Nette"
        value={
          kpis.margeNettePct != null
            ? formatPct(kpis.margeNettePct, { integer: true })
            : "—"
        }
        sub={
          <span className="inline-flex items-center gap-1">
            <Hash className="h-3 w-3" />
            {kpis.dealsCount} deal{kpis.dealsCount > 1 ? "s" : ""} · {rangeLabel}
          </span>
        }
      />
    </div>
  );
}

function Card({
  icon,
  label,
  value,
  accent,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent?: "positive" | "negative";
  sub?: React.ReactNode;
}) {
  const accentClass =
    accent === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : accent === "negative"
        ? "text-red-700 dark:text-red-400"
        : "";
  return (
    <div className="rounded-md border bg-card p-3 space-y-1">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {icon}
        {label}
      </div>
      <div className={`text-lg font-semibold tabular-nums ${accentClass}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
