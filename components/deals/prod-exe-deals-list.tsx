"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Briefcase,
  Check,
  CheckCircle2,
  Clock,
  HandCoins,
  Hourglass,
  MapPin,
  Percent,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ProdExeDealRow,
  ProdExeDealsListData,
} from "@/lib/prod-executive-list";
import { formatPct, dealStatusLabel } from "./deal-helpers";
import { DealStatusInline } from "./deal-status-inline";
import { MobileDealCard } from "./mobile-deal-card";
import { VENUE_DEAL_KIND_FR } from "@/lib/production-line-labels";
import { setDealArtistStatus } from "@/lib/actions/deals";
import { useEur } from "@/lib/privacy-context";

/**
 * Tableau récap /deals/prod-executive — refondu Stan 2026-05-27.
 *
 * Colonnes :
 *   1. Date
 *   2. Projet : "Artiste - Spectacle" + lieu en dessous
 *   3. Statut deal
 *   4. Modèle salle (PROD / CO_REAL / CESSION)
 *   5. CA HT
 *   6. Artiste (part artiste = CA − Charges − Commission)
 *   7. St. Artiste : pill cliquable (toggle PAID sur tous les DealArtiste)
 *   8. Marge Brute (commission 15%)
 *   9. St. Marge (toutes recettes PAID)
 *  10. Encaissement (date max paidAt recettes)
 *  11. Statut Paiements (X à régler)
 *  12. Mgmt Fees
 *  13. Marge Nette
 *  14. % marge nette / (part artiste + marge nette)
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

/** Pill cliquable "St. Artiste" — bascule le statut consolidé `Deal.artistStatus`
 *  (driver UI séparé des cachets individuels, Stan 2026-05-27 v2). */
function ArtisteStatusPill({ deal }: { deal: ProdExeDealRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const paid = deal.artistStatus === "PAID";

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const next = paid ? "TO_INVOICE" : "PAID";
    startTransition(async () => {
      await setDealArtistStatus({ dealId: deal.id, status: next });
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
          : "Marquer comme Payé (statut commercial)"
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

/** Pill statut paiements : "Soldé" (tout réglé), "X à régler", ou "—" (deal
 *  vide). Stan 2026-06-16 : un deal sans rien renseigné avait `linesToPay===0`
 *  donc affichait "Soldé" à tort — on distingue maintenant le deal vide. */
function PaiementsPill({ count, hasContent }: { count: number; hasContent: boolean }) {
  if (count === 0) {
    if (!hasContent) {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground">
          —
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs whitespace-nowrap text-emerald-700 dark:text-emerald-400">
        <Check className="h-3 w-3" />
        Soldé
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs whitespace-nowrap text-amber-700 dark:text-amber-400">
      <Clock className="h-3 w-3" />
      {count} à régler
    </span>
  );
}

interface Props {
  deals: ProdExeDealRow[];
  totals: ProdExeDealsListData["totals"];
  periodLabel: string;
}

const COL_WIDTHS = [
  "w-[68px]",  // 1 Date
  "w-[230px]", // 2 Projet
  "w-[120px]", // 3 Statut (Stan 2026-06-01 fix : DealStatusInline a min-w-[110px], 100px provoquait débordement sur col Modèle)
  "w-[70px]",  // 4 Modèle (réduit — Stan 2026-05-27 v3)
  "w-[90px]",  // 5 CA HT
  "w-[90px]",  // 6 Artiste
  "w-[100px]", // 7 St. Artiste
  "w-[100px]", // 8 Marge Brute (élargi)
  "w-[110px]", // 9 St. Marge
  "w-[80px]",  // 10 Encaissement
  "w-[100px]", // 11 Statut paiements
  "w-[80px]",  // 12 Mgmt fees
  "w-[90px]",  // 13 Marge Nette
  "w-[50px]",  // 14 %
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

export function ProdExeDealsList({ deals, totals, periodLabel }: Props) {
  const router = useRouter();
  const eur = useEur();

  return (
    <div className="space-y-4">
      {/* Bande KPI top — Stan 2026-05-27 v4 :
            même architecture que DealsTotals (Booking).
            CA HT · Artistes · Management Fees · Marge Nette · % marge Nette */}
      <ProdExeTotalsCard totals={totals} periodLabel={periodLabel} />

      {deals.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          Aucun deal Prod Exécutive pour ces filtres.
        </div>
      ) : (
        <>
        {/* Vue mobile — cards empilées. */}
        <div className="md:hidden space-y-2">
          {deals.map((deal) => {
            const projectTitle =
              deal.primaryArtistName && deal.showName
                ? `${deal.primaryArtistName} - ${deal.showName}`
                : deal.primaryArtistName ?? deal.showName ?? deal.title;
            const venueLine = deal.venueName ?? deal.venueCity ?? null;
            return (
              <MobileDealCard
                key={deal.id}
                dealId={deal.id}
                category="PROD_EXE"
                date={deal.date}
                title={projectTitle}
                venue={venueLine}
                status={deal.status as never}
                isPaid={deal.allRevenuePaid}
                caHt={deal.caHt}
                margeNette={deal.margeNette}
                margeNettePct={deal.margeNettePct}
                isAnnule={deal.status === "ANNULE"}
              />
            );
          })}
        </div>

        {/* Vue desktop — tableau classique. */}
        <div className="hidden md:block rounded-md border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1400px] text-sm table-fixed xl:min-w-0 xl:w-full">
              <ColGroup />
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
                <tr>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Date</th>
                  <th className="text-left px-2 py-2 font-medium">Projet</th>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Statut</th>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Modèle</th>
                  <th className="text-right px-2 py-2 font-medium whitespace-nowrap">CA HT</th>
                  <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Artiste</th>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap">St. Artiste</th>
                  <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Marge Brute</th>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap">St. Marge</th>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Encaiss.</th>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap" title="Statut des paiements">Paiements</th>
                  <th className="text-right px-2 py-2 font-medium whitespace-nowrap" title="Management fees">Mgmt fees</th>
                  <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Marge Nette</th>
                  <th className="text-center px-2 py-2 font-medium whitespace-nowrap">%</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => {
                  const dStatus = dealStatusLabel(deal.status as never);
                  const projectTitle =
                    deal.primaryArtistName && deal.showName
                      ? `${deal.primaryArtistName} - ${deal.showName}`
                      : deal.primaryArtistName ?? deal.showName ?? deal.title;
                  const venueLine = deal.venueName ?? deal.venueCity ?? null;
                  return (
                    <tr
                      key={deal.id}
                      onClick={() => router.push(`/deals/prod-executive/${deal.id}`)}
                      className={cn(
                        "border-t hover:bg-accent/30 transition-colors cursor-pointer",
                        deal.status === "ANNULE" && "opacity-50",
                      )}
                      title="Cliquer pour ouvrir la fiche show"
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

                      {/* 2. Projet : Artiste - Spectacle + lieu en dessous */}
                      <td className="px-2 py-2 min-w-0">
                        <div className="font-medium leading-tight truncate">
                          {projectTitle}
                        </div>
                        {venueLine && (
                          <div className="text-xs text-muted-foreground truncate inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {venueLine}
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

                      {/* 4. Modèle salle */}
                      <td className="px-2 py-2 whitespace-nowrap text-xs text-muted-foreground">
                        {deal.venueDealKind ? (
                          <span title={VENUE_DEAL_KIND_FR[deal.venueDealKind]}>
                            {deal.venueDealKind === "PROD"
                              ? "Prod"
                              : deal.venueDealKind === "CO_REAL"
                                ? "Co-réal"
                                : "Cession"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>

                      {/* 5. CA HT */}
                      <td className="px-2 py-2 text-right tabular-nums">
                        {deal.caHt > 0 ? eur(deal.caHt) : <span className="text-muted-foreground/40">—</span>}
                      </td>

                      {/* 6. Artiste (part artiste) */}
                      <td className="px-2 py-2 text-right tabular-nums">
                        {deal.partArtiste !== 0 ? eur(deal.partArtiste) : <span className="text-muted-foreground/40">—</span>}
                      </td>

                      {/* 7. St. Artiste — pill cliquable */}
                      <td className="px-2 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <ArtisteStatusPill deal={deal} />
                      </td>

                      {/* 8. Marge Brute */}
                      <td className="px-2 py-2 text-right tabular-nums font-medium">
                        {deal.margeBrute > 0 ? eur(deal.margeBrute) : <span className="text-muted-foreground/40">—</span>}
                      </td>

                      {/* 9. St. Marge (toutes recettes PAID) */}
                      <td className="px-2 py-2 whitespace-nowrap">
                        <RecapStatusPill isPaid={deal.allRevenuePaid} paidLabel="Encaissé" />
                      </td>

                      {/* 10. Encaissement (date) */}
                      <td className="px-2 py-2 whitespace-nowrap text-xs tabular-nums">
                        {deal.encaissementDate
                          ? format(deal.encaissementDate, "MM/yy", { locale: fr })
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>

                      {/* 11. Statut paiements (X à régler) */}
                      <td className="px-2 py-2 whitespace-nowrap">
                        <PaiementsPill
                          count={deal.linesToPay}
                          hasContent={
                            deal.caHt !== 0 ||
                            deal.totalCost !== 0 ||
                            deal.partArtiste !== 0
                          }
                        />
                      </td>

                      {/* 12. Mgmt fees */}
                      <td className="px-2 py-2 text-right tabular-nums">
                        {deal.totalMf > 0 ? eur(deal.totalMf) : <span className="text-muted-foreground/40">—</span>}
                      </td>

                      {/* 13. Marge Nette */}
                      <td className="px-2 py-2 text-right tabular-nums font-semibold">
                        <span
                          className={cn(
                            deal.margeNette >= 0
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-red-700 dark:text-red-400",
                          )}
                        >
                          {deal.margeNette !== 0 ? eur(deal.margeNette) : "—"}
                        </span>
                      </td>

                      {/* 14. % marge nette */}
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
                  {/* col 1-4 : Date | Projet | Statut | Modèle */}
                  <td
                    colSpan={4}
                    className="px-2 py-2.5 text-right text-[11px] uppercase tracking-wider text-muted-foreground"
                  >
                    Total · {totals.count} deal{totals.count > 1 ? "s" : ""}
                  </td>
                  {/* col 5 CA HT */}
                  <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                    {eur(totals.totalRevenue)}
                  </td>
                  {/* col 6 Artiste (part artiste) */}
                  <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                    {eur(totals.totalPartArtiste)}
                  </td>
                  {/* col 7 St. Artiste */}
                  <td />
                  {/* col 8 Marge Brute (= commission Pangee cumulée) */}
                  <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                    {eur(totals.totalCommission)}
                  </td>
                  {/* col 9 St. Marge — split MARGE BRUTE encaissée / à venir
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
                  {/* col 10 Encaiss. */}
                  <td />
                  {/* col 11 Paiements */}
                  <td />
                  {/* col 12 Mgmt fees */}
                  <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                    {totals.totalMf > 0 ? eur(totals.totalMf) : "—"}
                  </td>
                  {/* col 13 Marge Nette */}
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
                  {/* col 14 % marge nette globale */}
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
        </>
      )}
    </div>
  );
}

// ──────────────────────────── KPI top (arch alignée Booking) ────────────────────────────

/**
 * Bande KPI Prod Exécutive — copie fidèle de `DealsTotals` (Booking)
 * Stan 2026-05-27 v4. Cinq Stat alignés :
 *   - CA HT
 *   - Artistes  (sub : "X € à reverser" si partArtisteARegler > 0)
 *   - Management Fees
 *   - Marge Nette (sub : split encaissée / à venir basé sur allRevenuePaid)
 *   - Taux Marge Nette (Marge nette ÷ CA HT)
 */
function ProdExeTotalsCard({
  totals,
  periodLabel,
}: {
  totals: ProdExeDealsListData["totals"];
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
          value={eur(totals.totalRevenue)}
        />
        <Stat
          icon={<Sparkles className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Artistes"
          value={eur(totals.totalPartArtiste)}
          sub={
            totals.partArtisteARegler > 0 ? (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Hourglass className="h-3 w-3" />
                {eur(totals.partArtisteARegler)} à reverser
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
