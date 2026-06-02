"use server";

import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import {
  labelMatchesShowKey,
  type ShowTaskKey,
} from "@/lib/tasks-show-sync-utils";
import { revalidateAfterTaskMutation } from "@/lib/revalidate-helpers";

export type { ShowTaskKey };

/**
 * Synchronisation Show → Tâches (sens fiche → pipeline).
 *
 * Quand l'user toggle un flag opérationnel sur la fiche show (CheckPills
 * "Signature contrat" / "MEV billetterie" / "Gestion VHR"), on synchronise
 * la tâche correspondante du pipeline en DONE/TODO.
 *
 * Le sens inverse (pipeline → fiche show) est géré dans `markTaskDone` /
 * `markTaskTodo` (lib/actions/tasks.ts).
 */
export async function syncShowTaskToggle(
  dealId: string,
  showKey: ShowTaskKey,
  isDone: boolean,
): Promise<ActionResult> {
  return safeAction("syncShowTaskToggle", async () => {
    const user = await requireUser();
    if (!dealId) throw new Error("dealId manquant");

    // Audit Stan 2026-05-31 : on n'écrase PAS les tâches SKIPPED (l'user a
    // explicitement marqué la tâche comme "non applicable"). On exclut aussi
    // les tâches dont le statut cible == statut actuel (évite des updates
    // inutiles et préserve l'audit `doneByUserId`).
    const targetStatus = isDone ? TaskStatus.DONE : TaskStatus.TODO;
    const tasks = await prisma.task.findMany({
      where: {
        dealId,
        deletedAt: null,
        status: { not: TaskStatus.SKIPPED },
      },
      select: { id: true, label: true, status: true },
    });
    const matching = tasks.filter(
      (t) =>
        labelMatchesShowKey(t.label, showKey) && t.status !== targetStatus,
    );
    if (matching.length === 0) return; // pas de tâche → no-op

    await prisma.task.updateMany({
      where: { id: { in: matching.map((t) => t.id) } },
      data: isDone
        ? {
            status: TaskStatus.DONE,
            doneAt: new Date(),
            doneByUserId: user.id,
          }
        : {
            status: TaskStatus.TODO,
            doneAt: null,
            doneByUserId: null,
          },
    });

    revalidateAfterTaskMutation(dealId);
  });
}
