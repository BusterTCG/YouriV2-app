"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";

export function NewContactButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nouveau contact
      </Button>
      <ContactFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
