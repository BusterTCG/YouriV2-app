"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { DealCategory } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { DealFormDialog } from "./deal-form-dialog";

/**
 * Bouton "Nouveau deal" — Sprint 3 (Booking) + Sprint 4 (Prod Exé).
 *
 * Si `category` est passé, le dialog crée directement un deal de cette
 * catégorie + redirige vers la fiche correspondante. Sinon BOOKING par défaut.
 */
export function NewDealButton({ category }: { category?: DealCategory }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Nouveau deal
      </Button>
      <DealFormDialog open={open} onOpenChange={setOpen} category={category} />
    </>
  );
}
