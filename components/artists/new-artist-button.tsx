"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewArtistDialog } from "./new-artist-dialog";

/**
 * Bouton « + Nouvel artiste » de la page /artistes.
 *
 * Ouvre le dialog partagé NewArtistDialog (saisie du nom → createArtist →
 * redirection vers la fiche). Le même dialog est réutilisé dans le formulaire
 * de création de deal via un bouton "+ Nouvel artiste" (Stan 2026-06-16).
 */
export function NewArtistButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Nouvel artiste
      </Button>

      <NewArtistDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
