import "server-only";

// Séances (Performance) — source de vérité des représentations d'une date
// (portage de la refonte production KN, étape 2 — Stan 2026-09-29).
//
// Les champs historiques du Deal sont DÉRIVÉS des séances, pour que tout
// l'existant (dashboard, FDR, listes, calculs de production) continue de
// fonctionner sans changement :
//   performanceCount = nb de séances non annulées
//   date             = 1re séance non annulée (UTC midi)
//   showTime         = horaires distincts « 19:30 / 21:00 »
//   multiDateDates   = jours distincts (dates en mois de résidence)
//   paying / invited = somme des séances (si au moins une est saisie — sinon
//                      on garde le cumul historique « à ventiler »)
//   coRealGrossCa    = somme de la billetterie des séances (idem)
// En salle louée (PROD), la Recette HT = billetterie des séances : la ligne
// RECETTE_HT est alignée automatiquement (si elle est unique).
//
// (Pas de Google Agenda chez Youri — hors scope V2.)

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recomputeShowFinancials } from "@/lib/finance/show-financials";

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → Date UTC midi (convention des dates d'événement). */
export function dayToUtcNoon(key: string): Date {
  return new Date(`${key}T12:00:00.000Z`);
}

export type PerformanceTotals = {
  count: number;
  capacity: number | null;
  paying: number | null;
  invited: number | null;
  grossTicketing: number | null;
};

/** Totaux des séances non annulées (jauge de la date si séance sans jauge). */
export function performanceTotals(
  perfs: Array<{
    cancelled: boolean;
    capacity: number | null;
    paying: number | null;
    invited: number | null;
    grossTicketing: Prisma.Decimal | number | null;
  }>,
  dealCapacity: number | null,
): PerformanceTotals {
  const active = perfs.filter((p) => !p.cancelled);
  const sum = (vals: Array<number | null>) =>
    vals.some((v) => v != null) ? vals.reduce<number>((s, v) => s + (v ?? 0), 0) : null;
  const caps = active.map((p) => p.capacity ?? dealCapacity);
  return {
    count: active.length,
    capacity:
      caps.every((c) => c != null) && caps.length > 0
        ? caps.reduce<number>((s, c) => s + (c ?? 0), 0)
        : null,
    paying: sum(active.map((p) => p.paying)),
    invited: sum(active.map((p) => p.invited)),
    grossTicketing: sum(
      active.map((p) => (p.grossTicketing != null ? Number(p.grossTicketing) : null)),
    ),
  };
}

/**
 * Recalcule les champs dérivés du Deal depuis ses séances, puis les financials
 * de la production (+ management fees).
 */
export async function syncDealFromPerformances(dealId: string): Promise<void> {
  const [deal, perfs] = await Promise.all([
    prisma.deal.findUnique({
      where: { id: dealId },
      select: {
        isMultiDate: true,
        capacity: true,
        venueDealKind: true,
        productionLines: {
          where: { label: "RECETTE_HT", deletedAt: null },
          select: { id: true },
        },
      },
    }),
    prisma.performance.findMany({
      where: { dealId },
      orderBy: [{ date: "asc" }, { time: "asc" }],
    }),
  ]);
  if (!deal) return;

  const active = perfs.filter((p) => !p.cancelled);
  const totals = performanceTotals(perfs, deal.capacity);
  const days = [...new Set(active.map((p) => dayKey(p.date)))].sort();
  const times = [
    ...new Set(active.map((p) => p.time?.trim()).filter((t): t is string => !!t)),
  ];

  const data: Prisma.DealUncheckedUpdateInput = {
    performanceCount: totals.count,
    showTime: times.length ? times.join(" / ") : null,
    ...(active.length ? { date: active[0].date } : {}),
    ...(deal.isMultiDate ? { multiDateDates: days.length ? days : Prisma.DbNull } : {}),
    ...(totals.paying != null ? { paying: totals.paying } : {}),
    ...(totals.invited != null ? { invited: totals.invited } : {}),
    ...(totals.grossTicketing != null
      ? { coRealGrossCa: new Prisma.Decimal(totals.grossTicketing) }
      : {}),
  };
  await prisma.deal.update({ where: { id: dealId }, data });

  // Salle louée : la Recette HT EST la billetterie des séances.
  if (deal.venueDealKind === "PROD" && totals.grossTicketing != null) {
    const amount = new Prisma.Decimal(totals.grossTicketing);
    if (deal.productionLines.length === 0) {
      await prisma.productionLine.create({
        data: { dealId, kind: "REVENUE", label: "RECETTE_HT", amount },
      });
    } else if (deal.productionLines.length === 1) {
      await prisma.productionLine.update({
        where: { id: deal.productionLines[0].id },
        data: { amount },
      });
    }
  }

  await recomputeShowFinancials(dealId);
}

/**
 * Crée les séances d'une date à partir des champs historiques (création via
 * le formulaire deal) : 1 par jour coché en mois complet, sinon 1 par horaire
 * (« 21h00 / 22h30 » → 2 séances) au jour de la date.
 */
export async function seedPerformancesFromDeal(dealId: string): Promise<void> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { date: true, showTime: true, isMultiDate: true, multiDateDates: true, category: true },
  });
  if (!deal || deal.category !== "PROD_EXE") return;
  if ((await prisma.performance.count({ where: { dealId } })) > 0) return;

  const days = Array.isArray(deal.multiDateDates)
    ? (deal.multiDateDates as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const times = (deal.showTime ?? "")
    .split("/")
    .map((t) => t.trim())
    .filter(Boolean);
  const day = dayToUtcNoon(dayKey(deal.date));
  const rows =
    deal.isMultiDate && days.length > 0
      ? days.map((k) => ({ dealId, date: dayToUtcNoon(k), time: deal.showTime }))
      : (times.length ? times : [null]).map((t) => ({ dealId, date: day, time: t }));
  await prisma.performance.createMany({ data: rows });
  await syncDealFromPerformances(dealId);
}
