"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactFormDialog } from "./contact-form-dialog";
import type { VenueOption } from "@/lib/contacts-types";

/**
 * Bouton "+ Nouveau contact" pour le header de /contacts.
 * Le dialog gère lui-même la persistence (Server Action + revalidate).
 *
 * On reçoit la liste des salles (`venues`) depuis le server component parent :
 * pré-chargée une fois, elle alimente le select "Salle rattachée" du dialog.
 */
export function NewContactButton({ venues = [] }: { venues?: VenueOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />
        Nouveau contact
      </Button>
      {open && <ContactFormDialog open onOpenChange={setOpen} venues={venues} />}
    </>
  );
}
