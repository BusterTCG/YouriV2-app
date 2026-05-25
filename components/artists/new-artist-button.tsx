"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { createArtist } from "@/lib/actions/artists";

/** Palette de couleurs proposées pour un nouvel artiste — cohérente avec les
 *  couleurs déjà seedées et CATEGORY_COLORS du reporting. */
const COLOR_PALETTE = [
  "#cc785c", // orange Anthropic
  "#7c3aed", // violet
  "#2563eb", // bleu
  "#10b981", // émeraude
  "#d4a93a", // or KN
  "#e11d48", // rose
  "#0891b2", // cyan
  "#f59e0b", // amber
  "#64748b", // ardoise
];

function pickRandomColor(): string {
  return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
}

/**
 * Bouton « + Nouvel artiste » + Dialog pour saisir nom + couleur.
 *
 * Workflow :
 *   1. Click → ouvre Dialog
 *   2. User tape un nom + choisit une couleur (palette de 9, défaut random)
 *   3. Submit → server action createArtist → redirige vers /artistes/<slug>
 *
 * Le slug est généré côté serveur depuis le nom (slugify + dedupe).
 * La photo s'ajoute ensuite directement depuis la fiche artiste (rond → upload).
 */
export function NewArtistButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [color, setColor] = useState(pickRandomColor());
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!name.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await createArtist({ name: name.trim(), color });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Reset puis redirige vers la fiche du nouvel artiste
      setName("");
      setColor(pickRandomColor());
      setOpen(false);
      router.push(`/artistes/${res.data!.slug}`);
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setError(null);
      if (!pending) {
        setName("");
        setColor(pickRandomColor());
      }
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Nouvel artiste
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un artiste</DialogTitle>
            <DialogDescription>
              Le slug est généré automatiquement depuis le nom. Tu pourras
              ajouter une photo et compléter la bio depuis la fiche après
              création.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="artist-name"
                className="text-xs uppercase tracking-wider text-muted-foreground font-semibold"
              >
                Nom complet
              </label>
              <Input
                id="artist-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. Sophie Mercier"
                autoFocus
                disabled={pending}
                maxLength={100}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Couleur
              </label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    disabled={pending}
                    className={cn(
                      "h-8 w-8 rounded-full transition-all",
                      "ring-offset-2 ring-offset-background",
                      color === c
                        ? "ring-2 ring-foreground scale-110"
                        : "ring-0 hover:ring-2 hover:ring-foreground/30",
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={`Choisir la couleur ${c}`}
                  />
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={pending || name.trim().length < 2}
                className="gap-1.5"
              >
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Créer l&apos;artiste
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
