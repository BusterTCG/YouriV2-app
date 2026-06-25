"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Link2Off, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ContactPicker,
  type ContactSnapshot,
} from "@/components/deals/contact-picker";
import {
  linkArtistToContact,
  unlinkArtistContact,
} from "@/lib/actions/artist-profile";

/**
 * Lien fiche artiste ↔ fiche contact KN (Stan 2026-06-25).
 *
 *   - Pas de contact lié → bouton « Lier un contact existant » → dialog avec
 *     recherche annuaire (ContactPicker). Sert au rattachement des fiches déjà
 *     créées + évite les doublons quand un contact existe déjà.
 *   - Contact lié → badge « ✓ Fiche contact liée » + « Délier ».
 */
interface Props {
  artistId: string;
  hasContact: boolean;
}

export function ArtistContactLink({ artistId, hasContact }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onPick(snapshot: ContactSnapshot | null) {
    if (!snapshot) return;
    setError(null);
    startTransition(async () => {
      const res = await linkArtistToContact(artistId, snapshot.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function onUnlink() {
    startTransition(async () => {
      const res = await unlinkArtistContact(artistId);
      if (res.ok) router.refresh();
    });
  }

  if (hasContact) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
          ✓ Fiche contact liée
        </span>
        <button
          type="button"
          onClick={onUnlink}
          disabled={pending}
          title="Détacher le contact lié"
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2Off className="h-3 w-3" />}
          Délier
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Link2 className="h-3 w-3" />
        Lier un contact existant
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lier un contact existant</DialogTitle>
            <DialogDescription>
              Recherche le contact de l&apos;annuaire à rattacher à cette fiche
              artiste. Les modifications de tél/mail de l&apos;artiste seront
              ensuite répercutées sur ce contact.
            </DialogDescription>
          </DialogHeader>
          <ContactPicker value={null} onChange={onPick} />
          {pending && (
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Liaison…
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md p-2">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
