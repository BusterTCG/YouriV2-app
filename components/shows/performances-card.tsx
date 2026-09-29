"use client";

// Séances d'une date / d'un mois de résidence (portage KN, étape 2,
// Stan 2026-09-27) : une ligne par soir (un doublé = 2 lignes) avec jauge,
// payants, invités et billetterie HT saisis séance par séance. Les totaux de
// la date (payants, remplissage, ticket moyen, billetterie) en découlent.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertCircle, Ban, CalendarPlus, Copy, Loader2, Trash2, Undo2 } from "lucide-react";
import type { VenueDealKind } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatEur } from "@/components/deals/deal-helpers";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import {
  addPerformances,
  deletePerformance,
  updatePerformance,
} from "@/lib/actions/performances";
import { cn } from "@/lib/utils";
import { SectionTitle } from "@/components/shows/section-title";

export type PerformanceRow = {
  id: string;
  /** "YYYY-MM-DD" */
  day: string;
  time: string | null;
  capacity: number | null;
  paying: number | null;
  invited: number | null;
  grossTicketing: number | null;
  cancelled: boolean;
};

interface Props {
  dealId: string;
  performances: PerformanceRow[];
  /** Jauge de la date (défaut des séances sans jauge propre). */
  dealCapacity: number | null;
  venueDealKind: VenueDealKind | null;
  /** Recette HT saisie (somme des lignes RECETTE_HT) — relevé net en co-réa. */
  recetteHt: number;
  /** Payants cumulés historiques non ventilés par séance (avant étape 2). */
  legacyPaying: number | null;
  /** Titre de la carte (ex. « Séances » ou « Octobre 2026 »). */
  title?: string;
  /** Aujourd'hui "YYYY-MM-DD" (séances passées grisées). */
  todayKey: string;
  compact?: boolean;
  /** Masque la mention Recette HT du pied (la fiche résidence a le relevé juste en dessous). */
  hideRecette?: boolean;
}

export function PerformancesCard({
  dealId,
  performances,
  dealCapacity,
  venueDealKind,
  recetteHt,
  legacyPaying,
  title = "Séances",
  todayKey,
  compact,
  hideRecette = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const last = performances[performances.length - 1];
  const [newDay, setNewDay] = useState(last?.day ?? todayKey);
  const [newTime, setNewTime] = useState(last?.time ?? "");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Erreur");
      router.refresh();
    });
  }

  // Totaux (séances non annulées)
  const active = performances.filter((p) => !p.cancelled);
  const sumOf = (vals: Array<number | null>) =>
    vals.some((v) => v != null) ? vals.reduce<number>((s, v) => s + (v ?? 0), 0) : null;
  const paying = sumOf(active.map((p) => p.paying));
  const invited = sumOf(active.map((p) => p.invited));
  const gross = sumOf(active.map((p) => p.grossTicketing));
  const caps = active.map((p) => p.capacity ?? dealCapacity);
  const capacity = caps.length && caps.every((c) => c != null) ? caps.reduce<number>((s, c) => s + (c ?? 0), 0) : null;
  const fill = capacity && paying ? Math.round((paying / capacity) * 100) : null;
  const ticket = gross && paying ? Math.round(gross / paying) : null;
  const showLegacy = legacyPaying != null && legacyPaying > 0 && paying == null;

  return (
    <div className={cn("rounded-md border bg-card", compact && "border-dashed")}>
      <div className="px-4 py-2.5 border-b flex items-center justify-between gap-2 flex-wrap">
        <SectionTitle tone="blue" as="h3">
          {title} · {active.length}
          {performances.length !== active.length && (
            <span className="normal-case font-normal"> (+{performances.length - active.length} annulée)</span>
          )}
        </SectionTitle>
        <div className="flex items-center gap-2">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Button size="sm" variant="outline" className="h-7" onClick={() => setAdding((v) => !v)}>
            <CalendarPlus className="h-3.5 w-3.5 mr-1" />
            Séance
          </Button>
        </div>
      </div>

      {showLegacy && (
        <div className="px-4 py-2 text-xs border-b border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300 inline-flex items-center gap-1.5 w-full">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {legacyPaying} payants saisis en cumul avant les séances — à ventiler séance par séance
          (le cumul est remplacé dès la 1re saisie).
        </div>
      )}

      <div className="overflow-x-auto">
        {/* Colonnes à largeur fixe : chaque champ est calé sous son titre
            (titres et valeurs numériques alignés à droite). */}
        <table className="w-full min-w-[720px] table-fixed text-sm tabular-nums">
          <colgroup>
            <col className="w-[110px]" />
            <col className="w-[96px]" />
            <col className="w-[84px]" />
            <col className="w-[92px]" />
            <col className="w-[84px]" />
            <col className="w-[128px]" />
            <col className="w-[72px]" />
            <col />
          </colgroup>
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-semibold px-3 py-1.5">Date</th>
              <th className="text-left font-semibold px-2 py-1.5">Heure</th>
              <th className="text-right font-semibold px-2 py-1.5">Jauge</th>
              <th className="text-right font-semibold px-2 py-1.5">Payants</th>
              <th className="text-right font-semibold px-2 py-1.5">Invités</th>
              <th className="text-right font-semibold px-2 py-1.5">Billetterie HT</th>
              <th className="text-right font-semibold px-2 py-1.5">Rempl.</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {performances.map((p) => (
              <PerfRow
                key={p.id}
                p={p}
                dealCapacity={dealCapacity}
                past={p.day < todayKey}
                disabled={pending}
                run={run}
                onDuplicate={() =>
                  run(() => addPerformances({ dealId, items: [{ day: p.day, time: null }] }))
                }
              />
            ))}
          </tbody>
          <tfoot className="bg-muted/30 font-semibold text-sm">
            <tr>
              <td className="px-3 py-1.5" colSpan={2}>
                Total
              </td>
              <td className="px-2 py-1.5 text-right">{capacity ?? "—"}</td>
              <td className="px-2 py-1.5 text-right">{paying ?? (showLegacy ? `${legacyPaying}*` : "—")}</td>
              <td className="px-2 py-1.5 text-right">{invited ?? "—"}</td>
              <td className="px-2 py-1.5 text-right">
                {gross != null ? <SensitiveAmount value={gross} /> : "—"}
              </td>
              <td className="px-2 py-1.5 text-right">{fill != null ? `${fill}%` : "—"}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {adding && (
        <div className="px-4 py-2.5 border-t bg-muted/20 flex items-center gap-2 flex-wrap">
          <Input type="date" className="h-8 w-40 text-sm" value={newDay} onChange={(e) => setNewDay(e.target.value)} />
          <Input
            className="h-8 w-24 text-sm"
            placeholder="19:30"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
          />
          <Button
            size="sm"
            className="h-8"
            disabled={pending || !newDay}
            onClick={() =>
              run(async () => {
                const res = await addPerformances({ dealId, items: [{ day: newDay, time: newTime || null }] });
                if (res.ok) setAdding(false);
                return res;
              })
            }
          >
            Ajouter
          </Button>
        </div>
      )}

      <div className="px-4 py-2 border-t text-[11px] text-muted-foreground flex items-center gap-x-4 gap-y-1 flex-wrap">
        <span>
          Ticket moyen : <span className="font-semibold text-foreground">{ticket != null ? formatEur(ticket) : "—"}</span>
        </span>
        {hideRecette ? null : venueDealKind === "PROD" ? (
          <span>Salle louée : la Recette HT reprend automatiquement la billetterie des séances.</span>
        ) : (
          <span>
            Recette HT saisie{venueDealKind === "CO_REAL" ? " (relevé net du théâtre)" : ""} :{" "}
            <span className="font-semibold text-foreground">
              <SensitiveAmount value={recetteHt} />
            </span>
            {gross != null && (
              <>
                {" "}· billetterie des séances :{" "}
                <span className="font-semibold text-foreground">
                  <SensitiveAmount value={gross} />
                </span>
              </>
            )}
          </span>
        )}
        {error && <span className="text-destructive">{error}</span>}
      </div>
    </div>
  );
}

function PerfRow({
  p,
  dealCapacity,
  past,
  disabled,
  run,
  onDuplicate,
}: {
  p: PerformanceRow;
  dealCapacity: number | null;
  past: boolean;
  disabled: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
  onDuplicate: () => void;
}) {
  const [time, setTime] = useState(p.time ?? "");
  const [capacity, setCapacity] = useState(p.capacity?.toString() ?? "");
  const [paying, setPaying] = useState(p.paying?.toString() ?? "");
  const [invited, setInvited] = useState(p.invited?.toString() ?? "");
  const [gross, setGross] = useState(p.grossTicketing?.toString() ?? "");
  const cap = p.capacity ?? dealCapacity;
  const fill = cap && p.paying ? Math.round((p.paying / cap) * 100) : null;

  const numOrNull = (v: string) => {
    const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
    return v.trim() === "" || Number.isNaN(n) ? null : n;
  };
  const save = (field: string, raw: string, current: number | string | null) => {
    const v = field === "time" ? raw.trim() || null : numOrNull(raw);
    if (v === current) return;
    run(() => updatePerformance(p.id, { [field]: v }));
  };

  const cell = "h-7 w-full text-sm text-right tabular-nums px-1.5";
  return (
    <tr className={cn(p.cancelled && "opacity-50 line-through", past && !p.cancelled && "bg-muted/20")}>
      <td className="px-3 py-1 whitespace-nowrap capitalize">
        {format(new Date(`${p.day}T12:00:00Z`), "EEE dd/MM", { locale: fr })}
      </td>
      <td className="px-2 py-1">
        <Input className="h-7 w-full text-sm px-1.5" value={time} placeholder="—" disabled={disabled || p.cancelled}
          onChange={(e) => setTime(e.target.value)} onBlur={() => save("time", time, p.time)} />
      </td>
      <td className="px-2 py-1">
        <Input className={cell} value={capacity} placeholder={dealCapacity?.toString() ?? "—"}
          disabled={disabled || p.cancelled} inputMode="numeric"
          onChange={(e) => setCapacity(e.target.value)} onBlur={() => save("capacity", capacity, p.capacity)} />
      </td>
      <td className="px-2 py-1">
        <Input className={cell} value={paying} placeholder="—" disabled={disabled || p.cancelled}
          inputMode="numeric" onChange={(e) => setPaying(e.target.value)} onBlur={() => save("paying", paying, p.paying)} />
      </td>
      <td className="px-2 py-1">
        <Input className={cell} value={invited} placeholder="—" disabled={disabled || p.cancelled}
          inputMode="numeric" onChange={(e) => setInvited(e.target.value)} onBlur={() => save("invited", invited, p.invited)} />
      </td>
      <td className="px-2 py-1">
        <Input className={cell} value={gross} placeholder="€" disabled={disabled || p.cancelled}
          inputMode="decimal" onChange={(e) => setGross(e.target.value)}
          onBlur={() => save("grossTicketing", gross, p.grossTicketing)} />
      </td>
      <td className={cn("px-2 py-1 text-right text-xs", fill != null && fill >= 80 && "text-emerald-600 dark:text-emerald-400 font-semibold")}>
        {fill != null ? `${fill}%` : "—"}
      </td>
      <td className="px-2 py-1">
        <div className="flex items-center justify-end gap-0.5 no-underline">
          <IconBtn title="Doubler (2e séance le même soir)" disabled={disabled || p.cancelled} onClick={onDuplicate}>
            <Copy className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            title={p.cancelled ? "Rétablir la séance" : "Annuler la séance"}
            disabled={disabled}
            onClick={() => run(() => updatePerformance(p.id, { cancelled: !p.cancelled }))}
          >
            {p.cancelled ? <Undo2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
          </IconBtn>
          <IconBtn
            title="Supprimer la séance"
            disabled={disabled}
            danger
            onClick={() => {
              if (confirm("Supprimer cette séance ?")) run(() => deletePerformance(p.id));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </td>
    </tr>
  );
}

function IconBtn({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "p-1 rounded text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40",
        danger ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
