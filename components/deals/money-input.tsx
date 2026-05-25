"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * Input montant € — pattern KN.
 *
 * Affichage formaté "1 957 €" en lecture. En édition (focus) : valeur brute
 * (sans " €" ni séparateur) pour saisie facile. Save onBlur avec onCommit.
 *
 * Stocke en interne une string (pour permettre la saisie progressive). Parse
 * en number au commit. Vide → null.
 */
interface Props {
  value: number | null;
  onCommit: (next: number | null) => Promise<void> | void;
  placeholder?: string;
  className?: string;
  /** Si true, désactive la saisie (lecture seule). */
  disabled?: boolean;
}

function formatDisplay(v: number | null): string {
  if (v == null) return "";
  return Math.round(v).toLocaleString("fr-FR") + " €";
}

function parseInput(s: string): number | null {
  const cleaned = s.replace(/[^\d.,-]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function MoneyInput({ value, onCommit, placeholder, className, disabled }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value != null ? String(Math.round(value)) : "");

  useEffect(() => {
    if (!editing) {
      setDraft(value != null ? String(Math.round(value)) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function commit() {
    const parsed = parseInput(draft);
    if (parsed !== value) {
      void onCommit(parsed);
    }
    setEditing(false);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={editing ? draft : formatDisplay(value)}
      onFocus={(e) => {
        if (disabled) return;
        setEditing(true);
        setDraft(value != null ? String(Math.round(value)) : "");
        e.target.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(value != null ? String(Math.round(value)) : "");
          setEditing(false);
        }
      }}
      placeholder={placeholder ?? "0 €"}
      disabled={disabled}
      className={cn(
        "h-8 w-full rounded-md border bg-background px-2 text-sm tabular-nums text-right",
        "focus:outline-none focus:ring-2 focus:ring-foreground/20",
        disabled && "opacity-60 cursor-not-allowed",
        className,
      )}
    />
  );
}
