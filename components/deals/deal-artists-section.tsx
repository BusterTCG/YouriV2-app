"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { TrendingDown, Trash2 } from "lucide-react";
import type { BookingDealArtistRow } from "@/lib/deals-list-types";
import { updateDealArtiste, removeDealArtist } from "@/lib/actions/deals";
import { formatPct } from "./deal-helpers";
import { ArtistStatusSelect } from "./artist-status-select";
import { MoneyInput } from "./money-input";
import { artistInitials } from "@/lib/artists";
import { DealSectionHeader } from "./deal-section-header";
import { ArtistRosterPicker } from "./artist-roster-picker";

/**
 * Section Artistes — copie fidèle KN show § Section "CHARGES" (rouge),
 * adaptée multi-artiste Youri V2.
 *
 * Layout ligne KN :
 *   <div flex items-center gap-3 px-3 py-2>
 *     <div min-w-[180px] flex-1>Artiste Test 1</div>  ← text-sm font-medium leading-tight
 *     <div w-24>MoneyInput</div>
 *     <div w-16>PctInput</div>
 *     <div w-36>ArtistStatusSelect</div>
 *     <div w-28>MonthPickerField</div>
 *     <div flex-1>Notes input</div>
 *   </div>
 */
interface Props {
  dealId: string;
  budgetAmount: number | null;
  artistes: BookingDealArtistRow[];
}

export function DealArtistsSection({ dealId, budgetAmount, artistes }: Props) {
  const total = artistes.reduce((acc, a) => acc + (a.amount ?? 0), 0);
  const excludeIds = artistes.map((a) => a.artist.id);

  return (
    <section className="space-y-1.5">
      <DealSectionHeader
        icon={<TrendingDown className="h-4 w-4 text-red-500" />}
        title="🔴 Artistes"
        subtitle="Rémunérations versées aux artistes"
        total={total}
        totalAccent="negative"
      />
      <div className="rounded-md border overflow-hidden divide-y">
        {artistes.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground italic">
            Aucun artiste rattaché à ce deal.
          </div>
        ) : (
          artistes.map((a) => (
            <ArtistRow key={a.id} row={a} budgetAmount={budgetAmount} />
          ))
        )}
        <div className="px-3 py-2 flex justify-end bg-muted/20">
          <ArtistRosterPicker dealId={dealId} excludeIds={excludeIds} />
        </div>
      </div>
    </section>
  );
}

function ArtistRow({
  row,
  budgetAmount,
}: {
  row: BookingDealArtistRow;
  budgetAmount: number | null;
}) {
  const [, startTransition] = useTransition();
  const [removing, startRemoveTransition] = useTransition();

  /**
   * Montant ↔ % interconnectés (Stan 2026-05-26) :
   *   - Saisie montant → recalcule % auto (= montant / budget * 100)
   *   - Saisie % → recalcule montant auto (= budget * % / 100)
   */
  async function commitAmount(next: number | null) {
    const patch: { id: string; cachetAmount: number | null; sharePct?: number | null } = {
      id: row.id,
      cachetAmount: next,
    };
    if (next != null && budgetAmount != null && budgetAmount > 0) {
      patch.sharePct = Math.round((next / budgetAmount) * 1000) / 10;
    } else if (next == null) {
      patch.sharePct = null;
    }
    await updateDealArtiste(patch);
  }
  async function commitPct(next: number | null) {
    const patch: { id: string; sharePct: number | null; cachetAmount?: number | null } = {
      id: row.id,
      sharePct: next,
    };
    if (next != null && budgetAmount != null) {
      patch.cachetAmount = Math.round((budgetAmount * next) / 100);
    }
    await updateDealArtiste(patch);
  }
  function commitNotes(e: React.FocusEvent<HTMLInputElement>) {
    const next = e.target.value.trim() || null;
    if (next !== row.notes) {
      startTransition(async () => {
        await updateDealArtiste({ id: row.id, notes: next });
      });
    }
  }
  function handleRemove() {
    if (!confirm(`Retirer ${row.artist.name} de ce deal ?`)) return;
    startRemoveTransition(async () => {
      await removeDealArtist(row.id);
    });
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors flex-wrap sm:flex-nowrap">
      {/* Nom — pattern KN : div text-sm font-medium leading-tight */}
      <div className="min-w-[180px] flex-1 sm:flex-initial">
        <Link
          href={`/artistes/${row.artist.slug}`}
          className="inline-flex items-center gap-2 hover:underline min-w-0"
        >
          <span
            className="inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-semibold text-white shrink-0"
            style={{ backgroundColor: row.artist.color ?? "#2563eb" }}
          >
            {artistInitials(row.artist.name, row.artist.slug).slice(0, 2)}
          </span>
          <span className="text-sm font-medium leading-tight truncate">
            {row.artist.name}
          </span>
        </Link>
      </div>

      {/* Montant */}
      <div className="w-24 shrink-0">
        <MoneyInput value={row.amount} onCommit={commitAmount} />
      </div>

      {/* % budget */}
      <div className="w-16 shrink-0">
        <PctInput value={row.sharePct} onCommit={commitPct} />
      </div>

      {/* Status select (4 valeurs) — w-36 pour "Attente Facture" */}
      <div className="w-36 shrink-0">
        <ArtistStatusSelect dealArtisteId={row.id} value={row.paymentStatus} />
      </div>

      {/* Notes — flex-1 min-w-[120px] (pattern KN) */}
      <div className="flex-1 min-w-[120px]">
        <input
          type="text"
          defaultValue={row.notes ?? ""}
          onBlur={commitNotes}
          placeholder="Commentaire optionnel"
          className="h-8 w-full rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>

      {/* Supprimer (pattern identique aux charges) */}
      <button
        type="button"
        onClick={handleRemove}
        disabled={removing}
        title={`Retirer ${row.artist.name} de ce deal`}
        className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Input pourcentage — controlled avec sync useEffect (pattern MoneyInput).
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
    value != null ? String(Math.round(value * 10) / 10) : "",
  );

  useEffect(() => {
    if (!editing) {
      setDraft(value != null ? String(Math.round(value * 10) / 10) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const display = value != null ? formatPct(value) : "";

  function commit() {
    const raw = draft.replace(/[^\d.,-]/g, "").replace(",", ".");
    const n = raw ? Number(raw) : null;
    const parsed = n != null && Number.isFinite(n) ? n : null;
    if (parsed !== value) {
      void onCommit(parsed);
    }
    setEditing(false);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={editing ? draft : display}
      onFocus={(e) => {
        setEditing(true);
        setDraft(value != null ? String(Math.round(value * 10) / 10) : "");
        e.target.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(value != null ? String(Math.round(value * 10) / 10) : "");
          setEditing(false);
        }
      }}
      placeholder="—"
      className="h-8 w-full rounded-md border bg-background px-2 text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-foreground/20"
    />
  );
}
