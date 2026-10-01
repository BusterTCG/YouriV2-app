"use server";

// Compte artiste (portage KN, Stan 2026-09-28) : quote-parts versées à
// l'artiste et remboursements de l'artiste, par production. Chaque mouvement
// resynchronise les statuts artiste dérivés des dates (Deal.artistStatus).

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { ArtistMovementKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { syncArtistStatuses } from "@/lib/finance/artist-account-server";
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

const Schema = z.object({
  productionId: z.string().min(1),
  kind: z.nativeEnum(ArtistMovementKind),
  amount: z.coerce.number().positive("Montant requis"),
  date: z.coerce.date(),
  note: z.string().max(300).nullable().optional(),
});

export async function addArtistMovement(input: unknown): Promise<ActionResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation" };
  const d = parsed.data;
  return safeAction("addArtistMovement", async () => {
    await requireUser();
    const m = await prisma.artistMovement.create({
      data: {
        productionId: d.productionId,
        kind: d.kind,
        amount: new Prisma.Decimal(d.amount),
        date: d.date,
        note: d.note || null,
      },
    });
    await logAudit({
      entity: "ArtistMovement",
      entityId: m.id,
      action: "create",
      summary: `${d.kind === "PAYMENT" ? "Quote-part versée à l'artiste" : "Remboursement de l'artiste"} ${d.amount} €`,
    });
    await after(d.productionId);
  });
}

export async function deleteArtistMovement(id: string): Promise<ActionResult> {
  return safeAction("deleteArtistMovement", async () => {
    await requireUser();
    const before = await prisma.artistMovement.findUnique({ where: { id } });
    if (!before) throw new Error("Mouvement introuvable");
    // Le versement soldait des dates : elles sont rouvertes (quote-part de
    // frais généraux de nouveau répartie).
    const reopened = await prisma.deal.updateMany({
      where: { settledMovementId: id },
      data: { settledAt: null, settledOverheadShare: null, settledMovementId: null },
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
    const movement =
      d.amount > 0
        ? await prisma.artistMovement.create({
            data: {
              productionId: d.productionId,
              kind: "PAYMENT",
              amount: new Prisma.Decimal(d.amount),
              date: d.date,
              note: d.note || null,
            },
          })
        : null;
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
      }`,
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
