// Accueil /shows (Stan 2026-10-01) : 3 onglets — Prochaines dates (4 +
// dépliable), Spectacles (à clôturer, en cours, dates à rattacher, terminés),
// Retard / à solder (cautions + dates passées non soldées). Server component.

import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertCircle, Archive, ChevronRight, Landmark, Theater } from "lucide-react";
import { prisma } from "@/lib/db";
import {
  getProductionSummaries,
  type ProductionSummary,
} from "@/lib/productions";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import { PrivacyToggle } from "@/components/dashboard/privacy-toggle";
import { ProductionCreateButton } from "@/components/shows/production-create-button";
import { ShowsExportButton } from "@/components/shows/shows-export-button";
import { getShowsExportRows } from "@/lib/actions/shows-export";
import { AttachDealToProduction } from "@/components/shows/attach-deal-to-production";
import { SectionTitle } from "@/components/shows/section-title";
import { UpcomingList, collectUpcoming } from "@/components/shows/upcoming-list";
import { SettlementRow, toSettleOf } from "@/components/shows/date-rows";
import { CloseProductionButton } from "@/components/shows/close-production-button";
import { cn } from "@/lib/utils";
import { productionContractSummary } from "@/lib/finance/production-overhead";

/** Soirs affichés d'office dans « Prochaines dates » (le reste est replié). */
const UPCOMING_VISIBLE = 4;

/** Onglets de l'accueil (Stan 2026-10-01) — « Prochaines dates » par défaut. */
const HOME_TABS = [
  { key: "dates", label: "Prochaines dates" },
  { key: "spectacles", label: "Spectacles" },
  { key: "solder", label: "Retard / à solder" },
] as const;
type HomeTab = (typeof HOME_TABS)[number]["key"];

export async function ProductionsView({ tab }: { tab?: string }) {
  // eslint-disable-next-line react-hooks/purity -- server component, 1 exécution / requête
  const nowMs = Date.now();
  const [summaries, unlinkedRaw, artists] = await Promise.all([
    // Artistes en corbeille : leurs productions sont masquées.
    getProductionSummaries({ artist: { deletedAt: null } }, nowMs),
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
    // Artistes proposés dans « Nouvelle production ».
    prisma.artist.findMany({
      where: { deletedAt: null, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const unlinked = unlinkedRaw.map((d) => ({
    id: d.id,
    date: d.date,
    title: d.title,
    city: d.venueCity,
    artist: d.dealArtistes[0]?.artist ?? null,
  }));

  // Spectacles : en cours / à clôturer (tout joué et soldé) / terminés.
  const isToClose = (p: ProductionSummary) =>
    p.status === "ACTIVE" &&
    p.deals.some((d) => d.status !== "ANNULE") &&
    !p.deals.some((d) => !d.isPast && d.status !== "ANNULE") &&
    toSettleOf(p).length === 0 &&
    !p.deposits.some((dep) => !dep.recovered && dep.toRecover > 0);
  const toClose = summaries.filter(isToClose);
  const active = summaries
    .filter((p) => p.status === "ACTIVE" && !isToClose(p))
    .sort((a, b) => {
      // Productions avec une prochaine date d'abord (la plus proche en tête).
      const na = a.nextDeal?.date.getTime() ?? Infinity;
      const nb = b.nextDeal?.date.getTime() ?? Infinity;
      return na - nb || a.name.localeCompare(b.name);
    });
  const closed = summaries.filter((p) => p.status === "CLOSED");
  // Dates passées non soldées, toutes productions, la plus ancienne d'abord.
  const toSettle = summaries
    .flatMap((p) => toSettleOf(p).map((x) => ({ ...x, p })))
    .sort((a, b) => a.d.date.getTime() - b.d.date.getTime());
  // Cautions des engagements terminés, pas encore récupérées.
  const depositsDue = summaries.flatMap((p) =>
    p.deposits.filter((dep) => !dep.recovered && dep.toRecover > 0).map((dep) => ({ dep, p })),
  );

  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const upcoming = collectUpcoming(summaries, format(startOfToday, "yyyy-MM-dd"), null);

  const view: HomeTab = HOME_TABS.some((t) => t.key === tab) ? (tab as HomeTab) : "dates";
  const badges: Record<HomeTab, { text: string; tone: "amber" | "muted" } | null> = {
    dates: upcoming.length ? { text: String(upcoming.length), tone: "muted" } : null,
    spectacles:
      toClose.length + unlinked.length > 0
        ? { text: String(toClose.length + unlinked.length), tone: "amber" }
        : active.length
          ? { text: String(active.length), tone: "muted" }
          : null,
    solder:
      toSettle.length + depositsDue.length > 0
        ? { text: String(toSettle.length + depositsDue.length), tone: "amber" }
        : null,
  };

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
            Un spectacle = une production, avec toutes ses dates.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ProductionCreateButton artists={artists} />
          <ShowsExportButton load={getShowsExportRows} />
          <PrivacyToggle />
        </div>
      </div>

      {/* Onglets (Stan 2026-10-01) */}
      <div className="flex items-center gap-1 border-b overflow-x-auto">
        {HOME_TABS.map((t) => {
          const b = badges[t.key];
          return (
            <Link
              key={t.key}
              href={t.key === "dates" ? "/shows" : `/shows?tab=${t.key}`}
              className={cn(
                "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                view === t.key
                  ? "border-yr-gold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {b && (
                <span
                  className={cn(
                    "ml-1.5 rounded-full px-1.5 text-[11px] font-semibold",
                    b.tone === "amber"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {b.text}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* ── PROCHAINES DATES ── */}
      {view === "dates" && (
        <UpcomingList
          items={upcoming}
          visible={UPCOMING_VISIBLE}
          emptyText="Aucune date à venir."
        />
      )}

      {/* ── SPECTACLES ── */}
      {view === "spectacles" && (
        <>
          {toClose.length > 0 && (
            <section className="space-y-2">
              <SectionTitle tone="amber" icon={<Archive className="h-3.5 w-3.5" />}>
                À clôturer · {toClose.length}
              </SectionTitle>
              <p className="text-[11px] text-muted-foreground">
                Toutes les dates sont jouées et soldées : il ne reste qu&apos;à clôturer.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {toClose.map((p) => (
                  <div key={p.id} className="space-y-1.5">
                    <ProductionCard p={p} />
                    <div className="flex justify-end">
                      <CloseProductionButton productionId={p.id} name={p.name} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <SectionTitle tone="gold">En cours · {active.length}</SectionTitle>
            {active.length === 0 ? (
              <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                Aucune production en cours. « Nouvelle production » pour créer un spectacle,
                puis ajoute-lui ses dates, tournées et résidences.
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

          {closed.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none">
                <SectionTitle
                  tone="slate"
                  as="h3"
                  icon={<ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />}
                >
                  Terminés · {closed.length}
                </SectionTitle>
              </summary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                {closed.map((p) => (
                  <ProductionCard key={p.id} p={p} />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {/* ── RETARD / À SOLDER ── */}
      {view === "solder" && (
        <>
          {depositsDue.length > 0 && (
            <section className="space-y-2">
              <SectionTitle tone="amber" icon={<Landmark className="h-3.5 w-3.5" />}>
                Cautions à récupérer · {depositsDue.length}
              </SectionTitle>
              <div className="rounded-md border divide-y bg-card">
                {depositsDue.map(({ dep, p }) => (
                  <Link
                    key={dep.id}
                    href={dep.href}
                    className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent/30 flex-wrap"
                  >
                    <span className="font-semibold tabular-nums w-24">
                      <SensitiveAmount value={dep.toRecover} />
                    </span>
                    <span className="flex-1 min-w-[160px]">
                      <span className="font-medium" style={{ color: p.artist.color }}>
                        {p.artist.name}
                      </span>{" "}
                      · {p.name} · {dep.label}
                    </span>
                    <span
                      className={cn(
                        "text-xs",
                        dep.finished ? "font-semibold text-red-700 dark:text-red-400" : "text-muted-foreground",
                      )}
                    >
                      {dep.finished ? "à récupérer maintenant" : "en fin de production"}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                  </Link>
                ))}
              </div>
            </section>
          )}
          <section className="space-y-2">
            <SectionTitle tone="amber" icon={<AlertCircle className="h-3.5 w-3.5" />}>
              Dates en retard / à solder · {toSettle.length}
            </SectionTitle>
            {toSettle.length === 0 ? (
              <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                Toutes les dates passées sont soldées.
              </p>
            ) : (
              <div className="space-y-1.5">
                {toSettle.map(({ d, items, p }) => (
                  <SettlementRow key={d.id} d={d} items={items} production={p} />
                ))}
              </div>
            )}
          </section>
        </>
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
        <CardKpi label="Résultat" realized={p.realized.margin} signed />
        <CardKpi label="Part Pangee" realized={p.realized.kn} />
        <CardKpi label="Part artiste" realized={p.realized.artist} signed />
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
  signed,
}: {
  label: string;
  realized: number;
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
    </div>
  );
}
