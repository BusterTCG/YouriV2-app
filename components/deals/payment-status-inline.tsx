"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { PaymentStatus } from "@prisma/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  paymentStatusClass,
  paymentStatusLabel,
  PAYMENT_STATUS_OPTIONS,
} from "./deal-helpers";
import {
  setDealArtistStatusBulk,
  setDealBudgetStatus,
} from "@/lib/actions/deals";
import { cn } from "@/lib/utils";

/**
 * Select inline statut paiement (TO_INVOICE / INVOICED / PAID / N_A) avec
 * pill colorée — pattern KN deals-table PaymentStatusInline.
 *
 * Bulk : update tous les DealArtiste du deal (1 ligne tableau = 1 deal
 * consolidé). Le `kind` détermine si on touche cachet ou com Youri.
 *
 * Si `consolidatedFrom === 'MIXED'` (statuts mixed par artiste), on affiche
 * un Select désactivé avec tooltip "Statuts mixtes — ouvrir la fiche pour
 * éditer par artiste". Stan peut quand même forcer un statut commun via le
 * dropdown (qui devient "Forcer à...") — à décider plus tard si besoin.
 *
 * Pour cette V1 : si MIXED, Select désactivé. L'user va sur la fiche pour
 * éditer par artiste.
 */
interface Props {
  dealId: string;
  /**
   * kind="cachet" → édite paymentStatus de tous les DealArtiste (bulk).
   * kind="budget" → édite budgetPaymentStatus du Deal (= St. Marge).
   */
  kind: "cachet" | "budget";
  /** Statut courant. */
  value: PaymentStatus;
  /** True si les artistes diffèrent (édition bulk désactivée). N/A pour budget. */
  isMixed: boolean;
  className?: string;
}

export function PaymentStatusInline({
  dealId,
  kind,
  value,
  isMixed,
  className,
}: Props) {
  const [pending, startTransition] = useTransition();

  function onChange(next: PaymentStatus) {
    startTransition(async () => {
      if (kind === "cachet") {
        await setDealArtistStatusBulk({ dealId, status: next });
      } else {
        await setDealBudgetStatus({ dealId, status: next });
      }
    });
  }

  const meta = paymentStatusLabel(value);
  const cls = paymentStatusClass(value);

  if (isMixed) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 rounded border bg-muted/40 text-muted-foreground px-2 py-0.5 text-xs cursor-help"
        title="Statuts mixtes par artiste — ouvrir la fiche pour éditer par artiste"
      >
        <span>—</span>
        <span>Mixte</span>
      </div>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as PaymentStatus)}
        disabled={pending}
      >
        <SelectTrigger
          className={cn(
            "h-7 px-2 text-xs gap-1 min-w-[110px] border",
            cls,
            className,
          )}
        >
          <SelectValue>
            <span className="inline-flex items-center gap-1">
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span>{meta.emoji}</span>
              )}
              <span>{meta.label}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PAYMENT_STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.emoji} {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
