"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Loader2, Pencil, Plus } from "lucide-react";
import { DealCategory, type ProductionStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DealFormDialog } from "@/components/deals/deal-form-dialog";
import { setProductionStatus, updateProduction } from "@/lib/actions/productions";

interface Props {
  productionId: string;
  name: string;
  status: ProductionStatus;
  artistId: string;
  artistName: string;
  /** Action placée juste après « Ajouter une date » (ex. « Ajouter une résidence »). */
  extra?: React.ReactNode;
  /**
   * « add » = boutons d'ajout (en-tête) ; « settings » = renommer / clôturer
   * (onglet Contrat) ; défaut = tout.
   */
  mode?: "all" | "add" | "settings";
}

/** Actions d'en-tête de la fiche production : ajout de date, renommage, clôture (KN). */
export function ProductionActions({
  productionId,
  name,
  status,
  artistId,
  artistName,
  extra,
  mode = "all",
}: Props) {
  const showAdd = mode !== "settings";
  const showSettings = mode !== "add";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [nextName, setNextName] = useState(name);
  const [error, setError] = useState<string | null>(null);

  function toggleStatus() {
    const closing = status === "ACTIVE";
    if (
      closing &&
      !confirm(
        "Clôturer la production ? Elle passera dans « Terminées ». Tu pourras la réouvrir.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      await setProductionStatus(productionId, closing ? "CLOSED" : "ACTIVE");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {showAdd && (
        <>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Ajouter une date
          </Button>
          {extra}
        </>
      )}
      {showSettings && (
        <>
          <Button size="sm" variant="outline" onClick={() => setRenameOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Renommer
          </Button>
          <Button size="sm" variant="outline" onClick={toggleStatus} disabled={pending}>
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : status === "ACTIVE" ? (
              <Archive className="h-3.5 w-3.5 mr-1.5" />
            ) : (
              <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" />
            )}
            {status === "ACTIVE" ? "Clôturer la production" : "Réouvrir la production"}
          </Button>
        </>
      )}

      {addOpen && (
        <DealFormDialog
          open
          onOpenChange={setAddOpen}
          category={DealCategory.PROD_EXE}
          defaults={{ artistId, artistName, showName: name }}
        />
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renommer la production</DialogTitle>
          </DialogHeader>
          <Input value={nextName} onChange={(e) => setNextName(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">
            Le nom du spectacle de toutes les dates sera mis à jour.
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              disabled={pending || !nextName.trim()}
              onClick={() =>
                startTransition(async () => {
                  const res = await updateProduction(productionId, { name: nextName.trim() });
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setRenameOpen(false);
                  router.refresh();
                })
              }
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
