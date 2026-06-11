"use client";

import { useState, useTransition } from "react";
import {
  Loader2,
  Users,
  Percent,
  Building2,
  Ticket,
  CalendarRange,
  FileSignature,
  Tag,
  Plane,
  ExternalLink,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VenueDealKind } from "@prisma/client";
import { updateShowDetails } from "@/lib/actions/prod-executive";
import { syncShowTaskToggle } from "@/lib/actions/sync-show-tasks";
import { MultiDatesPicker } from "./multi-dates-picker";
import { formatEur } from "@/components/deals/deal-helpers";
import { cn } from "@/lib/utils";

/**
 * Carte des données show — copie fidèle KuroNeko-App `components/shows/
 * show-summary-card.tsx`, simplifiée pour Pangee Prod :
 *   - PROD_EXE pur (pas de modèle artiste choisi par l'user)
 *   - Pas d'invités (Stan ne s'en sert pas)
 *   - Jauge en Input libre (pas de venue.rooms côté Youri V2 — pattern
 *     snapshot annuaire KN distant, on aura cette donnée plus tard)
 *
 * Édition inline directe (pas de bouton Modifier). Chaque champ s'auto-
 * sauvegarde au blur (onBlur) ou onChange (selects).
 */

const NONE = "__none__";

const VENUE_LABELS: Record<VenueDealKind, string> = {
  PROD: "Production (Location)",
  CO_REAL: "Co-réalisation",
  CESSION: "Cession",
};

const VENUE_DESCRIPTIONS: Record<VenueDealKind, string> = {
  PROD: "Tu loues la salle, encaisses 100 % de la billetterie HT.",
  CO_REAL: "Salle gère, billetterie partagée. Tu saisis ta part nette dans Recette HT.",
  CESSION: "La salle te paye un prix fixe, pas de risque billetterie.",
};

interface Props {
  dealId: string;
  /** Date du deal — utilisée par MultiDatesPicker pour pré-afficher le mois. */
  dealDate: Date;
  capacity: number | null;
  paying: number | null;
  venueDealKind: VenueDealKind | null;
  prodExePct: number | null;
  coRealKnPct: number | null;
  coRealGrossCa: number | null;
  isMultiDate: boolean;
  performanceCount: number | null;
  multiDateDates: string[];
  contractSigned: boolean;
  ticketingReady: boolean;
  ticketingUrl: string | null;
  vhrBooked: boolean;
  /** Recettes totales — passées par le parent pour calculer le ticket moyen. */
  totalRevenue: number;
}

export function ShowSummaryCard({
  dealId,
  dealDate,
  capacity,
  paying,
  venueDealKind,
  prodExePct,
  coRealKnPct,
  coRealGrossCa,
  isMultiDate,
  performanceCount,
  multiDateDates,
  contractSigned,
  ticketingReady,
  ticketingUrl,
  vhrBooked,
  totalRevenue,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [persistError, setPersistError] = useState<string | null>(null);

  const [formCapacity, setFormCapacity] = useState<string>(capacity?.toString() ?? "");
  const [formPaying, setFormPaying] = useState<string>(paying?.toString() ?? "");
  const [formProdExe, setFormProdExe] = useState<string>(prodExePct?.toString() ?? "");
  const [formCoRealKnPct, setFormCoRealKnPct] = useState<string>(
    coRealKnPct?.toString() ?? "",
  );
  const [formCoRealGrossCa, setFormCoRealGrossCa] = useState<string>(
    coRealGrossCa?.toString() ?? "",
  );
  const [formTicketingUrl, setFormTicketingUrl] = useState<string>(ticketingUrl ?? "");

  function persist(patch: Omit<Parameters<typeof updateShowDetails>[0], "id">) {
    setPersistError(null);
    startTransition(async () => {
      const res = await updateShowDetails({ id: dealId, ...patch });
      if (!res.ok) {
        const details =
          "fieldErrors" in res && res.fieldErrors
            ? " (" +
              Object.entries(res.fieldErrors)
                .map(([f, msgs]) => `${f}: ${msgs.join(", ")}`)
                .join(" · ") +
              ")"
            : "";
        setPersistError(`${res.error}${details}`);
      }
    });
  }

  // Capacité totale : jauge si simple date, jauge × repr. si série
  const totalCapacity =
    capacity != null
      ? isMultiDate && performanceCount && performanceCount > 0
        ? capacity * performanceCount
        : capacity
      : null;

  const fillRate =
    totalCapacity && paying != null && paying > 0
      ? Math.round((paying / totalCapacity) * 100)
      : null;

  // Ticket moyen :
  //   CO_REAL : CA global (saisi à la main, reflète le prix public)
  //   Sinon   : recettes Pangee ÷ payants
  const ticketMoyenBase =
    venueDealKind === "CO_REAL" && coRealGrossCa != null && coRealGrossCa > 0
      ? coRealGrossCa
      : totalRevenue;
  const ticketMoyen =
    paying && paying > 0 && ticketMoyenBase > 0
      ? Math.round(ticketMoyenBase / paying)
      : null;

  function toggleMultiDate() {
    const next = !isMultiDate;
    const dates = next ? multiDateDates : [];
    persist({
      isMultiDate: next,
      multiDateDates: dates,
      performanceCount: dates.length > 0 ? dates.length : null,
    });
  }

  function onChangeVenueDealKind(next: string) {
    const v = next === NONE ? null : (next as VenueDealKind);
    persist({ venueDealKind: v });
  }

  return (
    <div className="rounded-md border bg-card p-4 space-y-4 relative">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Données show
        </h3>
        {pending && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {persistError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <span className="font-semibold">Sauvegarde refusée :</span> {persistError}
        </div>
      )}

      {/* Modèle salle + % commission Pangee */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="Modèle salle"
          hint={
            venueDealKind
              ? VENUE_DESCRIPTIONS[venueDealKind]
              : "Détermine quelles charges sont visibles."
          }
        >
          <Select value={venueDealKind ?? NONE} onValueChange={onChangeVenueDealKind}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Choisir…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— Pas défini —</SelectItem>
              {(Object.keys(VENUE_LABELS) as VenueDealKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {VENUE_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Commission Pangee (%)"
          hint={`Pangee prend ${formProdExe || prodExePct || 15} % du CA billetterie.`}
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={formProdExe}
              onChange={(e) => setFormProdExe(e.target.value)}
              onBlur={() => {
                const n = formProdExe === "" ? null : Number(formProdExe);
                if (n !== prodExePct) persist({ prodExePct: n });
              }}
              placeholder="15"
              className="h-9 w-20 text-sm text-center tabular-nums"
              min={0}
              max={100}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </Field>

        {/* Champs CO_REAL */}
        {venueDealKind === "CO_REAL" && (
          <>
            <Field
              label="Co-réa avec la salle (%)"
              hint="Part Pangee sur la billetterie totale. Le reste → salle."
            >
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={formCoRealKnPct}
                  onChange={(e) => setFormCoRealKnPct(e.target.value)}
                  onBlur={() => {
                    const n = formCoRealKnPct === "" ? null : Number(formCoRealKnPct);
                    if (n !== coRealKnPct) persist({ coRealKnPct: n });
                  }}
                  placeholder="ex. 50"
                  className="h-9 w-20 text-sm text-center tabular-nums"
                  min={0}
                  max={100}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </Field>
            <Field
              label="CA global billetterie (€)"
              hint="Total billetterie HT avant partage. Sert au ticket moyen."
              className="sm:col-start-2"
            >
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={formCoRealGrossCa}
                  onChange={(e) => setFormCoRealGrossCa(e.target.value)}
                  onBlur={() => {
                    const n =
                      formCoRealGrossCa === "" ? null : Number(formCoRealGrossCa);
                    if (n !== coRealGrossCa) persist({ coRealGrossCa: n });
                  }}
                  placeholder="ex. 8 000"
                  className="h-9 text-sm"
                  min={0}
                />
                <span className="text-sm text-muted-foreground">€</span>
              </div>
            </Field>
          </>
        )}
      </div>

      {/* Suivi opérationnel — Signature contrat / MEV billetterie + URL / VHR */}
      <div className="pt-3 border-t space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Suivi
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CheckPill
            icon={<FileSignature className="h-3.5 w-3.5" />}
            label="Signature contrat"
            checked={contractSigned}
            onClick={() => {
              const next = !contractSigned;
              persist({ contractSigned: next });
              // Sync pipeline task (Stan 2026-05-31 v3)
              void syncShowTaskToggle(dealId, "contractSigned", next);
            }}
          />
          <CheckPill
            icon={<Tag className="h-3.5 w-3.5" />}
            label="MEV billetterie"
            checked={ticketingReady}
            onClick={() => {
              const next = !ticketingReady;
              persist({ ticketingReady: next });
              void syncShowTaskToggle(dealId, "ticketingReady", next);
            }}
          />
          {ticketingReady && (
            <div className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-md">
              <Input
                type="url"
                value={formTicketingUrl}
                onChange={(e) => setFormTicketingUrl(e.target.value)}
                onBlur={() => {
                  const next = formTicketingUrl.trim() || null;
                  if (next !== ticketingUrl) persist({ ticketingUrl: next });
                }}
                placeholder="https://billetterie.com/…"
                className="h-7 text-xs"
              />
              {ticketingUrl && (
                <a
                  href={ticketingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-yr-gold hover:underline shrink-0"
                  title="Ouvrir le lien billetterie"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}
          <CheckPill
            icon={<Plane className="h-3.5 w-3.5" />}
            label="Gestion VHR"
            checked={vhrBooked}
            onClick={() => {
              const next = !vhrBooked;
              persist({ vhrBooked: next });
              void syncShowTaskToggle(dealId, "vhrBooked", next);
            }}
          />
        </div>
      </div>

      {/* Toggle "Mois complet" + MultiDatesPicker */}
      <div className="pt-3 border-t flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={toggleMultiDate}
          className={cn(
            "inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md border transition-colors",
            isMultiDate
              ? "bg-yr-gold/15 border-yr-gold/40 text-yr-gold font-semibold"
              : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
          )}
        >
          <CalendarRange className="h-3.5 w-3.5" />
          <span>Mois complet</span>
          <span
            className={cn(
              "h-3.5 w-3.5 rounded-sm border inline-flex items-center justify-center text-[10px]",
              isMultiDate
                ? "bg-yr-gold border-yr-gold text-yr-navy"
                : "border-muted-foreground/40",
            )}
          >
            {isMultiDate && "✓"}
          </span>
        </button>
        {isMultiDate && (
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Représentations
            </label>
            <div className="flex-1">
              <MultiDatesPicker
                dealId={dealId}
                dealDate={dealDate}
                initialDates={multiDateDates}
              />
            </div>
          </div>
        )}
      </div>

      {/* Jauge / Payants / % Remplissage / Ticket moyen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field
          icon={<Users className="h-3.5 w-3.5" />}
          label={isMultiDate ? "Jauge / repr." : "Jauge"}
          hint={
            isMultiDate && totalCapacity != null
              ? `Capacité totale : ${totalCapacity}`
              : null
          }
        >
          <Input
            type="number"
            value={formCapacity}
            onChange={(e) => setFormCapacity(e.target.value)}
            onBlur={() => {
              const n = formCapacity === "" ? null : Number(formCapacity);
              if (n !== capacity) persist({ capacity: n });
            }}
            placeholder="ex. 350"
            className="h-9 text-sm tabular-nums"
          />
        </Field>
        <Field
          label="Payants"
          hint={isMultiDate ? "Total cumulé sur la série" : null}
        >
          <Input
            type="number"
            value={formPaying}
            onChange={(e) => setFormPaying(e.target.value)}
            onBlur={() => {
              const n = formPaying === "" ? null : Number(formPaying);
              if (n !== paying) persist({ paying: n });
            }}
            placeholder="0"
            className="h-9 text-sm tabular-nums"
          />
        </Field>
        <ReadOnlyStat
          icon={<Percent className="h-3.5 w-3.5" />}
          label="Remplissage"
          value={fillRate != null ? `${fillRate}%` : "—"}
          accent={fillRate != null && fillRate >= 80}
          hint={isMultiDate ? "Payants ÷ (jauge × repr.)" : "Payants ÷ jauge"}
        />
        <ReadOnlyStat
          icon={<Ticket className="h-3.5 w-3.5" />}
          label="Ticket moyen"
          value={ticketMoyen != null ? formatEur(ticketMoyen) : "—"}
          hint={
            venueDealKind === "CO_REAL" ? "CA global ÷ payants" : "Recettes ÷ payants"
          }
        />
      </div>
    </div>
  );
}

// ──────────────────────────── helpers (copie fidèle KN) ────────────────────────────

function CheckPill({
  icon,
  label,
  checked,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md border transition-colors",
        checked
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 font-semibold"
          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
      )}
    >
      {icon}
      <span>{label}</span>
      <span
        className={cn(
          "h-3.5 w-3.5 rounded-sm border inline-flex items-center justify-center text-[10px]",
          checked
            ? "bg-emerald-500 border-emerald-500 text-white"
            : "border-muted-foreground/40",
        )}
      >
        {checked && "✓"}
      </span>
    </button>
  );
}

function Field({
  icon,
  label,
  hint,
  children,
  className,
}: {
  icon?: React.ReactNode;
  label: string;
  hint?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
        {icon}
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground italic">{hint}</p>}
    </div>
  );
}

function ReadOnlyStat({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "h-9 flex items-center px-3 rounded-md border bg-muted/30 text-sm tabular-nums font-semibold",
          accent && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </div>
      {hint && <p className="text-[10px] text-muted-foreground italic">{hint}</p>}
    </div>
  );
}
