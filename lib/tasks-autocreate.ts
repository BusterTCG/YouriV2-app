import "server-only";

import { DealCategory } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Auto-création des `Task` d'un deal à partir des `TaskTemplate` actifs de
 * sa catégorie (Sprint 6 — Stan 2026-05-31).
 *
 * Stan 2026-05-31 v4 audit : appelée depuis `createDeal` après le `deal.create`.
 * Le caller gère le rollback manuel (delete du deal) si cette fonction throw,
 * pour éviter qu'un deal existe sans son pipeline de tâches. Transaction
 * interactive Prisma volontairement non utilisée (incompatible avec client
 * étendu via `$extends`).
 *
 * Snapshot intégral : label, description, assigneeKey copiés du template au
 * moment du create. Pas d'auto-calcul `dueAt` (feature retirée v2).
 *
 * Note : ne crée RIEN si aucun template actif pour la catégorie — c'est OK,
 * Stan ajoutera manuellement via `addTaskToDeal` ou via /settings/templates.
 */
export async function autoCreateTasksForDeal(
  dealId: string,
  category: DealCategory,
  dealDate: Date,
): Promise<void> {
  void dealDate; // conservé en signature (cf. doc)

  const templates = await prisma.taskTemplate.findMany({
    where: { category, deletedAt: null },
    orderBy: { order: "asc" },
  });
  if (templates.length === 0) return;

  await prisma.task.createMany({
    data: templates.map((t) => ({
      dealId,
      templateId: t.id,
      order: t.order,
      label: t.label,
      description: t.description,
      assigneeKey: t.defaultAssigneeKey,
      dueAt: null,
    })),
  });
}
