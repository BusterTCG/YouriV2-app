"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { TrendingUp } from "lucide-react";
import { updateDealBudget } from "@/lib/actions/deals";
import { PaidToggle } from "./paid-toggle";
import { MoneyInput } from "./money-input";
import { MonthPickerField } from "./month-picker-field";
import { DealSectionHeader } from "./deal-section-header";
import { SectionStatusBadge } from "./section-status-badge";

/**
 * Section Budget Youri — copie fidèle KN show § Section "RECETTES".
 *
 * Structure :
 *   <section>
 *     <DealSectionHeader /> (h2 + sub + Total en vert text-base font-bold)
 *     <div border rounded divide-y>
 *       <ligne flex items-center gap-3 px-3 py-2>
 *         <div min-w-[180px] flex-1>Budget Youri</div>  ← text-sm font-medium leading-tight
 *         <div w-32>MoneyInput h-8 text-sm</div>
 *         <div w-32>PaidToggle</div>
 *         <div w-32>MonthPickerField</div>
 *       </ligne>
 *     </div>
 *   </section>
 */
interface Props {
  dealId: string;
  budgetAmount: number | null;
  isEncaisse: boolean;
  paidAt: Date | null;
}

export function DealBudgetSection({ dealId, budgetAmount, isEncaisse, paidAt }: Props) {
  const [pendingMonth, startMonthTransition] = useTransition();

  async function commitAmount(next: number | null) {
    await updateDealBudget({ dealId, amount: next });
  }
  async function toggleEncaisse(next: boolean) {
    await updateDealBudget({ dealId, isEncaisse: next });
  }
  function setPaidAt(next: Date | null) {
    startMonthTransition(async () => {
      await updateDealBudget({ dealId, paidAt: next });
    });
  }

  return (
    <section className="space-y-1.5">
      <DealSectionHeader
        icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
        title="🟢 Budget"
        subtitle={
          <SectionStatusBadge
            done={isEncaisse}
            label={isEncaisse ? "Encaissé" : "En cours"}
          />
        }
        total={budgetAmount ?? 0}
        totalAccent="positive"
      />
      <div className="rounded-md border overflow-hidden divide-y">
        {/* Stan 2026-06-01 : alignement colonnes vertical avec Artistes /
            Charges via mêmes largeurs (label w-[200px] + spacer w-16 pour
            matcher la colonne % des Artistes). */}
        <div className="flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors flex-wrap sm:flex-nowrap">
          <div className="w-full sm:w-[200px] sm:shrink-0 min-w-0">
            <div className="text-sm font-medium leading-tight">Budget Youri</div>
            {paidAt && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Encaissé en{" "}
                <span className="font-medium">
                  {format(paidAt, "MM/yy", { locale: fr })}
                </span>
              </div>
            )}
          </div>
          {/* Montant */}
          <div className="w-32 shrink-0">
            <MoneyInput value={budgetAmount} onCommit={commitAmount} placeholder="0 €" />
          </div>
          {/* Spacer % — pour aligner avec la col % des Artistes */}
          <div className="hidden sm:block w-16 shrink-0" />
          {/* Statut paiement */}
          <div className="w-36 shrink-0">
            <PaidToggle
              isOn={isEncaisse}
              onToggle={toggleEncaisse}
              label="Encaissé"
              className="w-full justify-center"
            />
          </div>
          {/* Mois d'encaissement */}
          <div className={`w-32 shrink-0 ${pendingMonth ? "opacity-60" : ""}`}>
            <MonthPickerField
              value={paidAt}
              onChange={setPaidAt}
              size="sm"
              placeholder={isEncaisse ? "Choisir" : "—"}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
