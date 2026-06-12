"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { BookingDealRow, BookingDealsListData } from "@/lib/deals-list-types";
import { formatPct, dealStatusLabel } from "./deal-helpers";
import { DealStatusInline } from "./deal-status-inline";
import { MobileDealCard } from "./mobile-deal-card";
import { useEur } from "@/lib/privacy-context";

/**
 * Pill statut recap booking (Stan 2026-05-26) : seulement 2 états affichés —
 * "Encaissé" (vert) si PAID, "En cours" (gris) sinon. Quels que soient les
 * statuts intermédiaires sous-jacents (TO_INVOICE/VALIDATED/INVOICED/DISPUTE).
 */
function RecapStatusPill({
  isPaid,
  paidLabel = "Encaissé",
}: {
  isPaid: boolean;
  /** Wording du status PAID — "Encaissé" (entrée cash, budget) ou "Payé"
   *  (sortie cash, artiste). Stan 2026-05-27. */
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

interface Props {
  deals: BookingDealRow[];
  totals: BookingDealsListData["totals"];
}

/**
 * Tableau récap /deals/booking — modèle Budget/Marge (Stan 2026-05-26).
 *
 * Colonnes : Date / Projet / Statut / CA HT (budget) / Artiste (Σ rémus) /
 * St. Artiste (consolidé) / Marge Brute (= budget − artistes − charges) /
 * St. Marge (= budgetPaymentStatus) / Encaiss. (budgetPaidAt) / Mgmt fees /
 * Marge Nette (= Marge Brute − MF) / Taux Marge Nette.
 *
 * Wording aligné Stan 2026-05-27 audit : on parle de "Marge Brute" (vs
 * "Marge Youri"/"Marge Pangee" historiques) pour rester cohérent avec les
 * KPI top et la fiche détail Prod Exé.
 *
 * - PAS de colonne Artiste (Stan : indés que je gère pas).
 * - PAS de colonne % Com (modèle marge auto, pas de % par artiste).
 * - 1 ligne = 1 deal. Édition inline desktop (Selects + MonthPicker).
 * - Cliquer sur la ligne → fiche détail `/deals/booking/[id]`.
 */

/** Largeurs des colonnes Stan 2026-05-27 v5 :
 *    Date | Projet | Statut | CA HT | Artiste | St. Artiste | Marge
 *    | St. Marge | Encaiss. | Manag fees | Marge nette | %
 *
 *  Stan v4 (2026-05-26 retour) :
 *    - % de marge déplacé APRÈS Marge nette (= % de la marge nette)
 *    - Manag fees en text-sm (même taille que CA HT/Artiste)
 *    - Encaiss. en format MM/yy
 *    - Colonne Notes supprimée
 *  Stan v5 (2026-05-27) :
 *    - "Montant" → "CA HT" pour cohérence avec Prod Exé
 */
const DEAL_COL_WIDTHS = [
  "w-[68px]",  // Date
  "w-[220px]", // Projet
  "w-[110px]", // Statut deal
  "w-[90px]",  // CA HT (= budget)
  "w-[90px]",  // Artiste (Σ)
  "w-[110px]", // St. Artiste
  "w-[90px]",  // Marge Brute (= budget − artistes − charges)
  "w-[110px]", // St. Marge
  "w-[80px]",  // Encaiss. (MM/yy)
  "w-[90px]",  // Manag fees
  "w-[90px]",  // Marge nette
  "w-[50px]",  // % de la marge nette
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
  const eur = useEur();

  if (deals.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
        Aucun deal Booking pour ces filtres.
      </div>
    );
  }

  return (
    <>
    {/* Vue mobile — cards empilées (Stan 2026-06-02 : pas de scroll-x). */}
    <div className="md:hidden space-y-2">
      {deals.map((deal) => {
        const venueLine = deal.venueName ?? deal.venueCity ?? null;
        const isPaid =
          deal.budgetPaymentStatus === "PAID" &&
          deal.dealArtistes.every((a) => a.paymentStatus === "PAID") &&
          deal.dealCharges.every((c) => c.paymentStatus === "PAID");
        return (
          <MobileDealCard
            key={deal.id}
            dealId={deal.id}
            category={deal.category}
            date={deal.date}
            title={deal.title}
            venue={venueLine}
            status={deal.status}
            isPaid={isPaid}
            caHt={deal.budgetAmount ?? 0}
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
        <table className="min-w-[1208px] text-sm table-fixed xl:min-w-0 xl:w-full">
          <DealsListColGroup />
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
            <tr>
              <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Date</th>
              <th className="text-left px-2 py-2 font-medium">Projet</th>
              <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Statut</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">CA HT</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Artiste</th>
              <th className="text-left px-2 py-2 font-medium whitespace-nowrap">St. Artiste</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Marge Brute</th>
              <th className="text-left px-2 py-2 font-medium whitespace-nowrap">St. Marge</th>
              <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Encaiss.</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap" title="Management fees">Mgmt fees</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Marge nette</th>
              <th className="text-center px-2 py-2 font-medium whitespace-nowrap">%</th>
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

                  {/* Statut deal — éditable inline desktop, lecture seule mobile.
                      Stan 2026-05-31 v3 : édition directe depuis le tableau. */}
                  <td className="px-2 py-2 whitespace-nowrap text-xs">
                    <div className="hidden sm:block" onClick={(e) => e.stopPropagation()}>
                      <DealStatusInline dealId={deal.id} value={deal.status} />
                    </div>
                    <span className="sm:hidden">
                      {dStatus.emoji} {dStatus.label}
                    </span>
                  </td>

                  {/* CA HT = budget */}
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                    {eur(deal.budgetAmount)}
                  </td>

                  {/* Artiste = Σ artistes */}
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                    {eur(deal.totalArtistes)}
                  </td>

                  {/* St. Artiste — recap binaire : Payé si tous PAID, sinon En cours
                      (Stan 2026-05-27 : "Payé" car sortie cash vers l'artiste). */}
                  <td className="px-2 py-2 whitespace-nowrap">
                    <RecapStatusPill isPaid={allArtistesPaid} paidLabel="Payé" />
                  </td>

                  {/* Marge Pangee (= budget − artistes − charges) */}
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums font-medium">
                    {eur(deal.margePangee)}
                  </td>

                  {/* St. Marge — recap binaire Stan : Encaissé si budget PAID, sinon En cours. */}
                  <td className="px-2 py-2 whitespace-nowrap">
                    <RecapStatusPill isPaid={deal.budgetPaymentStatus === "PAID"} />
                  </td>

                  {/* Encaissement = mois budget Pangee — format MM/yy (Stan v4) */}
                  <td className="px-2 py-2 whitespace-nowrap text-xs tabular-nums">
                    {deal.budgetPaidAt
                      ? format(deal.budgetPaidAt, "MM/yy", { locale: fr })
                      : <span className="text-muted-foreground/40">—</span>}
                  </td>

                  {/* Manag fees (Σ MF du deal) — text-sm aligné autres montants (Stan v4) */}
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                    {deal.totalMf > 0 ? (
                      eur(deal.totalMf)
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>

                  {/* Marge nette = Marge − Manag fees */}
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums font-semibold">
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

                  {/* % de la marge nette (Stan v4 : APRÈS Marge nette) */}
                  <td className="px-2 py-2 text-center whitespace-nowrap tabular-nums text-xs text-muted-foreground">
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
              {/* col 5 Artiste */}
              <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                {eur(totals.totalArtistes)}
              </td>
              {/* col 6 St. Artiste */}
              <td />
              {/* col 7 Marge Pangee */}
              <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                {eur(totals.totalMarge)}
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
              {/* col 10 Manag fees total */}
              <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                {totals.totalMf > 0 ? eur(totals.totalMf) : "—"}
              </td>
              {/* col 11 Marge nette total */}
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
              {/* col 12 % de marge nette */}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
    </>
  );
}
