"use client";

import { Layers } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { formatPct } from "@/components/deals/deal-helpers";
import { usePrivacy } from "@/lib/privacy-context";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import type { CategoryBreakdownSlice } from "@/lib/reporting-types";

interface Props {
  data: CategoryBreakdownSlice[];
  rangeLabel: string;
}

/**
 * Répartition Marge Nette par catégorie — donut + table.
 * Stan 2026-06-02 : 3 catégories Pangee (Booking / Prod Exé / Cachets).
 * Si une catégorie a une marge négative, on l'affiche mais en valeur absolue
 * dans le pie (Recharts gère mal les négatifs).
 */
export function ReportingCategoryBreakdown({ data, rangeLabel }: Props) {
  const { isPrivate } = usePrivacy();
  const total = data.reduce((s, d) => s + Math.abs(d.value), 0);
  // Recharts pie : utiliser |value| pour les arcs, mais afficher la vraie
  // value dans la table (peut être négative).
  const pieData = data.map((d) => ({ ...d, absValue: Math.abs(d.value) }));

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-blue-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wider">
          Marge Nette par catégorie
        </h2>
        <span className="text-[11px] text-muted-foreground">
          · {rangeLabel}
        </span>
      </div>
      <div className="rounded-md border bg-card p-4">
        {data.length === 0 || total === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground italic">
            Aucune donnée encaissée sur cette période.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            {/* Donut */}
            <div
              className={cn(
                "h-40 transition-[filter] duration-200",
                isPrivate && "blur-md select-none pointer-events-none",
              )}
              aria-hidden={isPrivate}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="absValue"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {pieData.map((slice) => (
                      <Cell key={slice.category} fill={slice.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Légende avec valeurs */}
            <div className="space-y-2">
              {data.map((slice) => {
                const pct = total > 0 ? (Math.abs(slice.value) / total) * 100 : 0;
                return (
                  <div
                    key={slice.category}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span
                      className="h-3 w-3 rounded-sm shrink-0"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="flex-1 min-w-0 truncate">
                      {slice.label}
                    </span>
                    <span
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        slice.value < 0 && "text-red-700 dark:text-red-400",
                      )}
                    >
                      <SensitiveAmount value={slice.value} />
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">
                      {formatPct(pct, { integer: true })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
