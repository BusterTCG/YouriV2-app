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
  ARTIST_STATUS_OPTIONS,
  paymentStatusClass,
  paymentStatusLabel,
} from "./deal-helpers";
import { updateDealArtiste } from "@/lib/actions/deals";
import { cn } from "@/lib/utils";

/**
 * Select statut artiste — 4 valeurs (Stan 2026-05-26) :
 *   ⏳ En cours · 👍 Validé · 📄 Attente Facture · ✅ Payé
 *
 * Couleur du trigger selon la valeur (amber/teal/blue/emerald).
 * Save instantané via `updateDealArtiste`.
 */
interface Props {
  dealArtisteId: string;
  value: PaymentStatus;
  className?: string;
}

export function ArtistStatusSelect({ dealArtisteId, value, className }: Props) {
  const [pending, startTransition] = useTransition();

  function onChange(next: PaymentStatus) {
    startTransition(async () => {
      await updateDealArtiste({ id: dealArtisteId, paymentStatus: next });
    });
  }

  const meta = paymentStatusLabel(value);
  const cls = paymentStatusClass(value);

  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as PaymentStatus)}
      disabled={pending}
    >
      <SelectTrigger
        className={cn(
          "h-8 px-2 text-xs gap-1 border min-w-0",
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
        {ARTIST_STATUS_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.emoji} {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
