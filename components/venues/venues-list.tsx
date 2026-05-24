"use client";

import { useState } from "react";
import { Pencil, MapPin, Users as UsersIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VenueFormDialog } from "@/components/venues/venue-form-dialog";
import type { KnVenue } from "@/lib/kn-client";

export function VenuesList({ venues }: { venues: KnVenue[] }) {
  const [editing, setEditing] = useState<KnVenue | null>(null);

  if (venues.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">Aucun lieu pour cette recherche.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {venues.map((venue) => (
          <Card key={venue.id} className="transition-shadow hover:shadow-sm">
            <CardContent className="flex items-start justify-between gap-4 py-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{venue.name}</p>
                  <span className="text-sm text-muted-foreground">· {venue.city}</span>
                  {venue.capacity != null && (
                    <Badge variant="muted">
                      <UsersIcon className="mr-1 h-3 w-3" />
                      {venue.capacity}
                    </Badge>
                  )}
                </div>
                {venue.address && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {venue.address}
                  </p>
                )}
                {venue.rooms.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {venue.rooms.length} sous-salle{venue.rooms.length > 1 ? "s" : ""} :{" "}
                    {venue.rooms.map((r) => r.name).join(", ")}
                  </p>
                )}
                {venue.notes && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{venue.notes}</p>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEditing(venue)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {editing && (
        <VenueFormDialog
          open={true}
          onOpenChange={(o) => !o && setEditing(null)}
          venue={editing}
        />
      )}
    </>
  );
}
