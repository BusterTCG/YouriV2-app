// Vue par défaut de /shows (portage de la refonte production KN — Stan 2026-09-29) :
// prochaines dates toutes productions confondues, productions en cours,
// dates à rattacher, productions terminées. Server component.

import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertCircle, CalendarClock, ChevronRight, Theater } from "lucide-react";
import { prisma } from "@/lib/db";
import {
  getProductionSummaries,
  type ProductionSummary,
} from "@/lib/productions";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import { PrivacyToggle } from "@/components/dashboard/privacy-toggle";
import { NewDealButton } from "@/components/deals/new-deal-button";
import { AttachDealToProduction } from "@/components/shows/attach-deal-to-production";
import { SectionTitle } from "@/components/shows/section-title";
import { UpcomingList, collectUpcoming } from "@/components/shows/upcoming-list";
import { cn } from "@/lib/utils";
import { productionContractSummary } from "@/lib/finance/production-overhead";

const UPCOMING_WINDOW_DAYS = 30;
/** Soirs affichés d'office dans « Prochaines dates » (le reste est replié). */
const UPCOMING_VISIBLE = 8;

export function ShowsTabs({ current }: { current: "productions" | "dates" }) {
  const tabs = [
    { key: "productions", label: "Productions", href: "/shows" },
    { key: "dates", label: "Toutes les dates", href: "/shows?view=dates" },
  ] as const;
  return (
    <div className="flex items-center gap-1 border-b">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            current === t.key
              ? "border-yr-gold text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export async function ProductionsView() {
  // eslint-disable-next-line react-hooks/purity -- server component, 1 exécution / requête
  const nowMs = Date.now();
  const [summaries, unlinkedRaw] = await Promise.all([
    getProductionSummaries({}, nowMs),
    prisma.deal.findMany({
      where: { category: "PROD_EXE", productionId: null, deletedAt: null },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        title: true,
        venueCity: true,
        // Artiste principal (1er DealArtiste actif) — spécificité Youri.
        dealArtistes: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { artist: { select: { id: true, name: true, color: true } } },
        },
      },
    }),
  ]);
  const unlinked = unlinkedRaw.map((d) => ({
    id: d.id,
    date: d.date,
    title: d.title,
    city: d.venueCity,
    artist: d.dealArtistes[0]?.artist ?? null,
  }));

  const active = summaries
    .filter((p) => p.status === "ACTIVE")
    .sort((a, b) => {
      // Productions avec une prochaine date d'abord (la plus proche en tête).
      const na = a.nextDeal?.date.getTime() ?? Infinity;
      const nb = b.nextDeal?.date.getTime() ?? Infinity;
      return na - nb || a.name.localeCompare(b.name);
    });
  const closed = summaries.filter((p) => p.status === "CLOSED");

  const horizon = nowMs + UPCOMING_WINDOW_DAYS * 24 * 3600 * 1000;
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const upcoming = collectUpcoming(
    summaries,
    format(startOfToday, "yyyy-MM-dd"),
    format(new Date(horizon), "yyyy-MM-dd"),
  );

  return (
    <div className="max-w-6xl space-y-5">
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <Theater className="h-3.5 w-3.5" />
            Productions · {active.length} en cours
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Productions & Tournées</h1>
          <p className="text-muted-foreground">
            Un spectacle = une production, suivie sur toute son exploitation.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <NewDealButton category="PROD_EXE" />
          <PrivacyToggle />
        </div>
      </div>

      <ShowsTabs current="productions" />

      {/* Prochaines dates — toutes productions */}
      <section className="space-y-2">
        <SectionTitle tone="blue" icon={<CalendarClock className="h-3.5 w-3.5" />}>
          Prochaines dates · {UPCOMING_WINDOW_DAYS} jours
        </SectionTitle>
        <UpcomingList
          items={upcoming}
          visible={UPCOMING_VISIBLE}
          emptyText={`Aucune date dans les ${UPCOMING_WINDOW_DAYS} prochains jours.`}
        />
      </section>

      {/* Productions en cours */}
      <section className="space-y-2">
        <SectionTitle tone="gold">En cours</SectionTitle>
        {active.length === 0 ? (
          <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            Aucune production en cours. Crée une date de production : la production est créée
            automatiquement à partir de l&apos;artiste et du nom du spectacle.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {active.map((p) => (
              <ProductionCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>

      {/* Dates sans production */}
      {unlinked.length > 0 && (
        <section className="space-y-2">
          <SectionTitle tone="amber" icon={<AlertCircle className="h-3.5 w-3.5" />}>
            Dates à rattacher · {unlinked.length}
          </SectionTitle>
          <div className="rounded-md border divide-y bg-card">
            {unlinked.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-3 py-2 flex-wrap">
                <span className="w-24 text-sm font-semibold tabular-nums">
                  {format(d.date, "dd/MM/yyyy")}
                </span>
                <Link
                  href={`/shows/${d.id}`}
                  className="flex-1 min-w-[160px] text-sm hover:underline"
                >
                  {d.artist ? (
                    <span className="font-medium" style={{ color: d.artist.color }}>
                      {d.artist.name}
                    </span>
                  ) : (
                    <span className="font-medium text-amber-700 dark:text-amber-400">
                      Sans artiste
                    </span>
                  )}{" "}
                  · {d.title}
                  {d.city && <span className="text-muted-foreground"> · {d.city}</span>}
                </Link>
                <AttachDealToProduction
                  dealId={d.id}
                  productions={summaries
                    .filter((p) => p.artist.id === d.artist?.id)
                    .map((p) => ({ id: p.id, name: p.name }))}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Productions terminées */}
      {closed.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none">
            <SectionTitle tone="slate" as="h3" icon={<ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />}>
              Terminées · {closed.length}
            </SectionTitle>
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            {closed.map((p) => (
              <ProductionCard key={p.id} p={p} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ProductionCard({ p }: { p: ProductionSummary }) {
  const progress =
    p.performancesPlanned > 0
      ? Math.round((p.performancesPlayed / p.performancesPlanned) * 100)
      : 0;
  const period =
    p.firstDate && p.lastDate
      ? `${format(p.firstDate, "MMM yy", { locale: fr })} → ${format(p.lastDate, "MMM yy", { locale: fr })}`
      : "Aucune date";
  const contractLabel =
    p.artistShareKind
      ? productionContractSummary(p)
        : "Contrat non défini";

  return (
    <Link
      href={`/shows/production/${p.id}`}
      className={cn(
        "block rounded-md border bg-card p-4 space-y-3 hover:bg-accent/30 transition-colors",
        p.status === "CLOSED" && "bg-slate-50 dark:bg-slate-900/40",
      )}
      style={{ borderLeftWidth: 4, borderLeftColor: p.artist.color }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold" style={{ color: p.artist.color }}>
            {p.artist.name}
          </div>
          <div className="text-lg font-semibold leading-tight truncate">{p.name}</div>
          <div className="text-[11px] text-muted-foreground capitalize">
            {period} · {contractLabel}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-1" />
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>
            {p.performancesPlayed}/{p.performancesPlanned} repr. jouées · {placesLabel(p)}
          </span>
          {p.nextDeal && (
            <span className="text-foreground/80">
              Prochaine : {format(p.nextDeal.date, "d MMM", { locale: fr })}
              {p.nextDeal.city && ` · ${p.nextDeal.city}`}
            </span>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-yr-gold" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <CardKpi label="Résultat" realized={p.realized.margin} forecast={p.forecast.margin} signed />
        <CardKpi label="Part Pangee" realized={p.realized.kn} forecast={p.forecast.kn} />
        <CardKpi label="Part artiste" realized={p.realized.artist} forecast={p.forecast.artist} signed />
      </div>

      {p.deposits.some((dep) => !dep.recovered && dep.toRecover > 0) && (
        <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 inline-flex items-center gap-1 mr-3">
          <AlertCircle className="h-3 w-3" />
          Acompte à récupérer :{" "}
          <SensitiveAmount
            value={p.deposits.reduce((s, dep) => s + (dep.recovered ? 0 : dep.toRecover), 0)}
          />
        </div>
      )}
      {(p.missingContractCount > 0 || p.unallocatedOverhead !== 0) && (
        <div className="text-[11px] text-amber-700 dark:text-amber-400 inline-flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {p.missingContractCount > 0
            ? "Contrat artiste non défini"
            : "Frais généraux non répartis"}
        </div>
      )}
    </Link>
  );
}

/** « 1 résidence · 3 dates de tournée » (les mois de résidence ne sont pas des dates). */
function placesLabel(p: ProductionSummary): string {
  const residencies = new Set(p.deals.map((d) => d.residencyId).filter(Boolean)).size;
  const tour = p.deals.filter((d) => !d.residencyId).length;
  return [
    residencies > 0 && `${residencies} résidence${residencies > 1 ? "s" : ""}`,
    tour > 0 && `${tour} date${tour > 1 ? "s" : ""} de tournée`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function CardKpi({
  label,
  realized,
  forecast,
  signed,
}: {
  label: string;
  realized: number;
  forecast: number;
  signed?: boolean;
}) {
  const color = (n: number) =>
    cn(
      signed && n > 0 && "text-emerald-600 dark:text-emerald-400",
      signed && n < 0 && "text-red-600 dark:text-red-400",
    );
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold tabular-nums", color(realized))}>
        <SensitiveAmount value={realized} />
      </div>
      <div className="text-[10px] text-muted-foreground tabular-nums">
        estimé <span className={color(forecast)}><SensitiveAmount value={forecast} /></span>
      </div>
    </div>
  );
}
