"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PANGEE_TEAM } from "@/lib/pangee-team";
import {
  createTaskTemplate,
  updateTaskTemplate,
  softDeleteTaskTemplate,
  reorderTaskTemplates,
} from "@/lib/actions/task-templates";
import { getAssigneeName, AssigneeDot } from "./task-helpers";
import type { DealCategory, TaskTemplate } from "@prisma/client";

/**
 * Éditeur des templates de tâches — Sprint 6 (Stan 2026-05-31).
 *
 * 3 tabs (BOOKING / PROD_EXE / CACHETS), édition inline de chaque template.
 * Pas de drag&drop dans le MVP — boutons ↑/↓ pour réordonner.
 */
interface Props {
  booking: TaskTemplate[];
  prodExe: TaskTemplate[];
  cachets: TaskTemplate[];
}

export function TemplatesEditor({ booking, prodExe, cachets }: Props) {
  const [tab, setTab] = useState<DealCategory>("BOOKING");
  const tabs: Array<{ key: DealCategory; label: string; count: number }> = [
    { key: "BOOKING", label: "Booking", count: booking.length },
    { key: "PROD_EXE", label: "Prod Exé", count: prodExe.length },
    { key: "CACHETS", label: "Cachets", count: cachets.length },
  ];
  const templates =
    tab === "BOOKING" ? booking : tab === "PROD_EXE" ? prodExe : cachets;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex items-center px-3 py-2 text-sm border-b-2 transition-colors -mb-px",
              tab === t.key
                ? "border-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}{" "}
            <span className="ml-1.5 text-[10px] opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      <CategoryEditor category={tab} templates={templates} />
    </div>
  );
}

function CategoryEditor({
  category,
  templates,
}: {
  category: DealCategory;
  templates: TaskTemplate[];
}) {
  const [adding, startAdd] = useTransition();
  const [newLabel, setNewLabel] = useState("");

  function onAdd() {
    const label = newLabel.trim();
    if (!label) return;
    startAdd(async () => {
      await createTaskTemplate({ category, label });
      setNewLabel("");
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="rounded-md border overflow-hidden divide-y bg-card">
        {templates.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground italic text-center">
            Aucun template pour cette catégorie.
          </div>
        ) : (
          templates.map((t, idx) => (
            <TemplateRow
              key={t.id}
              template={t}
              isFirst={idx === 0}
              isLast={idx === templates.length - 1}
              allIds={templates.map((x) => x.id)}
              category={category}
            />
          ))
        )}

        {/* Ajout rapide en pied */}
        <div className="px-3 py-2 bg-muted/20 flex items-center gap-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
            placeholder="+ Ajouter une étape…"
            disabled={adding}
            className="h-8 text-sm flex-1"
          />
          <button
            type="button"
            onClick={onAdd}
            disabled={adding || !newLabel.trim()}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors h-8 px-2"
          >
            <Plus className="h-3 w-3" />
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateRow({
  template,
  isFirst,
  isLast,
  allIds,
  category,
}: {
  template: TaskTemplate;
  isFirst: boolean;
  isLast: boolean;
  allIds: string[];
  category: DealCategory;
}) {
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(template.label);
  const [assigneeKey, setAssigneeKey] = useState(
    template.defaultAssigneeKey ?? "",
  );

  function persist(patch: Parameters<typeof updateTaskTemplate>[0]) {
    startTransition(async () => {
      await updateTaskTemplate(patch);
    });
  }

  function onLabelBlur() {
    if (label !== template.label) {
      const next = label.trim();
      if (!next) {
        setLabel(template.label);
        return;
      }
      persist({ id: template.id, label: next });
    }
  }

  function onAssigneeChange(next: string) {
    setAssigneeKey(next);
    persist({
      id: template.id,
      defaultAssigneeKey: next === "_none" ? null : next,
    });
  }

  function move(direction: "up" | "down") {
    const idx = allIds.indexOf(template.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= allIds.length) return;
    const newIds = [...allIds];
    [newIds[idx], newIds[swapIdx]] = [newIds[swapIdx], newIds[idx]];
    startTransition(async () => {
      await reorderTaskTemplates({ category, templateIds: newIds });
    });
  }

  function onDelete() {
    if (
      !confirm(
        `Supprimer le template "${template.label}" ? (n'affecte pas les deals existants)`,
      )
    )
      return;
    startTransition(async () => {
      await softDeleteTaskTemplate(template.id);
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors",
        pending && "opacity-60",
      )}
    >
      {/* Ordre + flèches */}
      <div className="shrink-0 flex flex-col w-7">
        <button
          type="button"
          onClick={() => move("up")}
          disabled={pending || isFirst}
          className="h-3 inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => move("down")}
          disabled={pending || isLast}
          className="h-3 inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      <span className="shrink-0 w-6 text-xs text-muted-foreground tabular-nums">
        {template.order + 1}.
      </span>

      {/* Label */}
      <div className="flex-1 min-w-[150px]">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={onLabelBlur}
          className="h-8 text-sm border-transparent focus:border-input bg-transparent"
          disabled={pending}
        />
      </div>

      {/* Assignee */}
      <div className="shrink-0 w-[130px]">
        <Select
          value={assigneeKey || "_none"}
          onValueChange={onAssigneeChange}
          disabled={pending}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue>
              <span className="inline-flex items-center gap-1.5">
                <AssigneeDot assigneeKey={assigneeKey || null} size="sm" />
                {getAssigneeName(assigneeKey || null)}
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

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        title="Supprimer ce template"
        className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
