"use client";

import { useTransition } from "react";
import { TrendingDown, Plus, Trash2 } from "lucide-react";
import type { BookingDealChargeRow } from "@/lib/deals-list-types";
import {
  updateDealCharge,
  addDealCharge,
  removeDealCharge,
} from "@/lib/actions/deals";
import { Button } from "@/components/ui/button";
import { PaidToggle } from "./paid-toggle";
import { MoneyInput } from "./money-input";
import { DealSectionHeader } from "./deal-section-header";
import { SectionStatusBadge } from "./section-status-badge";
import { EditableLabel } from "./editable-label";

/**
 * Section Charges diverses — copie fidèle KN show § Section "CHARGES" (rouge).
 *
 * Layout ligne KN identique :
 *   <div flex items-center gap-3 px-3 py-2>
 *     <div min-w-[180px] flex-1>Label (input ghost)</div>  ← text-sm font-medium leading-tight
 *     <div w-24>MoneyInput</div>
 *     <div w-36>PaidToggle</div>
 *     <div flex-1>Notes input</div>
 *     <button supprimer />
 *   </div>
 */
interface Props {
  dealId: string;
  charges: BookingDealChargeRow[];
}

export function DealChargesSection({ dealId, charges }: Props) {
  const [adding, startAddTransition] = useTransition();
  const total = charges.reduce((acc, c) => acc + (c.amount ?? 0), 0);
  const paidCount = charges.filter((c) => c.paymentStatus === "PAID").length;
  const allPaid = charges.length > 0 && paidCount === charges.length;
  const pendingCount = charges.length - paidCount;

  function handleAdd() {
    startAddTransition(async () => {
      await addDealCharge({ dealId, label: "Nouvelle charge", amount: null });
    });
  }

  return (
    <section className="space-y-1.5">
      <DealSectionHeader
        icon={<TrendingDown className="h-4 w-4 text-red-500" />}
        title="🔴 Charges diverses"
        subtitle={
          charges.length > 0 && (
            <SectionStatusBadge
              done={allPaid}
              label={
                allPaid
                  ? "Toutes payées"
                  : `${pendingCount} en cours / ${charges.length}`
              }
            />
          )
        }
        total={total}
        totalAccent="negative"
      />
      <div className="rounded-md border overflow-hidden divide-y">
        {charges.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground italic">
            Aucune charge enregistrée pour ce deal.
          </div>
        ) : (
          charges.map((c) => <ChargeRow key={c.id} row={c} />)
        )}
        <div className="px-3 py-2 flex justify-end bg-muted/20">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAdd}
            disabled={adding}
            className="h-7 text-xs gap-1"
          >
            <Plus className="h-3 w-3" />
            Ajouter une charge
          </Button>
        </div>
      </div>
    </section>
  );
}

function ChargeRow({ row }: { row: BookingDealChargeRow }) {
  const [, startTransition] = useTransition();
  const [removing, startRemoveTransition] = useTransition();

  async function commitAmount(next: number | null) {
    await updateDealCharge({ id: row.id, amount: next });
  }
  async function commitLabel(next: string) {
    await updateDealCharge({ id: row.id, label: next });
  }
  async function togglePaye(next: boolean) {
    await updateDealCharge({ id: row.id, isPaye: next });
  }
  function commitNotes(e: React.FocusEvent<HTMLInputElement>) {
    const next = e.target.value.trim() || null;
    if (next !== row.notes) {
      startTransition(async () => {
        await updateDealCharge({ id: row.id, notes: next });
      });
    }
  }
  function handleRemove() {
    if (!confirm(`Supprimer la charge "${row.label}" ?`)) return;
    startRemoveTransition(async () => {
      await removeDealCharge(row.id);
    });
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors flex-wrap sm:flex-nowrap">
      {/* Label — click-to-edit (span par défaut = rendu identique aux labels
          statiques Budget/Artiste). Input apparaît uniquement au click. */}
      <div className="min-w-[180px] flex-1 sm:flex-initial">
        <EditableLabel value={row.label} onCommit={commitLabel} />
      </div>

      {/* Montant */}
      <div className="w-24 shrink-0">
        <MoneyInput value={row.amount} onCommit={commitAmount} />
      </div>

      {/* Toggle Payé */}
      <div className="w-36 shrink-0">
        <PaidToggle
          isOn={row.paymentStatus === "PAID"}
          onToggle={togglePaye}
          label="Payé"
          className="w-full justify-center"
        />
      </div>

      {/* Notes */}
      <div className="flex-1 min-w-[120px]">
        <input
          type="text"
          defaultValue={row.notes ?? ""}
          onBlur={commitNotes}
          className="h-8 w-full rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>

      {/* Supprimer */}
      <button
        type="button"
        onClick={handleRemove}
        disabled={removing}
        title="Supprimer cette charge"
        className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
