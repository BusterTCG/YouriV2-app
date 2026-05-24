"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArtistFormDialog } from "@/components/artists/artist-form-dialog";

export function NewArtistButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nouvel artiste
      </Button>
      <ArtistFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
