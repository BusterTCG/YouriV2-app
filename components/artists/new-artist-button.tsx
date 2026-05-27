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
import { createArtist } from "@/lib/actions/artists";

/**
 * Bouton « + Nouvel artiste » + Dialog pour saisir le nom.
 *
 * Couleur : Pangee Prod a une couleur unique pour tous les artistes (cf.
 * lib/artists-constants.ts PANGEE_ARTIST_COLOR + règle Stan 2026-05-26 :
 * "50+ artistes = pas la peine d'avoir des couleurs"). Pas de palette
 * dans le dialog — juste le nom.
 *
 * Workflow :
 *   1. Click → ouvre Dialog
 *   2. User tape un nom
 *   3. Submit → server action createArtist (couleur forcée serveur)
 *      → redirige vers /artistes/<slug>
 */
export function NewArtistButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!name.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await createArtist({ name: name.trim() });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName("");
      setOpen(false);
      router.push(`/artistes/${res.data!.slug}`);
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setError(null);
      if (!pending) setName("");
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
                placeholder=""
                autoFocus
                disabled={pending}
                maxLength={100}
              />
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
