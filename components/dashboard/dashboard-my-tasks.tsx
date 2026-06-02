import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CheckSquare, Calendar, ArrowRight, Hourglass } from "lucide-react";
import {
  AssigneeDot,
  CategoryChip,
} from "@/components/tasks/task-helpers";
// getAssigneeName depuis lib/pangee-team directement (pas via task-helpers qui
// est "use client" — éviter import cross-boundary douteux côté Server Component).
import { getAssigneeName } from "@/lib/pangee-team";
import type { MyTaskItem, UpcomingTaskItem } from "@/lib/dashboard";

const VISIBLE = 5; // Stan 2026-06-02 v2 : cards en col étroite (3 cols).

/**
 * "Mes tâches courantes" — 1re TODO par deal assignée à moi (action immédiate).
 * Stan 2026-06-02 v2 : disposition 3 colonnes côte à côte avec À venir et
 * Cette semaine → limite 5 items affichés, avec lien "voir plus" si dépassé.
 */
export function DashboardMyTasks({
  tasks,
  teamTasksCount,
}: {
  tasks: MyTaskItem[];
  teamTasksCount: number;
}) {
  const visible = tasks.slice(0, VISIBLE);
  const remaining = Math.max(0, tasks.length - VISIBLE);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CheckSquare className="h-4 w-4 text-blue-500 shrink-0" />
          <h2 className="text-sm font-semibold uppercase tracking-wider truncate">
            Mes tâches
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {tasks.length}
          </span>
        </div>
        <Link
          href="/taches"
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-0.5 shrink-0"
          title={`Équipe : ${teamTasksCount} en cours`}
        >
          Voir tout
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="rounded-md border overflow-hidden divide-y bg-card">
        {visible.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground italic">
            Aucune tâche assignée. 🎉
          </div>
        ) : (
          visible.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors text-sm min-w-0"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium leading-tight truncate text-sm">
                  {t.label}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5 min-w-0">
                  <CategoryChip category={t.dealCategory} />
                  <span className="truncate">{t.dealTitle}</span>
                </div>
                <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                  <Calendar className="h-3 w-3" />
                  {format(t.dealDate, "dd MMM yyyy", { locale: fr })}
                </div>
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            </Link>
          ))
        )}
        {remaining > 0 && (
          <Link
            href="/taches"
            className="block px-3 py-1.5 text-center text-[11px] text-muted-foreground hover:bg-accent/20 transition-colors"
          >
            + {remaining} autres → voir tout
          </Link>
        )}
      </div>
    </section>
  );
}

/**
 * "Tâches à venir" — tâches assignées à moi mais bloquées par un autre user
 * (workflow séquentiel). Affichée seulement si non vide.
 */
export function DashboardUpcomingTasks({
  upcoming,
}: {
  upcoming: UpcomingTaskItem[];
}) {
  const visible = upcoming.slice(0, VISIBLE);
  const remaining = Math.max(0, upcoming.length - VISIBLE);

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Hourglass className="h-4 w-4 text-amber-500 shrink-0" />
        <h2 className="text-sm font-semibold uppercase tracking-wider truncate">
          À venir
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {upcoming.length}
        </span>
      </div>
      <div className="rounded-md border overflow-hidden divide-y bg-card">
        {visible.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground italic">
            Rien en attente d&apos;un autre.
          </div>
        ) : (
          visible.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors text-sm min-w-0"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium leading-tight truncate text-sm">
                  {t.label}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5 min-w-0">
                  <CategoryChip category={t.dealCategory} />
                  <span className="truncate">{t.dealTitle}</span>
                </div>
                <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                  <Hourglass className="h-3 w-3" />
                  bloqué par
                  <AssigneeDot
                    assigneeKey={t.blockedBy.assigneeKey}
                    size="sm"
                  />
                  {getAssigneeName(t.blockedBy.assigneeKey)}
                </div>
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            </Link>
          ))
        )}
        {remaining > 0 && (
          <Link
            href="/taches"
            className="block px-3 py-1.5 text-center text-[11px] text-muted-foreground hover:bg-accent/20 transition-colors"
          >
            + {remaining} autres → voir tout
          </Link>
        )}
      </div>
    </section>
  );
}
