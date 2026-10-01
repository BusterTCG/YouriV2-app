"use client";

import { GlossaryHint } from "@/components/shows/glossary-hint";
import type { GlossaryKey } from "@/lib/production-glossary";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HandCoins, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SectionTitle } from "@/components/shows/section-title";
import { updateProduction } from "@/lib/actions/productions";
import { cn } from "@/lib/utils";

interface Props {
  productionId: string;
  prodExePct: number | null;
  coprodKnPct: number | null;
  /** Contrat défini (au moins un taux saisi). */
  defined: boolean;
  /** Contrat distinct pour les résidences (Stan 2026-09-29). */
  residencySeparate: boolean;
  residencyProdExePct: number | null;
  residencyCoprodKnPct: number | null;
  /** La production a au moins une résidence (sinon bloc en sourdine). */
  hasResidencies: boolean;
}

/**
 * Contrat artiste de l'exploitation (KN, Stan 2026-09-28) : deux taux cumulables —
 * prod-exé % du CA perçu, puis co-prod % du bénéfice restant. Toutes les dates
 * (tournée, résidences) l'appliquent ; chaque date ne choisit que son accord
 * avec le lieu (co-réalisation, location, cession).
 *
 * Résidences (Stan 2026-09-29) : « Même contrat que les dates uniques »
 * coché par défaut ; décoché → taux propres aux mois de résidence.
 */
export function ProductionContractCard({
  productionId,
  prodExePct,
  coprodKnPct,
  defined,
  residencySeparate,
  residencyProdExePct,
  residencyCoprodKnPct,
  hasResidencies,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pe, setPe] = useState(defined && prodExePct != null ? String(prodExePct) : "");
  const [cp, setCp] = useState(defined && coprodKnPct != null ? String(coprodKnPct) : "");
  const [rpe, setRpe] = useState(residencyProdExePct != null ? String(residencyProdExePct) : "");
  const [rcp, setRcp] = useState(residencyCoprodKnPct != null ? String(residencyCoprodKnPct) : "");

  function run(payload: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      const res = await updateProduction(productionId, payload);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  function toggleSeparate(separate: boolean) {
    // À l'activation, le serveur recopie les taux principaux : on les
    // affiche tout de suite pour que Stan ne change que celui qui diffère.
    if (separate) {
      setRpe(pe);
      setRcp(cp);
    }
    run({ residencyContractSeparate: separate });
  }

  function saveResidency() {
    const nextPe = parseRate(rpe);
    const nextCp = parseRate(rcp);
    if (Number.isNaN(nextPe) || Number.isNaN(nextCp)) {
      setError("Taux invalide (nombre entre 0 et 100).");
      return;
    }
    if (nextPe === residencyProdExePct && nextCp === residencyCoprodKnPct) return;
    run({ residencyProdExePct: nextPe, residencyCoprodKnPct: nextCp });
  }

  function save() {
    const nextPe = parseRate(pe);
    const nextCp = parseRate(cp);
    if (Number.isNaN(nextPe) || Number.isNaN(nextCp)) {
      setError("Taux invalide (nombre entre 0 et 100).");
      return;
    }
    if (nextPe === (defined ? prodExePct : null) && nextCp === (defined ? coprodKnPct : null)) return;
    setError(null);
    startTransition(async () => {
      const res = await updateProduction(
        productionId,
        nextPe == null && nextCp == null
          ? { prodExePct: null, coprodKnPct: null, artistShareKind: null }
          : { prodExePct: nextPe ?? 0, coprodKnPct: nextCp ?? 0 },
      );
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle tone="violet" as="h3" icon={<HandCoins className="h-3.5 w-3.5" />}>
          Contrat artiste
        </SectionTitle>
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {/* Deux points distincts, dans l'ordre du calcul (KN, Stan 2026-09-28). */}
      {residencySeparate && (
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Dates uniques (tournée)
        </div>
      )}
      <div className="max-w-md rounded-md border divide-y">
        <RateRow
          step={1}
          label="Prod-exé Pangee"
          term="prodExe"
          hint="sur le CA de chaque date"
          value={pe}
          onChange={setPe}
          onBlur={save}
        />
        <RateRow
          step={2}
          label="Co-prod Pangee"
          term="coprod"
          hint="sur le bénéfice restant"
          value={cp}
          onChange={setCp}
          onBlur={save}
        />
      </div>

      {/* Contrat des résidences (Stan 2026-09-29). */}
      <div className={cn("max-w-md space-y-2", !hasResidencies && !residencySeparate && "opacity-60")}>
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Résidences
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!residencySeparate}
            disabled={pending}
            onChange={(e) => toggleSeparate(!e.target.checked)}
            className="h-4 w-4 rounded border-border cursor-pointer accent-yr-gold"
          />
          Même contrat que les dates uniques
        </label>
        {residencySeparate && (
          <div className="rounded-md border divide-y">
            <RateRow
              step={1}
              label="Prod-exé Pangee"
          term="prodExe"
              hint="sur le CA de chaque mois de résidence"
              value={rpe}
              onChange={setRpe}
              onBlur={saveResidency}
            />
            <RateRow
              step={2}
              label="Co-prod Pangee"
          term="coprod"
              hint="sur le bénéfice restant"
              value={rcp}
              onChange={setRcp}
              onBlur={saveResidency}
            />
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Taux saisi → nombre (virgule acceptée, clavier iPhone). "" → null ; saisie
 * invalide → NaN (jamais interprétée comme « taux effacé »).
 */
function parseRate(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : NaN;
}

function RateRow({
  step,
  label,
  term,
  hint,
  value,
  onChange,
  onBlur,
}: {
  step: number;
  label: string;
  /** Terme métier expliqué dans une bulle « ? ». */
  term?: GlossaryKey;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <label className="flex items-center gap-3 px-3 py-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[11px] font-bold text-violet-700 dark:text-violet-300">
        {step}
      </span>
      <span className="flex-1 min-w-0 leading-tight">
        <span className="flex items-center gap-1 text-sm font-medium">
          {label}
          {term && <GlossaryHint term={term} />}
        </span>
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
      <span className="relative">
        <Input
          type="text"
          inputMode="decimal"
          className="h-9 w-20 pr-6 text-right tabular-nums"
          value={value}
          placeholder="0"
          min={0}
          max={100}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          %
        </span>
      </span>
    </label>
  );
}
