"use client";

import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * MonthPicker — copie fidèle KuroNeko-App `components/deals/month-picker-field.tsx`.
 *
 * Grille 4×3 des 12 mois avec navigation année. Affiche le mois court ("Mai")
 * sans année dans le bouton. Stocke en interne le 1er du mois UTC midi.
 */
interface MonthPickerFieldProps {
  value: Date | null | undefined;
  onChange: (d: Date | null) => void;
  placeholder?: string;
  className?: string;
  size?: "default" | "sm";
}

const MONTHS_SHORT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];

export function MonthPickerField({
  value,
  onChange,
  placeholder = "Choisir un mois",
  className,
  size = "default",
}: MonthPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [yearCursor, setYearCursor] = useState<number>(
    value ? value.getFullYear() : new Date().getFullYear(),
  );

  function selectMonth(monthIndex: number) {
    onChange(new Date(Date.UTC(yearCursor, monthIndex, 1, 12)));
    setOpen(false);
  }

  // Stan 2026-05-26 v4 : harmonisation format date d'encaissement = MM/yy
  // (cohérent avec colonne Encaiss. tableau booking + colonne Paiement MF).
  const labelDisplay = value
    ? format(value, "MM/yy", { locale: fr })
    : placeholder;

  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            type="button"
            size={size}
            className={cn(
              "w-full min-w-0 justify-start text-left font-normal",
              size === "sm" && "h-7 text-xs",
              !value && "text-muted-foreground",
              value && (size === "sm" ? "pr-7" : "pr-9"),
            )}
          >
            <CalendarIcon className={cn("mr-2 shrink-0", size === "sm" ? "h-3 w-3" : "h-4 w-4")} />
            <span className="truncate">{labelDisplay}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-3" align="start">
          <div className="flex items-center justify-between mb-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setYearCursor((y) => y - 1)}
              aria-label="Année précédente"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold tabular-nums text-sm">{yearCursor}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setYearCursor((y) => y + 1)}
              aria-label="Année suivante"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS_SHORT.map((m, i) => {
              const isSelected =
                value && value.getFullYear() === yearCursor && value.getMonth() === i;
              const isCurrent =
                new Date().getFullYear() === yearCursor && new Date().getMonth() === i;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => selectMonth(i)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-xs transition-colors border",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary font-medium"
                      : isCurrent
                        ? "border-yr-gold/50 hover:bg-accent"
                        : "border-transparent hover:bg-accent",
                  )}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {value && (
        <button
          type="button"
          aria-label="Effacer le mois"
          onClick={(e) => {
            e.stopPropagation();
            onChange(null);
          }}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
            size === "sm" ? "right-1" : "right-1.5",
          )}
        >
          <X className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
        </button>
      )}
    </div>
  );
}

