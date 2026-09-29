import "server-only";

// Compte artiste d'une production — lecture Prisma + synchro des statuts
// artiste dérivés (portage KN, Stan 2026-09-28). Calculs : artist-account.ts.
//
// ⚠️ Les management fees n'entrent jamais dans le compte artiste.

import { prisma } from "@/lib/db";
import { localDayKey } from "@/lib/finance/artist-status-daily";
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
export async function syncArtistStatuses(
  productionId: string,
  nowMs: number = Date.now(),
): Promise<void> {
  const account = await getArtistAccount(productionId, nowMs);
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

// Resynchro quotidienne (portage KN, Stan 2026-09-30) : une date ne devient
// « jouée » (isPast) qu'au lendemain de sa dernière séance. Sans modification
// sur la production, son statut artiste restait figé (ex. billetterie et
// versement saisis le soir même). Les statuts sont donc recalculés pour
// toutes les productions une fois par jour, à la première page ouverte
// (layout). La « dispo paiement » des management fees se lit à l'affichage.
let lastDailySync: string | null = null;

export async function syncArtistStatusesDaily(now: Date = new Date()): Promise<void> {
  const day = localDayKey(now);
  if (lastDailySync === day) return;
  lastDailySync = day; // posé avant les await : pas de double passage concurrent
  try {
    const productions = await prisma.production.findMany({ select: { id: true } });
    for (const p of productions) await syncArtistStatuses(p.id, now.getTime());
  } catch (e) {
    lastDailySync = null; // réessai à la prochaine page
    console.error("[syncArtistStatusesDaily]", e);
  }
}

/** Tests : oublie la dernière resynchro. */
export function resetArtistStatusesDailyForTests(): void {
  lastDailySync = null;
}
