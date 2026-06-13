"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { getShowKeyFromLabel } from "@/lib/tasks-show-sync-utils";
import { revalidateAfterTaskMutation } from "@/lib/revalidate-helpers";

/**
 * Si la tâche correspond à une CheckPill de la fiche show (Signature contrat,
 * MEV billetterie, Gestion VHR), retourne le payload Prisma à ajouter à un
 * `deal.update` pour synchroniser le flag. Stan 2026-05-31 v4 audit : on
 * retourne un payload au lieu de faire l'update directement, pour permettre
 * un `prisma.$transaction([taskUpdate, dealUpdate])` atomique côté caller.
 *
 * @returns le `data` à passer à `prisma.deal.update`, ou null si pas de match.
 */
function buildDealFlagPatchFromTask(
  taskLabel: string,
  done: boolean,
): { contractSigned?: boolean; ticketingReady?: boolean; vhrBooked?: boolean } | null {
  const showKey = getShowKeyFromLabel(taskLabel);
  if (!showKey) return null;
  return { [showKey]: done };
}

/**
 * Server actions pour les `Task` instances (Sprint 6 — Stan 2026-05-31).
 *
 * Workflow : chaque action ajuste le statut/contenu d'une Task, déclenche
 * revalidatePath sur les pages impactées (/taches + fiche détail deal).
 */

// ───────── markTaskDone / markTaskTodo (toggle binaire) ─────────

export async function markTaskDone(id: string): Promise<ActionResult> {
  return safeAction("markTaskDone", async () => {
    const user = await requireUser();
    if (!id) throw new Error("ID tâche manquant");

    // Lecture du label avant update pour calculer le patch deal (atomique).
    const existing = await prisma.task.findUnique({
      where: { id },
      select: { dealId: true, label: true },
    });
    if (!existing) throw new Error("Tâche introuvable");

    const dealPatch = buildDealFlagPatchFromTask(existing.label, true);
    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.task.update({
        where: { id },
        data: {
          status: TaskStatus.DONE,
          doneAt: new Date(),
          doneByUserId: user.id,
        },
      }),
    ];
    if (dealPatch) {
      ops.push(
        prisma.deal.update({ where: { id: existing.dealId }, data: dealPatch }),
      );
    }
    await prisma.$transaction(ops);

    revalidateAfterTaskMutation(existing.dealId);
  });
}

export async function markTaskTodo(id: string): Promise<ActionResult> {
  return safeAction("markTaskTodo", async () => {
    await requireUser();
    if (!id) throw new Error("ID tâche manquant");

    const existing = await prisma.task.findUnique({
      where: { id },
      select: { dealId: true, label: true },
    });
    if (!existing) throw new Error("Tâche introuvable");

    const dealPatch = buildDealFlagPatchFromTask(existing.label, false);
    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.task.update({
        where: { id },
        data: {
          status: TaskStatus.TODO,
          doneAt: null,
          doneByUserId: null,
        },
      }),
    ];
    if (dealPatch) {
      ops.push(
        prisma.deal.update({ where: { id: existing.dealId }, data: dealPatch }),
      );
    }
    await prisma.$transaction(ops);

    revalidateAfterTaskMutation(existing.dealId);
  });
}

// `skipTask` supprimé Stan 2026-05-31 v4 — feature retirée de l'UI.
// L'utilisateur soit valide la tâche, soit la supprime via softDeleteTask.
// Le case `TaskStatus.SKIPPED` reste en enum Prisma pour rétrocompat avec
// les éventuelles tâches déjà skippées avant ce changement.

// ───────── updateTask (édition inline) ─────────

const UpdateTaskSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  assigneeKey: z.string().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  order: z.number().int().nonnegative().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function updateTask(
  input: z.infer<typeof UpdateTaskSchema>,
): Promise<ActionResult> {
  return safeAction("updateTask", async () => {
    await requireUser();
    const { id, ...patch } = UpdateTaskSchema.parse(input);
    const data: Prisma.TaskUpdateInput = {};
    if (patch.label !== undefined) data.label = patch.label;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.assigneeKey !== undefined) data.assigneeKey = patch.assigneeKey;
    if (patch.dueAt !== undefined) data.dueAt = patch.dueAt;
    if (patch.order !== undefined) data.order = patch.order;
    if (patch.notes !== undefined) data.notes = patch.notes;

    const updated = await prisma.task.update({
      where: { id },
      data,
      select: { dealId: true },
    });
    revalidateAfterTaskMutation(updated.dealId);
  });
}

// ───────── addTaskToDeal (tâche custom hors template) ─────────

const AddTaskToDealSchema = z.object({
  dealId: z.string().min(1),
  label: z.string().trim().min(1, "Libellé requis").max(200),
  description: z.string().max(2000).optional().nullable(),
  assigneeKey: z.string().optional().nullable(),
  dueAt: z.coerce.date().nullable().optional(),
});

export async function addTaskToDeal(
  input: z.infer<typeof AddTaskToDealSchema>,
): Promise<ActionResult<{ id: string }>> {
  return safeAction("addTaskToDeal", async () => {
    await requireUser();
    const data = AddTaskToDealSchema.parse(input);

    // Détermine l'ordre — à la fin du pipeline actuel du deal.
    const last = await prisma.task.findFirst({
      where: { dealId: data.dealId, deletedAt: null },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const nextOrder = (last?.order ?? -1) + 1;

    const created = await prisma.task.create({
      data: {
        dealId: data.dealId,
        templateId: null, // tâche custom
        order: nextOrder,
        label: data.label,
        description: data.description ?? null,
        assigneeKey: data.assigneeKey ?? null,
        dueAt: data.dueAt ?? null,
      },
      select: { id: true },
    });

    revalidateAfterTaskMutation(data.dealId);
    return { id: created.id };
  });
}

// ───────── softDeleteTask ─────────

export async function softDeleteTask(id: string): Promise<ActionResult> {
  return safeAction("softDeleteTask", async () => {
    await requireUser();
    if (!id) throw new Error("ID tâche manquant");
    const updated = await prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { dealId: true, label: true },
    });
    await logAudit({
      entity: "Task",
      entityId: id,
      action: "delete",
      summary: `Tâche supprimée : « ${updated.label} »`,
    });
    revalidateAfterTaskMutation(updated.dealId);
    revalidatePath("/trash");
  });
}

/**
 * Restaure une tâche soft-deletée depuis la corbeille. Une tâche appartient
 * toujours à un deal ; on ne la restaure que si son deal parent est vivant
 * (sinon elle reviendra via `restoreDeal`).
 */
export async function restoreTask(id: string): Promise<ActionResult> {
  return safeAction("restoreTask", async () => {
    await requireUser();
    if (!id) throw new Error("ID tâche manquant");
    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true, label: true, dealId: true, deletedAt: true, deal: { select: { deletedAt: true } } },
    });
    if (!task) throw new Error("Tâche introuvable");
    if (!task.deletedAt) throw new Error("Cette tâche n'est pas supprimée");
    if (task.deal.deletedAt) {
      throw new Error("Le deal parent est dans la corbeille — restaurez-le pour récupérer ses tâches");
    }
    await prisma.task.update({ where: { id }, data: { deletedAt: null } });
    await logAudit({
      entity: "Task",
      entityId: id,
      action: "restore",
      summary: `Tâche restaurée : « ${task.label} »`,
    });
    revalidateAfterTaskMutation(task.dealId);
    revalidatePath("/trash");
  });
}

/** Suppression DÉFINITIVE (irréversible) d'une tâche depuis la corbeille. */
export async function permanentlyDeleteTask(id: string): Promise<ActionResult> {
  return safeAction("permanentlyDeleteTask", async () => {
    await requireUser();
    if (!id) throw new Error("ID tâche manquant");
    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true, label: true, dealId: true, status: true, dueAt: true },
    });
    if (!task) throw new Error("Tâche introuvable");
    await prisma.task.delete({ where: { id } });
    await logAudit({
      entity: "Task",
      entityId: id,
      action: "permanently_delete",
      before: task,
      summary: `Tâche supprimée définitivement : « ${task.label} »`,
    });
    revalidateAfterTaskMutation(task.dealId);
    revalidatePath("/trash");
  });
}

// ───────── reorderTasks (drag&drop) ─────────

const ReorderTasksSchema = z.object({
  dealId: z.string().min(1),
  /** Liste ordonnée des IDs des tâches actives du deal (nouvel ordre). */
  taskIds: z.array(z.string().min(1)).min(1),
});

export async function reorderTasks(
  input: z.infer<typeof ReorderTasksSchema>,
): Promise<ActionResult> {
  return safeAction("reorderTasks", async () => {
    await requireUser();
    const { dealId, taskIds } = ReorderTasksSchema.parse(input);
    // Update en transaction — chaque tâche reçoit son nouvel `order` selon
    // sa position dans taskIds.
    await prisma.$transaction(
      taskIds.map((id, idx) =>
        prisma.task.update({
          where: { id },
          data: { order: idx },
        }),
      ),
    );
    revalidateAfterTaskMutation(dealId);
  });
}
