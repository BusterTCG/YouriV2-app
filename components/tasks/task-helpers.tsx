"use client";

import type { TaskStatus, DealCategory } from "@prisma/client";
import { cn } from "@/lib/utils";
import { getAssigneeName, getAssigneeColor } from "@/lib/pangee-team";

/**
 * Helpers + petits composants partagés des tâches (Sprint 6).
 *
 * Stan 2026-05-31 v2 : feature `dueAt` retirée de l'UI (polluante). Les
 * champs Prisma sont conservés pour réactivation future éventuelle.
 *
 * `getAssigneeName` réexporté depuis `lib/pangee-team.ts` (utilisable
 * côté serveur ET client).
 */

export { getAssigneeName, getAssigneeColor };

/**
 * Rond de couleur de l'assigné (Stan 2026-05-31 v3).
 *
 * Affiche un petit cercle plein avec la couleur du membre Pangee, ou un
 * cercle pointillé gris si "Non attribué". Utilisé partout où on liste
 * une tâche : carte, ligne du Popover, bucket équipe.
 */
export function AssigneeDot({
  assigneeKey,
  size = "sm",
}: {
  assigneeKey: string | null | undefined;
  size?: "xs" | "sm" | "md";
}) {
  const color = getAssigneeColor(assigneeKey);
  const sizeClass =
    size === "md" ? "h-3 w-3" : size === "xs" ? "h-2 w-2" : "h-2.5 w-2.5";
  if (!color) {
    return (
      <span
        className={cn(
          "shrink-0 rounded-full border border-dashed border-muted-foreground/40",
          sizeClass,
        )}
        title="Non attribué"
      />
    );
  }
  return (
    <span
      className={cn("shrink-0 rounded-full", sizeClass)}
      style={{ backgroundColor: color }}
      title={getAssigneeName(assigneeKey)}
    />
  );
}

const STATUS_DISPLAY: Record<TaskStatus, { label: string; classes: string }> = {
  TODO: {
    label: "À faire",
    classes: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  },
  DONE: {
    label: "Fait",
    classes: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  },
  SKIPPED: {
    label: "Ignoré",
    classes: "bg-muted/40 text-muted-foreground border-border line-through",
  },
};

export function TaskStatusChip({ status }: { status: TaskStatus }) {
  const d = STATUS_DISPLAY[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold",
        d.classes,
      )}
    >
      {d.label}
    </span>
  );
}

export function AssigneeChip({
  assigneeKey,
}: {
  assigneeKey: string | null;
}) {
  if (!assigneeKey) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-dashed border-muted-foreground/40 px-1.5 py-0.5 text-[10px] text-muted-foreground italic">
        <AssigneeDot assigneeKey={null} size="xs" />
        Non attribué
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
      <AssigneeDot assigneeKey={assigneeKey} size="xs" />
      {getAssigneeName(assigneeKey)}
    </span>
  );
}

const CATEGORY_LABEL: Record<DealCategory, string> = {
  BOOKING: "Booking",
  PROD_EXE: "Prod Exé",
  CACHETS: "Cachets",
};
const CATEGORY_COLOR: Record<DealCategory, string> = {
  BOOKING: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  PROD_EXE: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30",
  CACHETS: "bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/30",
};

export function CategoryChip({ category }: { category: DealCategory }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold",
        CATEGORY_COLOR[category],
      )}
    >
      {CATEGORY_LABEL[category]}
    </span>
  );
}

const CATEGORY_PATH: Record<DealCategory, string> = {
  BOOKING: "/deals/booking",
  PROD_EXE: "/deals/prod-executive",
  CACHETS: "/deals/cachets",
};
export const dealUrl = (category: DealCategory, dealId: string): string =>
  `${CATEGORY_PATH[category]}/${dealId}`;
