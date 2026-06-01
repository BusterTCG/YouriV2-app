"use client";

import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CategoryChip,
  dealUrl,
} from "./task-helpers";
import { getAssigneeName } from "@/lib/pangee-team";
import type { UpcomingTask } from "@/lib/queries/tasks";

/**
 * Carte "Tâche à venir" — Stan 2026-05-31 v2.
 *
 * Affichée dans /taches sous "Mes tâches courantes". Lecture seule (pas de
 * bouton Valider — il faut d'abord que la tâche précédente du pipeline
 * soit validée). Indique qui bloque actuellement.
 */
interface Props {
  task: UpcomingTask;
}

export function UpcomingTaskCard({ task }: Props) {
  return (
    <Link
      href={dealUrl(task.deal.category, task.deal.id)}
      className={cn(
        "block rounded-md border bg-card hover:bg-accent/20 transition-colors",
        "border-dashed", // pointillés pour montrer que c'est "pas encore actif"
      )}
    >
      <div className="px-3 py-2.5 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="text-sm font-medium leading-tight">
            {task.label}
          </span>
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

        {/* Bloqueur — qui doit valider avant */}
        <div className="text-[11px] text-amber-700 dark:text-amber-400 italic">
          ↳ En attente que{" "}
          <span className="font-semibold not-italic">
            {getAssigneeName(task.blockedBy.assigneeKey)}
          </span>{" "}
          valide :{" "}
          <span className="font-medium not-italic">
            « {task.blockedBy.label} »
          </span>
        </div>
      </div>
    </Link>
  );
}
