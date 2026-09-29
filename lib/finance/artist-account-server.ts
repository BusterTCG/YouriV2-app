import "server-only";

// Compte artiste d'une production — lecture Prisma + synchro des statuts
// artiste dérivés (portage KN, Stan 2026-09-28). Calculs : artist-account.ts.
//
// ⚠️ Les management fees n'entrent jamais dans le compte artiste.

import { prisma } from "@/lib/db";
import {
  computeArtistAccount,
  type AccountDeal,
  type ArtistAccount,
} from "@/lib/finance/artist-account";

export type ArtistAccountView = ArtistAccount & {
  movements: Array<{
    id: string;
    kind: "PAYMENT" | "REFUND";
    amount: number;
    date: Date;
    note: string | null;
  }>;
};

async function accountDeals(productionId: string, nowMs: number): Promise<AccountDeal[]> {
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const deals = await prisma.deal.findMany({
    where: { productionId, category: "PROD_EXE", deletedAt: null },
    select: {
      id: true,
      date: true,
      status: true,
      artistAmount: true,
      productionLines: {
        where: { kind: "REVENUE", deletedAt: null, coveredByVenue: false },
        select: { amount: true, paymentStatus: true },
      },
      performances: { where: { cancelled: false }, select: { date: true } },
    },
  });
  return deals.map((d) => {
    const last = d.performances.length
      ? new Date(Math.max(...d.performances.map((p) => p.date.getTime())))
      : d.date;
    const revenue = d.productionLines.filter((l) => Number(l.amount) !== 0);
    return {
      id: d.id,
      date: d.date,
      isPast: last.getTime() < startOfToday.getTime(),
      cancelled: d.status === "ANNULE",
      artistAmount: d.artistAmount != null ? Number(d.artistAmount) : 0,
      // Billetterie reçue = recettes saisies, toutes encaissées.
      collected: revenue.length > 0 && revenue.every((l) => l.paymentStatus === "PAID"),
    };
  });
}

export async function getArtistAccount(
  productionId: string,
  nowMs: number,
): Promise<ArtistAccountView> {
  const [deals, movements] = await Promise.all([
    accountDeals(productionId, nowMs),
    prisma.artistMovement.findMany({ where: { productionId }, orderBy: { date: "asc" } }),
  ]);
  const account = computeArtistAccount(
    deals,
    movements.map((m) => ({ kind: m.kind, amount: Number(m.amount) })),
  );
  return {
    ...account,
    movements: movements.map((m) => ({
      id: m.id,
      kind: m.kind,
      amount: Number(m.amount),
      date: m.date,
      note: m.note,
    })),
  };
}

/**
 * Aligne Deal.artistStatus des dates de la production sur le compte artiste
 * (source de vérité) — listes, dashboard et management fees (« dispo pour
 * paiement ») lisent ces statuts.
 */
export async function syncArtistStatuses(productionId: string): Promise<void> {
  const account = await getArtistAccount(productionId, Date.now());
  const current = await prisma.deal.findMany({
    where: { productionId, category: "PROD_EXE", deletedAt: null },
    select: { id: true, artistStatus: true },
  });
  for (const d of current) {
    const next = account.statuses.get(d.id);
    if (next && next !== d.artistStatus) {
      await prisma.deal.update({ where: { id: d.id }, data: { artistStatus: next } });
    }
  }
}
