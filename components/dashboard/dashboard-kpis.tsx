"use client";

import { ArrowDown, ArrowUp, Briefcase, HandCoins, Minus, Percent, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatPct } from "@/components/deals/deal-helpers";
import { SensitiveAmount } from "./sensitive-amount";
import type { DashboardKpis, DashboardPeriod } from "@/lib/dashboard";
import type { MoneyHeld } from "@/lib/finance/money-held-server";
import { MoneyHeldCard } from "./money-held-card";
import { RingMeter } from "@/components/shows/kpi-visuals";

interface Props {
  kpis: DashboardKpis;
  /** Argent reçu et pas encore reversé (à date). */
  moneyHeld: MoneyHeld;
  period: DashboardPeriod;
  periodLabel: string;
}

/**
 * 4 KPI cards top du dashboard — Stan 2026-06-02 v6.
 *
 * v6 (Stan 2026-06-02) : ajout évolution vs N-1 sous chaque montant
 * (mois précédent en mode month, année précédente en mode year).
 *
 * Ordre :
 *   1. CA HT encaissé
 *   2. Marge Nette (= Brute − MF)
 *   3. Taux Marge Nette (%)
 *   4. Management Fees (reversés à l'user connecté)
 *   5. À reverser — à date (Stan 2026-10-16)
 */
export function DashboardKpis({ kpis, moneyHeld, period, periodLabel }: Props) {
  void periodLabel;
  // Période dans le libellé de chaque card, comme KN (Stan 2026-10-16).
  const p = period === "year" ? "année" : "mois";
  const prevLabel = period === "year" ? "vs an dernier" : "vs mois dernier";
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <Card
        icon={<Briefcase className="h-3.5 w-3.5 text-muted-foreground" />}
        label={`CA HT encaissé — ${p}`}
        value={<SensitiveAmount value={kpis.caHtEncaisse} />}
        delta={computeDelta(kpis.caHtEncaisse, kpis.prev.caHtEncaisse)}
        deltaLabel={prevLabel}
      />
      <Card
        icon={<Sparkles className="h-3.5 w-3.5 text-muted-foreground" />}
        label={`Marge nette — ${p}`}
        value={<SensitiveAmount value={kpis.margeNette} />}
        delta={computeDelta(kpis.margeNette, kpis.prev.margeNette)}
        deltaLabel={prevLabel}
        accent={kpis.margeNette > 0 ? "positive" : kpis.margeNette < 0 ? "negative" : undefined}
      />
      <Card
        icon={<Percent className="h-3.5 w-3.5 text-muted-foreground" />}
        label={`Taux de marge nette — ${p}`}
        // Anneau à teinte fixe, quel que soit le taux (Stan 2026-10-16).
        value={
          <RingMeter
            percent={kpis.margeNettePct}
            center={kpis.margeNettePct != null ? formatPct(kpis.margeNettePct, { integer: true }) : "—"}
            size={56}
            tone="high"
          />
        }
        // Pour le taux %, on affiche le delta en points (pp) — ex. "+5pp"
        delta={
          kpis.margeNettePct != null && kpis.prev.margeNettePct != null
            ? {
                pct: kpis.margeNettePct - kpis.prev.margeNettePct,
                isPoints: true,
              }
            : null
        }
        deltaLabel={prevLabel}
      />
      <Card
        icon={<HandCoins className="h-3.5 w-3.5 text-muted-foreground" />}
        label={`Mes management fees — ${p}`}
        value={<SensitiveAmount value={kpis.mfEncaisseUser} />}
        delta={
          kpis.mfEncaisseUser != null
            ? computeDelta(kpis.mfEncaisseUser, kpis.prev.mfEncaisseUser ?? 0)
            : null
        }
        deltaLabel={prevLabel}
        accent={
          kpis.mfEncaisseUser != null && kpis.mfEncaisseUser > 0
            ? "positive"
            : undefined
        }
      />
      <MoneyHeldCard moneyHeld={moneyHeld} />
    </div>
  );
}

type Delta = { pct: number; isPoints?: boolean } | null;

/** Calcule l'évolution % entre la période courante et N-1.
 *  Si prev = 0 et current > 0 → "Nouveau" (pas de delta calculable). */
function computeDelta(current: number, prev: number): Delta {
  if (prev === 0) {
    if (current === 0) return { pct: 0 };
    return null; // "Nouveau" — pas de comparaison signifiante
  }
  return { pct: ((current - prev) / Math.abs(prev)) * 100 };
}

function Card({
  icon,
  label,
  value,
  delta,
  deltaLabel,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  delta: Delta;
  deltaLabel: string;
  accent?: "positive" | "negative";
}) {
  const accentClass =
    accent === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : accent === "negative"
        ? "text-red-700 dark:text-red-400"
        : "";
  return (
    <div className="rounded-md border bg-card p-3 sm:p-4 space-y-1 min-w-0">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-0">
        {icon}
        <span className="min-w-0 leading-tight">{label}</span>
      </div>
      <div className={`text-lg sm:text-2xl font-semibold tabular-nums truncate ${accentClass}`}>
        {value}
      </div>
      <DeltaBadge delta={delta} label={deltaLabel} />
    </div>
  );
}

function DeltaBadge({ delta, label }: { delta: Delta; label: string }) {
  if (delta === null) {
    return (
      <div className="text-[11px] text-muted-foreground italic">
        Nouveau · pas de comparaison
      </div>
    );
  }
  const { pct, isPoints } = delta;
  if (Math.abs(pct) < 0.5) {
    return (
      <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
        <Minus className="h-3 w-3" />
        Stable · {label}
      </div>
    );
  }
  const positive = pct > 0;
  const Icon = positive ? ArrowUp : ArrowDown;
  const colorClass = positive
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-red-700 dark:text-red-400";
  const formatted = isPoints
    ? `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}pp`
    : `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
  return (
    <div className={cn("text-[11px] inline-flex items-center gap-1", colorClass)}>
      <Icon className="h-3 w-3" />
      <span className="font-medium tabular-nums">{formatted}</span>
      <span className="text-muted-foreground font-normal ml-0.5">{label}</span>
    </div>
  );
}
