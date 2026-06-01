"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DealCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";

/**
 * Server actions pour les TaskTemplate — Sprint 6 (Stan 2026-05-31).
 *
 * Règle Stan validée : modifier un template ne propage PAS aux deals
 * existants (les Task sont snapshot au moment de la création du deal).
 * Garantit la prédictibilité et l'historique.
 *
 * À terme : restreindre à `requireAdmin()` (cf. ROLE_ADMIN). Pour le MVP
 * Sprint 6 on laisse `requireUser` — tous les associés peuvent éditer.
 */

const CreateTemplateSchema = z.object({
  category: z.nativeEnum(DealCategory),
  label: z.string().trim().min(1, "Libellé requis").max(200),
  description: z.string().max(2000).optional().nullable(),
  defaultAssigneeKey: z.string().optional().nullable(),
  defaultDueOffsetDays: z.number().int().optional().nullable(),
  /** Position dans le pipeline. Si omis → ajouté à la fin. */
  order: z.number().int().nonnegative().optional(),
});

export async function createTaskTemplate(
  input: z.infer<typeof CreateTemplateSchema>,
): Promise<ActionResult<{ id: string }>> {
  return safeAction("createTaskTemplate", async () => {
    await requireUser();
    const data = CreateTemplateSchema.parse(input);

    // Détermine l'ordre — à la fin du pipeline actuel de la catégorie.
    let order = data.order;
    if (order == null) {
      const last = await prisma.taskTemplate.findFirst({
        where: { category: data.category, deletedAt: null },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      order = (last?.order ?? -1) + 1;
    }

    const created = await prisma.taskTemplate.create({
      data: {
        category: data.category,
        label: data.label,
        description: data.description ?? null,
        defaultAssigneeKey: data.defaultAssigneeKey ?? null,
        defaultDueOffsetDays: data.defaultDueOffsetDays ?? null,
        order,
      },
      select: { id: true },
    });

    revalidatePath("/settings/templates");
    return { id: created.id };
  });
}

const UpdateTemplateSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  defaultAssigneeKey: z.string().nullable().optional(),
  defaultDueOffsetDays: z.number().int().nullable().optional(),
  order: z.number().int().nonnegative().optional(),
});

export async function updateTaskTemplate(
  input: z.infer<typeof UpdateTemplateSchema>,
): Promise<ActionResult> {
  return safeAction("updateTaskTemplate", async () => {
    await requireUser();
    const { id, ...patch } = UpdateTemplateSchema.parse(input);
    const data: Prisma.TaskTemplateUpdateInput = {};
    if (patch.label !== undefined) data.label = patch.label;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.defaultAssigneeKey !== undefined)
      data.defaultAssigneeKey = patch.defaultAssigneeKey;
    if (patch.defaultDueOffsetDays !== undefined)
      data.defaultDueOffsetDays = patch.defaultDueOffsetDays;
    if (patch.order !== undefined) data.order = patch.order;

    await prisma.taskTemplate.update({ where: { id }, data });
    revalidatePath("/settings/templates");
  });
}

export async function softDeleteTaskTemplate(id: string): Promise<ActionResult> {
  return safeAction("softDeleteTaskTemplate", async () => {
    await requireUser();
    if (!id) throw new Error("ID template manquant");
    await prisma.taskTemplate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    revalidatePath("/settings/templates");
  });
}

const ReorderTemplatesSchema = z.object({
  category: z.nativeEnum(DealCategory),
  templateIds: z.array(z.string().min(1)).min(1),
});

export async function reorderTaskTemplates(
  input: z.infer<typeof ReorderTemplatesSchema>,
): Promise<ActionResult> {
  return safeAction("reorderTaskTemplates", async () => {
    await requireUser();
    const { templateIds } = ReorderTemplatesSchema.parse(input);
    await prisma.$transaction(
      templateIds.map((id, idx) =>
        prisma.taskTemplate.update({
          where: { id },
          data: { order: idx },
        }),
      ),
    );
    revalidatePath("/settings/templates");
  });
}
