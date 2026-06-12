import "server-only";

import { prisma } from "@/lib/db";
import { DealCategory, type TaskStatus } from "@prisma/client";

/**
 * Lectures `Task` pour les pages — server-only.
 *
 * Pattern Sprint 6 (Stan 2026-05-31) : pour chaque user, on n'affiche
 * dans sa todo QUE la 1re tâche TODO assignée à lui dans chaque deal
 * (workflow séquentiel). Au validate → la suivante apparait.
 */

export interface TaskWithDeal {
  id: string;
  dealId: string;
  templateId: string | null;
  order: number;
  label: string;
  description: string | null;
  assigneeKey: string | null;
  status: TaskStatus;
  dueAt: Date | null;
  doneAt: Date | null;
  doneByUserId: string | null;
  notes: string | null;
  deal: {
    id: string;
    title: string;
    date: Date;
    category: DealCategory;
    status: string;
    venueName: string | null;
    venueCity: string | null;
  };
  doneBy: { id: string; name: string } | null;
}

// Sélection commune deal (factorisé)
const DEAL_SELECT = {
  id: true,
  title: true,
  date: true,
  category: true,
  status: true,
  venueName: true,
  venueCity: true,
} as const;

/**
 * Tâches courantes d'un user — Stan 2026-05-31 v2.
 *
 * Workflow séquentiel STRICT : pour chaque deal actif, la 1re tâche TODO
 * du deal (peu importe l'assignée) est la "tâche courante". L'user ne voit
 * cette tâche dans sa todo QUE si elle lui est assignée.
 *
 * Conséquence : si la 1re TODO d'un deal est assignée à Certe, Stan ne voit
 * PAS ce deal dans "Mes tâches courantes" tant que Certe n'a pas validé.
 * Ses tâches ultérieures sur ce deal seront affichées dans `getUpcomingTasks`.
 */
export async function getCurrentTasksForAssignee(
  assigneeKey: string,
): Promise<TaskWithDeal[]> {
  // Étape 1 : 1re TODO de chaque deal actif (toutes assignations confondues)
  const firstTodoByDeal = await getFirstTodoPerDeal();
  // Étape 2 : filtrer celles qui sont assignées à l'user
  return firstTodoByDeal.filter((t) => t.assigneeKey === assigneeKey);
}

/**
 * Tâches "À venir" d'un user — Stan 2026-05-31 v2.
 *
 * Tâches TODO assignées à l'user dont le tour n'est pas encore venu
 * (= une autre tâche TODO existe AVANT dans le même deal, assignée à
 * quelqu'un d'autre). Inclut un champ `blockedBy` indiquant qui doit
 * valider en premier.
 */
export interface UpcomingTask extends TaskWithDeal {
  /** Tâche qui bloque actuellement le pipeline (1re TODO du deal). */
  blockedBy: {
    label: string;
    assigneeKey: string | null;
  };
}

export async function getUpcomingTasksForAssignee(
  assigneeKey: string,
): Promise<UpcomingTask[]> {
  // Fetch toutes mes TODO + récupérer les dealIds concernés
  const myTodos = await prisma.task.findMany({
    where: {
      assigneeKey,
      status: "TODO",
      deletedAt: null,
      deal: { deletedAt: null, status: { not: "ANNULE" } },
    },
    orderBy: [{ dealId: "asc" }, { order: "asc" }],
    include: {
      deal: { select: DEAL_SELECT },
      doneBy: { select: { id: true, name: true } },
    },
  });
  if (myTodos.length === 0) return [];

  // Pour chaque deal concerné, trouver la 1re TODO (toutes assignations)
  const dealIds = [...new Set(myTodos.map((t) => t.dealId))];
  const allTodosInMyDeals = await prisma.task.findMany({
    where: {
      dealId: { in: dealIds },
      status: "TODO",
      deletedAt: null,
    },
    orderBy: [{ dealId: "asc" }, { order: "asc" }],
    select: {
      id: true,
      dealId: true,
      label: true,
      assigneeKey: true,
      order: true,
    },
  });

  const firstTodoByDeal = new Map<
    string,
    { id: string; label: string; assigneeKey: string | null }
  >();
  for (const t of allTodosInMyDeals) {
    if (!firstTodoByDeal.has(t.dealId)) {
      firstTodoByDeal.set(t.dealId, {
        id: t.id,
        label: t.label,
        assigneeKey: t.assigneeKey,
      });
    }
  }

  // Filtre Stan 2026-05-31 v3 :
  //   - 1 seule tâche "À venir" par deal (la prochaine pour l'user, pas
  //     toutes les suivantes)
  //   - Uniquement si la 1re TODO du deal est assignée à QUELQU'UN D'AUTRE
  //     (= en cours de validation). Si la 1re TODO est "Non attribué", on
  //     n'affiche rien — personne n'est en train de valider, c'est une
  //     situation à débloquer, pas une attente.
  const upcoming: UpcomingTask[] = [];
  const seenDeals = new Set<string>();
  for (const t of myTodos) {
    if (seenDeals.has(t.dealId)) continue; // 1 par deal max (myTodos trié par order ASC)
    const first = firstTodoByDeal.get(t.dealId);
    if (!first) continue;
    if (first.id === t.id) continue; // c'est mon tour, pas "à venir"
    if (first.assigneeKey == null) continue; // bloquée par "Non attribué" → on ne montre pas
    if (first.assigneeKey === assigneeKey) continue; // sécurité (déjà couvert par first.id check)
    seenDeals.add(t.dealId);
    upcoming.push({
      ...t,
      blockedBy: {
        label: first.label,
        assigneeKey: first.assigneeKey,
      },
    });
  }
  return upcoming;
}

/**
 * Internal : retourne la 1re tâche TODO de chaque deal actif (peu importe
 * l'assignée). Utilisé par getCurrentTasksForAssignee + getAllCurrentTasks.
 */
async function getFirstTodoPerDeal(): Promise<TaskWithDeal[]> {
  const tasks = await prisma.task.findMany({
    where: {
      status: "TODO",
      deletedAt: null,
      deal: { deletedAt: null, status: { not: "ANNULE" } },
    },
    orderBy: [{ dealId: "asc" }, { order: "asc" }],
    include: {
      deal: { select: DEAL_SELECT },
      doneBy: { select: { id: true, name: true } },
    },
  });
  const seen = new Set<string>();
  const current: TaskWithDeal[] = [];
  for (const t of tasks) {
    if (seen.has(t.dealId)) continue;
    seen.add(t.dealId);
    current.push(t);
  }
  return current;
}

/**
 * Tâches en cours de validation — vue équipe.
 *
 * Stan 2026-05-31 v3 : ne retourne QUE les 1re TODO assignées à un user
 * Pangee (Stan/Certe/Angath). Les tâches "Non attribué" sont exclues
 * (situation à débloquer, pas un suivi équipe).
 */
export async function getAllCurrentTasks(): Promise<TaskWithDeal[]> {
  const allFirstTodos = await getFirstTodoPerDeal();
  return allFirstTodos.filter((t) => t.assigneeKey != null);
}

/**
 * Tâches courantes NON attribuées — "À débloquer" (Stan 2026-06-11 audit).
 *
 * Retourne la 1re TODO de chaque deal dont l'assigné est null. Ces deals
 * étaient invisibles partout (ni "Mes tâches", ni "À venir", ni "Équipe")
 * tant que personne ne s'était attribué la tâche courante — un trou noir
 * silencieux puisque le seed des templates ne pose aucun assigné par défaut.
 * Cette section les rend visibles pour qu'un associé se les attribue.
 */
export async function getUnassignedCurrentTasks(): Promise<TaskWithDeal[]> {
  const allFirstTodos = await getFirstTodoPerDeal();
  return allFirstTodos.filter((t) => t.assigneeKey == null);
}

/**
 * Toutes les tâches d'un deal (tous statuts confondus), triées par order ASC.
 * Utilisée dans la section "Tâches" inline sur la fiche détail deal.
 */
export async function getTasksForDeal(dealId: string): Promise<TaskWithDeal[]> {
  return prisma.task.findMany({
    where: { dealId, deletedAt: null },
    orderBy: { order: "asc" },
    include: {
      deal: {
        select: {
          id: true,
          title: true,
          date: true,
          category: true,
          status: true,
          venueName: true,
          venueCity: true,
        },
      },
      doneBy: { select: { id: true, name: true } },
    },
  });
}

/**
 * KPI top de la page /taches pour un user donné.
 *   - todoCount  : tâches courantes (1 par deal, assignées à l'user)
 *   - upcomingCount : tâches "À venir" (bloquées par un autre user)
 *   - doneThisMonthCount : tâches DONE ce mois-ci (audit user)
 *
 * Stan 2026-05-31 v4 audit : `overdueCount` / `thisWeekCount` retirés
 * (feature `dueAt` exclue de l'UI — Stan 2026-05-31 : "le délai de date
 * me pollue plus qu'autre chose"). Les champs Prisma `dueAt` /
 * `defaultDueOffsetDays` restent en BDD pour rétrocompat / réactivation
 * future éventuelle.
 */
export async function getTasksKpiForAssignee(
  assigneeKey: string,
): Promise<{
  todoCount: number;
  upcomingCount: number;
  doneThisMonthCount: number;
}> {
  const now = new Date();
  const startOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const [current, upcoming] = await Promise.all([
    getCurrentTasksForAssignee(assigneeKey),
    getUpcomingTasksForAssignee(assigneeKey),
  ]);
  const todoCount = current.length;
  const upcomingCount = upcoming.length;

  // Tâches validées par CE user (via doneByUserId) ce mois-ci — pas filtrées
  // sur assigneeKey car un user peut valider une tâche d'un autre.
  const doneThisMonthCount = await prisma.task.count({
    where: {
      status: { in: ["DONE", "SKIPPED"] },
      doneAt: { gte: startOfMonth },
      assigneeKey,
      deletedAt: null,
    },
  });

  return {
    todoCount,
    upcomingCount,
    doneThisMonthCount,
  };
}
