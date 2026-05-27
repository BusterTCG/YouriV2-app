"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DealFormDialog, type DealFormDeal } from "./deal-form-dialog";
import { softDeleteDeal } from "@/lib/actions/deals";

/**
 * Boutons "Modifier" + "Supprimer" sur la fiche détail deal — Phase 3.5c.
 * Modifier ouvre DealFormDialog en mode édition (pré-rempli).
 * Supprimer demande confirm puis soft-delete + redirige vers /deals/booking.
 */
interface Props {
  deal: DealFormDeal;
}

export function DealActions({ deal }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pendingDelete, startDeleteTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Supprimer le deal "${deal.title}" ? Tous les artistes et charges seront aussi supprimés (corbeille).`)) {
      return;
    }
    startDeleteTransition(async () => {
      const res = await softDeleteDeal(deal.id);
      if (!res.ok) {
        alert(`Erreur : ${res.error}`);
        return;
      }
      // Redirige vers la liste de la catégorie du deal supprimé
      // (Stan 2026-05-27 : sinon un delete Prod Exé renvoyait sur Booking).
      const path =
        deal.category === "PROD_EXE"
          ? "/deals/prod-executive"
          : deal.category === "CACHETS"
            ? "/deals/cachets"
            : "/deals/booking";
      router.push(path);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setEditing(true)}
      >
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Modifier
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleDelete}
        disabled={pendingDelete}
        className="text-destructive hover:text-destructive"
      >
        {pendingDelete ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
        )}
        Supprimer
      </Button>
      <DealFormDialog open={editing} onOpenChange={setEditing} deal={deal} />
    </>
  );
}
