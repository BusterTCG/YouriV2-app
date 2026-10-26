"use client";

// Bandeau « Date soldée » (lot 3, Stan 2026-10-01) : comptes clos, quote-part
// de frais généraux figée. « Rouvrir » remet la date dans « À solder ».
// Quote-part versée mais charges à payer / recettes à encaisser (Stan
// 2026-10-26) : la date reste « À solder » et le bandeau dit ce qui reste.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reopenSettledDeal } from "@/lib/actions/artist-movements";
import { hasOpenMoney } from "@/lib/date-lifecycle";
import { cn } from "@/lib/utils";

const eur = (v: number) => v.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export function SettledBanner({
  dealId,
  settledOn,
  overheadShare,
  openRevenue,
  openCost,
}: {
  dealId: string;
  /** Date du solde, déjà formatée. */
  settledOn: string;
  overheadShare: number | null;
  /** Recettes non encaissées (€). */
  openRevenue: number;
  /** Charges non payées (€). */
  openCost: number;
}) {
  const open = hasOpenMoney(openRevenue, openCost);
  const remaining = [
    Math.round(openCost) !== 0 && `${eur(openCost)} de charges à payer`,
    Math.round(openRevenue) !== 0 && `${eur(openRevenue)} à encaisser`,
  ].filter(Boolean);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div
      className={cn(
        "flex items-center gap-3 flex-wrap rounded-md border px-4 py-2.5 text-sm",
        open ? "border-amber-500/40 bg-amber-500/10" : "border-violet-500/40 bg-violet-500/10",
      )}
    >
      <Lock
        className={cn(
          "h-4 w-4 shrink-0",
          open ? "text-amber-700 dark:text-amber-300" : "text-violet-700 dark:text-violet-300",
        )}
      />
      <div className="flex-1 min-w-[220px]">
        {open ? (
          <span className="font-semibold text-amber-900 dark:text-amber-200">
            Quote-part artiste réglée le {settledOn} — reste {remaining.join(" et ")}
          </span>
        ) : (
          <span className="font-semibold text-violet-900 dark:text-violet-200">Date soldée le {settledOn}</span>
        )}
        <span className="text-xs text-muted-foreground">
          {" "}
          — {open ? "la date sera soldée une fois tout réglé" : "comptes clos"}
          {overheadShare != null && ` · quote-part de frais généraux figée à ${eur(overheadShare)}`}
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
