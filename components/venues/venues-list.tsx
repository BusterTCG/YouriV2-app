"use client";

import { useState } from "react";
import { Building2, MapPin, Users, Briefcase, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VenueFormDialog } from "./venue-form-dialog";
import type { VenueListItem } from "@/lib/venues-local";

interface Props {
  venues: VenueListItem[];
}

/**
 * Liste des lieux sous forme de cartes — copie fidèle de KuroNeko-App
 * (cf. `KuroNeko-App/components/venues/venues-list.tsx`). Clic sur une carte
 * → ouvre le dialog en mode édition.
 *
 * Pour un lieu multi-salles, on affiche le nombre de salles (badge) + un
 * preview compact des sous-salles avec leur jauge en bas. Pour un lieu mono-
 * salle, on affiche directement la jauge.
 */
export function VenuesList({ venues }: Props) {
  const [editing, setEditing] = useState<VenueListItem | null>(null);

  if (venues.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
        Aucun lieu pour l&apos;instant. Clique sur{" "}
        <span className="font-medium text-foreground">Nouveau lieu</span> pour
        en créer un.
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {venues.map((v) => (
          <Card
            key={v.id}
            className="hover:bg-accent/40 hover:border-foreground/30 transition-colors cursor-pointer"
            onClick={() => setEditing(v)}
          >
            <CardContent className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-3.5 w-3.5 text-yr-gold shrink-0" />
                  <div className="font-semibold truncate">{v.name}</div>
                </div>
                {v.rooms.length > 0 ? (
                  <Badge variant="outline" className="shrink-0 tabular-nums">
                    {v.rooms.length} salle{v.rooms.length > 1 ? "s" : ""}
                  </Badge>
                ) : (
                  v.capacity != null && (
                    <Badge variant="outline" className="shrink-0 tabular-nums">
                      {v.capacity} pl
                    </Badge>
                  )
                )}
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{v.city}</span>
              </div>

              {/* Pills compactes par sous-salle, affichées seulement en multi-salles
                  (sinon la jauge du lieu suffit). */}
              {v.rooms.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {v.rooms.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-muted/40 text-muted-foreground"
                      title={r.notes ?? undefined}
                    >
                      <span className="font-medium text-foreground/80">
                        {r.name}
                      </span>
                      {r.capacity != null && (
                        <span className="tabular-nums">· {r.capacity}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1 border-t">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {v.contactsCount} contact{v.contactsCount > 1 ? "s" : ""}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  {v.dealsCount} deal{v.dealsCount > 1 ? "s" : ""}
                </span>
                <span className="ml-auto">
                  <Pencil className="h-3 w-3 opacity-50" />
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {editing && (
        <VenueFormDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          venue={editing}
        />
      )}
    </>
  );
}
