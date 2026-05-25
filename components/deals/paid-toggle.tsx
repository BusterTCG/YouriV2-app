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
}

export function PaidToggle({ isOn, onToggle, label, className }: Props) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await onToggle(!isOn);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title={isOn ? "Cliquer pour annuler" : `Marquer comme ${label.toLowerCase()}`}
      className={cn(
        "w-full h-7 inline-flex items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors border",
        isOn
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
        pending && "opacity-60 cursor-wait",
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
