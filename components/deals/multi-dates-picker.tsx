"use client";

import { useState, useTransition } from "react";
import { format, startOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { updateShowDetails } from "@/lib/actions/prod-executive";

/**
 * Picker multi-jours pour les deals en mode "Mois complet" — copie fidèle
 * KuroNeko-App `components/shows/multi-dates-picker.tsx`.
 *
 * Affiche un Popover avec Calendar mode="multiple" pour cocher/décocher
 * les jours de représentation. Le trigger affiche "X représentations".
 *
 * Auto-save via `updateShowDetails` à chaque change (Youri V2 — sur KN,
 * le parent persiste lui-même via un onChange).
 */
interface Props {
  dealId: string;
  /** Date du deal — détermine le mois affiché par défaut. */
  dealDate?: Date;
  /** Dates initiales (array de "YYYY-MM-DD"). */
  initialDates: string[];
  disabled?: boolean;
}

/** Parse "YYYY-MM-DD" → Date locale (à minuit local — évite les surprises TZ). */
function parseIsoDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10));
}

/** Date locale → "YYYY-MM-DD". */
function toIsoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function MultiDatesPicker({
  dealId,
  dealDate,
  initialDates,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [dates, setDates] = useState<Date[]>(
    initialDates.map((s) => parseIsoDay(s)).filter((d): d is Date => d != null),
  );

  const monthStart = startOfMonth(dealDate ?? dates[0] ?? new Date());
  const count = dates.length;

  function handleChange(next: Date[] | undefined) {
    const arr = next ?? [];
    setDates(arr);
    const iso = arr.map(toIsoDay).sort();
    startTransition(async () => {
      await updateShowDetails({ id: dealId, multiDateDates: iso });
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || pending}
          className="gap-1.5 h-8"
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          <span className="tabular-nums font-semibold">{count}</span>
          <span className="text-muted-foreground">
            représentation{count > 1 ? "s" : ""}
          </span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="px-3 py-2 border-b text-xs text-muted-foreground">
          Sélectionne les jours de représentation pour{" "}
          <span className="font-medium text-foreground capitalize">
            {format(monthStart, "MMMM yyyy", { locale: fr })}
          </span>
        </div>
        <Calendar
          mode="multiple"
          selected={dates}
          onSelect={handleChange}
          defaultMonth={monthStart}
          locale={fr}
          weekStartsOn={1}
        />
        <div className="px-3 py-2 border-t flex items-center justify-between text-xs">
          <span className="text-muted-foreground tabular-nums">
            {count} jour{count > 1 ? "s" : ""} sélectionné{count > 1 ? "s" : ""}
          </span>
          <Button size="sm" onClick={() => setOpen(false)}>
            OK
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
