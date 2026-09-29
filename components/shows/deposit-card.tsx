"use client";

// Carte « Acompte salle » (portage KN, Stan 2026-09-28) — sur une résidence ou une date de
// tournée. L'acompte fonctionne comme une CAUTION : versé puis récupéré en
// fin d'exploitation, jamais imputé, sans impact sur le résultat. Warning
// orange tant qu'il n'est pas récupéré.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, Landmark, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import {
  deleteVenueDeposit,
  setDepositRefunded,
  upsertVenueDeposit,
} from "@/lib/actions/deposits";

export type DepositData = {
  id: string;
  amount: number;
  /** "YYYY-MM-DD" */
  paidAt: string | null;
  refundedAt: string | null;
  note: string | null;
};

export function DepositCard({
  target,
  deposit,
}: {
  target: { residencyId?: string; dealId?: string };
  deposit: DepositData | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(deposit ? String(deposit.amount) : "");
  const [paidAt, setPaidAt] = useState(deposit?.paidAt ?? "");
  const [note, setNote] = useState(deposit?.note ?? "");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Erreur");
      else after?.();
      router.refresh();
    });
  }

  function save() {
    const n = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
    if (!n || n <= 0) {
      setError("Montant requis");
      return;
    }
    run(
      () =>
        upsertVenueDeposit({
          ...target,
          amount: n,
          paidAt: paidAt ? new Date(`${paidAt}T12:00:00Z`) : null,
          note: note || null,
        }),
      () => setEditing(false),
    );
  }

  // Pas d'acompte : simple bouton d'ajout.
  if (!deposit && !editing) {
    return (
      <div className="rounded-md border border-dashed bg-card/50 px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
          <Landmark className="h-4 w-4" />
          Aucun acompte versé à la salle.
        </span>
        <Button size="sm" variant="outline" className="h-8" onClick={() => setEditing(true)}>
          + Acompte versé
        </Button>
      </div>
    );
  }

  // Saisie / modification.
  if (editing || !deposit) {
    return (
      <div className="rounded-md border bg-card px-4 py-3 space-y-2">
        <div className="text-sm font-semibold inline-flex items-center gap-1.5">
          <Landmark className="h-4 w-4" />
          Acompte versé à la salle
          <span className="text-xs font-normal text-muted-foreground">
            — à récupérer en fin d&apos;exploitation, sans impact sur le résultat
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-28">
            <Input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Montant €"
              className="h-8 text-sm text-right tabular-nums"
            />
          </div>
          <span className="text-xs text-muted-foreground">versé le</span>
          <Input type="date" className="h-8 w-40 text-sm" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          <Input className="h-8 w-56 text-sm" placeholder="Note (optionnel)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" className="h-8" onClick={save} disabled={pending}>
            {pending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Enregistrer
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>
            Annuler
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  const recovered = deposit.refundedAt != null;
  return (
    <div
      className={
        recovered
          ? "rounded-md border border-emerald-500/40 bg-emerald-500/5 px-4 py-2.5"
          : "rounded-md border-2 border-amber-500/60 bg-amber-500/10 px-4 py-2.5"
      }
    >
      <div className="flex items-center gap-3 flex-wrap text-sm">
        {recovered ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
        )}
        <div className="flex-1 min-w-[220px]">
          <div className={recovered ? "font-semibold text-emerald-800 dark:text-emerald-300" : "font-semibold text-amber-900 dark:text-amber-200"}>
            Acompte{" "}
            <SensitiveAmount value={deposit.amount} />{" "}
            {recovered
              ? `récupéré le ${format(new Date(`${deposit.refundedAt}T12:00:00Z`), "dd/MM/yyyy")}`
              : "à récupérer auprès de la salle"}
          </div>
          <div className="text-xs text-muted-foreground">
            {deposit.paidAt && `Versé le ${format(new Date(`${deposit.paidAt}T12:00:00Z`), "dd/MM/yyyy")} · `}
            Caution — sans impact sur le résultat
            {deposit.note && ` · ${deposit.note}`}
          </div>
        </div>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {recovered ? (
          <button
            type="button"
            className="text-xs underline text-muted-foreground"
            disabled={pending}
            onClick={() => run(() => setDepositRefunded(deposit.id, null))}
          >
            annuler
          </button>
        ) : (
          <Button
            size="sm"
            className="h-8"
            disabled={pending}
            onClick={() => run(() => setDepositRefunded(deposit.id, new Date()))}
          >
            Marquer récupéré
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(true)} title="Modifier">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-muted-foreground hover:text-destructive"
          title="Supprimer"
          onClick={() => {
            if (confirm("Supprimer cet acompte ?")) run(() => deleteVenueDeposit(deposit.id));
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}
