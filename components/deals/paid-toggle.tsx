"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pill 2-état "○ Payé" / "✓ Payé" — copie fidèle KN show PaidPill.
 *
 * Classes exactes KN :
 *   w-full h-7 inline-flex items-center justify-center gap-1 rounded-md
 *   px-2 text-[11px] font-medium border
 * Avec une checkbox custom (h-3 w-3 rounded-sm border) au lieu d'une icône Lucide.
 *
 * Utilisé sur les lignes Budget (Encaissé), Charges (Payé).
 */
interface Props {
  isOn: boolean;
  onToggle: (next: boolean) => Promise<void>;
  label: string;
  className?: string;
  /** Lecture seule (profil « Production » : les paiements sont faits par les associés). */
  readOnly?: boolean;
}

export function PaidToggle({ isOn, onToggle, label, className, readOnly = false }: Props) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (readOnly) return;
    startTransition(async () => {
      await onToggle(!isOn);
    });
  }

  // Lecture seule (profil « Production », page Management fees — Stan
  // 2026-10-01) : simple étiquette de statut, plus rien qui ressemble à une
  // case à cocher.
  if (readOnly) {
    return (
      <span
        title="Paiement validé par les associés Pangee"
        className={cn(
          "w-full h-7 inline-flex items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium",
          isOn ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400",
          className,
        )}
      >
        {isOn ? `✓ ${label}` : "⏳ En cours"}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending || readOnly}
      title={readOnly ? undefined : isOn ? "Cliquer pour annuler" : `Marquer comme ${label.toLowerCase()}`}
      className={cn(
        "w-full h-7 inline-flex items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors border",
        isOn
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
        pending && "opacity-60 cursor-wait",
        readOnly && "cursor-default hover:bg-muted/30",
        className,
      )}
    >
      <span
        className={cn(
          "h-3 w-3 rounded-sm border inline-flex items-center justify-center text-[9px] shrink-0",
          isOn
            ? "bg-emerald-500 border-emerald-500 text-white"
            : "border-muted-foreground/40",
        )}
      >
        {pending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : isOn && "✓"}
      </span>
      {label}
    </button>
  );
}
