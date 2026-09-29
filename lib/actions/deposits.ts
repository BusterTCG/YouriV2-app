"use server";

// Acomptes versés aux salles (portage KN, Stan 2026-09-28) = cautions : UN par
// engagement (résidence OU date de tournée), versés puis récupérés, jamais
// imputés ni comptés dans le résultat. Warning tant que non récupérés.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { logAudit } from "@/lib/audit";

function revalidate() {
  revalidatePath("/shows", "layout");
}

const UpsertSchema = z
  .object({
    residencyId: z.string().min(1).nullable().optional(),
    dealId: z.string().min(1).nullable().optional(),
    amount: z.coerce.number().positive("Montant requis"),
    paidAt: z.coerce.date().nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .refine((d) => !!d.residencyId !== !!d.dealId, "Résidence OU date requise");

/** Crée ou met à jour l'acompte d'un engagement (résidence ou date). */
export async function upsertVenueDeposit(input: unknown): Promise<ActionResult> {
  const parsed = UpsertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation" };
  const d = parsed.data;
  return safeAction("upsertVenueDeposit", async () => {
    await requireUser();
    // Engagement actif : résidence avec au moins un mois actif, ou date de
    // production hors corbeille.
    const target = d.residencyId
      ? await prisma.residency.findFirst({
          where: { id: d.residencyId, deals: { some: { deletedAt: null } } },
          select: { id: true },
        })
      : await prisma.deal.findFirst({
          where: { id: d.dealId!, deletedAt: null, category: "PROD_EXE" },
          select: { id: true },
        });
    if (!target) throw new Error("Résidence ou date introuvable");
    const where = d.residencyId ? { residencyId: d.residencyId } : { dealId: d.dealId! };
    const existing = await prisma.venueDeposit.findFirst({ where });
    const data = {
      amount: new Prisma.Decimal(d.amount),
      paidAt: d.paidAt ?? null,
      note: d.note || null,
    };
    const dep = existing
      ? await prisma.venueDeposit.update({ where: { id: existing.id }, data })
      : await prisma.venueDeposit.create({
          data: { ...data, residencyId: d.residencyId ?? null, dealId: d.dealId ?? null },
        });
    await logAudit({
      entity: "VenueDeposit",
      entityId: dep.id,
      action: existing ? "update" : "create",
      before: existing ?? undefined,
      summary: `Acompte salle ${d.amount} €`,
    });
    revalidate();
  });
}

/** Acompte récupéré (date), ou null pour annuler. */
export async function setDepositRefunded(
  depositId: string,
  refundedAt: Date | null,
): Promise<ActionResult> {
  return safeAction("setDepositRefunded", async () => {
    await requireUser();
    const dep = await prisma.venueDeposit.update({
      where: { id: depositId },
      data: { refundedAt },
    });
    await logAudit({
      entity: "VenueDeposit",
      entityId: depositId,
      action: "update",
      summary: refundedAt
        ? `Acompte salle ${Number(dep.amount)} € récupéré le ${refundedAt.toISOString().slice(0, 10)}`
        : `Récupération de l'acompte salle ${Number(dep.amount)} € annulée`,
    });
    revalidate();
  });
}

export async function deleteVenueDeposit(depositId: string): Promise<ActionResult> {
  return safeAction("deleteVenueDeposit", async () => {
    await requireUser();
    const before = await prisma.venueDeposit.findUnique({ where: { id: depositId } });
    if (!before) throw new Error("Acompte introuvable");
    await prisma.venueDeposit.delete({ where: { id: depositId } });
    await logAudit({
      entity: "VenueDeposit",
      entityId: depositId,
      action: "delete",
      before,
      summary: `Acompte salle ${Number(before.amount)} € supprimé`,
    });
    revalidate();
  });
}
