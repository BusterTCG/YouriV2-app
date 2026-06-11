"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  TrendingUp,
  Briefcase,
  Theater,
  Ticket,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Hourglass,
  PieChart as PieIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  DEAL_CATEGORY_LABELS,
  PAYMENT_STATUS_EMOJI,
  PAYMENT_STATUS_LABEL,
  dealStatusLabel,
  formatEur,
  paymentStatusClass,
} from "@/components/deals/deal-helpers";
import {
  computeArtistOverview,
  type ArtistOverviewRow,
} from "@/lib/artist-overview-types";
import {
  PERIOD_PRESET_OPTIONS,
  getPeriodRange,
  formatPeriodRangeLabel,
  type PeriodPreset,
} from "@/lib/period-presets";

/**
 * Vue d'ensemble fiche artiste — refonte 2026-05-26 (Stan) :
 *   - 4 box KPI (Total / Booking / Spectacle / Cachet) avec split
 *     encaissé/à venir sous le chiffre
 *   - Period selector (Ce mois / Cette année / 12 derniers mois / Tout…)
 *     filtrant tout le bloc — calcul client-side via computeArtistOverview
 *   - Pie chart répartition par catégorie (donut) + liste à droite
 *     (style identique au KN screenshot)
 *   - Liste "Derniers deals" (8 dernières) cliquables → fiche deal
 *
 * Reçoit les ROWS brutes du serveur — re-calcule à chaque changement de
 * période sans round-trip réseau (< 200 deals max).
 */
interface OverviewSectionProps {
  rows: ArtistOverviewRow[];
  artistName: string;
  /** Total brut de deals (toutes périodes), pour différencier "0 cette
   *  année" de "0 jamais" dans l'empty state. */
  totalDealsCount: number;
}

const KPI_DEFS = [
  {
    key: "total" as const,
    label: "Total",
    icon: TrendingUp,
    hint: "Tous deals confondus",
    accent: true,
  },
  {
    key: "booking" as const,
    label: "Booking",
    icon: Briefcase,
    hint: "Cession / booking",
    accent: false,
  },
  {
    key: "spectacle" as const,
    label: "Spectacle",
    icon: Theater,
    hint: "Prod Exé 15 %",
    accent: false,
  },
  {
    key: "cachet" as const,
    label: "Cachet",
    icon: Ticket,
    hint: "Intermittents",
    accent: false,
  },
];

const DEFAULT_PERIOD: PeriodPreset = "this-year";

export function OverviewSection({
  rows,
  artistName,
  totalDealsCount,
}: OverviewSectionProps) {
  const [period, setPeriod] = useState<PeriodPreset>(DEFAULT_PERIOD);

  const periodRange = useMemo(() => getPeriodRange(period), [period]);
  const computed = useMemo(
    () => computeArtistOverview(rows, periodRange),
    [rows, periodRange],
  );
  const rangeLabel = useMemo(() => formatPeriodRangeLabel(period), [period]);

  const { totals, dealsCount, filteredRows, categoryBreakdown } = computed;
  const recentDeals = filteredRows.slice(0, 8);

  return (
    <div className="space-y-4">
      {/* Period selector — pattern KN (toggle group) */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-yr-gold" />
            KPIs financiers
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {dealsCount} deal{dealsCount > 1 ? "s" : ""} ·{" "}
            <span className="text-muted-foreground/80">{rangeLabel}</span>
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* 4 box KPI — Total accent doré, 3 autres neutres + split encaissé/à venir */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {KPI_DEFS.map((def) => {
          const Icon = def.icon;
          const bd = totals[def.key];
          return (
            <div
              key={def.key}
              className={cn(
                "rounded-md border p-4 space-y-1.5 transition-colors",
                def.accent
                  ? "border-yr-gold/40 bg-yr-gold/5"
                  : "bg-muted/20",
              )}
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                <Icon className="h-3.5 w-3.5" />
                {def.label}
              </div>
              <div
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  def.accent && "text-yr-gold",
                )}
              >
                {formatEur(bd.total)}
              </div>
              {bd.total > 0 ? (
                <div className="space-y-1.5 pt-1">
                  {bd.paid > 0 && (
                    <div className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 tabular-nums">
                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                      {formatEur(bd.paid)} encaissé
                    </div>
                  )}
                  {bd.pending > 0 && (
                    <div className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 tabular-nums">
                      <Hourglass className="h-3 w-3 shrink-0" />
                      {formatEur(bd.pending)} à venir
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground/70 italic">
                  {def.hint}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Répartition par catégorie — Pie chart KN-style (Stan screenshot) */}
      <div className="rounded-md border bg-card p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3 flex items-center gap-2">
          <PieIcon className="h-3.5 w-3.5" />
          Répartition par catégorie · montant des deals
        </div>
        {categoryBreakdown.length > 0 ? (
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="w-[170px] h-[170px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={70}
                    paddingAngle={2}
                    stroke="var(--color-card)"
                    strokeWidth={2}
                  >
                    {categoryBreakdown.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as {
                        label: string;
                        value: number;
                      };
                      return (
                        <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                          <div className="font-medium">{p.label}</div>
                          <div className="tabular-nums">
                            {formatEur(p.value)}
                          </div>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="max-w-fit space-y-2 flex-1">
              {categoryBreakdown.map((c) => {
                const pct =
                  totals.total.total > 0
                    ? (c.value / totals.total.total) * 100
                    : 0;
                return (
                  <li
                    key={c.category}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: c.color }}
                    />
                    <span className="min-w-[6rem] font-medium">{c.label}</span>
                    <span className="text-muted-foreground tabular-nums w-10 text-right shrink-0">
                      {Math.round(pct)}%
                    </span>
                    <span className="font-medium tabular-nums w-24 text-right shrink-0">
                      {formatEur(c.value)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-6 italic">
            Aucun deal sur cette période.
          </div>
        )}
      </div>

      {/* Derniers deals — limite 8 sur la période sélectionnée.
          Stan : max-w-4xl pour ne pas étirer sur toute la largeur (la liste
          ne contient que des colonnes courtes — le flex-1 du titre laissait
          trop de vide). + header de colonnes au-dessus pour lisibilité. */}
      <div className="max-w-4xl">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Derniers deals
          </h2>
          {dealsCount > recentDeals.length && (
            <span className="text-[11px] text-muted-foreground italic">
              Affichage des {recentDeals.length} plus récents sur {dealsCount}
            </span>
          )}
        </div>

        {recentDeals.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {totalDealsCount === 0
                  ? `${artistName} n'a pas encore de deals enregistrés.`
                  : `Aucun deal pour ${artistName} sur cette période.`}
              </p>
              {totalDealsCount === 0 && (
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Ajoute-le sur un deal Booking depuis{" "}
                  <Link
                    href="/deals/booking"
                    className="underline hover:text-foreground"
                  >
                    /deals/booking
                  </Link>
                  .
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border overflow-hidden divide-y">
            {/* Header de colonnes — mêmes largeurs que les rows pour
                alignement parfait. Stan 2026-05-26 : visibilité des
                libellés. */}
            <div className="flex items-center gap-3 px-3 py-2 bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              <div className="w-20 shrink-0">Date</div>
              <div className="w-20 shrink-0">Cat.</div>
              <div className="flex-1 min-w-0">Titre</div>
              <div className="hidden sm:block w-24 shrink-0">Statut</div>
              <div className="w-24 shrink-0 text-right">Montant</div>
              <div className="hidden md:block w-28 shrink-0 text-center">
                Paiement
              </div>
              <div className="w-3.5 shrink-0" aria-hidden />
            </div>

            {recentDeals.map((d) => {
              const dStatus = dealStatusLabel(d.status);
              return (
                <Link
                  key={d.dealArtisteId}
                  href={`/deals/booking/${d.dealId}`}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors text-sm"
                >
                  <div className="w-20 shrink-0 tabular-nums text-xs text-muted-foreground">
                    {format(d.date, "d MMM yy", { locale: fr })}
                  </div>
                  <div className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {DEAL_CATEGORY_LABELS[d.category]}
                  </div>
                  <div className="flex-1 min-w-0 truncate font-medium">
                    {d.title}
                  </div>
                  <div className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground w-24 shrink-0">
                    <span>{dStatus.emoji}</span>
                    <span className="truncate">{dStatus.label}</span>
                  </div>
                  <div className="w-24 shrink-0 text-right tabular-nums font-medium">
                    {formatEur(d.amount)}
                  </div>
                  <span
                    className={cn(
                      "hidden md:inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium w-28 shrink-0 justify-center",
                      paymentStatusClass(d.paymentStatus),
                    )}
                    title={`Statut paiement : ${PAYMENT_STATUS_LABEL[d.paymentStatus]}`}
                  >
                    <span>{PAYMENT_STATUS_EMOJI[d.paymentStatus]}</span>
                    <span className="truncate">
                      {PAYMENT_STATUS_LABEL[d.paymentStatus]}
                    </span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PeriodSelector({
  value,
  onChange,
}: {
  value: PeriodPreset;
  onChange: (p: PeriodPreset) => void;
}) {
  return (
    <div className="inline-flex rounded-md border bg-muted/40 p-0.5 flex-wrap">
      {PERIOD_PRESET_OPTIONS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => onChange(p.value)}
          className={cn(
            "rounded px-2.5 py-1 text-xs transition-colors whitespace-nowrap",
            value === p.value
              ? "bg-background shadow-sm font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
