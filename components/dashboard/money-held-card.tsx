"use client";

import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronRight, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SensitiveAmount } from "./sensitive-amount";
import type { MoneyHeld } from "@/lib/finance/money-held-server";
import { withVat } from "@/lib/finance/money-held";

/**
 * « À reverser » (Stan 2026-10-16, copie de la card KN) : l'argent sur le
 * compte Pangee qui ne lui appartient pas — reçu, pas encore versé aux
 * artistes, aux fournisseurs ni aux associés. Chiffre à date (indépendant de
 * la période), avec une ligne TVA indicative à 20 %. Au clic : le détail par
 * deal / production.
 */
export function MoneyHeldCard({ moneyHeld }: { moneyHeld: MoneyHeld }) {
  const { vat, ttc } = withVat(moneyHeld.total);
  const owed = moneyHeld.total > 0;
  const breakdown = [
    { label: "Artistes", value: moneyHeld.artists },
    { label: "Charges", value: moneyHeld.charges },
    { label: "MF", value: moneyHeld.fees },
  ].filter((b) => b.value > 0);

  const details = (
    <div className="mt-0.5 space-y-0.5 text-[11px] text-muted-foreground tabular-nums leading-tight">
      {breakdown.length > 0 && (
        <div>
          {breakdown.map((b, i) => (
            <span key={b.label}>
              {i > 0 && " · "}
              {b.label} <SensitiveAmount value={b.value} />
            </span>
          ))}
        </div>
      )}
      <div>
        TVA 20 % <SensitiveAmount value={vat} /> · TTC <SensitiveAmount value={ttc} />
      </div>
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group col-span-2 lg:col-span-1 rounded-md border bg-card p-3 sm:p-4 space-y-1 min-w-0 text-left transition-all cursor-pointer",
            "hover:bg-accent/40 hover:shadow-sm data-[state=open]:bg-accent/40",
            owed && "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 data-[state=open]:bg-amber-500/10",
          )}
        >
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-0">
            <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1 min-w-0 leading-tight">À reverser — à date</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
          </div>
          <div
            className={cn(
              "text-lg sm:text-2xl font-semibold tabular-nums truncate",
              owed && "text-amber-700 dark:text-amber-400",
            )}
          >
            <SensitiveAmount value={moneyHeld.total} />
          </div>
          {details}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[380px] max-w-[calc(100vw-2rem)] p-0 max-h-[480px] flex flex-col" sideOffset={6}>
        <div className="px-3 py-2.5 border-b shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            À reverser — reçu, pas encore payé
          </div>
          <div className="text-sm font-medium mt-0.5">
            <SensitiveAmount value={moneyHeld.total} />{" "}
            {moneyHeld.items.length > 0 && (
              <span className="text-xs text-muted-foreground font-normal">
                · {moneyHeld.items.length} ligne{moneyHeld.items.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          {details}
        </div>
        {moneyHeld.items.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground italic">
            Tout ce qui a été reçu est reversé 🎉
          </div>
        ) : (
          <ul className="divide-y overflow-y-auto flex-1">
            {moneyHeld.items.map((it) => (
              <li key={it.id}>
                <Link
                  href={it.href}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-accent/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-tight truncate">{it.title}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      {it.subtitle && <span>{it.subtitle}</span>}
                      {it.date && (
                        <span className="tabular-nums">· {format(it.date, "d MMM yyyy", { locale: fr })}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-semibold tabular-nums shrink-0">
                    <SensitiveAmount value={it.amount} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
