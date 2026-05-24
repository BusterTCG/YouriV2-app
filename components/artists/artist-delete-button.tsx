"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { softDeleteArtist } from "@/lib/actions/artists";

/**
 * Bouton suppression à 2 clics dans les 4s (pas de modal Dialog —
 * pattern emprunté à KuroNeko).
 */
export function ArtistDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleFirstClick() {
    setConfirming(true);
    setTimeout(() => setConfirming(false), 4000);
  }

  function handleConfirm() {
    startTransition(async () => {
      const res = await softDeleteArtist({ id });
      if (res.ok) {
        router.push("/artistes");
        router.refresh();
      } else {
        alert(res.error);
        setConfirming(false);
      }
    });
  }

  return (
    <Button
      variant={confirming ? "destructive" : "outline"}
      size="sm"
      onClick={confirming ? handleConfirm : handleFirstClick}
      disabled={isPending}
    >
      <Trash2 className="h-4 w-4" />
      {confirming ? "Confirmer ?" : "Supprimer"}
    </Button>
  );
}
