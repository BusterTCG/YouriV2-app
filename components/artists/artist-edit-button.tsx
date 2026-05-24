"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArtistFormDialog } from "@/components/artists/artist-form-dialog";

interface ArtistEditButtonProps {
  artist: {
    id: string;
    name: string;
    color: string;
    notes: string | null;
    active: boolean;
  };
}

export function ArtistEditButton({ artist }: ArtistEditButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        Modifier
      </Button>
      <ArtistFormDialog open={open} onOpenChange={setOpen} artist={artist} />
    </>
  );
}
