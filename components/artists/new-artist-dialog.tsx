"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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

interface NewArtistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Si fourni : on renvoie l'artiste créé au parent au lieu de rediriger vers
   * sa fiche (réutilisation depuis le formulaire de deal — Stan 2026-06-16).
   */
  onCreated?: (artist: { id: string; slug: string; name: string }) => void;
}

/**
 * Dialog « Ajouter un artiste » — saisie du nom uniquement.
 *
 * Couleur : Pangee Prod a une couleur unique pour tous les artistes (cf.
 * lib/artists-constants.ts PANGEE_ARTIST_COLOR + règle Stan 2026-05-26 :
 * "50+ artistes = pas la peine d'avoir des couleurs"). Pas de palette — juste
 * le nom.
 *
 * Partagé entre le bouton de /artistes (NewArtistButton) et le formulaire de
 * création de deal (bouton "+ Nouvel artiste"). La modale doit rester
 * strictement identique aux deux endroits (Stan 2026-06-16).
 *
 * Par défaut : redirige vers /artistes/<slug> après création. Si `onCreated`
 * est fourni, on appelle le callback à la place (mode embarqué deal).
 */
export function NewArtistDialog({ open, onOpenChange, onCreated }: NewArtistDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await createArtist({ name: trimmed });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName("");
      onOpenChange(false);
      if (onCreated && res.data?.id && res.data?.slug) {
        onCreated({ id: res.data.id, slug: res.data.slug, name: trimmed });
        return;
      }
      router.push(`/artistes/${res.data!.slug}`);
    });
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setError(null);
      if (!pending) setName("");
    }
  }

  return (
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
              onClick={() => onOpenChange(false)}
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
  );
}
