"use client";

// Bandeau « Date soldée » (lot 3, Stan 2026-10-01) : comptes clos, quote-part
// de frais généraux figée. « Rouvrir » remet la date dans « À solder ».

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reopenSettledDeal } from "@/lib/actions/artist-movements";

export function SettledBanner({
  dealId,
  settledOn,
  overheadShare,
}: {
  dealId: string;
  /** Date du solde, déjà formatée. */
  settledOn: string;
  overheadShare: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3 flex-wrap rounded-md border border-violet-500/40 bg-violet-500/10 px-4 py-2.5 text-sm">
      <Lock className="h-4 w-4 text-violet-700 dark:text-violet-300 shrink-0" />
      <div className="flex-1 min-w-[220px]">
        <span className="font-semibold text-violet-900 dark:text-violet-200">Date soldée le {settledOn}</span>
        <span className="text-xs text-muted-foreground">
          {" "}
          — comptes clos
          {overheadShare != null &&
            ` · quote-part de frais généraux figée à ${overheadShare.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7"
        disabled={pending}
        onClick={() => {
          if (!confirm("Rouvrir cette date ? Elle repassera « À solder » et sa quote-part de frais généraux sera de nouveau répartie.")) return;
          setError(null);
          startTransition(async () => {
            const res = await reopenSettledDeal(dealId);
            if (!res.ok) setError(res.error);
            router.refresh();
          });
        }}
      >
        {pending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
        Rouvrir
      </Button>
      {error && <span className="text-xs text-destructive w-full">{error}</span>}
    </div>
  );
}
