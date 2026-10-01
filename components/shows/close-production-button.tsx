"use client";

// Bouton « Clôturer » d'une production à clôturer (toutes ses dates jouées
// et soldées) — accueil Productions, onglet Spectacles (Stan 2026-10-01).

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setProductionStatus } from "@/lib/actions/productions";

export function CloseProductionButton({ productionId, name }: { productionId: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Clôturer « ${name} » ? Elle passera dans « Terminés ». Tu pourras la réouvrir.`)) return;
        startTransition(async () => {
          await setProductionStatus(productionId, "CLOSED");
          router.refresh();
        });
      }}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Archive className="h-3.5 w-3.5 mr-1" />}
      Clôturer
    </Button>
  );
}
