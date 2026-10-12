"use server";

// Compte artiste (portage KN, Stan 2026-09-28) : quote-parts versées à
// l'artiste et remboursements de l'artiste, par production. Chaque mouvement
// resynchronise les statuts artiste dérivés des dates (Deal.artistStatus).
// Frais avancés par l'artiste (Stan 2026-10-12) : remboursés avec une
// quote-part (frais cochés → advanceAmount) ou par un versement séparé
// (EXPENSES). Les frais remboursés pointent vers leur versement.
// Argent reçu de l'artiste : remboursement (REFUND, solde d'exploitation) ou
// avance de trésorerie (CASH_ADVANCE, à lui rendre comme les frais).

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { ArtistMovementKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { syncArtistStatuses } from "@/lib/finance/artist-account-server";
import { ARTIST_MOVEMENT_LABEL } from "@/lib/finance/artist-account";
import {
  getProductionOverheadAllocation,
  recomputeProductionFinancials,
} from "@/lib/finance/show-financials";
import { revalidateAllDealRoutes } from "@/lib/revalidate-deals";

async function after(productionId: string) {
  await syncArtistStatuses(productionId);
  const p = await prisma.production.findUnique({
    where: { id: productionId },
    select: { artist: { select: { slug: true } } },
  });
  revalidatePath("/shows", "layout");
  revalidatePath("/dashboard");
  revalidateAllDealRoutes(undefined, true);
  if (p) revalidatePath(`/artistes/${p.artist.slug}`);
}

const MOVEMENT_LABEL = ARTIST_MOVEMENT_LABEL;

/** Frais avancés cochés (charges des dates / frais généraux). */
const AdvancesSchema = z
  .object({
    lines: z.array(z.string().min(1)).default([]),
    overheads: z.array(z.string().min(1)).default([]),
    /** Avances de trésorerie (mouvements CASH_ADVANCE) rendues. */
    cash: z.array(z.string().min(1)).default([]),
  })
  .optional();
type Advances = z.infer<typeof AdvancesSchema>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Vérifie les frais cochés (production, avancés, pas encore remboursés) → total. */
async function advancesTotal(productionId: string, adv: Advances): Promise<number> {
  const lineIds = adv?.lines ?? [];
  const overheadIds = adv?.overheads ?? [];
  const cashIds = adv?.cash ?? [];
  const [lines, overheads, cash] = await Promise.all([
    lineIds.length
      ? prisma.productionLine.findMany({
          where: {
            id: { in: lineIds },
            paidByArtist: true,
            artistRefundId: null,
            deletedAt: null,
            deal: { productionId, deletedAt: null },
          },
          select: { amount: true },
        })
      : [],
    overheadIds.length
      ? prisma.productionOverhead.findMany({
          where: { id: { in: overheadIds }, productionId, paidByArtist: true, artistRefundId: null },
          select: { amount: true },
        })
      : [],
    cashIds.length
      ? prisma.artistMovement.findMany({
          where: { id: { in: cashIds }, productionId, kind: "CASH_ADVANCE", repaidById: null },
          select: { amount: true },
        })
      : [],
  ]);
  if (
    lines.length !== lineIds.length ||
    overheads.length !== overheadIds.length ||
    cash.length !== cashIds.length
  ) {
    throw new Error("Frais / avance introuvable ou déjà remboursé");
  }
  return round2(
    lines.reduce((s, l) => s + Number(l.amount ?? 0), 0) +
      overheads.reduce((s, o) => s + Number(o.amount), 0) +
      cash.reduce((s, m) => s + Number(m.amount), 0),
  );
}

/** Rattache les frais au versement qui les rembourse (passés « Payé »). */
async function linkAdvances(movementId: string, date: Date, adv: Advances) {
  const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
  if (adv?.lines.length) {
    await prisma.productionLine.updateMany({
      where: { id: { in: adv.lines } },
      data: { artistRefundId: movementId, paymentStatus: "PAID", paidAt: month },
    });
  }
  if (adv?.overheads.length) {
    await prisma.productionOverhead.updateMany({
      where: { id: { in: adv.overheads } },
      data: { artistRefundId: movementId, status: "PAID", paidAt: date },
    });
  }
  if (adv?.cash.length) {
    await prisma.artistMovement.updateMany({
      where: { id: { in: adv.cash } },
      data: { repaidById: movementId },
    });
  }
}

const Schema = z.object({
  productionId: z.string().min(1),
  kind: z.nativeEnum(ArtistMovementKind),
  amount: z.coerce.number().min(0),
  date: z.coerce.date(),
  note: z.string().max(300).nullable().optional(),
  advances: AdvancesSchema,
});

export async function addArtistMovement(input: unknown): Promise<ActionResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation" };
  const d = parsed.data;
  return safeAction("addArtistMovement", async () => {
    await requireUser();
    const adv = d.kind === "REFUND" || d.kind === "CASH_ADVANCE" ? undefined : d.advances;
    const advance = await advancesTotal(d.productionId, adv);
    // Remboursement de frais / avances : au plus le total coché (l'excédent sur
    // un déficit d'exploitation) ; sans montant = total coché.
    const amount = d.kind === "EXPENSES" && d.amount <= 0 ? advance : d.amount;
    if (d.kind === "EXPENSES" && advance <= 0) throw new Error("Coche au moins un frais ou une avance");
    if (d.kind === "EXPENSES" && amount > advance + 0.005) {
      throw new Error("Montant supérieur aux frais / avances cochés");
    }
    if (amount <= 0) throw new Error("Montant requis");
    if (amount + 0.005 < advance) throw new Error("Montant inférieur aux frais cochés");
    const m = await prisma.artistMovement.create({
      data: {
        productionId: d.productionId,
        kind: d.kind,
        amount: new Prisma.Decimal(amount),
        advanceAmount: new Prisma.Decimal(d.kind === "EXPENSES" ? amount : advance),
        date: d.date,
        note: d.note || null,
      },
    });
    await linkAdvances(m.id, d.date, adv);
    await logAudit({
      entity: "ArtistMovement",
      entityId: m.id,
      action: "create",
      summary: `${MOVEMENT_LABEL[d.kind]} ${amount} €${
        d.kind === "PAYMENT" && advance > 0 ? ` (dont frais avancés ${advance} €)` : ""
      }`,
    });
    await after(d.productionId);
  });
}

export async function deleteArtistMovement(id: string): Promise<ActionResult> {
  return safeAction("deleteArtistMovement", async () => {
    await requireUser();
    const before = await prisma.artistMovement.findUnique({ where: { id } });
    if (!before) throw new Error("Mouvement introuvable");
    if (before.repaidById) {
      throw new Error("Avance déjà rendue à l'artiste : supprime d'abord le versement qui la rend");
    }
    // Le versement soldait des dates : elles sont rouvertes (quote-part de
    // frais généraux de nouveau répartie).
    const reopened = await prisma.deal.updateMany({
      where: { settledMovementId: id },
      data: { settledAt: null, settledOverheadShare: null, settledMovementId: null },
    });
    // Frais avancés qu'il remboursait : de nouveau à rembourser.
    await prisma.productionLine.updateMany({
      where: { artistRefundId: id },
      data: { artistRefundId: null, paymentStatus: "TO_INVOICE", paidAt: null },
    });
    await prisma.productionOverhead.updateMany({
      where: { artistRefundId: id },
      data: { artistRefundId: null, status: "TO_INVOICE", paidAt: null },
    });
    await prisma.artistMovement.delete({ where: { id } });
    if (reopened.count > 0) await recomputeProductionFinancials(before.productionId);
    await logAudit({
      entity: "ArtistMovement",
      entityId: id,
      action: "delete",
      before,
      summary: `Mouvement du compte artiste supprimé (${Number(before.amount)} €)`,
    });
    await after(before.productionId);
  });
}

// ────────── Solder des dates (lot 3, Stan 2026-10-01 — portage KN) ──────────

const SettleSchema = z.object({
  productionId: z.string().min(1),
  dealIds: z.array(z.string().min(1)).min(1, "Coche au moins une date"),
  /** Quote-part versée (0 = solder sans versement, ex. date en perte). */
  amount: z.coerce.number().min(0),
  date: z.coerce.date(),
  note: z.string().max(300).nullable().optional(),
  /** Frais avancés remboursés avec ce versement (inclus dans `amount`). */
  advances: AdvancesSchema,
});

/**
 * Appel de quote-part : verse `amount` à l'artiste et SOLDE les dates cochées
 * (dates jouées de la production). Chaque date soldée fige sa quote-part de
 * frais généraux et sort des listes « à solder ».
 */
export async function settleDatesWithPayment(input: unknown): Promise<ActionResult> {
  const parsed = SettleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation" };
  const d = parsed.data;
  return safeAction("settleDatesWithPayment", async () => {
    await requireUser();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const deals = await prisma.deal.findMany({
      where: { id: { in: d.dealIds }, productionId: d.productionId, category: "PROD_EXE", deletedAt: null },
      select: {
        id: true,
        title: true,
        date: true,
        settledAt: true,
        performances: { where: { cancelled: false }, select: { date: true } },
      },
    });
    if (deals.length !== d.dealIds.length) throw new Error("Date introuvable dans cette production");
    for (const deal of deals) {
      if (deal.settledAt) throw new Error(`« ${deal.title} » est déjà soldée`);
      const last = deal.performances.length
        ? new Date(Math.max(...deal.performances.map((p) => p.date.getTime())))
        : deal.date;
      if (last.getTime() >= startOfToday.getTime()) throw new Error(`« ${deal.title} » n'est pas encore jouée`);
    }
    const advance = await advancesTotal(d.productionId, d.advances);
    if (d.amount + 0.005 < advance) throw new Error("Montant inférieur aux frais cochés");
    const movement =
      d.amount > 0
        ? await prisma.artistMovement.create({
            data: {
              productionId: d.productionId,
              kind: "PAYMENT",
              amount: new Prisma.Decimal(d.amount),
              advanceAmount: new Prisma.Decimal(advance),
              date: d.date,
              note: d.note || null,
            },
          })
        : null;
    if (movement) await linkAdvances(movement.id, d.date, d.advances);
    // Quote-part de frais généraux figée à sa valeur actuelle.
    const allocation = await getProductionOverheadAllocation(d.productionId);
    for (const deal of deals) {
      await prisma.deal.update({
        where: { id: deal.id },
        data: {
          settledAt: d.date,
          settledOverheadShare: new Prisma.Decimal(allocation.byDeal.get(deal.id) ?? 0),
          settledMovementId: movement?.id ?? null,
        },
      });
    }
    await logAudit({
      entity: "Production",
      entityId: d.productionId,
      action: "update",
      summary: `${deals.length} date${deals.length > 1 ? "s" : ""} soldée${deals.length > 1 ? "s" : ""}${
        movement ? ` — quote-part versée ${d.amount} €` : " sans versement"
      }${advance > 0 ? ` (dont frais avancés ${advance} €)` : ""}`,
    });
    await recomputeProductionFinancials(d.productionId);
    await after(d.productionId);
  });
}

/** Rouvre une date soldée (sa quote-part de frais généraux redevient répartie). */
export async function reopenSettledDeal(dealId: string): Promise<ActionResult> {
  return safeAction("reopenSettledDeal", async () => {
    await requireUser();
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { productionId: true, title: true, settledAt: true },
    });
    if (!deal?.productionId || !deal.settledAt) throw new Error("Date non soldée");
    await prisma.deal.update({
      where: { id: dealId },
      data: { settledAt: null, settledOverheadShare: null, settledMovementId: null },
    });
    await logAudit({
      entity: "Deal",
      entityId: dealId,
      action: "update",
      summary: `Date « ${deal.title} » rouverte (n'est plus soldée)`,
    });
    await recomputeProductionFinancials(deal.productionId);
    await after(deal.productionId);
  });
}
