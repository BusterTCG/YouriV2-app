import "server-only";

// Compte artiste d'une production — lecture Prisma + synchro des statuts
// artiste dérivés (portage KN, Stan 2026-09-28). Calculs : artist-account.ts.
//
// ⚠️ Les management fees n'entrent jamais dans le compte artiste.

import { prisma } from "@/lib/db";
import { localDayKey } from "@/lib/finance/artist-status-daily";
import { format } from "date-fns";
import { PRODUCTION_LINE_LABELS } from "@/lib/production-line-labels";
import {
  computeArtistAccount,
  type AccountDeal,
  type ArtistAccount,
} from "@/lib/finance/artist-account";

/** Dû à l'artiste : frais avancé (charge d'une date, frais général) ou avance
 *  de trésorerie (CASH = mouvement CASH_ADVANCE). */
export type ArtistAdvanceItem = {
  kind: "LINE" | "OVERHEAD" | "CASH";
  id: string;
  /** « Train Paris-Lyon · 12/09/2026 · Petite Loge » */
  label: string;
  amount: number;
  /** Remboursé (versement lié). */
  refunded: boolean;
};

export type ArtistAccountView = ArtistAccount & {
  movements: Array<{
    id: string;
    kind: "PAYMENT" | "REFUND" | "EXPENSES" | "CASH_ADVANCE";
    amount: number;
    /** Part qui rembourse des frais avancés. */
    advanceAmount: number;
    date: Date;
    note: string | null;
  }>;
  advanceItems: ArtistAdvanceItem[];
};

/** Frais avancés par l'artiste sur la production (Stan 2026-10-12). */
async function advanceItemsOf(productionId: string): Promise<ArtistAdvanceItem[]> {
  const [lines, overheads] = await Promise.all([
    prisma.productionLine.findMany({
      where: {
        paidByArtist: true,
        deletedAt: null,
        kind: "COST",
        deal: { productionId, category: "PROD_EXE", deletedAt: null },
      },
      select: {
        id: true,
        label: true,
        customLabel: true,
        amount: true,
        artistRefundId: true,
        deal: { select: { date: true, title: true, venueName: true } },
      },
      orderBy: [{ deal: { date: "asc" } }, { order: "asc" }],
    }),
    prisma.productionOverhead.findMany({
      where: { productionId, paidByArtist: true },
      select: { id: true, label: true, date: true, amount: true, artistRefundId: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return [
    ...overheads.map((o) => ({
      kind: "OVERHEAD" as const,
      id: o.id,
      label: `${o.label} · frais général${o.date ? ` · ${format(o.date, "dd/MM/yyyy")}` : ""}`,
      amount: Number(o.amount),
      refunded: o.artistRefundId != null,
    })),
    ...lines.map((l) => ({
      kind: "LINE" as const,
      id: l.id,
      label: `${l.customLabel || PRODUCTION_LINE_LABELS[l.label]} · ${format(l.deal.date, "dd/MM/yyyy")} · ${
        l.deal.venueName ?? l.deal.title
      }`,
      amount: Number(l.amount ?? 0),
      refunded: l.artistRefundId != null,
    })),
  ].filter((a) => Math.round(a.amount * 100) !== 0);
}

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
      settledAt: true,
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
      settled: d.settledAt != null,
    };
  });
}

export async function getArtistAccount(
  productionId: string,
  nowMs: number,
): Promise<ArtistAccountView> {
  const [deals, movements, advanceItems] = await Promise.all([
    accountDeals(productionId, nowMs),
    prisma.artistMovement.findMany({ where: { productionId }, orderBy: { date: "asc" } }),
    advanceItemsOf(productionId),
  ]);
  const account = computeArtistAccount(
    deals,
    movements.map((m) => ({
      kind: m.kind,
      amount: Number(m.amount),
      advanceAmount: Number(m.advanceAmount),
    })),
    advanceItems,
  );
  // Avances de trésorerie : à rendre, comme les frais avancés (comptées par
  // computeArtistAccount depuis les mouvements).
  const cashItems: ArtistAdvanceItem[] = movements
    .filter((m) => m.kind === "CASH_ADVANCE")
    .map((m) => ({
      kind: "CASH" as const,
      id: m.id,
      label: `Avance de trésorerie · ${format(m.date, "dd/MM/yyyy")}${m.note ? ` · ${m.note}` : ""}`,
      amount: Number(m.amount),
      refunded: m.repaidById != null,
    }));
  return {
    ...account,
    movements: movements.map((m) => ({
      id: m.id,
      kind: m.kind,
      amount: Number(m.amount),
      advanceAmount: m.kind === "EXPENSES" ? Number(m.amount) : Number(m.advanceAmount),
      date: m.date,
      note: m.note,
    })),
    advanceItems: [...cashItems, ...advanceItems],
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
    // Dates soldées reprises par migration : quote-part de frais figée dès la
    // 1re page ouverte (avant toute modification des dates).
    const { freezeSettledOverheads } = await import("@/lib/finance/show-financials");
    for (const p of productions) {
      await freezeSettledOverheads(p.id);
      await syncArtistStatuses(p.id, now.getTime());
    }
  } catch (e) {
    lastDailySync = null; // réessai à la prochaine page
    console.error("[syncArtistStatusesDaily]", e);
  }
}

/** Tests : oublie la dernière resynchro. */
export function resetArtistStatusesDailyForTests(): void {
  lastDailySync = null;
}
