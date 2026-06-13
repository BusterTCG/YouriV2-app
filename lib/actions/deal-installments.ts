"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { recomputeBudgetFromInstallments } from "@/lib/finance/deal-installments";

/**
 * Server actions de l'échéancier de paiement (BOOKING) — Stan 2026-06-13.
 *
 * CRUD inline d'une ligne DealInstallment depuis la section "Échéancier" de la
 * fiche détail deal (même pattern que DealCharge). Chaque mutation recompute
 * `budgetPaymentStatus` / `budgetPaidAt` du deal parent depuis les tranches.
 */

/** DTO chargé pour la section échéancier de la fiche détail. */
export interface DealInstallmentRow {
  id: string;
  label: string;
  amount: number | null;
  dueDate: Date | null;
  paymentStatus: PaymentStatus;
  paidAt: Date | null;
  sortOrder: number;
}

/** Lecture des échéances d'un deal, triées par ordre de saisie. */
export async function getDealInstallments(
  dealId: string,
): Promise<DealInstallmentRow[]> {
  if (!dealId) return [];
  const rows = await prisma.dealInstallment.findMany({
    where: { dealId },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    amount: r.amount != null ? Number(r.amount) : null,
    dueDate: r.dueDate,
    paymentStatus: r.paymentStatus,
    paidAt: r.paidAt,
    sortOrder: r.sortOrder,
  }));
}

// ───────── addDealInstallment ─────────

const AddInstallmentSchema = z.object({
  dealId: z.string().min(1),
  label: z.string().trim().min(1, "Libellé requis").max(120),
  amount: z.union([z.number().nonnegative(), z.literal(null)]).optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

export async function addDealInstallment(
  input: z.infer<typeof AddInstallmentSchema>,
): Promise<ActionResult<{ id: string }>> {
  return safeAction("addDealInstallment", async () => {
    await requireUser();
    const { dealId, label, amount, dueDate } = AddInstallmentSchema.parse(input);

    // Ordre = à la fin de l'échéancier actuel.
    const last = await prisma.dealInstallment.findFirst({
      where: { dealId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const nextOrder = (last?.sortOrder ?? -1) + 1;

    const created = await prisma.dealInstallment.create({
      data: {
        dealId,
        label,
        amount: amount != null ? new Prisma.Decimal(amount) : null,
        dueDate: dueDate ?? null,
        sortOrder: nextOrder,
      },
      select: { id: true },
    });
    await recomputeBudgetFromInstallments(dealId);
    revalidateBooking(dealId);
    return { id: created.id };
  });
}

// ───────── updateDealInstallment ─────────

const UpdateInstallmentSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(120).optional(),
  amount: z.union([z.number().nonnegative(), z.literal(null)]).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  /** Toggle binaire "Encaissé" : true → PAID (+ paidAt auto), false → TO_INVOICE. */
  isEncaisse: z.boolean().optional(),
  paidAt: z.coerce.date().nullable().optional(),
});

export async function updateDealInstallment(
  input: z.infer<typeof UpdateInstallmentSchema>,
): Promise<ActionResult> {
  return safeAction("updateDealInstallment", async () => {
    await requireUser();
    const { id, label, amount, dueDate, isEncaisse, paidAt } =
      UpdateInstallmentSchema.parse(input);

    const data: Prisma.DealInstallmentUpdateInput = {};
    if (label !== undefined) data.label = label;
    if (amount !== undefined)
      data.amount = amount != null ? new Prisma.Decimal(amount) : null;
    if (dueDate !== undefined) data.dueDate = dueDate;
    if (isEncaisse !== undefined) {
      data.paymentStatus = isEncaisse
        ? PaymentStatus.PAID
        : PaymentStatus.TO_INVOICE;
      if (isEncaisse && paidAt === undefined) {
        // Auto-init du mois d'encaissement : dueDate de la tranche, sinon mois
        // courant (UTC midi, convention dates de l'app).
        const existing = await prisma.dealInstallment.findUnique({
          where: { id },
          select: { paidAt: true, dueDate: true },
        });
        if (!existing?.paidAt) {
          const fallback = existing?.dueDate ?? new Date();
          data.paidAt = new Date(
            Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), 1, 12),
          );
        }
      } else if (!isEncaisse) {
        data.paidAt = null;
      }
    }
    if (paidAt !== undefined) data.paidAt = paidAt;

    const updated = await prisma.dealInstallment.update({
      where: { id },
      data,
      select: { dealId: true },
    });
    await recomputeBudgetFromInstallments(updated.dealId);
    revalidateBooking(updated.dealId);
  });
}

// ───────── removeDealInstallment ─────────

export async function removeDealInstallment(id: string): Promise<ActionResult> {
  return safeAction("removeDealInstallment", async () => {
    await requireUser();
    if (!id) throw new Error("ID échéance manquant");
    const removed = await prisma.dealInstallment.delete({
      where: { id },
      select: { dealId: true },
    });
    await recomputeBudgetFromInstallments(removed.dealId);
    revalidateBooking(removed.dealId);
  });
}

function revalidateBooking(dealId: string): void {
  revalidatePath("/dashboard");
  revalidatePath("/reporting");
  revalidatePath("/deals/booking");
  revalidatePath(`/deals/booking/${dealId}`);
}
