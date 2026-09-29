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
  Landmark,
  MapPin,
  StickyNote,
  Theater,
} from "lucide-react";
import { getProductionSummaries, type ProductionDealView } from "@/lib/productions";
import { dealStatusLabel, formatEur } from "@/components/deals/deal-helpers";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import { PrivacyToggle } from "@/components/dashboard/privacy-toggle";
import { ProductionActions } from "@/components/shows/production-actions";
import { ProductionContractCard } from "@/components/shows/production-contract-card";
import { ProductionOverheadsEditor } from "@/components/shows/production-overheads-editor";
import { SectionTitle } from "@/components/shows/section-title";
import { UpcomingList, collectUpcoming } from "@/components/shows/upcoming-list";
import { FinanceSummary } from "@/components/shows/finance-summary";
import { financeOf, productionRates } from "@/lib/production-report";
import { contractRates, productionContractSummary } from "@/lib/finance/production-overhead";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

type TabKey = "suivi" | "dates" | "resultats" | "frais" | "contrat";
const TAB_KEYS: TabKey[] = ["suivi", "dates", "resultats", "frais", "contrat"];

/**
 * Fiche spectacle (production) — portage KN (Stan 2026-09-28 : un onglet = une
 * question, dans l'ordre du cycle de vie d'une exploitation).
 *   Suivi          : qu'est-ce que je dois faire ? (alertes, 3 prochaines
 *                    dates, à solder)
 *   Dates          : le planning complet (à venir, passées)
 *   Résultats      : combien ça rapporte ? (compte d'exploitation, détail
 *                    par date)
 *   Frais généraux : les charges communes
 *   Contrat        : prod-exé % / co-prod %, notes, renommer, clôturer
 * (Onglet Artiste — compte artiste — et KPI visuels : étape 4 ; bilan PDF /
 * Excel : étape 5.)
 *
 * ⚠️ Management fees : jamais affichées ici (écrans internes uniquement).
 */
export default async function ProductionPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab } = await searchParams;
  const view: TabKey = TAB_KEYS.includes(tab as TabKey) ? (tab as TabKey) : "suivi";
  // eslint-disable-next-line react-hooks/purity -- server component, 1 exécution / requête
  const nowMs = Date.now();
  const [prod] = await getProductionSummaries({ id }, nowMs);
  if (!prod) notFound();

  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const upcoming = collectUpcoming([prod], format(startOfToday, "yyyy-MM-dd"), null);

  // Dates passées : à solder / soldées.
  const pastDeals = prod.deals.filter((d) => d.isPast || d.status === "ANNULE").reverse();
  const toSettle = pastDeals
    .map((d) => ({ d, items: openItems(d) }))
    .filter((x) => x.items.length > 0);
  const depositsToRecover = prod.deposits.filter((dep) => !dep.recovered && dep.toRecover > 0);
  const suiviCount = toSettle.length + depositsToRecover.length;

  const tourDates = prod.deals.filter((d) => !d.residencyId);
  const rates = productionRates(prod);
  const hasUpcoming = prod.deals.some((d) => !d.isPast && d.status !== "ANNULE");

  const period =
    prod.firstDate && prod.lastDate
      ? `${format(prod.firstDate, "MMM yyyy", { locale: fr })} → ${format(prod.lastDate, "MMM yyyy", { locale: fr })}`
      : null;

  const tabs: Array<{ key: TabKey; label: string; badge?: string; tone?: "amber" | "muted" }> = [
    { key: "suivi", label: "Suivi", badge: suiviCount ? String(suiviCount) : undefined, tone: "amber" },
    { key: "dates", label: "Dates", badge: String(prod.deals.length), tone: "muted" },
    { key: "resultats", label: "Résultats" },
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
              {tourDates.length > 0 &&
                `${tourDates.length} date${tourDates.length > 1 ? "s" : ""} de tournée · `}
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

      {/* ── SUIVI : ce qu'il faut faire ─────────────────────────────── */}
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

          <section className="space-y-2">
            <SectionTitle tone="blue" icon={<CalendarClock className="h-3.5 w-3.5" />}>
              Prochaines dates · {upcoming.length}
            </SectionTitle>
            <UpcomingList items={upcoming.slice(0, 3)} visible={3} showArtist={false} emptyText="Aucune date à venir." />
            {upcoming.length > 3 && (
              <Link href={href("dates")} className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline">
                Voir tout le planning ({upcoming.length} dates à venir) →
              </Link>
            )}
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
        </>
      )}

      {/* ── DATES : le planning complet ─────────────────────────────── */}
      {view === "dates" && (
        <>
          <section className="space-y-2">
            <SectionTitle tone="blue" icon={<CalendarClock className="h-3.5 w-3.5" />}>
              À venir · {upcoming.length}
            </SectionTitle>
            <UpcomingList items={upcoming} visible={20} showArtist={false} emptyText="Aucune date à venir." />
          </section>
          <section className="space-y-2">
            <SectionTitle tone="slate">Passées · {pastDeals.length}</SectionTitle>
            {pastDeals.length === 0 ? (
              <p className="rounded-md border border-dashed py-4 text-center text-sm text-muted-foreground">
                Aucune date passée.
              </p>
            ) : (
              <div className="space-y-1.5">
                {pastDeals.map((d) => (
                  <DateRow key={d.id} d={d} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* ── RÉSULTATS : combien ça rapporte ─────────────────────────── */}
      {view === "resultats" && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground ml-auto">
              Réalisé = dates jouées · Estimé = toute l&apos;exploitation (sur la base de ce qui est saisi)
            </span>
          </div>
          <FinanceSummary
            rates={rates}
            columns={
              hasUpcoming
                ? [
                    { label: "Réalisé", f: financeOf(prod.deals.filter((d) => d.isPast)) },
                    { label: "Estimé", f: financeOf(prod.deals) },
                  ]
                : [{ label: "Total", f: financeOf(prod.deals) }]
            }
          />
          <section className="space-y-2">
            <SectionTitle tone="violet">Détail par date · {prod.deals.length}</SectionTitle>
            <div className="space-y-1.5">
              {prod.deals.map((d) => (
                <DateRow key={d.id} d={d} />
              ))}
            </div>
          </section>
        </>
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
            hasResidencies={false}
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

// ─────────────────────────── À solder ───────────────────────────

type OpenItem = { label: string; tone: "amber" | "red" | "slate" };

/**
 * Ce qui reste à faire sur une date passée : recettes à encaisser, charges à
 * payer, données à saisir. Vide = date soldée.
 */
function openItems(d: ProductionDealView): OpenItem[] {
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

function SettlementRow({ d, items }: { d: ProductionDealView; items: OpenItem[] }) {
  return (
    <Link
      href={`/shows/${d.id}`}
      className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 hover:bg-accent/30 transition-colors flex-wrap sm:flex-nowrap"
    >
      <div className="w-28 shrink-0 leading-tight">
        <div className="font-semibold tabular-nums capitalize">
          {d.isMultiDate ? format(d.firstDate, "MMMM yyyy", { locale: fr }) : format(d.date, "dd/MM/yyyy")}
        </div>
        <div className="text-[11px] text-muted-foreground first-letter:uppercase">
          {d.isMultiDate ? `${d.performances} repr.` : format(d.date, "EEEE", { locale: fr })}
        </div>
      </div>
      <div className="flex-1 min-w-[160px]">
        <div className="text-sm font-medium truncate">{d.venueName ?? d.title}</div>
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

// ─────────────────────────── Lignes de date ───────────────────────────

function DateRow({ d }: { d: ProductionDealView }) {
  const status = dealStatusLabel(d.status);
  let nextOp: string | null = null;
  if (!d.contractSigned) nextOp = "Contrat";
  else if (!d.ticketingReady) nextOp = "MEV";
  else if (!d.vhrBooked) nextOp = "VHR";
  const cancelled = d.status === "ANNULE";

  return (
    <Link
      href={`/shows/${d.id}`}
      className={cn(
        "flex items-center gap-3 rounded-md border bg-card px-3 py-2 hover:bg-accent/30 transition-colors flex-wrap sm:flex-nowrap",
        (cancelled || d.isPast) && "bg-slate-50 dark:bg-slate-900/40",
        cancelled && "opacity-60",
      )}
    >
      <div className="w-24 shrink-0">
        {d.isMultiDate ? (
          <div className="font-semibold capitalize leading-tight">
            {format(d.firstDate, "MMM yyyy", { locale: fr })}
            <div className="text-[11px] font-normal text-muted-foreground">{d.performances} repr.</div>
          </div>
        ) : (
          <div className="leading-tight">
            <div className="font-semibold tabular-nums">{format(d.date, "dd/MM/yyyy")}</div>
            <div className="text-[11px] text-muted-foreground capitalize">
              {format(d.date, "EEEE", { locale: fr })}
              {d.showTime && ` · ${d.showTime}`}
            </div>
          </div>
        )}
      </div>
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
          <span>
            {status.emoji} {status.label}
          </span>
        </div>
      </div>
      {!d.isPast && !cancelled && (
        <div className="w-20 text-xs">
          {nextOp ? (
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold">
              <AlertCircle className="h-3 w-3" />
              {nextOp}
            </span>
          ) : (
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Prêt</span>
          )}
        </div>
      )}
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
