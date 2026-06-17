"use client";

import { cn } from "@/lib/utils";

/**
 * Pill binaire "Payé / En cours" — pattern partagé Stan 2026-05-26.
 *
 * Origine : `production-lines-editor.tsx` (Prod Exé) qui l'a introduit avec
 * une case à cocher visuelle + bordure verte. Réutilisé sur la fiche Cachets
 * (Sprint 5) et potentiellement ailleurs (booking artist row, mf row…).
 *
 * Wording :
 *   - "Payé" → sortie cash (charge / artiste / MF)
 *   - "Encaissé" → entrée cash (recette / billetterie / prestation facturée)
 */
interface Props {
  paid: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label?: string;
}

export function PaidPill({
  paid,
  onToggle,
  disabled,
  label = "Payé",
}: Props) {
  const lcLabel = label.toLowerCase();
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={
        paid
          ? `Cliquer pour annuler — ${lcLabel}`
          : `Marquer comme ${lcLabel}`
      }
      className={cn(
        "w-full h-7 inline-flex items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors border",
        paid
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "h-3 w-3 rounded-sm border inline-flex items-center justify-center text-[9px] shrink-0",
          paid
            ? "bg-emerald-500 border-emerald-500 text-white"
            : "border-muted-foreground/40",
        )}
      >
        {paid ? "✓" : ""}
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
