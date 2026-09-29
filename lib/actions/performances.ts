"use server";

// Actions Séances (portage KN, étape 2 — Stan 2026-09-29) : ajout, édition
// inline (horaire, jauge, payants, invités, billetterie HT), annulation,
// suppression. Après chaque mutation, les champs dérivés du Deal et les
// financials de la production sont recalculés (lib/performances.ts).

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { dayToUtcNoon, syncDealFromPerformances } from "@/lib/performances";
import { revalidateAllDealRoutes } from "@/lib/revalidate-deals";

function revalidateShows(dealId: string) {
  revalidatePath("/shows", "layout");
  revalidatePath("/dashboard");
  revalidateAllDealRoutes(dealId, true);
}

function firstIssue(e: z.ZodError): ActionResult<never> {
  return { ok: false, error: e.issues[0]?.message ?? "Validation" };
}

const DayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");

const AddSchema = z.object({
  dealId: z.string().min(1),
  items: z
    .array(z.object({ day: DayKey, time: z.string().max(20).nullable().optional() }))
    .min(1)
    .max(200),
});

/** Ajoute une ou plusieurs séances à une date / un mois de résidence. */
export async function addPerformances(input: unknown): Promise<ActionResult<{ count: number }>> {
  const parsed = AddSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  return safeAction("addPerformances", async () => {
    await requireUser();
    const { dealId, items } = parsed.data;
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, deletedAt: null },
      select: { id: true },
    });
    if (!deal) throw new Error("Date introuvable");
    await prisma.performance.createMany({
      data: items.map((i) => ({ dealId, date: dayToUtcNoon(i.day), time: i.time?.trim() || null })),
    });
    await syncDealFromPerformances(dealId);
    revalidateShows(dealId);
    return { count: items.length };
  });
}

const UpdateSchema = z.object({
  day: DayKey.optional(),
  time: z.string().max(20).nullable().optional(),
  capacity: z.coerce.number().int().nonnegative().nullable().optional(),
  paying: z.coerce.number().int().nonnegative().nullable().optional(),
  invited: z.coerce.number().int().nonnegative().nullable().optional(),
  grossTicketing: z.coerce.number().nonnegative().nullable().optional(),
  cancelled: z.boolean().optional(),
});

/** Édition inline d'une séance. */
export async function updatePerformance(id: string, input: unknown): Promise<ActionResult> {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  return safeAction("updatePerformance", async () => {
    await requireUser();
    const d = parsed.data;
    const perf = await prisma.performance.update({
      where: { id },
      data: {
        ...(d.day !== undefined ? { date: dayToUtcNoon(d.day) } : {}),
        ...(d.time !== undefined ? { time: d.time?.trim() || null } : {}),
        ...(d.capacity !== undefined ? { capacity: d.capacity } : {}),
        ...(d.paying !== undefined ? { paying: d.paying } : {}),
        ...(d.invited !== undefined ? { invited: d.invited } : {}),
        ...(d.grossTicketing !== undefined
          ? { grossTicketing: d.grossTicketing == null ? null : new Prisma.Decimal(d.grossTicketing) }
          : {}),
        ...(d.cancelled !== undefined ? { cancelled: d.cancelled } : {}),
      },
    });
    await syncDealFromPerformances(perf.dealId);
    revalidateShows(perf.dealId);
  });
}

/** Supprime une séance (une date garde toujours au moins une séance). */
export async function deletePerformance(id: string): Promise<ActionResult> {
  return safeAction("deletePerformance", async () => {
    await requireUser();
    const perf = await prisma.performance.findUnique({ where: { id } });
    if (!perf) throw new Error("Séance introuvable");
    const count = await prisma.performance.count({ where: { dealId: perf.dealId } });
    if (count <= 1) {
      throw new Error("Une date garde au moins une séance — annule-la plutôt, ou supprime la date.");
    }
    await prisma.performance.delete({ where: { id } });
    await logAudit({
      entity: "Performance",
      entityId: id,
      action: "delete",
      before: perf,
      summary: `Séance du ${perf.date.toISOString().slice(0, 10)} supprimée`,
    });
    await syncDealFromPerformances(perf.dealId);
    revalidateShows(perf.dealId);
  });
}
