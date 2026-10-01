// Prochaines dates = vraies dates des séances (Stan 2026-09-28) : une ligne
// par jour de représentation (tournée + résidences confondues), un doublé sur
// une ligne avec ses horaires. Partagé entre /shows (toutes productions, 30 j)
// et la fiche production (toutes les dates à venir). Server component.

import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertCircle, MapPin } from "lucide-react";
import type { ProductionDealView, ProductionSummary } from "@/lib/productions";
import { FillRing } from "@/components/shows/kpi-visuals";
import { StagePill } from "@/components/shows/stage-pill";
import { nextPrepStep } from "@/lib/date-lifecycle";
import { cn } from "@/lib/utils";

export type UpcomingItem = {
  d: ProductionDealView;
  p: ProductionSummary;
  /** Jour "YYYY-MM-DD". */
  day: string;
  times: string[];
  /** Remplissage du soir (payants ÷ jauge des séances du jour), null si non saisi. */
  fillRate: number | null;
};

/** Jours de représentation à venir (≥ aujourd'hui, ≤ horizon si fourni). */
export function collectUpcoming(
  productions: ProductionSummary[],
  todayKey: string,
  horizonKey: string | null,
): UpcomingItem[] {
  return productions
    .flatMap((p) =>
      p.deals
        .filter((d) => d.status !== "ANNULE")
        .flatMap((d) => {
          const byDay = new Map<string, { times: string[]; paying: number; capacity: number }>();
          for (const s of d.sessions) {
            if (s.day < todayKey || (horizonKey && s.day > horizonKey)) continue;
            const cur = byDay.get(s.day) ?? { times: [], paying: 0, capacity: 0 };
            if (s.time) cur.times.push(s.time);
            cur.paying += s.paying ?? 0;
            cur.capacity += s.capacity ?? 0;
            byDay.set(s.day, cur);
          }
          return [...byDay.entries()].map(([day, v]) => ({
            d,
            p,
            day,
            times: v.times,
            fillRate: v.capacity > 0 && v.paying > 0 ? Math.round((v.paying / v.capacity) * 100) : null,
          }));
        }),
    )
    .sort((a, b) => a.day.localeCompare(b.day) || (a.times[0] ?? "").localeCompare(b.times[0] ?? ""));
}

/** Liste avec les `visible` premiers jours affichés, le reste replié. */
export function UpcomingList({
  items,
  visible,
  showArtist = true,
  emptyText,
}: {
  items: UpcomingItem[];
  visible: number;
  /** false sur la fiche production (artiste / spectacle déjà en titre). */
  showArtist?: boolean;
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }
  const row = (it: UpcomingItem) => (
    <UpcomingRow key={`${it.d.id}-${it.day}`} item={it} showArtist={showArtist} />
  );
  return (
    <div className="space-y-1.5">
      {items.slice(0, visible).map(row)}
      {items.length > visible && (
        <details className="group space-y-1.5">
          <summary className="cursor-pointer list-none text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline py-1">
            <span className="group-open:hidden">Voir les {items.length - visible} autres dates</span>
            <span className="hidden group-open:inline">Masquer</span>
          </summary>
          {items.slice(visible).map(row)}
        </details>
      )}
    </div>
  );
}

function UpcomingRow({ item, showArtist }: { item: UpcomingItem; showArtist: boolean }) {
  const { d, p, day, times } = item;
  const nextOp = nextPrepStep(d);
  const fdrMissing = d.briefingStatus !== "COMPLETE" && d.briefingStatus !== "SENT";
  const place = [d.venueName, d.city].filter(Boolean).join(" · ") || "Lieu à définir";

  return (
    <Link
      href={d.residencyId ? `/shows/residence/${d.residencyId}` : `/shows/${d.id}`}
      className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 hover:bg-accent/30 transition-colors flex-wrap sm:flex-nowrap"
      style={{ borderLeftWidth: 4, borderLeftColor: p.artist.color }}
    >
      <div className="w-28 shrink-0 leading-tight">
        <div className="font-semibold tabular-nums capitalize">
          {format(new Date(`${day}T12:00:00Z`), "EEE dd/MM", { locale: fr })}
        </div>
        {times.length > 0 && <div className="text-[11px] text-muted-foreground">{times.join(" / ")}</div>}
      </div>
      <FillRing percent={item.fillRate} />
      <div className="flex-1 min-w-[160px]">
        {showArtist ? (
          <>
            <div className="text-sm">
              <span className="font-semibold" style={{ color: p.artist.color }}>
                {p.artist.name}
              </span>{" "}
              · <span className="font-medium">{p.name}</span>
            </div>
            <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {d.residencyId && "Résidence · "}
              {place}
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-medium">{d.venueName ?? d.title}</div>
            <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {d.residencyId ? "Résidence · " : "Tournée · "}
              {d.city ?? place}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs">
        {d.stage === "A_CONFIRMER" ? (
          <StagePill stage="A_CONFIRMER" />
        ) : nextOp ? (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold">
            <AlertCircle className="h-3 w-3" />
            {nextOp}
          </span>
        ) : (
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Prêt</span>
        )}
        <span className={cn(fdrMissing ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
          FDR {fdrMissing ? "à finir" : "✓"}
        </span>
      </div>
    </Link>
  );
}
