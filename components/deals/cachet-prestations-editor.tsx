"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { MonthPickerField } from "./month-picker-field";
import { DealSectionHeader } from "./deal-section-header";
import { SectionStatusBadge } from "./section-status-badge";
import { PaidPill } from "./paid-pill";
import {
  addCachetPrestation,
  updateCachetPrestation,
  deleteCachetPrestation,
} from "@/lib/actions/cachets";

/**
 * Éditeur inline des prestations d'un deal CACHETS — Sprint 5 v2.
 *
 * 1 deal CACHETS = 1 artiste × 1 mois × N prestations facturées à des
 * sociétés différentes. Le total des prestations = budget facturé total,
 * la Marge Brute Pangee = total × cachetsFeesPct%, le reste va à l'artiste.
 *
 * Ergonomie reprise de `production-lines-editor` (Prod Exé) mais simplifiée :
 *   - 1 ligne = 1 prestation (société + montant + statut paiement)
 *   - Pas de catégories, pas de sous-entrées
 *   - Pill "Encaissé" cliquable + MonthPicker pour la date d'encaissement
 */

export interface CachetPrestationRow {
  id: string;
  prestataire: string;
  amount: number | null;
  paymentStatus: string;
  paidAt: Date | null;
  notes: string | null;
  order: number;
}

interface Props {
  dealId: string;
  prestations: CachetPrestationRow[];
  cachetsFeesPct: number;
}

export function CachetPrestationsEditor({
  dealId,
  prestations,
  cachetsFeesPct,
}: Props) {
  const [adding, startAdd] = useTransition();

  const totalBudget = prestations.reduce(
    (acc, p) => acc + (p.amount ?? 0),
    0,
  );
  const significantCount = prestations.filter((p) => (p.amount ?? 0) > 0).length;
  const paidCount = prestations.filter(
    (p) => (p.amount ?? 0) > 0 && p.paymentStatus === "PAID",
  ).length;
  const allPaid = significantCount > 0 && paidCount === significantCount;

  function addEmpty() {
    startAdd(async () => {
      await addCachetPrestation({
        dealId,
        prestataire: "",
        amount: null,
      });
    });
  }

  return (
    <section className="space-y-1.5">
      {/* Header canonique aligné Booking/Prod Exé — total en vert (revenu). */}
      <DealSectionHeader
        icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
        title="🟢 Prestations"
        subtitle={
          significantCount > 0 && (
            <SectionStatusBadge
              done={allPaid}
              label={
                allPaid
                  ? "Tout encaissé"
                  : `${significantCount - paidCount} en cours / ${significantCount}`
              }
            />
          )
        }
        total={totalBudget}
        totalAccent="positive"
      />

      <div className="rounded-md border overflow-hidden divide-y bg-card">
        {prestations.length === 0 && (
          <div className="px-3 py-6 text-sm text-muted-foreground italic text-center">
            Aucune prestation rattachée à ce deal.
          </div>
        )}
        {prestations.map((p) => (
          <PrestationRow key={p.id} line={p} />
        ))}
        <div className="px-3 py-2 flex justify-end bg-muted/20">
          <button
            type="button"
            onClick={addEmpty}
            disabled={adding}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-3 w-3" />
            Ajouter une prestation
          </button>
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────── Sous-composants ────────────────────────────

function PrestationRow({ line }: { line: CachetPrestationRow }) {
  const [pending, startTransition] = useTransition();
  const [prestataire, setPrestataire] = useState(line.prestataire);
  const [amount, setAmount] = useState<string>(
    line.amount != null ? String(line.amount) : "",
  );
  const [notes, setNotes] = useState(line.notes ?? "");

  const isPaid = line.paymentStatus === "PAID";

  function persist(patch: {
    prestataire?: string;
    amount?: number | null;
    notes?: string | null;
    isPaye?: boolean;
    paidAt?: Date | null;
  }) {
    startTransition(async () => {
      await updateCachetPrestation({
        id: line.id,
        ...patch,
        // Si on update juste un champ texte, ne pas envoyer isPaye undefined
      });
    });
  }

  function onPrestataireBlur() {
    if (prestataire !== line.prestataire) {
      const trimmed = prestataire.trim();
      if (trimmed.length === 0) {
        setPrestataire(line.prestataire); // rollback si vide
      } else {
        persist({ prestataire: trimmed });
      }
    }
  }
  function onAmountBlur() {
    const next = amount === "" ? null : Number(amount);
    if (next !== line.amount) persist({ amount: next });
  }
  function onNotesBlur() {
    if (notes !== (line.notes ?? "")) persist({ notes: notes.trim() || null });
  }
  function togglePaid() {
    persist({ isPaye: !isPaid });
  }
  function remove() {
    startTransition(async () => {
      await deleteCachetPrestation(line.id);
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors flex-wrap sm:flex-nowrap",
        pending && "opacity-60",
      )}
    >
      {/* Prestataire (société) */}
      <div className="w-[220px] shrink-0 min-w-0">
        <Input
          value={prestataire}
          onChange={(e) => setPrestataire(e.target.value)}
          onBlur={onPrestataireBlur}
          placeholder="Société facturée"
          className="h-8 text-sm"
        />
      </div>

      {/* Montant */}
      <div className="w-32 shrink-0 relative">
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={onAmountBlur}
          placeholder="0,00"
          min={0}
          step="0.01"
          className="h-8 text-sm text-right tabular-nums pr-6"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          €
        </span>
      </div>

      {/* Pill Encaissé — pattern partagé PaidPill (wording "Encaissé" car entrée cash). */}
      <div className="w-24 shrink-0">
        <PaidPill
          paid={isPaid}
          onToggle={togglePaid}
          disabled={pending || (Number(amount) || 0) <= 0}
          label="Encaissé"
        />
      </div>

      {/* MonthPicker date d'encaissement (visible si Encaissé) */}
      <div className="w-[110px] shrink-0">
        {isPaid && (
          <MonthPickerField
            value={line.paidAt}
            onChange={(d) => persist({ paidAt: d })}
            size="sm"
          />
        )}
      </div>

      {/* Notes libres */}
      <div className="flex-1 min-w-[120px]">
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={onNotesBlur}
          placeholder=""
          className="h-8 text-xs"
        />
      </div>

      {/* Supprimer */}
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        title="Supprimer cette prestation"
        className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

