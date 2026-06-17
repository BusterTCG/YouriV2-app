"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { recomputeMfForDeal } from "@/lib/management-fees-recompute";

/**
 * Recompute server-side d'un deal CACHETS :
 *   `Deal.budgetAmount` = Σ prestations.amount actives (CA total facturé)
 *   + normalisation du statut d'encaissement (budgetPaymentStatus / paidAt).
 *
 * Stan 2026-06-17 : on NE recalcule PLUS le cachet brut de l'artiste depuis le
 * CA — il est désormais saisi à la main (cellule vide par défaut). La marge
 * brute = Σ prestations − cachet brut est calculée à l'affichage.
 *
 * À appeler après TOUTE mutation impactant le CA :
 *   - addCachetPrestation / updateCachetPrestation / deleteCachetPrestation
 *   - updateCachetsDetails (si linkedToOwnProd change)
 */
async function recomputeCachetsBudget(dealId: string): Promise<void> {
  const prestations = await prisma.cachetPrestation.findMany({
    where: { dealId, deletedAt: null },
    select: { amount: true, paymentStatus: true, paidAt: true },
  });

  const total = prestations.reduce(
    (acc, p) => acc + (p.amount != null ? Number(p.amount) : 0),
    0,
  );

  // Stan 2026-06-11 (audit) : on normalise l'encaissement sur le deal pour que
  // le dashboard/reporting (filtre budgetPaymentStatus=PAID) captent les deals
  // CACHETS — avant ce fix ils étaient toujours invisibles. Même règle que
  // cachets-list.ts (`allPrestationsPaid`).
  const significant = prestations.filter(
    (p) => (p.amount != null ? Number(p.amount) : 0) > 0,
  );
  const allPrestationsPaid =
    significant.length > 0 &&
    significant.every((p) => p.paymentStatus === "PAID");
  let prestationsPaidAt: Date | null = null;
  for (const p of significant) {
    if (p.paymentStatus === "PAID" && p.paidAt) {
      if (!prestationsPaidAt || p.paidAt > prestationsPaidAt) {
        prestationsPaidAt = p.paidAt;
      }
    }
  }

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      budgetAmount: total > 0 ? new Prisma.Decimal(total) : null,
      budgetPaymentStatus: allPrestationsPaid ? "PAID" : "N_A",
      budgetPaidAt: allPrestationsPaid ? prestationsPaidAt : null,
    },
  });
}

/**
 * Server actions spécifiques CACHETS (Sprint 5, Stan 2026-05-28).
 *
 * Met à jour les champs spécifiques d'un deal CACHETS :
 *   - `budgetAmount` (montant facturé au prestataire/tiers)
 *   - `cachetsFeesPct` (% de gestion Pangee, défaut 10)
 *   - `linkedToOwnProd` (cachet versé dans le cadre d'un spectacle interne)
 *
 * Toute modif de ces champs déclenche `recomputeMfForDeal` car la Marge
 * Brute Pangee (= base de calcul des MF) bouge en conséquence.
 */

const UpdateCachetsDetailsSchema = z.object({
  id: z.string().min(1),
  // Note : `budgetAmount` n'est plus modifiable directement (recompute auto
  // depuis les prestations). On le garde dans le schéma au cas où on veuille
  // l'override manuellement à terme.
  budgetAmount: z
    .union([z.number().nonnegative(), z.literal(null)])
    .optional(),
  cachetsFeesPct: z
    .union([z.number().min(0).max(100), z.literal(null)])
    .optional(),
  linkedToOwnProd: z.boolean().optional(),
});

export async function updateCachetsDetails(
  input: z.infer<typeof UpdateCachetsDetailsSchema>,
): Promise<ActionResult> {
  return safeAction("updateCachetsDetails", async () => {
    await requireUser();
    const { id, budgetAmount, cachetsFeesPct, linkedToOwnProd } =
      UpdateCachetsDetailsSchema.parse(input);

    const data: Prisma.DealUpdateInput = {};
    if (budgetAmount !== undefined) {
      data.budgetAmount =
        budgetAmount != null ? new Prisma.Decimal(budgetAmount) : null;
    }
    if (cachetsFeesPct !== undefined) {
      data.cachetsFeesPct =
        cachetsFeesPct != null ? new Prisma.Decimal(cachetsFeesPct) : null;
    }
    if (linkedToOwnProd !== undefined) {
      data.linkedToOwnProd = linkedToOwnProd;
    }

    await prisma.deal.update({ where: { id }, data });

    // Tout changement impacte la marge brute Pangee → recalc MF + cachet
    // artiste (la règle de partage budget × (100 − pct)% change avec pct).
    const marginChanged =
      budgetAmount !== undefined ||
      cachetsFeesPct !== undefined ||
      linkedToOwnProd !== undefined;
    if (marginChanged) {
      await recomputeCachetsBudget(id);
      await recomputeMfForDeal(id);
    }

    revalidatePath("/dashboard");
    revalidatePath("/deals/cachets");
    revalidatePath(`/deals/cachets/${id}`);
    if (marginChanged) revalidatePath("/deals/management-fees");
  });
}

// ─────────────────────────── CRUD Prestations (Sprint 5 v2) ───────────────────────────

const AddCachetPrestationSchema = z.object({
  dealId: z.string().min(1),
  // Stan 2026-05-30 audit : autoriser "" à la création pour permettre
  // l'ajout d'une ligne vide depuis la fiche détail (édition inline ensuite).
  // La validation "nom requis" est ramenée à `updateCachetPrestation`.
  prestataire: z.string().trim().max(200).default(""),
  amount: z.union([z.number().nonnegative(), z.literal(null)]).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function addCachetPrestation(
  input: z.infer<typeof AddCachetPrestationSchema>,
): Promise<ActionResult<{ id: string }>> {
  return safeAction("addCachetPrestation", async () => {
    await requireUser();
    const data = AddCachetPrestationSchema.parse(input);

    // Détermine l'ordre — à la fin de la liste actuelle.
    const last = await prisma.cachetPrestation.findFirst({
      where: { dealId: data.dealId, deletedAt: null },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const nextOrder = (last?.order ?? -1) + 1;

    const created = await prisma.cachetPrestation.create({
      data: {
        dealId: data.dealId,
        prestataire: data.prestataire,
        amount: data.amount != null ? new Prisma.Decimal(data.amount) : null,
        notes: data.notes ?? null,
        order: nextOrder,
      },
      select: { id: true },
    });

    await recomputeCachetsBudget(data.dealId);
    await recomputeMfForDeal(data.dealId);

    revalidatePath("/dashboard");
    revalidatePath("/deals/cachets");
    revalidatePath(`/deals/cachets/${data.dealId}`);
    revalidatePath("/deals/management-fees");
    return { id: created.id };
  });
}

const UpdateCachetPrestationSchema = z.object({
  id: z.string().min(1),
  prestataire: z.string().trim().min(1).max(200).optional(),
  amount: z.union([z.number().nonnegative(), z.literal(null)]).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  isPaye: z.boolean().optional(),
  paidAt: z.coerce.date().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function updateCachetPrestation(
  input: z.infer<typeof UpdateCachetPrestationSchema>,
): Promise<ActionResult> {
  return safeAction("updateCachetPrestation", async () => {
    await requireUser();
    const { id, prestataire, amount, paymentStatus, isPaye, paidAt, notes } =
      UpdateCachetPrestationSchema.parse(input);

    const data: Prisma.CachetPrestationUpdateInput = {};
    if (prestataire !== undefined) data.prestataire = prestataire;
    if (amount !== undefined) {
      data.amount = amount != null ? new Prisma.Decimal(amount) : null;
    }
    if (notes !== undefined) data.notes = notes;

    if (paymentStatus !== undefined) {
      data.paymentStatus = paymentStatus;
      if (paymentStatus === PaymentStatus.PAID && paidAt === undefined) {
        const existing = await prisma.cachetPrestation.findUnique({
          where: { id },
          select: { paidAt: true },
        });
        if (!existing?.paidAt) {
          const now = new Date();
          data.paidAt = new Date(
            Date.UTC(now.getFullYear(), now.getMonth(), 1, 12),
          );
        }
      }
    } else if (isPaye !== undefined) {
      data.paymentStatus = isPaye ? PaymentStatus.PAID : PaymentStatus.TO_INVOICE;
      if (isPaye && paidAt === undefined) {
        const existing = await prisma.cachetPrestation.findUnique({
          where: { id },
          select: { paidAt: true },
        });
        if (!existing?.paidAt) {
          const now = new Date();
          data.paidAt = new Date(
            Date.UTC(now.getFullYear(), now.getMonth(), 1, 12),
          );
        }
      } else if (!isPaye && paidAt === undefined) {
        data.paidAt = null;
      }
    }
    if (paidAt !== undefined) data.paidAt = paidAt;

    const updated = await prisma.cachetPrestation.update({
      where: { id },
      data,
      select: { dealId: true },
    });

    // Stan 2026-06-11 (audit) : le budget se recalcule si le montant OU
    // l'encaissement change (le recompute pose désormais budgetPaymentStatus/
    // budgetPaidAt utilisés par dashboard/reporting). La marge (MF) ne dépend
    // que du montant.
    const paymentChanged =
      paymentStatus !== undefined ||
      isPaye !== undefined ||
      paidAt !== undefined;
    if (amount !== undefined || paymentChanged) {
      await recomputeCachetsBudget(updated.dealId);
    }
    if (amount !== undefined) {
      await recomputeMfForDeal(updated.dealId);
    }

    revalidatePath("/dashboard");
    revalidatePath("/deals/cachets");
    revalidatePath(`/deals/cachets/${updated.dealId}`);
    if (amount !== undefined) revalidatePath("/deals/management-fees");
  });
}

export async function deleteCachetPrestation(id: string): Promise<ActionResult> {
  return safeAction("deleteCachetPrestation", async () => {
    await requireUser();
    if (!id) throw new Error("ID prestation manquant");
    const presta = await prisma.cachetPrestation.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { dealId: true },
    });
    await recomputeCachetsBudget(presta.dealId);
    await recomputeMfForDeal(presta.dealId);
    revalidatePath("/dashboard");
    revalidatePath("/deals/cachets");
    revalidatePath(`/deals/cachets/${presta.dealId}`);
    revalidatePath("/deals/management-fees");
  });
}

// ─────────────────────────── Batch create (form création deal) ───────────────────────────

const BatchCreatePrestationsSchema = z.object({
  dealId: z.string().min(1),
  prestations: z.array(
    z.object({
      prestataire: z.string().trim().min(1).max(200),
      amount: z.union([z.number().nonnegative(), z.literal(null)]),
    }),
  ),
});

/**
 * Crée plusieurs prestations en batch pour un deal — utilisé par le form de
 * création (l'user saisit N prestations dans le dialog avant de submit).
 */
export async function batchCreateCachetPrestations(
  input: z.infer<typeof BatchCreatePrestationsSchema>,
): Promise<ActionResult> {
  return safeAction("batchCreateCachetPrestations", async () => {
    await requireUser();
    const { dealId, prestations } = BatchCreatePrestationsSchema.parse(input);
    if (prestations.length === 0) return;

    await prisma.cachetPrestation.createMany({
      data: prestations.map((p, idx) => ({
        dealId,
        prestataire: p.prestataire,
        amount: p.amount != null ? new Prisma.Decimal(p.amount) : null,
        order: idx,
      })),
    });

    await recomputeCachetsBudget(dealId);
    await recomputeMfForDeal(dealId);

    revalidatePath("/dashboard");
    revalidatePath("/deals/cachets");
    revalidatePath(`/deals/cachets/${dealId}`);
    revalidatePath("/deals/management-fees");
  });
}
