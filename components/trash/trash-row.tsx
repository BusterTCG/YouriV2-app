"use client";

import { useTransition, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { RotateCcw, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TrashType = "Deal" | "Task" | "Artist";

export type TrashItem = {
  id: string;
  type: TrashType;
  title: string;
  subtitle?: string | null;
  deletedAt: Date;
  /** Nom de l'acteur ayant supprimé (depuis l'audit log — multi-user). */
  deletedByName?: string | null;
  /** Couleur d'accent du liseré gauche (par type). */
  accentColor?: string | null;
};

interface TrashRowProps {
  item: TrashItem;
  onRestore: (id: string, type: TrashType) => Promise<void>;
  onDelete: (id: string, type: TrashType) => Promise<void>;
}

export function TrashRow({ item, onRestore, onDelete }: TrashRowProps) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function restore() {
    startTransition(() => onRestore(item.id, item.type));
  }
  function permanentlyDelete() {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    startTransition(async () => {
      await onDelete(item.id, item.type);
      setConfirming(false);
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border bg-card pl-4 pr-3 py-2.5",
        pending && "opacity-50",
      )}
      style={{
        borderLeftWidth: 4,
        borderLeftColor: item.accentColor ?? "var(--color-muted-foreground)",
      }}
    >
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground border rounded px-1 py-0.5">
            {TYPE_LABEL[item.type]}
          </span>
          <span className="font-medium text-sm truncate">{item.title}</span>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
          {item.subtitle && <span>{item.subtitle}</span>}
          <span className="text-muted-foreground/60">
            · supprimé le{" "}
            {format(item.deletedAt, "d MMM yyyy 'à' HH:mm", { locale: fr })}
            {item.deletedByName ? ` par ${item.deletedByName}` : ""}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={restore} disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          <span className="ml-1.5">Restaurer</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={permanentlyDelete}
          disabled={pending}
          className={cn(
            "text-destructive hover:text-destructive hover:bg-destructive/10",
            confirming && "bg-destructive/15 ring-1 ring-destructive/40",
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="ml-1.5">{confirming ? "Confirmer" : "Supprimer"}</span>
        </Button>
      </div>
    </div>
  );
}

const TYPE_LABEL: Record<TrashType, string> = {
  Deal: "Deal",
  Task: "Tâche",
  Artist: "Artiste",
};
