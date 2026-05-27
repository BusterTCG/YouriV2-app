"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PaymentStatus, Prisma, ProductionLineKind, ProductionLineLabel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { recomputeShowFinancials } from "@/lib/finance/show-financials";
import { recomputeMfForDeal } from "@/lib/management-fees-recompute";
import { PRODUCTION_LINE_KIND_OF } from "@/lib/production-line-labels";

/**
 * Server actions pour les lignes de production (Sprint 4, Prod Exécutive).
 *
 * CRUD du tableau de prod sur la fiche détail `/deals/prod-executive/[id]`.
 * Chaque mutation déclenche :
 *   1. `recomputeShowFinancials(dealId)` — met à jour grossAmount /
 *      commissionPct / commissionAmount / artistAmount sur Deal
 *   2. `recomputeMfForDeal(dealId)` — recalcule les montants snapshot MF
 *      (la marge Pangee a peut-être changé)
 *   3. revalidatePath sur la fiche deal + la page liste Prod Exé
 *
 * Toutes les actions appellent `requireUser()` (multi-user audit).
 */

// ──────────────────────────── Add ────────────────────────────

const AddProductionLineSchema = z.object({
  dealId: z.string().min(1),
  label: z.nativeEnum(ProductionLineLabel),
  /** Kind override (sinon dérivé du label via PRODUCTION_LINE_DEFAULT_KIND). */
  kind: z.nativeEnum(ProductionLineKind).optional(),
  customLabel: z.string().max(200).nullable().optional(),
  amount: z.union([z.number().nonnegative(), z.literal(null)]).optional(),
  comment: z.string().max(500).nullable().optional(),
});

export async function addProductionLine(
  input: z.infer<typeof AddProductionLineSchema>,
): Promise<ActionResult<{ id: string }>> {
  return safeAction("addProductionLine", async () => {
    await requireUser();
    const { dealId, label, kind, customLabel, amount, comment } =
      AddProductionLineSchema.parse(input);

    // Détermine l'ordre : à la fin du même kind.
    const lastInKind = await prisma.productionLine.findFirst({
      where: { dealId, deletedAt: null, kind: kind ?? PRODUCTION_LINE_KIND_OF[label] },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const nextOrder = (lastInKind?.order ?? -1) + 1;

    const created = await prisma.productionLine.create({
      data: {
        dealId,
        kind: kind ?? PRODUCTION_LINE_KIND_OF[label],
        label,
        customLabel: customLabel ?? null,
        amount: amount != null ? amount : null,
        comment: comment ?? null,
        order: nextOrder,
      },
      select: { id: true },
    });

    await recomputeShowFinancials(dealId);
    await recomputeMfForDeal(dealId);

    revalidatePath("/deals/prod-executive");
    revalidatePath(`/deals/prod-executive/${dealId}`);
    revalidatePath("/deals/management-fees");
    return { id: created.id };
  });
}

// ──────────────────────────── Update ────────────────────────────

const UpdateProductionLineSchema = z.object({
  id: z.string().min(1),
  customLabel: z.string().max(200).nullable().optional(),
  amount: z.union([z.number().nonnegative(), z.literal(null)]).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  /** Toggle binaire "Payé" (style PaidToggle). */
  isPaye: z.boolean().optional(),
  paidAt: z.coerce.date().nullable().optional(),
  comment: z.string().max(500).nullable().optional(),
  coveredByVenue: z.boolean().optional(),
});

export async function updateProductionLine(
  input: z.infer<typeof UpdateProductionLineSchema>,
): Promise<ActionResult> {
  return safeAction("updateProductionLine", async () => {
    await requireUser();
    const {
      id,
      customLabel,
      amount,
      paymentStatus,
      isPaye,
      paidAt,
      comment,
      coveredByVenue,
    } = UpdateProductionLineSchema.parse(input);

    const data: Prisma.ProductionLineUpdateInput = {};
    if (customLabel !== undefined) data.customLabel = customLabel;
    if (amount !== undefined) data.amount = amount;
    if (comment !== undefined) data.comment = comment;
    if (coveredByVenue !== undefined) data.coveredByVenue = coveredByVenue;

    if (paymentStatus !== undefined) {
      data.paymentStatus = paymentStatus;
      if (paymentStatus === PaymentStatus.PAID && paidAt === undefined) {
        const existing = await prisma.productionLine.findUnique({
          where: { id },
          select: { paidAt: true },
        });
        if (!existing?.paidAt) {
          const now = new Date();
          data.paidAt = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 12));
        }
      }
    } else if (isPaye !== undefined) {
      data.paymentStatus = isPaye ? PaymentStatus.PAID : PaymentStatus.TO_INVOICE;
      if (isPaye && paidAt === undefined) {
        const existing = await prisma.productionLine.findUnique({
          where: { id },
          select: { paidAt: true },
        });
        if (!existing?.paidAt) {
          const now = new Date();
          data.paidAt = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 12));
        }
      } else if (!isPaye && paidAt === undefined) {
        // Stan 2026-05-26 : repasser en "En cours" doit effacer la date
        // (sinon historique faussé).
        data.paidAt = null;
      }
    }
    if (paidAt !== undefined) data.paidAt = paidAt;

    const line = await prisma.productionLine.update({
      where: { id },
      data,
      select: { dealId: true },
    });

    // Recompute uniquement si la modif touche au calcul de marge
    // (amount ou coveredByVenue changent la marge ; le reste non).
    const marginChanged = amount !== undefined || coveredByVenue !== undefined;
    if (marginChanged) {
      await recomputeShowFinancials(line.dealId);
      await recomputeMfForDeal(line.dealId);
    }

    revalidatePath("/deals/prod-executive");
    revalidatePath(`/deals/prod-executive/${line.dealId}`);
    if (marginChanged) revalidatePath("/deals/management-fees");
  });
}

// ──────────────────────────── Delete ────────────────────────────

export async function deleteProductionLine(id: string): Promise<ActionResult> {
  return safeAction("deleteProductionLine", async () => {
    await requireUser();
    if (!id) throw new Error("ID ligne manquant");
    const line = await prisma.productionLine.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { dealId: true },
    });
    await recomputeShowFinancials(line.dealId);
    await recomputeMfForDeal(line.dealId);
    revalidatePath("/deals/prod-executive");
    revalidatePath(`/deals/prod-executive/${line.dealId}`);
    revalidatePath("/deals/management-fees");
  });
}

// ──────────────────────────── Upsert (API style KN) ────────────────────────────

const UpsertProductionLineSchema = z.object({
  dealId: z.string().min(1),
  kind: z.nativeEnum(ProductionLineKind),
  label: z.nativeEnum(ProductionLineLabel),
  amount: z.number().nonnegative(),
  comment: z.string().max(500).nullable().optional(),
  coveredByVenue: z.boolean().optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
});

/**
 * Upsert intelligent par (dealId, label) — pattern KN.
 *
 * - Si aucune ligne avec ce (dealId, label) actif : créer si amount > 0 OU
 *   coveredByVenue=true. Sinon no-op.
 * - Si une ligne unique avec ce (dealId, label) actif :
 *   - amount = 0 ET coveredByVenue=false → soft-delete (l'utilisateur a vidé)
 *   - sinon update les champs fournis
 * - Si plusieurs lignes (sous-entrées multi) : on update la 1re trouvée.
 *   L'éditeur multi utilise `updateProductionLineById` directement.
 */
export async function upsertProductionLine(
  input: z.infer<typeof UpsertProductionLineSchema>,
): Promise<ActionResult> {
  return safeAction("upsertProductionLine", async () => {
    await requireUser();
    const { dealId, kind, label, amount, comment, coveredByVenue, status } =
      UpsertProductionLineSchema.parse(input);

    const existing = await prisma.productionLine.findFirst({
      where: { dealId, label, deletedAt: null },
      orderBy: { order: "asc" },
      select: { id: true },
    });

    if (!existing) {
      if (amount <= 0 && !coveredByVenue) {
        // Rien à créer (champ vidé sur une catégorie qui n'avait pas de ligne).
        return;
      }
      await prisma.productionLine.create({
        data: {
          dealId,
          kind,
          label,
          amount,
          comment: comment ?? null,
          coveredByVenue: coveredByVenue ?? false,
          paymentStatus: status ?? PaymentStatus.TO_INVOICE,
        },
      });
    } else {
      // Si amount = 0 ET pas coveredByVenue → soft-delete (l'user a vidé).
      if (amount <= 0 && !coveredByVenue) {
        await prisma.productionLine.update({
          where: { id: existing.id },
          data: { deletedAt: new Date() },
        });
      } else {
        await prisma.productionLine.update({
          where: { id: existing.id },
          data: {
            amount,
            comment: comment ?? null,
            coveredByVenue: coveredByVenue ?? false,
            paymentStatus: status,
          },
        });
      }
    }

    await recomputeShowFinancials(dealId);
    await recomputeMfForDeal(dealId);
    revalidatePath("/deals/prod-executive");
    revalidatePath(`/deals/prod-executive/${dealId}`);
    revalidatePath("/deals/management-fees");
  });
}

// ──────────────────────────── Add Empty (sous-entrée multi) ────────────────────────────

const AddEmptyProductionLineSchema = z.object({
  dealId: z.string().min(1),
  kind: z.nativeEnum(ProductionLineKind),
  label: z.nativeEnum(ProductionLineLabel),
});

/**
 * Crée une ligne vide (amount=0) sur (dealId, label) — sert à passer une
 * catégorie en mode multi-sous-entrées.
 */
export async function addEmptyProductionLine(
  input: z.infer<typeof AddEmptyProductionLineSchema>,
): Promise<ActionResult> {
  return safeAction("addEmptyProductionLine", async () => {
    await requireUser();
    const { dealId, kind, label } = AddEmptyProductionLineSchema.parse(input);

    const lastInLabel = await prisma.productionLine.findFirst({
      where: { dealId, label, deletedAt: null },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const nextOrder = (lastInLabel?.order ?? -1) + 1;

    await prisma.productionLine.create({
      data: {
        dealId,
        kind,
        label,
        amount: 0,
        order: nextOrder,
      },
    });
    // Pas de recompute (amount=0 → marge inchangée).
    revalidatePath(`/deals/prod-executive/${dealId}`);
  });
}

// ──────────────────────────── Update By ID (alias) ────────────────────────────

/**
 * Alias de `updateProductionLine` avec signature plus simple — KN style :
 *   `updateProductionLineById(id, { amount, comment, status, ... })`.
 */
export async function updateProductionLineById(
  id: string,
  patch: {
    customLabel?: string | null;
    amount?: number;
    comment?: string | null;
    status?: PaymentStatus;
    coveredByVenue?: boolean;
    paidAt?: Date | null;
  },
): Promise<ActionResult> {
  return updateProductionLine({
    id,
    customLabel: patch.customLabel,
    amount: patch.amount,
    comment: patch.comment,
    paymentStatus: patch.status,
    coveredByVenue: patch.coveredByVenue,
    paidAt: patch.paidAt,
  });
}
