"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DealFormDialog } from "./deal-form-dialog";

export function NewDealButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Nouveau deal
      </Button>
      <DealFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
