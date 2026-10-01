"use server";

// Export Excel de toutes les dates de production — portage KN (Stan
// 2026-10-01 : la vue « Toutes les dates » est supprimée, l'export reste sur
// l'accueil Productions). Chargé au clic pour ne pas alourdir la page.
// Youri : lieu = snapshot venueName / venueCity ; cachets artistes et quote-
// part de frais généraux = charges « Autre ». Jamais de management fees.

import { prisma } from "@/lib/db";
import { requireDealCategoryAccess } from "@/lib/auth/access";
import { getProductionOverheadAllocation } from "@/lib/finance/show-financials";
import type { ShowsExportRow } from "@/components/shows/shows-export-button";

export async function getShowsExportRows(): Promise<ShowsExportRow[]> {
  await requireDealCategoryAccess("PROD_EXE");
  const shows = await prisma.deal.findMany({
    where: { category: "PROD_EXE", status: { not: "ANNULE" } },
    orderBy: [{ date: "asc" }],
    include: {
      dealArtistes: {
        orderBy: { createdAt: "asc" },
        select: { cachetAmount: true, artist: { select: { name: true } } },
      },
      production: { select: { name: true, artist: { select: { name: true } } } },
      briefing: { select: { status: true } },
      productionLines: {
        select: { kind: true, label: true, amount: true, coveredByVenue: true },
      },
    },
  });

  // Quote-part des frais généraux par date (ligne virtuelle de charge).
  const overheadByDeal = new Map<string, number>();
  const productionIds = [
    ...new Set(shows.map((s) => s.productionId).filter((v): v is string => !!v)),
  ];
  for (const pid of productionIds) {
    const alloc = await getProductionOverheadAllocation(pid);
    for (const [dealId, share] of alloc.byDeal) overheadByDeal.set(dealId, share);
  }

  const num = (v: { toString(): string } | null) => (v != null ? Number(v) : null);
  return shows.map((s) => {
    const cachets = s.dealArtistes.reduce((t, a) => t + (num(a.cachetAmount) ?? 0), 0);
    const extra = [cachets, overheadByDeal.get(s.id) ?? 0]
      .filter((amount) => amount !== 0)
      .map((amount) => ({
        kind: "COST" as const,
        label: "AUTRE" as const,
        amount,
        coveredByVenue: false,
      }));
    return {
      date: s.date,
      title: s.title,
      city: s.venueCity,
      showName: s.production?.name ?? null,
      status: s.status,
      capacity: s.capacity,
      paying: s.paying,
      invited: s.invited,
      grossAmount: null,
      commissionPct: null,
      commissionAmount: null,
      notes: s.description,
      artist: {
        name:
          s.production?.artist.name ??
          s.dealArtistes.map((a) => a.artist.name).join(", "),
      },
      briefing: s.briefing ? { status: s.briefing.status } : null,
      venueName: s.venueName,
      venueDealKind: s.venueDealKind,
      artistShareKind: s.artistShareKind,
      coprodKnPct: num(s.coprodKnPct),
      prodExePct: num(s.prodExePct),
      coRealGrossCa: num(s.coRealGrossCa),
      productionLines: [
        ...s.productionLines.map((l) => ({
          kind: l.kind,
          label: l.label,
          amount: Number(l.amount),
          coveredByVenue: l.coveredByVenue,
        })),
        ...extra,
      ],
    };
  });
}
