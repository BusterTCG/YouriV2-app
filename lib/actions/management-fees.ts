"use server";

import {
  ManagementFeeRole,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { PANGEE_TEAM } from "@/lib/pangee-team";

/**
 * Server actions pour la gestion des management fees (rémunération associés).
 *
 * Modèle métier Stan 2026-05-26 :
 *   - Pangee verse à chaque associé sélectionné un % de la marge du deal
 *   - 2 catégories : APPORT (apport d'affaires) + WORK (travail effectif)
 *   - Pool par défaut 10% pour chaque catégorie, modifiable au cas par cas
 *   - Si N associés sélectionnés → pool ÷ N pour chaque (répartition équitable)
 *   - Montant € snapshot pour préserver l'historique
 *
 * Cadre juridique : convention de prestation entre Pangee et la société
 * de chaque associé (Kuro Neko EURL / SASU Certe / etc.).
 */

/** Validation : la liste d'associés doit contenir uniquement des keys
 *  connues dans lib/pangee-team.ts. */
const VALID_KEYS = new Set(PANGEE_TEAM.map((m) => m.key));

const SetManagementFeePoolSchema = z.object({
  dealId: z.string().min(1),
  role: z.nativeEnum(ManagementFeeRole),
  /** % du pool total (default 10). */
  poolPct: z.number().min(0).max(100),
  /** Clés des associés sélectionnés (0..N parmi stan/certe/angath). */
  associateKeys: z
    .array(z.string().min(1))
    .refine((keys) => keys.every((k) => VALID_KEYS.has(k)), {
      message: "Clé associé inconnue",
    }),
  /** Marge Youri actuelle du deal pour calculer les montants snapshot. */
  margeYouri: z.number(),
});

/**
 * Set la composition complète d'une catégorie (APPORT ou WORK) pour un deal.
 *
 * Logique :
 *   1. Soft-delete des lignes existantes (deal × role) non sélectionnées
 *      OU dont sharePct/amount ne correspondent plus
 *   2. Upsert d'une ligne par associé sélectionné avec :
 *      - sharePct = poolPct ÷ N (répartition équitable)
 *      - amount   = margeYouri × sharePct / 100 (snapshot)
 *   3. Préserve les paymentStatus + paidAt existants si on resélectionne le
 *      même associé (pas de reset destructif sur un paiement déjà fait)
 *
 * Si associateKeys est vide → soft-delete toutes les lignes de la catégorie.
 */
export async function setManagementFeePool(
  input: z.infer<typeof SetManagementFeePoolSchema>,
): Promise<ActionResult> {
  return safeAction("setManagementFeePool", async () => {
    await requireUser();
    const { dealId, role, poolPct, associateKeys, margeYouri } =
      SetManagementFeePoolSchema.parse(input);

    const n = associateKeys.length;
    const sharePct = n > 0 ? poolPct / n : 0;
    // Arrondi montant à l'euro pour éviter les centimes étranges.
    const sharePctNum = Math.round(sharePct * 100) / 100; // 2 décimales max
    const amountPerAssociate =
      margeYouri > 0 ? Math.round((margeYouri * sharePctNum) / 100) : 0;

    // 1. Soft-delete des lignes non sélectionnées dans cette catégorie
    await prisma.dealManagementFee.updateMany({
      where: {
        dealId,
        role,
        deletedAt: null,
        associateKey: { notIn: associateKeys.length > 0 ? associateKeys : ["__none__"] },
      },
      data: { deletedAt: new Date() },
    });

    // 2. Upsert pour chaque associé sélectionné (préserve paymentStatus si existant)
    for (const key of associateKeys) {
      const existing = await prisma.dealManagementFee.findUnique({
        where: {
          dealId_role_associateKey: { dealId, role, associateKey: key },
        },
        select: { id: true, paymentStatus: true, paidAt: true, deletedAt: true },
      });

      if (existing) {
        // Restore + update sharePct/amount, préserve paymentStatus
        await prisma.dealManagementFee.update({
          where: { id: existing.id },
          data: {
            sharePct: sharePctNum,
            amount: amountPerAssociate,
            deletedAt: null, // restore si soft-deleted
          },
        });
      } else {
        await prisma.dealManagementFee.create({
          data: {
            dealId,
            role,
            associateKey: key,
            sharePct: sharePctNum,
            amount: amountPerAssociate,
            paymentStatus: PaymentStatus.N_A,
          },
        });
      }
    }

    // Audit Stan 2026-05-27 : un MF peut être lié à un deal Booking OU Prod Exé.
    // On revalide les deux fiches (cheap : Next ignore le path inexistant).
    revalidatePath(`/deals/booking/${dealId}`);
    revalidatePath(`/deals/prod-executive/${dealId}`);
    revalidatePath("/dashboard");
    revalidatePath("/deals/management-fees");
  });
}

// ──────────────────────────── Update paiement / notes ────────────────────────────

const UpdateManagementFeeSchema = z.object({
  id: z.string().min(1),
  /** Override manuel du montant (rare — si Stan veut ajuster au cas par cas). */
  amount: z.union([z.number().nonnegative(), z.literal(null)]).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  /** Toggle binaire pour le bouton "Payé" inline (style charges/artistes). */
  isPaye: z.boolean().optional(),
  paidAt: z.coerce.date().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function updateManagementFee(
  input: z.infer<typeof UpdateManagementFeeSchema>,
): Promise<ActionResult> {
  return safeAction("updateManagementFee", async () => {
    await requireUser();
    const { id, amount, paymentStatus, isPaye, paidAt, notes } =
      UpdateManagementFeeSchema.parse(input);

    const data: Prisma.DealManagementFeeUpdateInput = {};
    if (amount !== undefined) data.amount = amount;
    if (paymentStatus !== undefined) {
      data.paymentStatus = paymentStatus;
      if (paymentStatus === PaymentStatus.PAID && paidAt === undefined) {
        const existing = await prisma.dealManagementFee.findUnique({
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
        const existing = await prisma.dealManagementFee.findUnique({
          where: { id },
          select: { paidAt: true },
        });
        if (!existing?.paidAt) {
          const now = new Date();
          data.paidAt = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 12));
        }
      } else if (!isPaye && paidAt === undefined) {
        // Stan 2026-05-26 : repasser en "En cours" doit effacer la date
        // de paiement (sinon elle reste figée à l'ancien mois, faux historique).
        data.paidAt = null;
      }
    }
    if (paidAt !== undefined) data.paidAt = paidAt;
    if (notes !== undefined) data.notes = notes;

    const fee = await prisma.dealManagementFee.update({
      where: { id },
      data,
      select: { dealId: true },
    });
    // Audit Stan 2026-05-27 : cf. setManagementFeePool.
    revalidatePath(`/deals/booking/${fee.dealId}`);
    revalidatePath(`/deals/prod-executive/${fee.dealId}`);
    revalidatePath("/dashboard");
    revalidatePath("/deals/management-fees");
  });
}

// `recomputeManagementFeeAmounts` supprimé Stan 2026-05-27 — remplacé par
// `recomputeMfForDeal` (lib/management-fees-recompute.ts) qui discrimine
// BOOKING / PROD_EXE et calcule la marge selon la catégorie.
