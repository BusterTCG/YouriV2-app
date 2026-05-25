"use client";

import { useTransition } from "react";
import { MonthPickerField } from "./month-picker-field";
import {
  setDealBudgetPaidAt,
  setDealArtistPaidAtBulk,
} from "@/lib/actions/deals";

/**
 * MonthPicker inline pour le mois d'encaissement.
 *
 * kind="budget" → update budgetPaidAt du Deal (= mois encaissement Youri = St. Marge).
 *                  Fixer une date passe aussi budgetPaymentStatus → PAID.
 * kind="cachet" → update paidAt sur tous les DealArtiste (bulk). Idem PAID auto.
 */
interface Props {
  dealId: string;
  kind: "budget" | "cachet";
  /** Date commune si tous identiques, sinon null. */
  value: Date | null;
  /** True si dates différentes (édition bulk désactivée). */
  isMultiple: boolean;
}

export function PaymentMonthInline({ dealId, kind, value, isMultiple }: Props) {
  const [pending, startTransition] = useTransition();

  function onChange(next: Date | null) {
    startTransition(async () => {
      if (kind === "budget") {
        await setDealBudgetPaidAt({ dealId, date: next });
      } else {
        await setDealArtistPaidAtBulk({ dealId, date: next });
      }
    });
  }

  if (isMultiple) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 rounded border bg-muted/40 text-muted-foreground px-2 py-1 text-xs cursor-help"
        title="Mois d'encaissement différents par artiste — ouvrir la fiche pour éditer"
      >
        Multi
      </div>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <MonthPickerField
        value={value}
        onChange={onChange}
        size="sm"
        placeholder="—"
        className={pending ? "opacity-60" : undefined}
      />
    </div>
  );
}
