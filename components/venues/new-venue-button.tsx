"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VenueFormDialog } from "./venue-form-dialog";

/**
 * Bouton "+ Nouveau lieu" en header de /venues. Ouvre le dialog en mode
 * création (defaults vide).
 */
export function NewVenueButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" />
        Nouveau lieu
      </Button>
      <VenueFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
