"use client";

import { useState, useTransition } from "react";
import {
  CheckSquare,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PANGEE_TEAM } from "@/lib/pangee-team";
import {
  markTaskDone,
  markTaskTodo,
  updateTask,
  softDeleteTask,
  addTaskToDeal,
  reorderTasks,
} from "@/lib/actions/tasks";
import {
  TaskStatusChip,
  AssigneeDot,
  getAssigneeName,
} from "./task-helpers";
import type { TaskWithDeal } from "@/lib/queries/tasks";

/**
 * Pipeline du deal — variante "bandeau intégré au header" (Stan 2026-05-31 v3).
 *
 * UX : la tâche courante s'affiche en ligne dans le header du deal (juste
 * sous le titre), comme un statut. Au clic sur "Pipeline", un Sheet latéral
 * droit s'ouvre avec le pipeline complet éditable.
 *
 * Avantage : pas de carte parasite qui charge la fiche, action principale
 * accessible mais discrète.
 */
interface Props {
  dealId: string;
  tasks: TaskWithDeal[];
}

export function DealPipelineBar({ dealId, tasks }: Props) {
  const todoCount = tasks.filter((t) => t.status === "TODO").length;
  const doneCount = tasks.filter((t) => t.status === "DONE").length;
  const totalActive = tasks.filter((t) => t.status !== "SKIPPED").length;
  const currentTask = tasks.find((t) => t.status === "TODO");
  const allDone = totalActive > 0 && todoCount === 0;
  const hasNoTasks = tasks.length === 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded -mx-1 px-1 hover:bg-accent/30"
        >
          <CheckSquare className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          {hasNoTasks ? (
            <span className="text-xs italic">Aucune tâche</span>
          ) : allDone ? (
            <span className="text-xs text-emerald-700 dark:text-emerald-400">
              Pipeline complet ✓
            </span>
          ) : currentTask ? (
            <>
              <span className="text-[10px] uppercase tracking-wider font-semibold">
                Étape
              </span>
              <span className="text-sm font-medium text-foreground">
                {currentTask.label}
              </span>
              {currentTask.assigneeKey && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  ·
                  <AssigneeDot assigneeKey={currentTask.assigneeKey} size="xs" />
                  {getAssigneeName(currentTask.assigneeKey)}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                ({doneCount}/{totalActive})
              </span>
            </>
          ) : null}
          <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[calc(100vw-2rem)] sm:w-[480px] max-h-[70vh] overflow-y-auto p-3"
      >
        <div className="flex items-center justify-between gap-2 mb-2 px-1">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold">Pipeline du deal</span>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
            {totalActive > 0 ? (
              <>
                {doneCount} / {totalActive}
                {tasks.length > totalActive &&
                  ` (+${tasks.length - totalActive} ignorée${tasks.length - totalActive > 1 ? "s" : ""})`}
              </>
            ) : (
              "Aucune tâche"
            )}
          </span>
        </div>

        <PipelineList
          dealId={dealId}
          tasks={tasks}
          currentTaskId={currentTask?.id}
        />
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────── Liste du pipeline (dans le Sheet) ───────────────────

function PipelineList({
  dealId,
  tasks,
  currentTaskId,
}: {
  dealId: string;
  tasks: TaskWithDeal[];
  currentTaskId?: string;
}) {
  const [adding, startAdd] = useTransition();
  const [, startReorder] = useTransition();
  const [newLabel, setNewLabel] = useState("");

  // Ordre local optimiste — réordonné au drop avant l'aller-retour serveur
  // pour éviter un flash visuel pendant la transition.
  const [orderedIds, setOrderedIds] = useState<string[]>(() => tasks.map((t) => t.id));
  // Resync si la liste serveur change (ex. ajout/suppression de tâche).
  // Pattern "Storing information from previous renders" recommandé par React
  // (https://react.dev/reference/react/useState#storing-information-from-
  // previous-renders) — appeler setState pendant le render est OK, React
  // re-render synchrone avec les nouvelles values sans flush effets.
  const serverIds = tasks.map((t) => t.id).join(",");
  const [lastServerIds, setLastServerIds] = useState(serverIds);
  if (lastServerIds !== serverIds) {
    setLastServerIds(serverIds);
    setOrderedIds(tasks.map((t) => t.id));
  }

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const orderedTasks = orderedIds
    .map((id) => taskById.get(id))
    .filter((t): t is TaskWithDeal => t !== undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Demande un petit drag avant d'activer — évite de déclencher en
      // cliquant sur un input/select à l'intérieur de la ligne.
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = orderedIds.indexOf(String(active.id));
    const newIdx = orderedIds.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const next = [...orderedIds];
    const [moved] = next.splice(oldIdx, 1);
    next.splice(newIdx, 0, moved);
    setOrderedIds(next);
    startReorder(async () => {
      await reorderTasks({ dealId, taskIds: next });
    });
  }

  function onAdd() {
    const label = newLabel.trim();
    if (!label) return;
    startAdd(async () => {
      await addTaskToDeal({ dealId, label });
      setNewLabel("");
    });
  }

  return (
    <div className="space-y-2 pb-1">
      {/* Stan 2026-06-02 : sur mobile chaque tâche dans sa propre card pour
          mieux ressortir visuellement. Desktop garde le pattern compact en
          divide-y (dense pour lecture rapide). */}
      <div className="space-y-2 sm:space-y-0 sm:rounded-md sm:border sm:overflow-hidden sm:bg-card">
        {orderedTasks.length === 0 ? (
          <div className="rounded-md border bg-card px-3 py-6 text-xs text-muted-foreground italic text-center">
            Aucune tâche.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={orderedIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2 sm:space-y-0 sm:divide-y">
                {orderedTasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    isCurrent={t.id === currentTaskId}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Ajout rapide */}
      <div className="flex items-center gap-1.5">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          placeholder="+ Ajouter une tâche…"
          disabled={adding}
          className="h-7 text-xs flex-1"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={adding || !newLabel.trim()}
          className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors h-7 px-2"
        >
          <Plus className="h-3 w-3" />
          OK
        </button>
      </div>
    </div>
  );
}

// ─────────────────── TaskRow (édition inline dans le Sheet) ───────────────────

function TaskRow({
  task,
  isCurrent,
}: {
  task: TaskWithDeal;
  isCurrent?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(task.label);
  const [assigneeKey, setAssigneeKey] = useState(task.assigneeKey ?? "");
  const isDone = task.status === "DONE";
  const isSkipped = task.status === "SKIPPED";

  // Drag & drop (@dnd-kit) — handle GripVertical à gauche.
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function toggleDone() {
    startTransition(async () => {
      if (isDone || isSkipped) {
        await markTaskTodo(task.id);
      } else {
        await markTaskDone(task.id);
      }
    });
  }

  function onLabelBlur() {
    if (label !== task.label) {
      const next = label.trim();
      if (!next) {
        setLabel(task.label);
        return;
      }
      startTransition(async () => {
        await updateTask({ id: task.id, label: next });
      });
    }
  }

  function onAssigneeChange(next: string) {
    setAssigneeKey(next);
    startTransition(async () => {
      await updateTask({
        id: task.id,
        assigneeKey: next === "_none" ? null : next,
      });
    });
  }

  function onDelete() {
    if (!confirm(`Supprimer la tâche "${task.label}" ?`)) return;
    startTransition(async () => {
      await softDeleteTask(task.id);
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        // Mobile : card encadrée avec ombre légère. Desktop : pas de bordure
        // (le wrapper parent gère le divide-y dense).
        "flex items-center gap-1.5 px-3 py-2 sm:px-2 sm:py-1 text-xs transition-colors rounded-md border sm:rounded-none sm:border-0 bg-card sm:bg-transparent hover:bg-accent/30",
        pending && "opacity-60",
        isDragging && "opacity-50 bg-blue-500/10 shadow-lg z-10 relative",
        (isDone || isSkipped) && !isDragging && "bg-muted/20",
        isCurrent && !isDone && !isSkipped && !isDragging && "bg-blue-500/5 border-blue-500/40 sm:border-0",
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Glisser pour réordonner"
        className="shrink-0 h-5 w-3 inline-flex items-center justify-center text-muted-foreground/40 hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-3 w-3" />
      </button>

      {/* Checkbox */}
      <button
        type="button"
        onClick={toggleDone}
        disabled={pending}
        title={
          isDone
            ? "Cliquer pour remettre en TODO"
            : "Cliquer pour marquer comme fait"
        }
        className={cn(
          "shrink-0 h-4 w-4 rounded border-2 inline-flex items-center justify-center transition-colors",
          isDone
            ? "bg-emerald-500 border-emerald-500 text-white"
            : isSkipped
              ? "bg-muted border-muted-foreground/40 text-muted-foreground"
              : "border-muted-foreground/40 hover:border-foreground hover:bg-muted",
        )}
      >
        {(isDone || isSkipped) && (
          <span className="text-[9px]">{isDone ? "✓" : "−"}</span>
        )}
      </button>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={onLabelBlur}
          className={cn(
            "h-6 text-xs border-transparent focus:border-input bg-transparent px-1",
            isSkipped && "line-through text-muted-foreground",
          )}
          disabled={pending}
        />
      </div>

      {/* Assignée (rond couleur seul sur mobile, + nom sur desktop) */}
      <div className="shrink-0">
        <Select
          value={assigneeKey || "_none"}
          onValueChange={onAssigneeChange}
          disabled={pending}
        >
          <SelectTrigger className="h-6 text-[11px] w-auto gap-1 px-1.5 sm:px-2 border-transparent hover:border-input">
            <SelectValue placeholder="—">
              <span className="inline-flex items-center gap-1.5">
                <AssigneeDot assigneeKey={assigneeKey || null} size="sm" />
                <span className="hidden sm:inline">
                  {getAssigneeName(assigneeKey || null)}
                </span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">
              <span className="inline-flex items-center gap-1.5">
                <AssigneeDot assigneeKey={null} size="sm" />
                Non attribué
              </span>
            </SelectItem>
            {PANGEE_TEAM.map((m) => (
              <SelectItem key={m.key} value={m.key}>
                <span className="inline-flex items-center gap-1.5">
                  <AssigneeDot assigneeKey={m.key} size="sm" />
                  {m.firstName}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Statut (chip) — masqué sur mobile (la checkbox visuelle suffit). */}
      <div className="hidden sm:block">
        <TaskStatusChip status={task.status} />
      </div>

      {/* Action delete */}
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        title="Supprimer"
        className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
