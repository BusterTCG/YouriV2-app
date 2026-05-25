"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Click-to-edit label — span par défaut (rendu identique aux labels statiques
 * "Budget Youri" / "Artiste Test 1"), bascule en input au click, save onBlur.
 *
 * Évite l'asymétrie visuelle d'un input avec border-transparent (qui rend
 * différemment du texte natif d'un span même avec classes identiques).
 */
interface Props {
  value: string;
  onCommit: (next: string) => Promise<void> | void;
  className?: string;
}

export function EditableLabel({ value, onCommit, className }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    const next = draft.trim();
    if (next && next !== value) {
      void onCommit(next);
    } else if (!next) {
      setDraft(value); // empêche le vide
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "text-sm font-medium leading-tight text-left w-full truncate cursor-text hover:bg-accent/30 rounded px-1 -mx-1",
          className,
        )}
        title="Cliquer pour modifier"
      >
        {value}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="text-sm font-medium leading-tight w-full rounded border bg-background px-1 -mx-1 -my-px focus:outline-none focus:ring-1 focus:ring-foreground/20"
    />
  );
}
