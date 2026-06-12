"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar, MapPin } from "lucide-react";
import type { DealCategory, DealStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { dealStatusLabel } from "./deal-helpers";
import { useEur } from "@/lib/privacy-context";

/**
 * Card mobile pour un deal — Sprint 11 Stan 2026-06-02.
 *
 * Remplace le tableau scroll-x sur mobile (< md). Affiche les infos
 * essentielles d'un deal : titre + lieu + date + statut + 3 chiffres clés
 * (CA HT, Marge Nette, statut paiement encaissé/en cours).
 *
 * Click → ouvre la fiche détail deal.
 *
 * Usage : afficher dans un wrapper `md:hidden` à côté du tableau desktop
 * `hidden md:block`.
 */
interface Props {
  dealId: string;
  category: DealCategory;
  date: Date;
  title: string;
  subtitle?: string | null;
  venue?: string | null;
  status: DealStatus;
  /** Statut "Encaissé" global du deal (budget reçu). */
  isPaid: boolean;
  /** Chiffres clés affichés en bas de la card. */
  caHt: number;
  margeNette: number;
  margeNettePct: number | null;
  /** Subtle décoration (line-through si ANNULE). */
  isAnnule?: boolean;
}

/** URL fiche détail deal par catégorie. */
function dealHref(category: DealCategory, id: string): string {
  switch (category) {
    case "BOOKING":
      return `/deals/booking/${id}`;
    case "PROD_EXE":
      return `/deals/prod-executive/${id}`;
    case "CACHETS":
      return `/deals/cachets/${id}`;
  }
}

export function MobileDealCard({
  dealId,
  category,
  date,
  title,
  subtitle,
  venue,
  status,
  isPaid,
  caHt,
  margeNette,
  margeNettePct,
  isAnnule = false,
}: Props) {
  const router = useRouter();
  const eur = useEur();
  const dStatus = dealStatusLabel(status);

  return (
    <button
      type="button"
      onClick={() => router.push(dealHref(category, dealId))}
      className={cn(
        "block w-full text-left rounded-md border bg-card p-3 hover:bg-accent/30 transition-colors",
        isAnnule && "opacity-50",
      )}
    >
      {/* Ligne 1 : date + statut deal */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3 shrink-0" />
          <span className="tabular-nums">
            {format(date, "dd MMM yyyy", { locale: fr })}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground inline-flex items-center gap-1">
          {dStatus.emoji} {dStatus.label}
        </span>
      </div>

      {/* Ligne 2 : titre projet */}
      <div className="font-medium text-sm leading-tight truncate">{title}</div>
      {subtitle && (
        <div className="text-[11px] text-muted-foreground leading-tight truncate mt-0.5">
          {subtitle}
        </div>
      )}
      {venue && (
        <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5 max-w-full min-w-0">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{venue}</span>
        </div>
      )}

      {/* Ligne 3 : 4 colonnes — CA HT | Marge Nette | % | Statut.
          Stan 2026-06-02 : % séparé de la marge € pour plus de lisibilité. */}
      <div className="mt-2 pt-2 border-t grid grid-cols-4 gap-2 items-end">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
            CA HT
          </div>
          <div className="text-sm font-semibold tabular-nums truncate">
            {caHt > 0 ? eur(caHt) : "—"}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
            Marge Nette
          </div>
          <div
            className={cn(
              "text-sm font-semibold tabular-nums truncate",
              margeNette > 0
                ? "text-emerald-700 dark:text-emerald-400"
                : margeNette < 0
                  ? "text-red-700 dark:text-red-400"
                  : "",
            )}
          >
            {margeNette !== 0 ? eur(margeNette) : "—"}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
            % Marge
          </div>
          <div className="text-sm font-semibold tabular-nums truncate text-muted-foreground">
            {margeNettePct != null ? `${Math.round(margeNettePct)} %` : "—"}
          </div>
        </div>
        <div className="min-w-0 text-right">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
            Statut
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] whitespace-nowrap mt-0.5",
              isPaid
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                : "bg-muted/40 text-muted-foreground border-border",
            )}
          >
            {isPaid ? "✅ Payé" : "⏳ En cours"}
          </span>
        </div>
      </div>
    </button>
  );
}
