"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { DealStatus } from "@prisma/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dealStatusLabel } from "./deal-helpers";
import { setDealStatus } from "@/lib/actions/deals";
import { cn } from "@/lib/utils";

/**
 * Select inline statut deal (LEAD / EN_COURS / CONFIRME / ANNULE) — pattern
 * KN deals-table. Click stoppé pour ne pas propager au row.
 */
interface Props {
  dealId: string;
  value: DealStatus;
  className?: string;
}

const OPTIONS: DealStatus[] = ["LEAD", "EN_COURS", "CONFIRME", "ANNULE"];

export function DealStatusInline({ dealId, value, className }: Props) {
  const [pending, startTransition] = useTransition();

  function onChange(next: DealStatus) {
    startTransition(async () => {
      await setDealStatus({ dealId, status: next });
    });
  }

  const meta = dealStatusLabel(value);

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as DealStatus)}
        disabled={pending}
      >
        <SelectTrigger
          className={cn(
            "h-7 px-2 text-xs gap-1 min-w-[110px] border",
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
          {OPTIONS.map((s) => {
            const m = dealStatusLabel(s);
            return (
              <SelectItem key={s} value={s}>
                {m.emoji} {m.label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
