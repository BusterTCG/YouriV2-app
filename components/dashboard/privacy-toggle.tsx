"use client";

import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrivacy } from "@/lib/privacy-context";

/**
 * Toggle Eye / EyeOff — façon appli bancaire. Masque les montants en €
 * dans le dashboard (et toute page wrappée du Provider).
 *
 * État persisté en localStorage (`yr-privacy-mode`).
 */
export function PrivacyToggle() {
  const { isPrivate, toggle } = usePrivacy();
  return (
    <button
      type="button"
      onClick={toggle}
      title={
        isPrivate
          ? "Afficher les montants"
          : "Masquer les montants (mode discret)"
      }
      aria-pressed={isPrivate}
      className={cn(
        "inline-flex items-center justify-center h-8 w-8 rounded-md border transition-colors",
        isPrivate
          ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25"
          : "bg-muted/40 border-border text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
    >
      {isPrivate ? (
        <EyeOff className="h-4 w-4" />
      ) : (
        <Eye className="h-4 w-4" />
      )}
    </button>
  );
}
