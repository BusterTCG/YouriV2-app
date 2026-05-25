"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { BookingDealRow, BookingDealsListData } from "@/lib/deals-list-types";
import {
  formatEur,
  formatPct,
  dealStatusLabel,
} from "./deal-helpers";
import { PaymentStatusPill } from "./payment-status-pill";
import { consolidateStatus } from "@/lib/consolidate-status";
import type { PaymentStatus } from "@prisma/client";

interface Props {
  deals: BookingDealRow[];
  totals: BookingDealsListData["totals"];
}

/**
 * Tableau plat /deals/booking — copie fidèle KuroNeko-App `components/deals/
 * deals-table.tsx`, adapté multi-artiste Youri V2 :
 *   - PAS de colonne Artiste (Stan : "indés que je gère pas").
 *   - 1 ligne = 1 deal consolidé. Statuts St. Artiste / St. Com :
 *     si tous DealArtiste ont le même → ce statut ; sinon → N_A (pill grise
 *     "—"), faut ouvrir la fiche pour éditer par artiste.
 *   - % Com : si tous DealArtiste ont le même % → affiché ; sinon "—".
 *   - Encaiss. : mois consolidé idem.
 *
 * Layout responsive (pattern KN) :
 *   - <xl : table-fixed min-w-[1240px] → scroll horizontal léger
 *   - ≥xl : xl:min-w-0 xl:w-full → compression proportionnelle, pas de scroll
 *
 * Click ligne → fiche détail `/deals/booking/[id]`. Édition inline (Lot suivant).
 */

const DEAL_COL_WIDTHS = [
  "w-[68px]", // Date
  "w-[260px]", // Projet
  "w-[110px]", // Statut
  "w-[96px]", // Montant
  "w-[96px]", // Artiste €
  "w-[120px]", // St. Artiste
  "w-[56px]", // % Com
  "w-[96px]", // Com €
  "w-[120px]", // St. Com
  "w-[100px]", // Encaiss.
  "w-[140px]", // Notes
];

function DealsListColGroup() {
  return (
    <colgroup>
      {DEAL_COL_WIDTHS.map((w, i) => (
        <col key={i} className={w} />
      ))}
    </colgroup>
  );
}

export function BookingDealsList({ deals, totals }: Props) {
  const router = useRouter();

  if (deals.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
        Aucun deal Booking pour ces filtres.
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-[1240px] text-sm table-fixed xl:min-w-0 xl:w-full">
          <DealsListColGroup />
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
            <tr>
              <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Date</th>
              <th className="text-left px-2 py-2 font-medium">Projet</th>
              <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Statut</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Montant</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Artiste</th>
              <th className="text-left px-2 py-2 font-medium whitespace-nowrap">St. Artiste</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">% Com</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Com €</th>
              <th className="text-left px-2 py-2 font-medium whitespace-nowrap">St. Com</th>
              <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Encaiss.</th>
              <th className="text-left px-2 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => {
              const cachetCons = consolidateStatus(
                deal.dealArtistes.map((da) => da.paymentStatus),
              );
              const comCons = consolidateStatus(
                deal.dealArtistes.map((da) => da.commissionStatus),
              );
              // Pour la pill, on retombe sur N_A si MIXED (pill grise + "—") +
              // hint title sur survol. Phase édition affichera "Mixte" non éditable.
              const cachetForPill: PaymentStatus =
                cachetCons === "MIXED" ? "N_A" : cachetCons;
              const comForPill: PaymentStatus =
                comCons === "MIXED" ? "N_A" : comCons;

              // % Com consolidé
              const pctValues = deal.dealArtistes
                .map((da) => da.commissionPct)
                .filter((p): p is number => p != null);
              const uniquePcts = [...new Set(pctValues)];
              const consolidatedPct = uniquePcts.length === 1 ? uniquePcts[0] : null;

              // Mois encaiss. consolidé
              const paidDates = deal.dealArtistes
                .map((da) => (da.commissionPaidAt ? da.commissionPaidAt.getTime() : null))
                .filter((t): t is number => t !== null);
              const uniqueDates = [...new Set(paidDates)];
              const paidLabel =
                uniqueDates.length === 0
                  ? "—"
                  : uniqueDates.length === 1
                    ? format(new Date(uniqueDates[0]), "MMM", { locale: fr })
                    : "Multi";

              const grossAmount = deal.totalCachet + deal.totalCommission;
              const dStatus = dealStatusLabel(deal.status);

              return (
                <tr
                  key={deal.id}
                  onClick={() => router.push(`/deals/booking/${deal.id}`)}
                  className={cn(
                    "border-t hover:bg-accent/30 transition-colors cursor-pointer",
                    deal.status === "ANNULE" && "opacity-50",
                  )}
                  title="Cliquer pour ouvrir/éditer le deal"
                >
                  {/* Date */}
                  <td className="px-2 py-2 whitespace-nowrap text-xs">
                    {format(deal.date, "dd/MM/yy", { locale: fr })}
                  </td>

                  {/* Projet (titre + ville/lieu) */}
                  <td className="px-2 py-2 min-w-0">
                    <div className="font-medium leading-tight truncate">{deal.title}</div>
                    {(deal.venueCity || deal.venueName) && (
                      <div className="text-xs text-muted-foreground truncate">
                        {deal.venueCity ?? deal.venueName}
                      </div>
                    )}
                  </td>

                  {/* Statut deal — pattern KN brut (emoji + label, pas Badge) */}
                  <td
                    className="px-2 py-2 whitespace-nowrap text-xs"
                    title={dStatus.label}
                  >
                    {dStatus.emoji} {dStatus.label}
                  </td>

                  {/* Montant (= cachet + com) */}
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                    {formatEur(grossAmount)}
                  </td>

                  {/* Artiste (= cachet total) */}
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                    {formatEur(deal.totalCachet)}
                  </td>

                  {/* St. Artiste (consolidé) */}
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span
                      title={
                        cachetCons === "MIXED"
                          ? "Statuts mixtes par artiste — ouvrir la fiche pour détail"
                          : undefined
                      }
                    >
                      <PaymentStatusPill value={cachetForPill} />
                    </span>
                  </td>

                  {/* % Com */}
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums text-xs text-muted-foreground">
                    {consolidatedPct != null ? formatPct(consolidatedPct) : "—"}
                  </td>

                  {/* Com € */}
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                    {formatEur(deal.totalCommission)}
                  </td>

                  {/* St. Com (consolidé) */}
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span
                      title={
                        comCons === "MIXED"
                          ? "Statuts mixtes par artiste — ouvrir la fiche pour détail"
                          : undefined
                      }
                    >
                      <PaymentStatusPill value={comForPill} />
                    </span>
                  </td>

                  {/* Encaiss. (mois) */}
                  <td className="px-2 py-2 whitespace-nowrap text-xs tabular-nums">
                    {uniqueDates.length === 0 ? (
                      <span className="text-muted-foreground/40">—</span>
                    ) : (
                      <span>{paidLabel}</span>
                    )}
                  </td>

                  {/* Notes */}
                  <td className="px-2 py-2 min-w-0">
                    {deal.notes ? (
                      <span
                        className="text-xs text-muted-foreground line-clamp-2"
                        title={deal.notes}
                      >
                        {deal.notes}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Pied : totaux (pattern KN) */}
          <tfoot className="bg-muted/60 border-t-2 font-semibold sticky bottom-0">
            <tr>
              <td
                colSpan={3}
                className="px-2 py-2.5 text-right text-[11px] uppercase tracking-wider text-muted-foreground"
              >
                Total · {totals.count} deal{totals.count > 1 ? "s" : ""}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                {formatEur(totals.gross)}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                {formatEur(totals.totalCachet)}
              </td>
              <td />
              <td />
              <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap text-[--yr-gold]">
                {formatEur(totals.totalCommission)}
              </td>
              <td colSpan={2} className="px-2 py-2.5 text-[11px] text-muted-foreground">
                {totals.commissionPaid > 0 && (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {formatEur(totals.commissionPaid)} encaissée
                  </span>
                )}
                {totals.commissionPaid > 0 && totals.commissionTodo > 0 && (
                  <span className="mx-1 text-muted-foreground/50">·</span>
                )}
                {totals.commissionTodo > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {formatEur(totals.commissionTodo)} à venir
                  </span>
                )}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
