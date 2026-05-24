"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { createVenue, updateVenue, createVenueRoom } from "@/lib/actions/venues";
import type { KnVenue } from "@/lib/kn-client";

interface VenueFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venue?: KnVenue;
}

export function VenueFormDialog({ open, onOpenChange, venue }: VenueFormDialogProps) {
  const router = useRouter();
  const isEdit = venue != null;

  const [name, setName] = useState(venue?.name ?? "");
  const [city, setCity] = useState(venue?.city ?? "");
  const [address, setAddress] = useState(venue?.address ?? "");
  const [capacity, setCapacity] = useState(venue?.capacity?.toString() ?? "");
  const [notes, setNotes] = useState(venue?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Sous-salles : uniquement en mode édition (besoin de venueId)
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomCapacity, setNewRoomCapacity] = useState("");
  const [addingRoom, setAddingRoom] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const payload = {
        name: name.trim(),
        city: city.trim(),
        address: address.trim() || null,
        capacity: capacity.trim() ? Number.parseInt(capacity, 10) : null,
        notes: notes.trim() || null,
      };
      const res = isEdit
        ? await updateVenue({ id: venue.id, patch: payload })
        : await createVenue(payload);

      if (!res.ok) {
        setError(res.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  function handleAddRoom() {
    if (!venue || newRoomName.trim().length === 0) return;
    setError(null);
    setAddingRoom(true);
    startTransition(async () => {
      const res = await createVenueRoom({
        venueId: venue.id,
        name: newRoomName.trim(),
        capacity: newRoomCapacity.trim() ? Number.parseInt(newRoomCapacity, 10) : null,
      });
      setAddingRoom(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNewRoomName("");
      setNewRoomCapacity("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Modifier le lieu" : "Nouveau lieu"}</DialogTitle>
            <DialogDescription>
              Annuaire partagé avec KuroNeko. Sous-salles ajoutables après création.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nom *</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex : Olympia"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Ville *</Label>
              <Input
                id="city"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ex : Paris"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Adresse</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="28 Boulevard des Capucines"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="capacity">Jauge (capacité)</Label>
            <Input
              id="capacity"
              type="number"
              min={1}
              max={100000}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="2000"
              className="max-w-[180px]"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              disabled={isPending}
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Annuler
            </Button>
            <Button type="submit" disabled={isPending || name.trim().length === 0 || city.trim().length === 0}>
              {isPending ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>

        {isEdit && venue && (
          <>
            <Separator />
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-semibold">Sous-salles</h4>
                <p className="text-xs text-muted-foreground">
                  Pour les lieux multi-salles (théâtre + studio + foyer). Optionnel.
                </p>
              </div>

              {venue.rooms.length > 0 && (
                <ul className="space-y-1">
                  {venue.rooms.map((room) => (
                    <li
                      key={room.id}
                      className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{room.name}</span>
                      {room.capacity != null && (
                        <span className="text-xs text-muted-foreground">
                          jauge {room.capacity}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="room-name" className="text-xs">
                    Nouvelle salle
                  </Label>
                  <Input
                    id="room-name"
                    placeholder="Ex : Grande Salle"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    disabled={addingRoom}
                  />
                </div>
                <div className="w-28 space-y-1">
                  <Label htmlFor="room-capacity" className="text-xs">
                    Jauge
                  </Label>
                  <Input
                    id="room-capacity"
                    type="number"
                    placeholder="—"
                    value={newRoomCapacity}
                    onChange={(e) => setNewRoomCapacity(e.target.value)}
                    disabled={addingRoom}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddRoom}
                  disabled={addingRoom || newRoomName.trim().length === 0}
                >
                  <Plus className="h-4 w-4" />
                  Ajouter
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
