import Link from "next/link";
import { format } from "date-fns";
import type { BookingDealArtistRow } from "@/lib/deals-list-types";

/**
 * Cachet utilisé comme avance de trésorerie de l'artiste sur une production
 * (Stan 2026-10-16) : il lui est dû via son compte artiste — ne pas le payer
 * en plus. Lien vers l'onglet Artiste de la production.
 */
export function CashAdvanceBadge({ cashAdvance }: { cashAdvance: BookingDealArtistRow["cashAdvance"] }) {
  if (!cashAdvance) return null;
  return (
    <Link
      href={`/shows/production/${cashAdvance.productionId}?tab=artiste`}
      title={`Cachet utilisé en avance de trésorerie sur « ${cashAdvance.productionName} » (versement du ${format(cashAdvance.date, "dd/MM/yyyy")}) : dû via le compte artiste, ne pas le payer en plus.`}
      className="inline-block shrink-0 whitespace-nowrap rounded-full border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-500/20"
    >
      Avance tréso · {cashAdvance.productionName}
    </Link>
  );
}
