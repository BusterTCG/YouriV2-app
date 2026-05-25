import type { PaymentStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { paymentStatusClass, paymentStatusLabel } from "./deal-helpers";

/**
 * Pill statut paiement — copie fidèle KN PaymentStatusBadge.
 * Lecture seule (Lot édition inline à venir avec Select shadcn).
 *
 * Couleurs spécifiques par statut :
 *   - PAID       → emerald
 *   - INVOICED   → blue
 *   - TO_INVOICE → amber
 *   - N_A        → muted
 */
export function PaymentStatusPill({
  value,
  className,
}: {
  value: PaymentStatus;
  className?: string;
}) {
  const meta = paymentStatusLabel(value);
  const cls = paymentStatusClass(value);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs whitespace-nowrap",
        cls,
        className,
      )}
    >
      <span>{meta.emoji}</span>
      <span>{meta.label}</span>
    </span>
  );
}
