"use client";

import { useState, useRef, useEffect } from "react";
import { LogoutButton } from "@/components/layout/logout-button";
import { cn } from "@/lib/utils";

interface UserMenuProps {
  name: string;
  email: string;
  color: string;
  role: "ADMIN" | "MEMBER";
}

/**
 * Avatar circulaire avec initiales colorées + dropdown au clic
 * (logout + lien settings — quand /settings sera livré, Sprint 6+).
 *
 * Dropdown simple maison (pas de Radix DropdownMenu encore installé). Quand
 * on en aura besoin ailleurs, on l'installera via shadcn.
 */
export function UserMenu({ name, email, color, role }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown au click outside
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const initials = name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        style={{ backgroundColor: color }}
        aria-label={`Menu utilisateur (${name})`}
      >
        {initials}
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 mt-2 w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
            "z-50",
          )}
        >
          <div className="px-2 py-2">
            <p className="text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">{email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Rôle : <span className="font-medium">{role}</span>
            </p>
          </div>
          <div className="my-1 h-px bg-border" />
          <LogoutButton />
        </div>
      )}
    </div>
  );
}
