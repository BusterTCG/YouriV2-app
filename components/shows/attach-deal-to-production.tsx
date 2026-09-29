"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { attachDealToProduction } from "@/lib/actions/productions";

/** Sélecteur « Rattacher à… » pour une date de production sans production. */
export function AttachDealToProduction({
  dealId,
  productions,
}: {
  dealId: string;
  productions: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (productions.length === 0) {
    return (
      <span className="text-[11px] text-muted-foreground">
        Renseigne le nom du spectacle sur la date
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Select
        disabled={pending}
        onValueChange={(productionId) =>
          startTransition(async () => {
            const res = await attachDealToProduction(dealId, productionId);
            if (!res.ok) setError(res.error);
            router.refresh();
          })
        }
      >
        <SelectTrigger className="h-8 w-auto min-w-[180px] text-sm">
          <SelectValue placeholder="Rattacher à…" />
        </SelectTrigger>
        <SelectContent>
          {productions.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
