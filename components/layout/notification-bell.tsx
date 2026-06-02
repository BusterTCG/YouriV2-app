"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowRight, Bell, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CategoryChip } from "@/components/tasks/task-helpers";
import type { NotificationItem } from "@/lib/notifications";

interface Props {
  notifications: NotificationItem[];
}

/**
 * Cloche de notification dans le topbar — Sprint 8 Stan 2026-06-02.
 *
 * Pattern KN `components/layout/notification-bell.tsx` adapté Pangee :
 *   - Badge compteur si > 0 notifs
 *   - Popover au clic avec liste des tâches courantes assignées à l'user
 *   - Click sur une tâche → ouvre la fiche deal directement
 *   - Footer "Voir tout →" qui pointe vers /taches
 *
 * Données pré-fetchées dans le layout server component (pas de hook client).
 */
export function NotificationBell({ notifications }: Props) {
  const [open, setOpen] = useState(false);
  const count = notifications.length;
  const hasNotifs = count > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={
            hasNotifs
              ? `${count} tâche${count > 1 ? "s" : ""} en attente`
              : "Aucune tâche en attente"
          }
          aria-label={`Notifications (${count})`}
          className={cn(
            "relative inline-flex items-center justify-center h-8 w-8 rounded-md border transition-colors",
            hasNotifs
              ? "border-border bg-muted/40 text-foreground hover:bg-muted"
              : "border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          <Bell className="h-4 w-4" />
          {hasNotifs && (
            <span
              className={cn(
                "absolute -top-1 -right-1 inline-flex items-center justify-center h-4 min-w-[16px] rounded-full text-[10px] font-semibold text-white px-1 tabular-nums",
                "bg-red-500 ring-2 ring-background",
              )}
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[380px] max-h-[70vh] overflow-y-auto p-0"
      >
        {/* Header */}
        <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold">Mes tâches courantes</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {count}
            </span>
          </div>
          <Link
            href="/taches"
            onClick={() => setOpen(false)}
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
          >
            Voir tout
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Liste */}
        <div className="divide-y">
          {!hasNotifs ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground italic">
              Aucune tâche assignée à toi en ce moment. 🎉
            </div>
          ) : (
            notifications.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 px-3 py-2 hover:bg-accent/30 transition-colors text-sm min-w-0"
              >
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="font-medium leading-tight truncate text-sm">
                    {n.title}
                  </div>
                  <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5 max-w-full min-w-0">
                    <CategoryChip category={n.category} />
                    <span className="truncate">{n.subtitle}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Show le {format(n.date, "dd MMM yyyy", { locale: fr })}
                  </div>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0 mt-1" />
              </Link>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
