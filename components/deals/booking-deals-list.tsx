"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { BookingDealRow, BookingDealsListData } from "@/lib/deals-list-types";
import { formatEur, formatPct, dealStatusLabel } from "./deal-helpers";

/**
 * Pill statut recap booking (Stan 2026-05-26) : seulement 2 états affichés —
 * "Encaissé" (vert) si PAID, "En cours" (gris) sinon. Quels que soient les
 * statuts intermédiaires sous-jacents (TO_INVOICE/VALIDATED/INVOICED/DISPUTE).
 */
function RecapStatusPill({ isPaid }: { isPaid: boolean }) {
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
      <span>{isPaid ? "Encaissé" : "En cours"}</span>
    </span>
  );
}

interface Props {
  deals: BookingDealRow[];
  totals: BookingDealsListData["totals"];
}

/**
 * Tableau récap /deals/booking — modèle Budget/Marge (Stan 2026-05-26).
 *
 * Colonnes : Date / Projet / Statut / Montant (budget) / Artiste (Σ rémus) /
 * St. Artiste (consolidé) / Divers (Σ charges) / Marge Youri / St. Marge
 * (= budgetPaymentStatus) / % Marge / Encaiss. (budgetPaidAt) / Notes.
 *
 * - PAS de colonne Artiste (Stan : indés que je gère pas).
 * - PAS de colonne % Com (modèle marge auto, pas de % par artiste).
 * - 1 ligne = 1 deal. Édition inline desktop (Selects + MonthPicker).
 * - Cliquer sur la ligne → fiche détail `/deals/booking/[id]`.
 */

const DEAL_COL_WIDTHS = [
  "w-[68px]",  // Date
  "w-[220px]", // Projet
  "w-[110px]", // Statut deal
  "w-[90px]",  // Montant (budget)
  "w-[90px]",  // Artiste (Σ)
  "w-[110px]", // St. Artiste
  "w-[90px]",  // Divers (Σ charges)
  "w-[90px]",  // Marge Youri
  "w-[50px]",  // % (entre Marge Youri et St. Marge — Stan 2026-05-26 v2)
  "w-[110px]", // St. Marge
  "w-[100px]", // Encaiss.
  "w-[120px]", // Notes
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
        <table className="min-w-[1258px] text-sm table-fixed xl:min-w-0 xl:w-full">
          <DealsListColGroup />
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
            <tr>
              <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Date</th>
              <th className="text-left px-2 py-2 font-medium">Projet</th>
              <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Statut</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Montant</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Artiste</th>
              <th className="text-left px-2 py-2 font-medium whitespace-nowrap">St. Artiste</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Divers</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Marge Youri</th>
              <th className="text-center px-2 py-2 font-medium whitespace-nowrap">%</th>
              <th className="text-left px-2 py-2 font-medium whitespace-nowrap">St. Marge</th>
              <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Encaiss.</th>
              <th className="text-left px-2 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => {
              // Règle Stan 2026-05-26 : St. Artiste consolidé recap = "Payé"
              // si TOUS les artistes sont PAID, sinon "En cours".
              const allArtistesPaid =
                deal.dealArtistes.length > 0 &&
                deal.dealArtistes.every((da) => da.paymentStatus === "PAID");
              const artisteRecapStatus = allArtistesPaid ? "PAID" : "TO_INVOICE";

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

                  {/* Projet (titre + ville) */}
                  <td className="px-2 py-2 min-w-0">
                    <div className="font-medium leading-tight truncate">{deal.title}</div>
                    {(deal.venueCity || deal.venueName) && (
                      <div className="text-xs text-muted-foreground truncate">
                        {deal.venueCity ?? deal.venueName}
                      </div>
                    )}
                  </td>

                  {/* Statut deal — LECTURE SEULE (Stan : édition seulement dans la fiche) */}
                  <td className="px-2 py-2 whitespace-nowrap text-xs">
                    {dStatus.emoji} {dStatus.label}
                  </td>

                  {/* Montant = budget */}
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                    {formatEur(deal.budgetAmount)}
                  </td>

                  {/* Artiste = Σ artistes */}
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                    {formatEur(deal.totalArtistes)}
                  </td>

                  {/* St. Artiste — recap binaire Stan : Encaissé si tous PAID, sinon En cours. */}
                  <td className="px-2 py-2 whitespace-nowrap">
                    <RecapStatusPill isPaid={allArtistesPaid} />
                  </td>

                  {/* Divers = Σ charges */}
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                    {deal.totalCharges > 0 ? formatEur(deal.totalCharges) : "—"}
                  </td>

                  {/* Marge Youri — en noir (couleur normale, pas accent) */}
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums font-medium">
                    {formatEur(deal.margePangee)}
                  </td>

                  {/* % — entre Marge Youri et St. Marge (Stan 2026-05-26 v2) */}
                  <td className="px-2 py-2 text-center whitespace-nowrap tabular-nums text-xs text-muted-foreground">
                    {deal.margePct != null ? formatPct(deal.margePct, { integer: true }) : "—"}
                  </td>

                  {/* St. Marge — recap binaire Stan : Encaissé si budget PAID, sinon En cours. */}
                  <td className="px-2 py-2 whitespace-nowrap">
                    <RecapStatusPill isPaid={deal.budgetPaymentStatus === "PAID"} />
                  </td>

                  {/* Encaissement = mois budget Youri — LECTURE SEULE */}
                  <td className="px-2 py-2 whitespace-nowrap text-xs tabular-nums">
                    {deal.budgetPaidAt
                      ? format(deal.budgetPaidAt, "MMM yyyy", { locale: fr })
                      : <span className="text-muted-foreground/40">—</span>}
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
          <tfoot className="bg-muted/60 border-t-2 font-semibold sticky bottom-0">
            <tr>
              <td
                colSpan={3}
                className="px-2 py-2.5 text-right text-[11px] uppercase tracking-wider text-muted-foreground"
              >
                Total · {totals.count} deal{totals.count > 1 ? "s" : ""}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                {formatEur(totals.totalBudget)}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                {formatEur(totals.totalArtistes)}
              </td>
              <td />
              <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                {totals.totalCharges > 0 ? formatEur(totals.totalCharges) : "—"}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                {formatEur(totals.totalMarge)}
              </td>
              <td />
              <td className="px-2 py-2.5 text-[11px] text-muted-foreground whitespace-nowrap">
                {totals.margeRealisee !== 0 && (
                  <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatEur(totals.margeRealisee)} encaissée
                  </span>
                )}
                {totals.margeRealisee !== 0 && totals.margeAttente !== 0 && (
                  <span className="mx-1 text-muted-foreground/50">·</span>
                )}
                {totals.margeAttente !== 0 && (
                  <span className="text-amber-600 dark:text-amber-400 tabular-nums">
                    {formatEur(totals.margeAttente)} à venir
                  </span>
                )}
              </td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
