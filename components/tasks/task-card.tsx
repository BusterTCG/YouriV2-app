"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar, MapPin, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Check } from "lucide-react";
import {
  CategoryChip,
  AssigneeChip,
  dealUrl,
} from "./task-helpers";
import {
  markTaskDone,
  markTaskTodo,
  softDeleteTask,
} from "@/lib/actions/tasks";
import type { TaskWithDeal } from "@/lib/queries/tasks";

/**
 * Carte tâche pour la page /taches — affiche le deal + la tâche courante
 * assignée (1 carte = 1 deal = la 1re tâche TODO).
 *
 * Stan 2026-05-31 : design dense pour scanner la liste rapidement.
 * Clic sur la carte → ouvre la fiche détail deal. Bouton ✓ Valider → la
 * tâche passe en DONE → la suivante du deal apparait au refresh.
 */
interface Props {
  task: TaskWithDeal;
  /** Si true, on affiche aussi l'assigné (vue Équipe). */
  showAssignee?: boolean;
}

export function TaskCard({ task, showAssignee = false }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDone() {
    // Stan 2026-05-31 : optimistic + toast undo (~6s) pour rattraper les
    // clics par erreur. Pattern Gmail/Slack.
    startTransition(async () => {
      await markTaskDone(task.id);
      toast.success(`Tâche validée : ${task.label}`, {
        description: `${task.deal.title}`,
        action: {
          label: "Annuler",
          onClick: () => {
            startTransition(async () => {
              await markTaskTodo(task.id);
              toast.info("Tâche remise en cours");
            });
          },
        },
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
      className={cn(
        "rounded-md border bg-card hover:bg-accent/20 transition-colors",
        pending && "opacity-60",
      )}
    >
      <div className="px-3 py-2.5 flex items-start gap-3">
        {/* Bouton ✓ Valider — bouton custom Stan 2026-05-31 v4 (PaidPill avait
            une logique inadaptée qui affichait "En cours" sur ce cas). */}
        <div className="w-24 shrink-0 pt-0.5">
          <button
            type="button"
            onClick={onDone}
            disabled={pending}
            title="Marquer la tâche comme faite"
            className={cn(
              "w-full h-7 inline-flex items-center justify-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors",
              "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20",
              pending && "opacity-50 cursor-wait",
            )}
          >
            <Check className="h-3.5 w-3.5" />
            Valider
          </button>
        </div>

        {/* Bloc principal : label tâche + deal + meta */}
        <Link
          href={dealUrl(task.deal.category, task.deal.id)}
          className="flex-1 min-w-0 space-y-1 cursor-pointer"
          onClick={(e) => {
            // Si l'user clique sur un bouton dans la carte, ne pas naviguer
            const target = e.target as HTMLElement;
            if (target.closest("button, [role='button']")) e.preventDefault();
          }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium leading-tight">
              {task.label}
            </span>
            {showAssignee && <AssigneeChip assigneeKey={task.assigneeKey} />}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap min-w-0">
            <CategoryChip category={task.deal.category} />
            <span className="font-medium truncate">{task.deal.title}</span>
            <span className="text-muted-foreground/60">·</span>
            <span className="inline-flex items-center gap-1 normal-case">
              <Calendar className="h-3 w-3" />
              {format(task.deal.date, "dd MMM yyyy", { locale: fr })}
            </span>
            {task.deal.venueCity && (
              <>
                <span className="text-muted-foreground/60">·</span>
                <span className="inline-flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3" />
                  {task.deal.venueCity}
                </span>
              </>
            )}
          </div>
          {task.description && (
            <div className="text-[11px] text-muted-foreground italic leading-snug">
              {task.description}
            </div>
          )}
        </Link>

        {/* Menu kebab : skip / supprimer / éditer */}
        <div className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Actions"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => router.push(dealUrl(task.deal.category, task.deal.id))}
              >
                Ouvrir la fiche deal
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onDelete}
                disabled={pending}
                className="text-destructive focus:text-destructive"
              >
                🗑️ Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
