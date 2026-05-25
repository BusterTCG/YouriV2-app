"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { createArtist, updateArtist } from "@/lib/actions/artists";

interface ArtistFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Artiste à éditer (mode update). Absent = mode create. */
  artist?: {
    id: string;
    name: string;
    color: string;
    notes: string | null;
    active: boolean;
  };
}

/**
 * Dialog form create/update d'un artiste.
 * Mode déterminé par la présence de `artist` (update) ou son absence (create).
 *
 * Pas de champ couleur : Pangee a une couleur d'artiste unique (cf.
 * lib/artists-constants.ts + règle Stan 2026-05-26).
 */
export function ArtistFormDialog({ open, onOpenChange, artist }: ArtistFormDialogProps) {
  const router = useRouter();
  const isEdit = artist != null;

  const [name, setName] = useState(artist?.name ?? "");
  const [notes, setNotes] = useState(artist?.notes ?? "");
  const [active, setActive] = useState(artist?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const payload = { name: name.trim(), notes: notes.trim() || null, active };
      const res = isEdit
        ? await updateArtist({ id: artist.id, patch: payload })
        : await createArtist(payload);

      if (!res.ok) {
        setError(res.error);
        return;
      }
      onOpenChange(false);
      // Redirige vers la fiche (création) ou refresh (update)
      if (!isEdit && res.data?.slug) {
        router.push(`/artistes/${res.data.slug}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Modifier l'artiste" : "Nouvel artiste"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Mets à jour les infos de cet artiste."
                : "Ajoute un artiste managé / produit par Pangee Prod."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="name">Nom *</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Jean Dupont"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Style, préférences, infos contractuelles…"
              rows={4}
              disabled={isPending}
            />
          </div>

          {isEdit && (
            <div className="flex items-center gap-2">
              <input
                id="active"
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4"
                disabled={isPending}
              />
              <Label htmlFor="active" className="cursor-pointer">
                Actif (visible dans les listes par défaut)
              </Label>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Annuler
            </Button>
            <Button type="submit" disabled={isPending || name.trim().length === 0}>
              {isPending ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
