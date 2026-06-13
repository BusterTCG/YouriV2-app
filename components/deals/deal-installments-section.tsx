"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PaidToggle } from "./paid-toggle";
import { MoneyInput } from "./money-input";
import { DatePickerField } from "@/components/tasks/date-picker-field";
import { EditableLabel } from "./editable-label";
import { formatPct } from "./deal-helpers";
import { useEur } from "@/lib/privacy-context";
import {
  addDealInstallment,
  updateDealInstallment,
  removeDealInstallment,
  type DealInstallmentRow,
} from "@/lib/actions/deal-installments";

/**
 * Section Échéancier de paiement — BOOKING uniquement (Stan 2026-06-13).
 *
 * Découpe le budget reçu de l'organisateur en N tranches datées (acompte +
 * solde…). Chaque tranche = libellé + montant + mois d'échéance + statut
 * "Encaissé". La somme des tranches doit égaler le budget (contrôle visuel).
 *
 * Quand des tranches existent, le statut/encaissement du budget est DÉRIVÉ
 * d'elles côté serveur (recomputeBudgetFromInstallments) → la section Budget
 * affiche un état lecture seule (cf. deal-budget-section).
 *
 * Layout aligné sur DealChargesSection (label 200px + montant + statut +
 * date), responsive mobile (stack + grid 2-col).
 */
interface Props {
  dealId: string;
  /** Budget total du deal — référence pour le contrôle de répartition + %. */
  budgetAmount: number | null;
  installments: DealInstallmentRow[];
}

/**
 * Bloc échéancier — fragment de lignes (rows + contrôle + bouton ajouter)
 * destiné à être embarqué DANS la card de la section CA (deal-budget-section),
 * pas comme une section autonome. Stan 2026-06-13 : l'échéancier vit dans le
 * bloc CA, pas dissocié. Les enfants deviennent des siblings du `divide-y`
 * parent.
 */
export function DealInstallmentsBlock({
  dealId,
  budgetAmount,
  installments,
}: Props) {
  const eur = useEur();
  const [adding, startAdd] = useTransition();

  const total = installments.reduce((acc, i) => acc + (i.amount ?? 0), 0);

  // Contrôle de répartition : somme des tranches ≈ budget (tolérance 1 €).
  const budget = budgetAmount ?? 0;
  const diff = budget - total;
  const matches = installments.length === 0 || Math.abs(diff) <= 1;

  function handleAdd() {
    startAdd(async () => {
      // Pré-remplit le montant restant à répartir (budget − déjà réparti),
      // pour accélérer la saisie acompte/solde.
      const remaining = budget > 0 ? Math.max(0, Math.round(diff)) : null;
      await addDealInstallment({
        dealId,
        label: installments.length === 0 ? "Acompte" : "Solde",
        amount: remaining && remaining > 0 ? remaining : null,
      });
    });
  }

  return (
    <>
      {/* En-tête d'échéancier (seulement si des tranches existent) */}
      {installments.length > 0 && (
        <div className="px-3 py-1.5 bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold inline-flex items-center gap-1.5">
          <CalendarClock className="h-3 w-3 text-blue-500" />
          Échéancier
        </div>
      )}

      {installments.map((inst) => (
        <InstallmentRow key={inst.id} row={inst} budgetAmount={budgetAmount} />
      ))}

      {/* Contrôle de répartition (seulement si des tranches existent) */}
      {installments.length > 0 && (
        <div
          className={cn(
            "px-3 py-2 text-xs flex items-center justify-between gap-2",
            matches
              ? "bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
          )}
        >
          <span className="font-medium">
            {matches ? "✓ Réparti" : "⚠ Écart de répartition"}
          </span>
          <span className="tabular-nums">
            {eur(total)} / {eur(budget)}
            {!matches && diff !== 0 && (
              <span className="ml-1">
                ({diff > 0 ? "reste " : "dépasse de "}
                {eur(Math.abs(diff))})
              </span>
            )}
          </span>
        </div>
      )}

      <div className="px-3 py-2 flex items-center justify-between gap-2 bg-muted/20">
        <span className="text-[11px] text-muted-foreground italic">
          {installments.length === 0
            ? "Échelonner le paiement en tranches (acompte + solde…)"
            : ""}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={adding}
          className="h-7 text-xs gap-1 shrink-0"
        >
          <Plus className="h-3 w-3" />
          Ajouter une échéance
        </Button>
      </div>
    </>
  );
}

function InstallmentRow({
  row,
  budgetAmount,
}: {
  row: DealInstallmentRow;
  budgetAmount: number | null;
}) {
  const [removing, startRemoveTransition] = useTransition();
  const [pendingMonth, startMonthTransition] = useTransition();

  // % du budget (indicatif) — dérivé du montant.
  const pct =
    row.amount != null && budgetAmount != null && budgetAmount > 0
      ? (row.amount / budgetAmount) * 100
      : null;

  // MoneyInput / PaidToggle / EditableLabel gèrent leur propre pending interne
  // → on passe des handlers async simples (pattern DealChargesSection).
  async function commitAmount(next: number | null) {
    await updateDealInstallment({ id: row.id, amount: next });
  }
  async function commitLabel(next: string) {
    await updateDealInstallment({ id: row.id, label: next });
  }
  async function toggleEncaisse(next: boolean) {
    await updateDealInstallment({ id: row.id, isEncaisse: next });
  }
  function setDueDate(next: Date | null) {
    startMonthTransition(async () => {
      await updateDealInstallment({ id: row.id, dueDate: next });
    });
  }
  // Saisie d'un % → calcule le montant depuis le budget et le persiste.
  // Stan 2026-06-13 : two-way binding montant ↔ % (ex. acompte 30%).
  async function commitPct(nextPct: number | null) {
    if (nextPct == null || budgetAmount == null || budgetAmount <= 0) return;
    const amount = Math.round(budgetAmount * (nextPct / 100));
    await updateDealInstallment({ id: row.id, amount });
  }
  function handleRemove() {
    if (!confirm(`Supprimer l'échéance "${row.label}" ?`)) return;
    startRemoveTransition(async () => {
      await removeDealInstallment(row.id);
    });
  }

  const isPaid = row.paymentStatus === "PAID";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2 hover:bg-accent/30 transition-colors">
      {/* Label + delete (mobile aligné à droite) */}
      <div className="flex items-center justify-between gap-2 sm:w-[200px] sm:shrink-0 min-w-0">
        <div className="flex-1 min-w-0">
          <EditableLabel value={row.label} onCommit={commitLabel} />
        </div>
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          title="Supprimer cette échéance"
          className="sm:hidden h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Inputs : grid 2-col mobile / contents desktop */}
      <div className="grid grid-cols-2 gap-2 sm:contents">
        {/* Montant */}
        <div className="sm:w-32 sm:shrink-0">
          <MoneyInput value={row.amount} onCommit={commitAmount} />
        </div>

        {/* % du budget — éditable, two-way avec le montant (Stan 2026-06-13) */}
        <div className="sm:w-16 sm:shrink-0">
          <PctInput value={pct} onCommit={commitPct} />
        </div>

        {/* Statut Encaissé — full width mobile (col-span-2) */}
        <div className="col-span-2 sm:col-span-1 sm:w-36 sm:shrink-0">
          <PaidToggle
            isOn={isPaid}
            onToggle={toggleEncaisse}
            label="Encaissé"
            className="w-full justify-center"
          />
        </div>

        {/* Date d'échéance (jour) — full width mobile */}
        <div
          className={cn(
            "col-span-2 sm:col-span-1 sm:w-44 sm:shrink-0",
            pendingMonth && "opacity-60",
          )}
        >
          <DatePickerField
            value={row.dueDate}
            onChange={setDueDate}
            placeholder="Échéance"
            allowClear={false}
          />
        </div>
      </div>

      {/* Supprimer desktop */}
      <button
        type="button"
        onClick={handleRemove}
        disabled={removing}
        title="Supprimer cette échéance"
        className="hidden sm:flex h-7 w-7 shrink-0 rounded-md items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Input pourcentage du budget — two-way avec le montant (Stan 2026-06-13).
 * Affiche le % dérivé du montant ; saisir un % recalcule le montant côté
 * serveur via `onCommit`. Pattern identique au PctInput de DealArtistsSection.
 */
function PctInput({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (next: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(
    value != null ? String(Math.round(value)) : "",
  );

  // Resync l'affichage quand la valeur dérivée change (édition du montant)
  // et qu'on n'est pas en train de taper.
  const display = value != null ? formatPct(value, { integer: true }) : "";

  function commit() {
    const raw = draft.replace(/[^\d.,-]/g, "").replace(",", ".");
    const n = raw ? Number(raw) : null;
    const parsed = n != null && Number.isFinite(n) ? n : null;
    void onCommit(parsed);
    setEditing(false);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={editing ? draft : display}
      onFocus={(e) => {
        setEditing(true);
        setDraft(value != null ? String(Math.round(value)) : "");
        e.target.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(value != null ? String(Math.round(value)) : "");
          setEditing(false);
        }
      }}
      placeholder="%"
      title="Part du budget (%) — recalcule le montant"
      className="h-8 w-full rounded border-0 bg-transparent px-2 text-xs tabular-nums text-right text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20 focus:bg-background focus:text-foreground"
    />
  );
}
