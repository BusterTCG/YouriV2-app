"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VenueFormDialog } from "@/components/venues/venue-form-dialog";

export function NewVenueButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nouveau lieu
      </Button>
      <VenueFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
