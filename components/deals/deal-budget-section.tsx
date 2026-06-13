"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateDealBudget } from "@/lib/actions/deals";
import { PaidToggle } from "./paid-toggle";
import { MoneyInput } from "./money-input";
import { MonthPickerField } from "./month-picker-field";
import { DealSectionHeader } from "./deal-section-header";
import { SectionStatusBadge } from "./section-status-badge";
import { DealInstallmentsBlock } from "./deal-installments-section";
import type { DealInstallmentRow } from "@/lib/actions/deal-installments";

/**
 * Section CA (ex-Budget) — recette reçue de l'organisateur sur un deal Booking.
 *
 * Stan 2026-06-13 : renommée "CA" + l'échéancier de paiement est intégré DANS
 * ce bloc (sous la ligne CA), pas dissocié. Quand des échéances existent, c'est
 * elles qui pilotent l'encaissement (le toggle "Encaissé" + le month-picker
 * passent en statut dérivé lecture seule).
 */
interface Props {
  dealId: string;
  budgetAmount: number | null;
  isEncaisse: boolean;
  paidAt: Date | null;
  /** Échéancier de paiement (tranches). Vide = encaissement en une fois via
   *  le toggle manuel. Non vide = encaissement dérivé des tranches. */
  installments: DealInstallmentRow[];
}

export function DealBudgetSection({
  dealId,
  budgetAmount,
  isEncaisse,
  paidAt,
  installments,
}: Props) {
  const [pendingMonth, startMonthTransition] = useTransition();
  const hasInstallments = installments.length > 0;

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
        title="🟢 CA HT"
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
        {/* Ligne CA : montant + (toggle/mois si pas d'échéancier). */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2 hover:bg-accent/30 transition-colors">
          <div className="sm:w-[200px] sm:shrink-0 min-w-0">
            <div className="text-sm font-medium leading-tight">CA HT</div>
            {!hasInstallments && paidAt && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Encaissé en{" "}
                <span className="font-medium">
                  {format(paidAt, "MM/yy", { locale: fr })}
                </span>
              </div>
            )}
          </div>
          {/* Wrapper inputs : grid 2-col mobile, contents en desktop. */}
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <div className="sm:w-32 sm:shrink-0">
              <MoneyInput value={budgetAmount} onCommit={commitAmount} placeholder="0 €" />
            </div>
            <div className="hidden sm:block sm:w-16 sm:shrink-0" />
            {hasInstallments ? (
              // Échéancier présent → statut dérivé en lecture seule. Le détail
              // des tranches s'affiche juste en dessous dans le même bloc.
              <div className="col-span-2 sm:col-span-1 sm:w-[calc(9rem+0.75rem+8rem)] inline-flex items-center gap-1">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                    isEncaisse
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                      : "bg-muted/40 text-muted-foreground border-border",
                  )}
                >
                  {isEncaisse ? "✅ Encaissé" : "⏳ En cours"}
                </span>
                <span className="text-[11px] text-muted-foreground italic ml-1">
                  via échéancier
                </span>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>

        {/* Échéancier de paiement — intégré dans le bloc CA (Stan 2026-06-13).
            Découpe le CA en tranches datées. Les enfants deviennent siblings
            du divide-y ci-dessus. */}
        <DealInstallmentsBlock
          dealId={dealId}
          budgetAmount={budgetAmount}
          installments={installments}
        />
      </div>
    </section>
  );
}
