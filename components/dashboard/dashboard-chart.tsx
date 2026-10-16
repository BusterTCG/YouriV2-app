"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEur } from "@/components/deals/deal-helpers";
import { usePrivacy } from "@/lib/privacy-context";
import { SensitiveAmount } from "./sensitive-amount";
import type { DashboardPeriod } from "@/lib/dashboard";

interface Props {
  data: Array<{ key: string; month: string; margeNette: number; projection: number }>;
  period: DashboardPeriod;
}

/**
 * Graphique Marge Nette mensuelle (Sprint 7 Pangee).
 *
 * Stan 2026-06-02 : la fenêtre du chart s'aligne sur le toggle de période.
 *   - month : 12 mois glissants finissant le mois courant (contexte historique)
 *   - year  : 12 mois calendaires de l'année courante (jan → déc) — le total
 *             du chart = KPI Marge Nette pour cohérence visuelle.
 *
 * Data pré-agrégée par `lib/dashboard.ts` : 12 buckets contigus, même les
 * mois sans data sont à 0 pour conserver l'axe X stable.
 *
 * Projection (Stan 2026-10-16, idem KN) : barre bleue empilée = marge nette
 * des deals à venir pas encore encaissée, au mois de la date du deal.
 */
/** Barre « projection » (deals à venir) — bleu, distinct de l'or encaissé. */
const PROJECTION_COLOR = "#7aa7e0";

export function DashboardChart({ data, period }: Props) {
  const { isPrivate } = usePrivacy();
  const total = data.reduce((s, m) => s + m.margeNette, 0);
  const projected = data.reduce((s, m) => s + m.projection, 0);
  // Année déduite du dernier bucket (= mois courant en mode "month", déc de
  // l'année courante en mode "year").
  const lastKey = data[data.length - 1]?.key ?? "";
  const year = lastKey.split("-")[0] ?? "";
  const title =
    period === "year"
      ? `Marge Nette · année ${year}`
      : `Marge Nette · 12 derniers mois`;

  return (
    <div className="rounded-md border bg-card px-4 py-3 space-y-2">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          <TrendingUp className="h-3.5 w-3.5" />
          {title}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "var(--yr-gold)" }} />
            Encaissé :{" "}
            <span className="font-semibold text-foreground">
              <SensitiveAmount value={total} />
            </span>
          </span>
          {projected !== 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: PROJECTION_COLOR }} />
              Projection :{" "}
              <span className="font-semibold text-foreground">
                <SensitiveAmount value={projected} />
              </span>
            </span>
          )}
        </div>
      </div>
      <div
        className={cn(
          "h-40 -mx-2 transition-[filter] duration-200",
          isPrivate && "blur-md select-none pointer-events-none",
        )}
        aria-hidden={isPrivate}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              axisLine={false}
              tickLine={false}
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
                const item = payload[0].payload as Props["data"][number];
                return (
                  <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                    <div className="font-medium">{label}</div>
                    {item.margeNette !== 0 && (
                      <div className="tabular-nums">Encaissé : {formatEur(item.margeNette)}</div>
                    )}
                    {item.projection !== 0 && (
                      <div className="tabular-nums text-muted-foreground">
                        Projection : {formatEur(item.projection)}
                      </div>
                    )}
                    {item.margeNette === 0 && item.projection === 0 && (
                      <div className="tabular-nums">{formatEur(0)}</div>
                    )}
                  </div>
                );
              }}
            />
            <Bar dataKey="margeNette" stackId="m" fill="var(--yr-gold)" />
            <Bar dataKey="projection" stackId="m" fill={PROJECTION_COLOR} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
