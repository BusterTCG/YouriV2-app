import "server-only";

import { DealStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEFAULT_EMPLOYEE_CHARGES_RATE } from "@/lib/finance/cachet-payroll";
import type { ArtistOverviewRow } from "./artist-overview-types";

/**
 * Server-only data-fetcher pour la Vue d'ensemble fiche artiste.
 *
 * Retourne les ROWS BRUTES (1 par DealArtiste) sérialisables — le client
 * component `overview-section.tsx` les filtre par période + recalcule les
 * agrégats via `computeArtistOverview()` (lib/artist-overview-types.ts).
 *
 * Filtres :
 *   - DealArtiste.deletedAt = null
 *   - Deal.deletedAt = null
 *   - Deal.status ≠ ANNULE
 *
 * Tri date desc — utile pour la liste "Derniers deals" qui slice(0, 8).
 * < 200 deals par artiste max → pas de pagination nécessaire.
 */
export async function getArtistOverviewRows(
  artistId: string,
): Promise<ArtistOverviewRow[]> {
  const rows = await prisma.dealArtiste.findMany({
    where: {
      artistId,
      deletedAt: null,
      deal: {
        deletedAt: null,
        status: { not: DealStatus.ANNULE },
      },
    },
    select: {
      id: true,
      cachetAmount: true,
      paymentStatus: true,
      deal: {
        select: {
          id: true,
          date: true,
          title: true,
          category: true,
          status: true,
        },
      },
    },
    orderBy: { deal: { date: "desc" } },
  });

  return rows.map((r) => {
    const raw = r.cachetAmount != null ? Number(r.cachetAmount) : null;
    // CACHETS : on expose le NET estimé reçu par l'artiste (brut × (1 − charges
    // salariales ~25 %)), pas le brut GUSO — c'est ce que l'artiste touche
    // réellement, donc la donnée pertinente côté fiche artiste (Stan 2026-06-17).
    const amount =
      raw != null && r.deal.category === "CACHETS"
        ? Math.round(raw * (1 - DEFAULT_EMPLOYEE_CHARGES_RATE / 100))
        : raw;
    return {
      dealArtisteId: r.id,
      dealId: r.deal.id,
      date: r.deal.date,
      title: r.deal.title,
      category: r.deal.category,
      status: r.deal.status,
      amount,
      paymentStatus: r.paymentStatus,
    };
  });
}
