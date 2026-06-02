import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, MapPin } from "lucide-react";
import { CategoryChip } from "@/components/tasks/task-helpers";
import type { WeekItem } from "@/lib/dashboard";

interface Props {
  items: WeekItem[];
}

const VISIBLE = 5;

/**
 * "Cette semaine" — deals dans les 7 prochains jours, toutes catégories.
 * Stan 2026-06-02 v2 : disposition en colonne étroite (3 cols avec Mes tâches
 * et À venir). Limite 5 items affichés.
 */
export function DashboardWeek({ items }: Props) {
  const visible = items.slice(0, VISIBLE);
  const remaining = Math.max(0, items.length - VISIBLE);

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-amber-500 shrink-0" />
        <h2 className="text-sm font-semibold uppercase tracking-wider truncate">
          Cette semaine
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {items.length}
        </span>
      </div>
      <div className="rounded-md border overflow-hidden divide-y bg-card">
        {visible.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground italic">
            Rien dans les 7 prochains jours.
          </div>
        ) : (
          visible.map((it) => (
            <Link
              key={it.id}
              href={it.href}
              className="flex items-start gap-2 px-3 py-2 hover:bg-accent/30 transition-colors min-w-0"
            >
              <div className="shrink-0 w-10 text-center text-[10px] leading-tight pt-0.5">
                <div className="font-semibold uppercase text-sm">
                  {format(it.date, "dd", { locale: fr })}
                </div>
                <div className="text-muted-foreground">
                  {format(it.date, "MMM", { locale: fr })}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium leading-tight truncate inline-flex items-center gap-1.5 max-w-full">
                  <CategoryChip category={it.category} />
                  <span className="truncate">{it.title}</span>
                </div>
                {it.primaryArtistName && (
                  <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {it.primaryArtistName}
                  </div>
                )}
                {(it.venueName || it.venueCity) && (
                  <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1 mt-0.5 min-w-0">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {[it.venueName, it.venueCity].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                )}
              </div>
            </Link>
          ))
        )}
        {remaining > 0 && (
          <div className="block px-3 py-1.5 text-center text-[11px] text-muted-foreground">
            + {remaining} autres deals cette semaine
          </div>
        )}
      </div>
    </section>
  );
}
