// Lignes de date partagées entre l'accueil Productions (« En retard / à
// solder », toutes productions) et la fiche production (onglet Suivi).
// Chaque ligne porte ses KPI + le mini-anneau de remplissage (Stan
// 2026-10-01). Un mois de résidence renvoie vers la fiche résidence.
// Server component.

import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronRight, MapPin } from "lucide-react";
import type { ProductionDealView, ProductionSummary } from "@/lib/productions";
import { dateFillRate } from "@/lib/production-report";
import { formatEur } from "@/components/deals/deal-helpers";
import { StagePill } from "@/components/shows/stage-pill";
import { nextPrepStep } from "@/lib/date-lifecycle";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import { FillRing } from "@/components/shows/kpi-visuals";
import { cn } from "@/lib/utils";

export type OpenItem = { label: string; tone: "amber" | "red" | "slate" };

/**
 * Ce qui reste à faire sur une date passée (tournée ou mois de résidence) :
 * recettes à encaisser, charges à payer, données à saisir. Le règlement
 * artiste est géré par le compte artiste. Vide = date soldée.
 */
export function openItems(d: ProductionDealView): OpenItem[] {
  const items: OpenItem[] = [];
  const cancelled = d.status === "ANNULE";
  if (!cancelled && d.pnl.revenue === 0) items.push({ label: "Recette à saisir", tone: "slate" });
  if (!cancelled && (d.paying == null || d.paying === 0)) {
    items.push({ label: "Payants à saisir", tone: "slate" });
  }
  if (Math.round(d.openRevenue) !== 0) {
    items.push({ label: `${formatEur(d.openRevenue)} à encaisser`, tone: "amber" });
  }
  if (Math.round(d.openCost) !== 0) {
    items.push({ label: `${formatEur(d.openCost)} de charges à payer`, tone: "red" });
  }
  return items;
}

/** Dates passées (ou annulées) d'une production, la plus récente d'abord. */
export function pastDealsOf(p: ProductionSummary): ProductionDealView[] {
  return p.deals.filter((d) => d.isPast || d.status === "ANNULE").reverse();
}

/**
 * Dates à solder (lot 3, Stan 2026-10-01) : jouées et pas encore soldées
 * (une annulée seulement si elle porte encore quelque chose à régler). Une
 * date aux comptes à jour reste à solder tant que la quote-part artiste qui
 * la couvre n'est pas versée (onglet Artiste → « Verser une quote-part »).
 */
export function toSettleOf(p: ProductionSummary): Array<{ d: ProductionDealView; items: OpenItem[] }> {
  return pastDealsOf(p)
    .filter((d) => d.stage !== "SOLDEE")
    .map((d) => {
      const items = openItems(d);
      if (items.length === 0 && d.stage === "A_SOLDER") {
        items.push({ label: "Comptes à jour — quote-part à verser", tone: "slate" });
      }
      return { d, items };
    })
    .filter((x) => x.items.length > 0);
}

function dealHref(d: ProductionDealView): string {
  return `/shows/${d.id}`;
}

function DateCell({ d }: { d: ProductionDealView }) {
  return (
    <div className="w-28 shrink-0 leading-tight">
      <div className="font-semibold tabular-nums capitalize">
        {d.isMultiDate || d.residencyId
          ? format(d.firstDate, "MMMM yyyy", { locale: fr })
          : format(d.date, "dd/MM/yyyy")}
      </div>
      <div className="text-[11px] text-muted-foreground first-letter:uppercase">
        {d.isMultiDate || d.residencyId
          ? `${d.performances} séance${d.performances > 1 ? "s" : ""}`
          : `${format(d.date, "EEEE", { locale: fr })}${d.showTime ? ` · ${d.showTime}` : ""}`}
      </div>
    </div>
  );
}

export function SettlementRow({
  d,
  items,
  production,
}: {
  d: ProductionDealView;
  items: OpenItem[];
  /** Accueil (toutes productions) : rappelle l'artiste et la production. */
  production?: Pick<ProductionSummary, "name" | "artist">;
}) {
  return (
    <Link
      href={dealHref(d)}
      className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 hover:bg-accent/30 transition-colors flex-wrap sm:flex-nowrap"
      style={production ? { borderLeftWidth: 4, borderLeftColor: production.artist.color } : undefined}
    >
      <DateCell d={d} />
      <FillRing percent={dateFillRate(d)} />
      <div className="flex-1 min-w-[160px]">
        {production && (
          <div className="text-sm">
            <span className="font-semibold" style={{ color: production.artist.color }}>
              {production.artist.name}
            </span>{" "}
            · <span className="font-medium">{production.name}</span>
          </div>
        )}
        <div className={cn("truncate", production ? "text-[11px] text-muted-foreground" : "text-sm font-medium")}>
          {d.venueName ?? d.title}
        </div>
        <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {d.residencyId ? "Résidence · " : "Tournée · "}
          {d.city ?? "—"}
          {d.status === "ANNULE" && " · annulée"}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        {items.map((it) => (
          <span
            key={it.label}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
              it.tone === "amber" && "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
              it.tone === "red" && "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
              it.tone === "slate" && "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300",
            )}
          >
            {it.label}
          </span>
        ))}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
    </Link>
  );
}

/** Ligne de date avec KPI : remplissage (anneau), CA, résultat, part artiste. */
export function DateRow({ d }: { d: ProductionDealView }) {
  const cancelled = d.status === "ANNULE";

  return (
    <Link
      href={dealHref(d)}
      className={cn(
        "flex items-center gap-3 rounded-md border bg-card px-3 py-2 hover:bg-accent/30 transition-colors flex-wrap sm:flex-nowrap",
        (cancelled || d.isPast) && "bg-slate-50 dark:bg-slate-900/40",
        cancelled && "opacity-60",
      )}
    >
      <DateCell d={d} />
      <FillRing percent={dateFillRate(d)} />
      <div className="flex-1 min-w-[160px]">
        <div className="text-sm font-medium truncate">{d.venueName ?? d.title}</div>
        <div className="text-[11px] text-muted-foreground inline-flex items-center gap-2">
          {d.residencyId && <span>Résidence</span>}
          {d.city && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="h-3 w-3" />
              {d.city}
            </span>
          )}
        </div>
      </div>
      <StagePill
        stage={d.stage}
        detail={d.stage === "EN_PREPARATION" ? nextPrepStep(d) : d.settledAt ? format(d.settledAt, "dd/MM/yy") : null}
      />
      <Money label="CA" value={d.pnl.revenue} />
      <Money label="Résultat" value={d.pnl.margin} signed />
      <Money label="Part artiste" value={d.pnl.artistAmount} signed />
    </Link>
  );
}

function Money({ label, value, signed }: { label: string; value: number | null; signed?: boolean }) {
  return (
    <div className="w-24 text-right">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-sm font-semibold tabular-nums",
          signed && value != null && value > 0 && "text-emerald-600 dark:text-emerald-400",
          signed && value != null && value < 0 && "text-red-600 dark:text-red-400",
        )}
      >
        {value == null || value === 0 ? "—" : <SensitiveAmount value={value} />}
      </div>
    </div>
  );
}
