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
        {/* Stan 2026-06-02 : mobile = stack vertical avec grid 2 cols pour
            les boutons (montant + statut alignés, mois full width dessous).
            Desktop = ligne flex avec largeurs fixes (label 200px + spacer
            16 pour aligner avec col % des Artistes). */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2 hover:bg-accent/30 transition-colors">
          <div className="sm:w-[200px] sm:shrink-0 min-w-0">
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
          {/* Wrapper inputs : grid 2-col mobile, contents (= remonte dans le
              flex parent) en desktop. */}
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <div className="sm:w-32 sm:shrink-0">
              <MoneyInput value={budgetAmount} onCommit={commitAmount} placeholder="0 €" />
            </div>
            <div className="hidden sm:block sm:w-16 sm:shrink-0" />
            <div className="sm:w-36 sm:shrink-0">
              <PaidToggle
                isOn={isEncaisse}
                onToggle={toggleEncaisse}
                label="Encaissé"
                className="w-full justify-center"
              />
            </div>
            <div className={`col-span-2 sm:col-span-1 sm:w-32 sm:shrink-0 ${pendingMonth ? "opacity-60" : ""}`}>
              <MonthPickerField
                value={paidAt}
                onChange={setPaidAt}
                size="sm"
                placeholder={isEncaisse ? "Choisir" : "—"}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
