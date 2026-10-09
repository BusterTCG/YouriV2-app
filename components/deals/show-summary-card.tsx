"use client";

import { GlossaryHint } from "@/components/shows/glossary-hint";
import type { GlossaryKey } from "@/lib/production-glossary";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  Loader2,
  Users,
  Building2,
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
import { useEur } from "@/lib/privacy-context";
import { cn } from "@/lib/utils";

/**
 * Carte des données show — copie fidèle KuroNeko-App `components/shows/
 * show-summary-card.tsx`, simplifiée pour Pangee Prod :
 *   - PROD_EXE pur (pas de modèle artiste choisi par l'user)
 *   - Pas d'invités (Stan ne s'en sert pas)
 *   - Jauge : menu déroulant des jauges du lieu (capacité par défaut +
 *     sous-salles) quand le deal a un venue KN en base, sinon input libre
 *     (Stan 2026-06-16). Sélectionner reprend la donnée existante du lieu.
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
  capacity: number | null;
  /** Lieu KN lié (capacité par défaut + sous-salles) — alimente le menu
   *  déroulant jauge. null = pas de venue en base → jauge en input libre. */
  venue: {
    id: string;
    name: string;
    capacity: number | null;
    rooms: Array<{ id: string; name: string; capacity: number | null }>;
  } | null;
  /** Sous-salle choisie au sein du venue (persistée sur le deal). */
  venueRoomId: string | null;
  venueDealKind: VenueDealKind | null;
  prodExePct: number | null;
  coRealKnPct: number | null;
  coRealGrossCa: number | null;
  contractSigned: boolean;
  ticketingReady: boolean;
  ticketingUrl: string | null;
  vhrBooked: boolean;
  /** Date d'une production (portage KN) : contrat artiste hérité, affiché en
   *  lecture seule — il se modifie sur la fiche production (onglet Contrat). */
  productionContract?: { productionId: string; summary: string } | null;
  /**
   * Partie affichée (fiche date en onglets, portage KN) : « suivi » =
   * check-list + jauge ; « contrat » = modèle salle + contrat artiste.
   */
  section?: "all" | "suivi" | "contrat";
  /**
   * Mois d'une résidence : nombre de mois actifs. Si > 1, choix « Tous les
   * mois (défaut) / Ce mois seulement » pour le suivi, le modèle salle et la
   * jauge (Stan 2026-10-01, portage KN).
   */
  residencyMonths?: number;
}

export function ShowSummaryCard({
  dealId,
  capacity,
  venue,
  venueRoomId,
  venueDealKind,
  prodExePct,
  coRealKnPct,
  coRealGrossCa,
  contractSigned,
  ticketingReady,
  ticketingUrl,
  vhrBooked,
  productionContract,
  section = "all",
  residencyMonths = 0,
}: Props) {
  const isResidencyMonth = residencyMonths > 1;
  const [applyToAllMonths, setApplyToAllMonths] = useState(true);
  const showContract = section !== "suivi";
  const showSuivi = section !== "contrat";
  const eur = useEur();
  const [pending, startTransition] = useTransition();
  // « Enregistré ✓ » 2,5 s après chaque sauvegarde réussie (Stan 2026-10-01).
  const [saved, setSaved] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  const [formCapacity, setFormCapacity] = useState<string>(capacity?.toString() ?? "");
  const [formProdExe, setFormProdExe] = useState<string>(prodExePct?.toString() ?? "");
  const [formCoRealKnPct, setFormCoRealKnPct] = useState<string>(
    coRealKnPct?.toString() ?? "",
  );
  const [formTicketingUrl, setFormTicketingUrl] = useState<string>(ticketingUrl ?? "");

  function persist(patch: Omit<Parameters<typeof updateShowDetails>[0], "id">) {
    setPersistError(null);
    startTransition(async () => {
      const res = await updateShowDetails({
        id: dealId,
        ...patch,
        applyToResidency: isResidencyMonth && applyToAllMonths,
      });
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
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    });
  }

  // ─ Menu déroulant Jauge (copie KN) ─
  // Quand le deal a un venue KN en base (capacité par défaut OU sous-salles),
  // le champ Jauge devient un Select pour reprendre la donnée existante du
  // lieu. Valeurs spéciales : "__none__" (pas défini), "__default__" (jauge du
  // lieu), "__custom__" (saisie manuelle → Input), ou un roomId (sous-salle).
  const JAUGE_NONE = "__none__";
  const JAUGE_DEFAULT = "__default__";
  const JAUGE_CUSTOM = "__custom__";
  const hasVenueJaugeOptions = Boolean(
    venue && (venue.capacity != null || venue.rooms.length > 0),
  );
  const [forceCustom, setForceCustom] = useState(false);

  function computeJaugeSelectValue(): string {
    if (venueRoomId && venue?.rooms.find((r) => r.id === venueRoomId)) {
      return venueRoomId;
    }
    if (capacity == null) return JAUGE_NONE;
    if (venue?.capacity === capacity) return JAUGE_DEFAULT;
    return JAUGE_CUSTOM;
  }
  const jaugeSelectValue = forceCustom ? JAUGE_CUSTOM : computeJaugeSelectValue();

  function onChangeJauge(next: string) {
    if (next === JAUGE_CUSTOM) {
      setForceCustom(true);
      return;
    }
    setForceCustom(false);
    if (next === JAUGE_NONE) {
      setFormCapacity("");
      persist({ capacity: null, venueRoomId: null });
      return;
    }
    if (next === JAUGE_DEFAULT && venue?.capacity != null) {
      setFormCapacity(String(venue.capacity));
      persist({ capacity: venue.capacity, venueRoomId: null });
      return;
    }
    const room = venue?.rooms.find((r) => r.id === next);
    if (room) {
      setFormCapacity(room.capacity != null ? String(room.capacity) : "");
      persist({ capacity: room.capacity, venueRoomId: room.id });
    }
  }

  function onChangeVenueDealKind(next: string) {
    const v = next === NONE ? null : (next as VenueDealKind);
    persist({ venueDealKind: v });
  }

  return (
    <div className="rounded-md border bg-card p-4 space-y-4 relative">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {section === "contrat"
            ? "Contrat de la date"
            : section === "suivi"
              ? "Suivi de la date"
              : "Paramètres & suivi"}
        </h3>
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          saved && <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Enregistré ✓</span>
        )}
      </div>

      {isResidencyMonth && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground">Mois de résidence — appliquer les modifications à :</span>
          <div className="inline-flex rounded-md border overflow-hidden">
            {[
              { all: true, label: `Tous les mois (${residencyMonths})` },
              { all: false, label: "Ce mois seulement" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setApplyToAllMonths(o.all)}
                className={cn(
                  "px-2.5 py-1 font-medium transition-colors",
                  applyToAllMonths === o.all
                    ? "bg-yr-gold/20 text-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">
            (suivi, modèle salle, % co-réa, jauge — séances et comptes restent par mois)
          </span>
        </div>
      )}

      {persistError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <span className="font-semibold">Sauvegarde refusée :</span> {persistError}
        </div>
      )}

      {showSuivi && (
      <>
      {/* Suivi opérationnel — Signature contrat / MEV billetterie + URL / VHR */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold inline-flex items-center gap-1">
          Suivi <GlossaryHint term="suivi" />
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

      {/* Jauge par défaut des séances (payants, remplissage et ticket moyen
          sont dans la carte Séances — toute date a au moins une séance). */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-4">
        <Field
          icon={<Users className="h-3.5 w-3.5" />}
          label="Jauge / séance"
          hint="Jauge par défaut des séances."
        >
          {hasVenueJaugeOptions ? (
            <div className="space-y-1.5">
              <Select value={jaugeSelectValue} onValueChange={onChangeJauge}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={JAUGE_NONE}>— Pas défini —</SelectItem>
                  {venue?.capacity != null && (
                    <SelectItem value={JAUGE_DEFAULT}>
                      Jauge du lieu · {venue.capacity}
                    </SelectItem>
                  )}
                  {venue?.rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                      {r.capacity != null ? ` · ${r.capacity}` : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value={JAUGE_CUSTOM}>Saisir manuellement…</SelectItem>
                </SelectContent>
              </Select>
              {jaugeSelectValue === JAUGE_CUSTOM && (
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
                  autoFocus
                />
              )}
            </div>
          ) : (
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
          )}
        </Field>
      </div>
      </>
      )}
      {/* Modèle salle + % commission Pangee */}
      {showContract && (
      <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3", showSuivi && "pt-3 border-t")}>
        <Field
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="Modèle salle"
          term="venueDeal"
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

        {productionContract ? (
          <Field
            label="Contrat artiste"
            hint="Hérité de la production — modifiable dans son onglet Contrat."
          >
            <Link
              href={`/shows/production/${productionContract.productionId}?tab=contrat`}
              className="inline-flex h-9 items-center text-sm font-medium hover:underline"
            >
              {productionContract.summary}
            </Link>
          </Field>
        ) : (
        <Field
          label="Commission Pangee (%)"
          hint={`Pangee prend ${formProdExe || prodExePct || 0} % du CA billetterie.`}
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
              className="h-9 w-20 text-sm text-center tabular-nums"
              min={0}
              max={100}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </Field>
        )}

        {/* Champs CO_REAL */}
        {venueDealKind === "CO_REAL" && (
          <>
            <Field
              label="Co-réa avec la salle (%)"
              term="coReal"
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
            <ReadOnlyStat
              label="CA global billetterie"
              value={coRealGrossCa != null ? eur(coRealGrossCa) : "—"}
              hint="Somme de la billetterie HT des séances."
            />
          </>
        )}
      </div>
      )}

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
  term,
}: {
  icon?: React.ReactNode;
  label: string;
  hint?: string | null;
  children: React.ReactNode;
  className?: string;
  /** Terme métier expliqué dans une bulle « ? ». */
  term?: GlossaryKey;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
        {icon}
        {label}
        {term && <GlossaryHint term={term} />}
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
