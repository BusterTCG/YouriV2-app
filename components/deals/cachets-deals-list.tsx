"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Briefcase,
  CheckCircle2,
  HandCoins,
  Hourglass,
  Percent,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CachetsDealRow,
  CachetsDealsListData,
} from "@/lib/cachets-list";
import { formatPct, dealStatusLabel } from "./deal-helpers";
import { DealStatusInline } from "./deal-status-inline";
import { updateDealArtiste } from "@/lib/actions/deals";
import { useEur } from "@/lib/privacy-context";

/**
 * Tableau récap /deals/cachets — Sprint 5, Stan 2026-05-28.
 *
 * Modèle Cachets : Pangee facture un tiers pour le compte d'un artiste,
 * conserve `cachetsFeesPct`% (= Marge Brute, default 10) et reverse le reste
 * à l'artiste. 1 artiste = 1 deal (pas de multi-artiste).
 *
 * Colonnes (12 — alignées Booking, sans la colonne Paiements qui est
 * redondante avec St. Artiste quand il n'y a ni charges ni multi-artistes) :
 *   1. Date (avec badge multi-date)
 *   2. Projet : nom artiste
 *   3. Statut deal (LEAD/EN_COURS/CONFIRME/ANNULE)
 *   4. CA HT (= budget facturé tiers)
 *   5. Cachet (= cachetAmount artiste)
 *   6. St. Artiste : pill cliquable (toggle DealArtiste.paymentStatus)
 *   7. Marge Brute (= budget × cachetsFeesPct%)
 *   8. St. Marge (= budgetPaymentStatus PAID)
 *   9. Encaiss. (= budgetPaidAt MM/yy)
 *  10. Mgmt fees
 *  11. Marge Nette
 *  12. % Marge Nette
 *
 * KPI top 5-stat alignés Booking/Prod Exé :
 *   CA HT · Cachets · MF · Marge Nette · Taux Marge Nette
 */

function RecapStatusPill({
  isPaid,
  paidLabel = "Encaissé",
}: {
  isPaid: boolean;
  paidLabel?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs whitespace-nowrap",
        isPaid
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
          : "bg-muted/40 text-muted-foreground border-border",
      )}
    >
      <span>{isPaid ? "✅" : "⏳"}</span>
      <span>{isPaid ? paidLabel : "En cours"}</span>
    </span>
  );
}

/**
 * Pill cliquable "St. Artiste" — bascule le `paymentStatus` du 1er
 * DealArtiste actif (1 artiste = 1 deal Cachets).
 */
function ArtisteStatusPill({ deal }: { deal: CachetsDealRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const primary = deal.dealArtistes[0];
  const paid = primary?.paymentStatus === "PAID";

  if (!primary) {
    return (
      <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs whitespace-nowrap bg-muted/30 text-muted-foreground/60 border-border">
        —
      </span>
    );
  }

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!primary) return;
    startTransition(async () => {
      await updateDealArtiste({ id: primary.id, isPaye: !paid });
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={
        paid
          ? "Cliquer pour repasser En cours"
          : "Marquer le cachet artiste comme Payé"
      }
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs whitespace-nowrap transition-colors",
        paid
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
          : "bg-muted/40 text-muted-foreground border-border hover:bg-muted",
        pending && "opacity-60 cursor-wait",
      )}
    >
      <span>{paid ? "✅" : "⏳"}</span>
      <span>{paid ? "Payé" : "En cours"}</span>
    </button>
  );
}

interface Props {
  deals: CachetsDealRow[];
  totals: CachetsDealsListData["totals"];
  periodLabel: string;
}

const COL_WIDTHS = [
  "w-[68px]",  // 1 Date
  "w-[220px]", // 2 Projet (artiste)
  "w-[120px]", // 3 Statut deal (Stan 2026-06-01 fix : DealStatusInline a min-w-[110px], 100px provoquait débordement)
  "w-[90px]",  // 4 CA HT (budget)
  "w-[90px]",  // 5 Cachet artiste
  "w-[100px]", // 6 St. Artiste
  "w-[100px]", // 7 Marge Brute
  "w-[110px]", // 8 St. Marge
  "w-[80px]",  // 9 Encaiss.
  "w-[90px]",  // 10 Mgmt fees
  "w-[90px]",  // 11 Marge Nette
  "w-[50px]",  // 12 %
];

function ColGroup() {
  return (
    <colgroup>
      {COL_WIDTHS.map((w, i) => (
        <col key={i} className={w} />
      ))}
    </colgroup>
  );
}

export function CachetsDealsList({ deals, totals, periodLabel }: Props) {
  const router = useRouter();
  const eur = useEur();

  return (
    <div className="space-y-4">
      {/* Bande KPI top — Stan 2026-05-28 : architecture alignée Booking/Prod Exé.
            CA HT · Cachets · Management Fees · Marge Nette · Taux Marge Nette */}
      <CachetsTotalsCard totals={totals} periodLabel={periodLabel} />

      {deals.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          Aucun deal Cachets pour ces filtres.
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] text-sm table-fixed xl:min-w-0 xl:w-full">
              <ColGroup />
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
                <tr>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Date</th>
                  <th className="text-left px-2 py-2 font-medium">Projet</th>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Statut</th>
                  <th className="text-right px-2 py-2 font-medium whitespace-nowrap">CA HT</th>
                  <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Cachet</th>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap">St. Artiste</th>
                  <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Marge Brute</th>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap">St. Marge</th>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Encaiss.</th>
                  <th className="text-right px-2 py-2 font-medium whitespace-nowrap" title="Management fees">Mgmt fees</th>
                  <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Marge Nette</th>
                  <th className="text-center px-2 py-2 font-medium whitespace-nowrap">%</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => {
                  const dStatus = dealStatusLabel(deal.status as never);
                  const projectTitle =
                    deal.primaryArtistName ?? deal.title;
                  // Stan 2026-05-28 v2 : St. Marge = "toutes prestations
                  // encaissées" (≠ budgetPaymentStatus qui n'est plus utilisé
                  // depuis le passage multi-prestations).
                  const budgetPaid = deal.allPrestationsPaid;
                  return (
                    <tr
                      key={deal.id}
                      onClick={() => router.push(`/deals/cachets/${deal.id}`)}
                      className={cn(
                        "border-t hover:bg-accent/30 transition-colors cursor-pointer",
                        deal.status === "ANNULE" && "opacity-50",
                      )}
                      title="Cliquer pour ouvrir la fiche cachet"
                    >
                      {/* 1. Date */}
                      <td className="px-2 py-2 whitespace-nowrap text-xs">
                        <div>{format(deal.date, "dd/MM/yy", { locale: fr })}</div>
                        {deal.isMultiDate && deal.performanceCount && deal.performanceCount > 1 && (
                          <div className="text-[10px] text-muted-foreground">
                            +{deal.performanceCount - 1} repré.
                          </div>
                        )}
                      </td>

                      {/* 2. Projet (artiste) */}
                      <td className="px-2 py-2 min-w-0">
                        <div className="font-medium leading-tight truncate">
                          {projectTitle}
                        </div>
                        {deal.title !== projectTitle && (
                          <div className="text-xs text-muted-foreground truncate">
                            {deal.title}
                          </div>
                        )}
                      </td>

                      {/* 3. Statut deal — éditable inline desktop (Stan 2026-05-31 v3) */}
                      <td className="px-2 py-2 whitespace-nowrap text-xs">
                        <div className="hidden sm:block" onClick={(e) => e.stopPropagation()}>
                          <DealStatusInline dealId={deal.id} value={deal.status as never} />
                        </div>
                        <span className="sm:hidden">
                          {dStatus.emoji} {dStatus.label}
                        </span>
                      </td>

                      {/* 4. CA HT (budget) */}
                      <td className="px-2 py-2 text-right tabular-nums">
                        {deal.budgetAmount != null && deal.budgetAmount > 0
                          ? eur(deal.budgetAmount)
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>

                      {/* 5. Cachet artiste */}
                      <td className="px-2 py-2 text-right tabular-nums">
                        {deal.totalArtistes > 0
                          ? eur(deal.totalArtistes)
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>

                      {/* 6. St. Artiste — pill cliquable */}
                      <td className="px-2 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <ArtisteStatusPill deal={deal} />
                      </td>

                      {/* 7. Marge Brute */}
                      <td className="px-2 py-2 text-right tabular-nums font-medium">
                        {deal.margeBrute > 0
                          ? eur(deal.margeBrute)
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>

                      {/* 8. St. Marge — dash si linkedToOwnProd (pas de tiers facturé) */}
                      <td className="px-2 py-2 whitespace-nowrap">
                        {deal.linkedToOwnProd ? (
                          <span className="text-muted-foreground/40">—</span>
                        ) : (
                          <RecapStatusPill isPaid={budgetPaid} paidLabel="Encaissé" />
                        )}
                      </td>

                      {/* 9. Encaiss. (date max paidAt prestations) */}
                      <td className="px-2 py-2 whitespace-nowrap text-xs tabular-nums">
                        {deal.prestationsPaidAt
                          ? format(deal.prestationsPaidAt, "MM/yy", { locale: fr })
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>

                      {/* 10. Mgmt fees */}
                      <td className="px-2 py-2 text-right tabular-nums">
                        {deal.totalMf > 0 ? eur(deal.totalMf) : <span className="text-muted-foreground/40">—</span>}
                      </td>

                      {/* 11. Marge Nette */}
                      <td className="px-2 py-2 text-right tabular-nums font-semibold">
                        <span
                          className={cn(
                            deal.margeNette >= 0
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-red-700 dark:text-red-400",
                          )}
                        >
                          {eur(deal.margeNette)}
                        </span>
                      </td>

                      {/* 12. % Marge Nette */}
                      <td className="px-2 py-2 text-center text-xs text-muted-foreground tabular-nums">
                        {deal.margeNettePct != null
                          ? formatPct(deal.margeNettePct, { integer: true })
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/60 border-t-2 font-semibold sticky bottom-0">
                <tr>
                  {/* col 1-3 : Date | Projet | Statut */}
                  <td
                    colSpan={3}
                    className="px-2 py-2.5 text-right text-[11px] uppercase tracking-wider text-muted-foreground"
                  >
                    Total · {totals.count} deal{totals.count > 1 ? "s" : ""}
                  </td>
                  {/* col 4 CA HT */}
                  <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                    {eur(totals.totalBudget)}
                  </td>
                  {/* col 5 Cachet */}
                  <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                    {eur(totals.totalArtistes)}
                  </td>
                  {/* col 6 St. Artiste */}
                  <td />
                  {/* col 7 Marge Brute */}
                  <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                    {eur(totals.totalMargeBrute)}
                  </td>
                  {/* col 8 St. Marge — split MARGE BRUTE encaissée / à venir
                      (Stan 2026-06-01 fix : col à droite de Marge Brute, donc on
                      affiche le split de la BRUTE, pas de la NETTE qui est dans
                      la card KPI top). */}
                  <td className="px-2 py-2.5 text-[11px] text-muted-foreground whitespace-nowrap">
                    {totals.margeBruteRealisee !== 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {eur(totals.margeBruteRealisee)} encaissée
                      </span>
                    )}
                    {totals.margeBruteRealisee !== 0 && totals.margeBruteAttente !== 0 && (
                      <span className="mx-1 text-muted-foreground/50">·</span>
                    )}
                    {totals.margeBruteAttente !== 0 && (
                      <span className="text-amber-600 dark:text-amber-400 tabular-nums">
                        {eur(totals.margeBruteAttente)} à venir
                      </span>
                    )}
                  </td>
                  {/* col 9 Encaiss. */}
                  <td />
                  {/* col 10 Mgmt fees */}
                  <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                    {totals.totalMf > 0 ? eur(totals.totalMf) : "—"}
                  </td>
                  {/* col 11 Marge Nette */}
                  <td
                    className={cn(
                      "px-2 py-2.5 text-right tabular-nums whitespace-nowrap",
                      totals.totalMargeNette >= 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-red-700 dark:text-red-400",
                    )}
                  >
                    {eur(totals.totalMargeNette)}
                  </td>
                  {/* col 12 % */}
                  <td className="px-2 py-2.5 text-center text-[11px] text-muted-foreground tabular-nums">
                    {totals.margeNettePctGlobal != null
                      ? formatPct(totals.margeNettePctGlobal, { integer: true })
                      : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── KPI top (arch alignée Booking + Prod Exé) ────────

/**
 * Bande KPI Cachets — 5 Stat alignés sur DealsTotals + ProdExeTotalsCard.
 *   - CA HT (totalBudget)
 *   - Cachets (totalArtistes) — sub "X € à reverser" si budget encaissé mais
 *     artiste pas encore payé
 *   - Management Fees (totalMf)
 *   - Marge Nette (totalMargeNette) — sub split encaissée/à venir
 *   - Taux Marge Nette (margeNettePctGlobal) — sub "Marge nette ÷ CA HT"
 */
function CachetsTotalsCard({
  totals,
  periodLabel,
}: {
  totals: CachetsDealsListData["totals"];
  periodLabel: string;
}) {
  const eur = useEur();
  return (
    <div className="rounded-md border-2 border-yr-gold/30 bg-card p-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Total · {periodLabel}
        </div>
        <div className="text-xs text-muted-foreground">
          {totals.count} deal{totals.count > 1 ? "s" : ""}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Stat
          icon={<Briefcase className="h-3.5 w-3.5 text-muted-foreground" />}
          label="CA HT"
          value={eur(totals.totalBudget)}
        />
        <Stat
          icon={<Sparkles className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Cachets"
          value={eur(totals.totalArtistes)}
          sub={
            totals.artistOwed > 0 ? (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Hourglass className="h-3 w-3" />
                {eur(totals.artistOwed)} à reverser
              </span>
            ) : null
          }
        />
        <Stat
          icon={<HandCoins className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Management Fees"
          value={eur(totals.totalMf)}
        />
        <Stat
          icon={<span className="text-emerald-600 text-xs">★</span>}
          label="Marge Nette"
          value={eur(totals.totalMargeNette)}
          sub={
            totals.totalMargeNette !== 0 ? (
              <span className="flex items-center gap-2 flex-wrap">
                {totals.margeRealisee !== 0 && (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    {eur(totals.margeRealisee)} encaissée
                  </span>
                )}
                {totals.margeAttente !== 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Hourglass className="h-3 w-3" />
                    {eur(totals.margeAttente)} à venir
                  </span>
                )}
              </span>
            ) : null
          }
        />
        <Stat
          icon={<Percent className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Taux Marge Nette"
          value={formatPct(totals.margeNettePctGlobal, { integer: true })}
          sub="Marge nette ÷ CA HT"
        />
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
  sub,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
  sub?: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5 min-w-0">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "text-xl font-semibold tabular-nums truncate",
          accent && "text-emerald-700 dark:text-emerald-400",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
