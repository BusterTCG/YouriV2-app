import { AlertTriangle, CheckSquare, Clock, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { requireUser } from "@/lib/auth/users";
import {
  getCurrentTasksForAssignee,
  getUpcomingTasksForAssignee,
  getAllCurrentTasks,
  getUnassignedCurrentTasks,
  getTasksKpiForAssignee,
  type TaskWithDeal,
} from "@/lib/queries/tasks";
import { TaskCard } from "@/components/tasks/task-card";
import { UpcomingTaskCard } from "@/components/tasks/upcoming-task-card";
import { AssigneeDot } from "@/components/tasks/task-helpers";
import { PANGEE_TEAM, getAssigneeName } from "@/lib/pangee-team";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tâches — Youri Prod",
};

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

/**
 * Page Tâches — Sprint 6 (Stan 2026-05-31).
 *
 * 2 tabs : "Mes tâches" (filtré sur l'user connecté via pangeeKey) et "Équipe"
 * (toutes les tâches courantes, groupées par associé).
 *
 * Logique workflow : pour chaque deal actif, on affiche UNIQUEMENT la 1re
 * tâche TODO assignée à l'user. Au validate → la suivante apparait.
 */
export default async function TachesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireUser();
  const tab = sp.tab === "team" ? "team" : "mine";

  // Pangee key de l'user — défaut "stan" si pas défini (dev seed).
  const myKey = user.pangeeKey ?? "stan";

  const [myTasks, upcomingTasks, allTasks, unassignedTasks, kpi] =
    await Promise.all([
      getCurrentTasksForAssignee(myKey),
      getUpcomingTasksForAssignee(myKey),
      tab === "team"
        ? getAllCurrentTasks()
        : Promise.resolve([] as TaskWithDeal[]),
      getUnassignedCurrentTasks(),
      getTasksKpiForAssignee(myKey),
    ]);

  // Groupage tab "Équipe" : par assigné (Stan/Certe/Angath/Non attribué).
  const byAssignee = groupByAssignee(allTasks);

  return (
    <div className="max-w-5xl space-y-5">
      {/* Header */}
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <CheckSquare className="h-3.5 w-3.5" />
            Pipeline ·
            <AssigneeDot assigneeKey={myKey} size="sm" />
            {getAssigneeName(myKey)}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Mes tâches</h1>
          <p className="text-muted-foreground text-sm">
            La tâche en cours de chaque deal. Au validate, la suivante du
            pipeline apparait. Les templates sont éditables depuis{" "}
            <Link
              href="/settings/templates"
              className="underline hover:text-foreground"
            >
              /settings/templates
            </Link>
            .
          </p>
        </div>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-3 gap-2">
        <KpiCard
          label="À faire"
          value={kpi.todoCount}
          icon={<CheckSquare className="h-3.5 w-3.5" />}
          tone="blue"
        />
        <KpiCard
          label="À venir"
          value={kpi.upcomingCount}
          icon={<Clock className="h-3.5 w-3.5" />}
          tone="amber"
        />
        <KpiCard
          label="Terminées ce mois"
          value={kpi.doneThisMonthCount}
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          tone="emerald"
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b">
        <TabLink href="/taches" active={tab === "mine"}>
          Mes tâches{" "}
          <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">
            {myTasks.length}
            {upcomingTasks.length > 0 && (
              <span className="text-muted-foreground/60">
                {" "}
                +{upcomingTasks.length}
              </span>
            )}
          </span>
        </TabLink>
        <TabLink href="/taches?tab=team" active={tab === "team"}>
          Équipe{" "}
          <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">
            {allTasks.length}
          </span>
        </TabLink>
      </div>

      {/* À attribuer — Stan 2026-06-11 audit : deals dont la tâche courante
          n'a aucun assigné. Invisibles ailleurs (ni Mes tâches, ni À venir, ni
          Équipe) tant que personne ne se les attribue. Affiché sur les 2 tabs
          car c'est une file de triage partagée. Cliquer ouvre le deal pour
          assigner via le pipeline. */}
      {unassignedTasks.length > 0 && (
        <div className="rounded-md border-2 border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            À attribuer
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] normal-case">
              {unassignedTasks.length}
            </span>
            <span className="text-[10px] text-muted-foreground italic normal-case font-normal">
              personne n&apos;est encore sur ces deals — ouvre-les pour assigner
            </span>
          </div>
          <div className="space-y-2">
            {unassignedTasks.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {tab === "mine" ? (
        myTasks.length === 0 && upcomingTasks.length === 0 ? (
          <EmptyState
            message="Aucune tâche à faire pour l'instant. 🎉"
            sub="Soit tout est validé, soit il n'y a pas de deals actifs avec des tâches qui te sont assignées."
          />
        ) : (
          <div className="space-y-6">
            {myTasks.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  ✅ À faire maintenant
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] normal-case">
                    {myTasks.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {myTasks.map((t) => (
                    <TaskCard key={t.id} task={t} />
                  ))}
                </div>
              </div>
            )}

            {upcomingTasks.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  🕐 À venir
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] normal-case">
                    {upcomingTasks.length}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 italic normal-case font-normal">
                    en attente qu&apos;une tâche précédente soit validée
                  </span>
                </div>
                <div className="space-y-2">
                  {upcomingTasks.map((t) => (
                    <UpcomingTaskCard key={t.id} task={t} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      ) : allTasks.length === 0 ? (
        <EmptyState
          message="Aucune tâche en cours pour l'équipe."
          sub="Crée un nouveau deal pour générer un pipeline."
        />
      ) : (
        <div className="space-y-6">
          {PANGEE_TEAM.map((m) => m.key).map((key) => {
            const list = byAssignee.get(key) ?? [];
            if (list.length === 0) return null;
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  <AssigneeDot assigneeKey={key} size="md" />
                  {getAssigneeName(key)}
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] normal-case">
                    {list.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {list.map((t) => (
                    <TaskCard key={t.id} task={t} showAssignee={false} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function groupByAssignee(tasks: TaskWithDeal[]): Map<string, TaskWithDeal[]> {
  const m = new Map<string, TaskWithDeal[]>();
  for (const t of tasks) {
    const key = t.assigneeKey ?? "_unassigned";
    const arr = m.get(key) ?? [];
    arr.push(t);
    m.set(key, arr);
  }
  return m;
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center px-3 py-2 text-sm border-b-2 transition-colors -mb-px",
        active
          ? "border-foreground font-semibold"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "blue" | "red" | "amber" | "emerald";
}) {
  const colorClass = {
    blue: "text-blue-700 dark:text-blue-400",
    red: "text-red-700 dark:text-red-400",
    amber: "text-amber-700 dark:text-amber-400",
    emerald: "text-emerald-700 dark:text-emerald-400",
  }[tone];
  return (
    <div className="rounded-md border bg-card p-3">
      <div
        className={cn(
          "flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold",
          colorClass,
        )}
      >
        {icon}
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="rounded-md border border-dashed py-12 text-center space-y-1">
      <div className="text-sm text-muted-foreground">{message}</div>
      {sub && <div className="text-xs text-muted-foreground/70">{sub}</div>}
    </div>
  );
}
