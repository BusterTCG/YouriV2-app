"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEur } from "@/components/deals/deal-helpers";
import { usePrivacy } from "@/lib/privacy-context";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import type { MonthlyBucket } from "@/lib/reporting-types";

interface Props {
  data: MonthlyBucket[];
  rangeLabel: string;
}

/**
 * Chart marge nette mensuelle pour /reporting (Sprint 9 Pangee).
 * Adapté du DashboardChart : fenêtre dépend du préset (12 ou 24 mois), pas
 * de toggle period interne (filtré côté URL).
 */
export function ReportingChart({ data, rangeLabel }: Props) {
  const { isPrivate } = usePrivacy();
  const total = data.reduce((s, m) => s + m.margeNette, 0);

  return (
    <div className="rounded-md border bg-card px-4 py-3 space-y-2">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          <TrendingUp className="h-3.5 w-3.5" />
          Marge Nette mensuelle · {rangeLabel}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          Total :{" "}
          <span className="font-semibold text-foreground">
            <SensitiveAmount value={total} />
          </span>
        </span>
      </div>
      <div
        className={cn(
          "h-48 -mx-2 transition-[filter] duration-200",
          isPrivate && "blur-md select-none pointer-events-none",
        )}
        aria-hidden={isPrivate}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v) => (v === 0 ? "" : `${Math.round(v / 1000)}k`)}
            />
            <Tooltip
              cursor={{ fill: "var(--color-accent)", opacity: 0.3 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const v = (payload[0].value ?? 0) as number;
                return (
                  <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                    <div className="font-medium">{label}</div>
                    <div className="tabular-nums">{formatEur(v)}</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="margeNette" fill="var(--yr-gold)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
