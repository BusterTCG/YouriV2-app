"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2, Plus, Receipt, Trash2 } from "lucide-react";
import type { PaymentStatus } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import {
  createOverhead,
  deleteOverhead,
  updateOverhead,
} from "@/lib/actions/productions";
import { cn } from "@/lib/utils";
import { SectionTitle } from "@/components/shows/section-title";

type Row = {
  id: string;
  label: string;
  date: Date | null;
  amount: number;
  status: PaymentStatus;
  comment: string | null;
};

interface Props {
  productionId: string;
  rows: Row[];
  total: number;
  perPerformance: number;
  performancesPlanned: number;
  unallocated: number;
}

/**
 * Frais généraux d'une production (carte SNCF, affiches, captation…) —
 * répartis automatiquement sur toutes les dates au prorata du nombre de
 * représentations (prévues incluses, annulées exclues).
 */
export function ProductionOverheadsEditor({
  productionId,
  rows,
  total,
  perPerformance,
  performancesPlanned,
  unallocated,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Erreur");
      router.refresh();
    });
  }

  function add() {
    const n = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
    if (!label.trim() || Number.isNaN(n)) {
      setError("Libellé et montant requis");
      return;
    }
    run(async () => {
      const res = await createOverhead(productionId, {
        label: label.trim(),
        amount: n,
        date: date ? new Date(`${date}T12:00:00Z`) : null,
      });
      if (res.ok) {
        setLabel("");
        setAmount("");
        setDate("");
      }
      return res;
    });
  }

  return (
    <div id="frais-generaux" className="rounded-md border bg-card scroll-mt-20">
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2 flex-wrap">
        <div>
          <SectionTitle tone="violet" as="h3" icon={<Receipt className="h-3.5 w-3.5" />}>
            Frais généraux
          </SectionTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Charges communes à toute la production, lissées au prorata des
            représentations.
          </p>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums">
            <SensitiveAmount value={total} />
          </div>
          {performancesPlanned > 0 && total !== 0 && (
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {performancesPlanned} repr. →{" "}
              {perPerformance.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} € / repr.
            </div>
          )}
        </div>
      </div>

      {unallocated !== 0 && (
        <div className="px-4 py-2 text-xs border-b border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300">
          ⚠ Aucune représentation active : {Math.round(unallocated)} € de frais non répartis.
        </div>
      )}

      <div className="divide-y">
        {rows.map((r) => (
          <OverheadRow key={r.id} row={r} disabled={pending} run={run} />
        ))}
        {rows.length === 0 && (
          <p className="px-4 py-3 text-xs text-muted-foreground italic">
            Aucun frais général — ex. carte SNCF, affiches, captation, communication.
          </p>
        )}
      </div>

      {/* Ajout */}
      <div className="px-4 py-3 border-t bg-muted/20 flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Libellé (ex. Carte SNCF)"
          className="h-8 w-56 text-sm"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date de la dépense"
        />
        <div className="w-28">
          <Input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Montant €"
            className="h-8 text-sm text-right tabular-nums"
          />
        </div>
        <Button size="sm" className="h-8" onClick={add} disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
          Ajouter
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}

function OverheadRow({
  row,
  disabled,
  run,
}: {
  row: Row;
  disabled: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [label, setLabel] = useState(row.label);
  const [amount, setAmount] = useState(String(row.amount));
  const paid = row.status === "PAID";

  return (
    <div className="px-4 py-2 flex items-center gap-2 flex-wrap sm:flex-nowrap">
      <Input
        className="h-8 w-56 text-sm"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          if (label.trim() && label !== row.label) {
            run(() => updateOverhead(row.id, { label: label.trim() }));
          }
        }}
      />
      <span className="text-xs text-muted-foreground w-20 tabular-nums">
        {row.date ? format(row.date, "dd/MM/yyyy") : ""}
      </span>
      <div className="w-28">
        <Input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-8 text-sm text-right tabular-nums"
          onBlur={() => {
            const n = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
            if (!Number.isNaN(n) && n !== row.amount) {
              run(() => updateOverhead(row.id, { amount: n }));
            }
          }}
        />
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          run(() => updateOverhead(row.id, { status: paid ? "TO_INVOICE" : "PAID" }))
        }
        className={cn(
          "h-7 rounded-md px-2 text-[11px] font-medium border transition-colors",
          paid
            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
            : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
        )}
      >
        {paid ? "✓ Payé" : "À payer"}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (confirm(`Supprimer « ${row.label} » ?`)) run(() => deleteOverhead(row.id));
        }}
        className="ml-auto text-muted-foreground hover:text-destructive p-1"
        title="Supprimer"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
