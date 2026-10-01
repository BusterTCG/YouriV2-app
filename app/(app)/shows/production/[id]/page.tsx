import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertCircle,
  CalendarClock,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  HandCoins,
  Landmark,
  StickyNote,
  Theater,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getProductionSummaries } from "@/lib/productions";
import { formatEur } from "@/components/deals/deal-helpers";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import { PrivacyToggle } from "@/components/dashboard/privacy-toggle";
import { ProductionActions } from "@/components/shows/production-actions";
import { ProductionContractCard } from "@/components/shows/production-contract-card";
import { ProductionOverheadsEditor } from "@/components/shows/production-overheads-editor";
import { ResidencyWizard } from "@/components/shows/residency-wizard";
import { TourWizard } from "@/components/shows/tour-wizard";
import { SectionTitle } from "@/components/shows/section-title";
import { UpcomingList, collectUpcoming } from "@/components/shows/upcoming-list";
import { FinanceSummary } from "@/components/shows/finance-summary";
import { audienceOf, computeKpis, financeOf, productionRates } from "@/lib/production-report";
import { FillRing, KpiTiles } from "@/components/shows/kpi-visuals";
import { DateRow, SettlementRow, pastDealsOf, toSettleOf } from "@/components/shows/date-rows";
import { getArtistAccount } from "@/lib/finance/artist-account-server";
import { ArtistAccountCard } from "@/components/shows/artist-account-card";
import { contractRates, productionContractSummary } from "@/lib/finance/production-overhead";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

type TabKey = "suivi" | "resultats" | "artiste" | "frais" | "contrat";
const TAB_KEYS: TabKey[] = ["suivi", "resultats", "artiste", "frais", "contrat"];
/** Prochaines dates affichées d'office (le reste est replié). */
const UPCOMING_VISIBLE = 4;

/**
 * Fiche spectacle (production) — portage KN (Stan 2026-09-28 : un onglet = une
 * question, dans l'ordre du cycle de vie d'une exploitation).
 *   Suivi          : alertes, résidences, prochaines dates (4 + dépliable),
 *                    à solder, passées soldées — chaque date avec ses KPI
 *                    (Stan 2026-10-01 : Suivi et Dates fusionnés ; ?tab=dates → Suivi)
 *   Résultats      : combien ça rapporte ? (KPI visuels, compte
 *                    d'exploitation, détail par date)
 *   Artiste        : le compte artiste (settlement)
 *   Frais généraux : les charges communes
 *   Contrat        : prod-exé % / co-prod %, notes, renommer, clôturer
 *
 * ⚠️ Management fees : jamais affichées ici (écrans internes uniquement).
 */
export default async function ProductionPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab } = await searchParams;
  const view: TabKey = TAB_KEYS.includes(tab as TabKey) ? (tab as TabKey) : "suivi";
  // eslint-disable-next-line react-hooks/purity -- server component, 1 exécution / requête
  const nowMs = Date.now();
  const [[prod], residencies] = await Promise.all([
    getProductionSummaries({ id }, nowMs),
    prisma.residency.findMany({
      // Résidences supprimées (tous leurs mois en corbeille) masquées.
      where: { productionId: id, deals: { some: { deletedAt: null } } },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!prod) notFound();
  const account = await getArtistAccount(prod.id, nowMs);

  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const upcoming = collectUpcoming([prod], format(startOfToday, "yyyy-MM-dd"), null);

  // Dates passées : à solder / soldées.
  const toSettle = toSettleOf(prod);
  const settled = pastDealsOf(prod).filter((d) => !toSettle.some((x) => x.d.id === d.id));
  const depositsToRecover = prod.deposits.filter((dep) => !dep.recovered && dep.toRecover > 0);
  const suiviCount = toSettle.length + depositsToRecover.length;

  const tourDates = prod.deals.filter((d) => !d.residencyId);
  const residencyCards = residencies.map((r) => {
    const months = prod.deals.filter((d) => d.residencyId === r.id && d.status !== "ANNULE");
    return {
      ...r,
      months: months.length,
      planned: months.reduce((s, d) => s + d.performances, 0),
      played: months.reduce((s, d) => s + d.performancesPlayed, 0),
      paying: months.reduce((s, d) => s + (d.paying ?? 0), 0),
      fillRate: audienceOf(months).fillRate,
      first: months[0]?.firstDate ?? null,
      last: months.length ? months[months.length - 1].lastDate : null,
    };
  });
  const rates = productionRates(prod);
  const balanceOpen = Math.round(account.balance) !== 0;
  const playedDeals = prod.deals.filter((d) => d.isPast);

  const period =
    prod.firstDate && prod.lastDate
      ? `${format(prod.firstDate, "MMM yyyy", { locale: fr })} → ${format(prod.lastDate, "MMM yyyy", { locale: fr })}`
      : null;

  const tabs: Array<{ key: TabKey; label: string; badge?: string; tone?: "amber" | "muted" }> = [
    { key: "suivi", label: "Suivi", badge: suiviCount ? String(suiviCount) : undefined, tone: "amber" },
    { key: "resultats", label: "Résultats" },
    { key: "artiste", label: "Artiste", badge: balanceOpen ? "•" : undefined, tone: "amber" },
    {
      key: "frais",
      label: "Frais généraux",
      badge: prod.overheads.length ? String(prod.overheads.length) : undefined,
      tone: "muted",
    },
    {
      key: "contrat",
      label: "Contrat",
      badge: !rates ? "!" : undefined,
      tone: "amber",
    },
  ];
  const href = (k: TabKey) =>
    k === "suivi" ? `/shows/production/${prod.id}` : `/shows/production/${prod.id}?tab=${k}`;

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/shows" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="h-3 w-3" />
          Productions
        </Link>
      </div>

      {/* En-tête : identité + actions du quotidien */}
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <Theater className="h-3.5 w-3.5" />
            Production · <span style={{ color: prod.artist.color }}>{prod.artist.name}</span>
            {prod.status === "CLOSED" && (
              <span className="rounded bg-muted px-1.5 py-0.5 normal-case tracking-normal">
                Clôturée{prod.closedAt && ` le ${format(prod.closedAt, "dd/MM/yyyy")}`}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{prod.name}</h1>
          <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
            {period && (
              <span className="inline-flex items-center gap-1 capitalize">
                <CalendarRange className="h-3.5 w-3.5" />
                {period}
              </span>
            )}
            <span>
              {[
                residencies.length > 0 && `${residencies.length} résidence${residencies.length > 1 ? "s" : ""}`,
                tourDates.length > 0 && `${tourDates.length} date${tourDates.length > 1 ? "s" : ""} de tournée`,
              ]
                .filter(Boolean)
                .join(" · ")}
              {" · "}
              {prod.performancesPlayed}/{prod.performancesPlanned} repr. jouées
            </span>
            <span>{rates ? productionContractSummary(prod) : "Contrat non défini"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ProductionActions
            mode="add"
            productionId={prod.id}
            name={prod.name}
            status={prod.status}
            artistId={prod.artist.id}
            artistName={prod.artist.name}
            extra={
              <>
                <TourWizard productionId={prod.id} />
                <ResidencyWizard productionId={prod.id} label="Ajouter une résidence" />
              </>
            }
          />
          <PrivacyToggle />
        </div>
      </div>

      {/* Onglets */}
      <div className="flex items-center gap-1 border-b overflow-x-auto">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={href(t.key)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              view === t.key
                ? "border-yr-gold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.badge && (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 text-[11px] font-semibold",
                  t.tone === "amber"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {t.badge}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* ── SUIVI : alertes + toutes les dates (Stan 2026-10-01 : Suivi et
          Dates fusionnés — dates avec KPI, lien vers les résidences). ── */}
      {view === "suivi" && (
        <>
          {depositsToRecover.length > 0 && (
            <div className="rounded-md border-2 border-amber-500/60 bg-amber-500/10 px-4 py-2.5 space-y-1">
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-200 inline-flex items-center gap-1.5">
                <Landmark className="h-4 w-4" />
                {depositsToRecover.length > 1
                  ? `${depositsToRecover.length} acomptes à récupérer auprès des salles`
                  : "Acompte à récupérer auprès de la salle"}{" "}
                · <SensitiveAmount value={depositsToRecover.reduce((s, dep) => s + dep.toRecover, 0)} />
              </div>
              {depositsToRecover.map((dep) => (
                <Link
                  key={dep.id}
                  href={dep.href}
                  className="flex items-center gap-2 text-xs text-amber-900/90 dark:text-amber-200/90 hover:underline"
                >
                  <span className="font-semibold tabular-nums">{formatEur(dep.toRecover)}</span>
                  <span>· {dep.label}</span>
                  {dep.paidAt && <span>· versé le {format(dep.paidAt, "dd/MM/yyyy")}</span>}
                  <span className={dep.finished ? "font-semibold text-red-700 dark:text-red-400" : ""}>
                    · {dep.finished ? "production terminée — à récupérer maintenant" : "à récupérer en fin de production"}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {!rates && (
            <Link
              href={href("contrat")}
              className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-2 text-sm text-amber-800 dark:text-amber-300 hover:bg-amber-500/10"
            >
              <AlertCircle className="h-4 w-4" />
              Contrat artiste non défini — à renseigner
              <ChevronRight className="h-4 w-4 ml-auto" />
            </Link>
          )}

          {balanceOpen && (
            <Link
              href={href("artiste")}
              className="flex items-center gap-2 rounded-md border bg-card px-4 py-2 text-sm hover:bg-accent/30"
            >
              <HandCoins className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              {account.balance > 0 ? "Quote-part disponible à verser à l'artiste" : "L'artiste doit à Pangee"}
              <span className="font-semibold ml-auto">
                <SensitiveAmount value={Math.abs(account.balance)} />
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          )}

          {residencyCards.length > 0 && (
            <section className="space-y-2">
              <SectionTitle tone="gold">Résidences · {residencyCards.length}</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {residencyCards.map((r) => (
                  <Link
                    key={r.id}
                    href={`/shows/residence/${r.id}`}
                    className="rounded-md border bg-card px-4 py-3 hover:bg-accent/30 transition-colors flex items-center gap-3"
                  >
                    <FillRing percent={r.fillRate} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.first && r.last
                          ? `${format(r.first, "d MMM", { locale: fr })} → ${format(r.last, "d MMM yyyy", { locale: fr })} · `
                          : ""}
                        {r.months} mois · {r.played}/{r.planned} séances jouées
                        {r.paying ? ` · ${r.paying} payants` : ""}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <SectionTitle tone="blue" icon={<CalendarClock className="h-3.5 w-3.5" />}>
              Prochaines dates · {upcoming.length}
            </SectionTitle>
            <UpcomingList items={upcoming} visible={UPCOMING_VISIBLE} showArtist={false} emptyText="Aucune date à venir." />
          </section>

          <section className="space-y-2">
            <SectionTitle tone="amber" icon={<AlertCircle className="h-3.5 w-3.5" />}>
              À solder · {toSettle.length}
            </SectionTitle>
            {toSettle.length === 0 ? (
              <p className="rounded-md border border-dashed py-4 text-center text-sm text-muted-foreground">
                Toutes les dates passées sont soldées.
              </p>
            ) : (
              <div className="space-y-1.5">
                {toSettle.map(({ d, items }) => (
                  <SettlementRow key={d.id} d={d} items={items} />
                ))}
              </div>
            )}
          </section>

          {settled.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none">
                <SectionTitle
                  tone="slate"
                  as="h3"
                  icon={<ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />}
                >
                  Passées soldées · {settled.length}
                </SectionTitle>
              </summary>
              <div className="space-y-1.5 mt-2">
                {settled.map((d) => (
                  <DateRow key={d.id} d={d} />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {/* ── RÉSULTATS : combien ça rapporte ─────────────────────────── */}
      {view === "resultats" && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={`/api/production-report/${prod.id}?format=pdf`}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent/40 transition-colors"
            >
              <FileText className="h-4 w-4" />
              Bilan PDF
            </a>
            <a
              href={`/api/production-report/${prod.id}?format=xlsx`}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent/40 transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Bilan Excel
            </a>
            <span className="text-[11px] text-muted-foreground ml-auto">
              État à date : dates déjà jouées uniquement
            </span>
          </div>
          <KpiTiles kpis={computeKpis(prod.deals, "realized")} />
          <FinanceSummary
            rates={rates}
            columns={[
              {
                label: playedDeals.length < prod.deals.length ? "Réalisé à date" : "Total",
                f: financeOf(playedDeals),
              },
            ]}
          />
          <section className="space-y-2">
            <SectionTitle tone="violet">Détail par date jouée · {playedDeals.length}</SectionTitle>
            <div className="space-y-1.5">
              {playedDeals.map((d) => (
                <DateRow key={d.id} d={d} />
              ))}
            </div>
          </section>
        </>
      )}

      {/* ── ARTISTE : compte artiste ────────────────────────────────── */}
      {view === "artiste" && (
        <ArtistAccountCard
          productionId={prod.id}
          artistName={prod.artist.name}
          settleable={prod.deals
            .filter((d) => d.stage === "A_SOLDER")
            .map((d) => ({
              id: d.id,
              label: `${
                d.residencyId ? format(d.firstDate, "MMMM yyyy", { locale: fr }) : format(d.date, "dd/MM/yyyy")
              } · ${d.venueName ?? d.title}`,
              artistAmount: d.pnl.artistAmount ?? 0,
              collected: Math.round(d.pnl.revenue) !== 0 && Math.round(d.openRevenue) === 0,
            }))}
          account={{
            acquired: account.acquired,
            callable: account.callable,
            pendingCollection: account.pendingCollection,
            forecast: account.forecast,
            paid: account.paid,
            refunded: account.refunded,
            balance: account.balance,
            movements: account.movements.map((m) => ({
              id: m.id,
              kind: m.kind,
              amount: m.amount,
              date: m.date.toISOString().slice(0, 10),
              note: m.note,
            })),
          }}
        />
      )}

      {/* ── FRAIS GÉNÉRAUX ──────────────────────────────────────────── */}
      {view === "frais" && (
        <ProductionOverheadsEditor
          productionId={prod.id}
          rows={prod.overheads}
          total={prod.overheadTotal}
          perPerformance={prod.perPerformance}
          performancesPlanned={prod.performancesPlanned}
          unallocated={prod.unallocatedOverhead}
        />
      )}

      {/* ── CONTRAT : paramètres du deal ────────────────────────────── */}
      {view === "contrat" && (
        <>
          <ProductionContractCard
            // key = taux enregistrés : l'état local se réinitialise après refresh.
            key={[prod.prodExePct, prod.coprodKnPct, prod.residencyContractSeparate, prod.residencyProdExePct, prod.residencyCoprodKnPct].join("|")}
            productionId={prod.id}
            prodExePct={prod.prodExePct}
            coprodKnPct={prod.coprodKnPct}
            defined={contractRates(prod) != null}
            residencySeparate={prod.residencyContractSeparate}
            residencyProdExePct={prod.residencyProdExePct}
            residencyCoprodKnPct={prod.residencyCoprodKnPct}
            hasResidencies={residencies.length > 0}
          />
          <div className="rounded-md border bg-card p-4 space-y-3">
            <SectionTitle tone="slate" as="h3">
              Production
            </SectionTitle>
            <ProductionActions
              mode="settings"
              productionId={prod.id}
              name={prod.name}
              status={prod.status}
              artistId={prod.artist.id}
              artistName={prod.artist.name}
            />
            {prod.notes && prod.notes.trim().length > 0 && (
              <div className="pt-2 border-t">
                <div className="flex items-center gap-2 mb-1 text-sm font-semibold">
                  <StickyNote className="h-4 w-4 text-muted-foreground" />
                  Notes
                </div>
                <p className="text-sm whitespace-pre-wrap">{prod.notes}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
