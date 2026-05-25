"use client";

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Date picker FR — copie fidèle de KuroNeko-App
 * `components/tasks/date-picker-field.tsx` (cf. AGENTS.md règle copie fidèle).
 *
 * Bouton outline + popover Calendar (locale fr, semaine commence lundi),
 * affichage "d MMM yyyy" en français. Bouton X pour vider (désactivable
 * via `allowClear` pour les champs obligatoires).
 *
 * Utilisé par le form ArtistInfo (birthDate). Sera réutilisé Sprint 3+
 * sur les forms Deal (dateBooking, paymentDate, etc.).
 */
interface DatePickerFieldProps {
  value: Date | null | undefined;
  onChange: (d: Date | null) => void;
  placeholder?: string;
  className?: string;
  /** @default true */
  allowClear?: boolean;
}

export function DatePickerField({
  value,
  onChange,
  placeholder = "Choisir une date",
  className,
  allowClear = true,
}: DatePickerFieldProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            type="button"
            className={cn(
              "w-full min-w-0 justify-start text-left font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">
              {value ? format(value, "d MMM yyyy", { locale: fr }) : placeholder}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value ?? undefined}
            onSelect={(d) => onChange(d ?? null)}
            locale={fr}
            weekStartsOn={1}
            captionLayout="dropdown"
            startMonth={new Date(2024, 0, 1)}
            endMonth={new Date(2030, 11, 31)}
          />
        </PopoverContent>
      </Popover>
      {value && allowClear && (
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label="Effacer la date"
          onClick={() => onChange(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
