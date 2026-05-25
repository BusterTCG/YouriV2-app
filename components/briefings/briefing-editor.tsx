"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Clock,
  Hotel,
  Loader2,
  StickyNote,
  Theater,
  Train,
  Users,
  Utensils,
} from "lucide-react";
import type { BriefingStatus } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { VenuePicker, type VenueSnapshot } from "@/components/deals/venue-picker";
import { cn } from "@/lib/utils";
import { updateBriefing } from "@/lib/actions/briefings";

/**
 * Éditeur FDR — Sprint 3.7 Lot B1 (Stan 2026-05-26).
 *
 * Pattern KN show § briefing-editor.tsx :
 *   - Header avec status pills + indicateur auto-save
 *   - Chaque champ persiste indépendamment via `autoSave({ patch })` au blur
 *   - Pas de bouton "Enregistrer" global
 *
 * Sections livrées en Lot B1 :
 *   1. Spectacle (lieu via VenuePicker KN, heure show read-only depuis deal,
 *      heure balance éditable)
 *   2. Hébergement & repas (hôtel + restau free-text + AddressAutocomplete
 *      BAN data.gouv.fr + flag "pris en charge" + per diem)
 *   3. Notes libres
 *
 * Trajets (Lot B2) et Contacts (Lot B3) restent en placeholder.
 */

const STATUS_META: Record<
  BriefingStatus,
  { label: string; emoji: string; hint: string; cls: string }
> = {
  DRAFT: {
    label: "Brouillon",
    emoji: "📝",
    hint: "Édition en cours, infos à compléter.",
    cls: "text-amber-700 dark:text-amber-400 border-amber-500/40",
  },
  COMPLETE: {
    label: "Complète",
    emoji: "✅",
    hint: "Toutes les infos sont là, prête à envoyer.",
    cls: "text-emerald-700 dark:text-emerald-400 border-emerald-500/40",
  },
  SENT: {
    label: "Envoyée",
    emoji: "📧",
    hint: "Envoyée aux artistes par email.",
    cls: "text-blue-700 dark:text-blue-400 border-blue-500/40",
  },
};

export interface BriefingEditorData {
  id: string;
  showTime: string | null;
  balanceTime: string | null;
  venueId: string | null;
  venueName: string | null;
  venueCity: string | null;
  /** Adresse libre BAN — copiée depuis Deal.venueAddress au prefill,
   *  éditable sur la FDR. Stan 2026-05-26 : "info complète". */
  venueAddress: string | null;
  hotelName: string | null;
  hotelAddress: string | null;
  restaurantName: string | null;
  restaurantAddress: string | null;
  restaurantCovered: boolean;
  perDiemFlag: boolean;
  perDiemAmount: number | null;
  notes: string | null;
  status: BriefingStatus;
}

interface Props {
  briefing: BriefingEditorData;
  /** Heure du show depuis Deal — affichée en lecture seule (source de vérité). */
  showTimeFromDeal: string | null;
  artistName: string;
}

export function BriefingEditor({
  briefing,
  showTimeFromDeal,
  artistName,
}: Props) {
  const [pending, startTransition] = useTransition();

  // ─ Master fields (autoSave au blur) ─
  const [balanceTime, setBalanceTime] = useState(briefing.balanceTime ?? "");
  const [venue, setVenue] = useState<VenueSnapshot | null>(
    briefing.venueId
      ? {
          id: briefing.venueId,
          name: briefing.venueName ?? "",
          city: briefing.venueCity ?? "",
        }
      : null,
  );
  const [venueAddress, setVenueAddress] = useState(briefing.venueAddress ?? "");
  const [hotelName, setHotelName] = useState(briefing.hotelName ?? "");
  const [hotelAddress, setHotelAddress] = useState(briefing.hotelAddress ?? "");
  const [restaurantName, setRestaurantName] = useState(
    briefing.restaurantName ?? "",
  );
  const [restaurantAddress, setRestaurantAddress] = useState(
    briefing.restaurantAddress ?? "",
  );
  const [restaurantCovered, setRestaurantCovered] = useState(
    briefing.restaurantCovered,
  );
  const [perDiemFlag, setPerDiemFlag] = useState(briefing.perDiemFlag);
  const [perDiemAmount, setPerDiemAmount] = useState<string>(
    briefing.perDiemAmount?.toString() ?? "",
  );
  const [notes, setNotes] = useState(briefing.notes ?? "");
  const [status, setStatus] = useState<BriefingStatus>(briefing.status);

  // ─ Indicateur d'auto-save ─
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  function autoSave(patch: Parameters<typeof updateBriefing>[0]["patch"]) {
    setSaveError(null);
    setSaveState("saving");
    startTransition(async () => {
      const res = await updateBriefing({ briefingId: briefing.id, patch });
      if (res.ok) {
        setSaveState("saved");
        setTimeout(
          () => setSaveState((cur) => (cur === "saved" ? "idle" : cur)),
          1500,
        );
      } else {
        setSaveState("error");
        setSaveError(res.error);
      }
    });
  }

  function handleVenueChange(next: VenueSnapshot | null) {
    setVenue(next);
    autoSave({
      venueId: next?.id ?? null,
      venueName: next?.name ?? null,
      venueCity: next?.city ?? null,
    });
  }

  function handleStatusChange(s: BriefingStatus) {
    setStatus(s);
    autoSave({ status: s });
  }

  return (
    <div className="space-y-5">
      {/* Header : status pills + indicateur auto-save */}
      <div className="flex items-center justify-between flex-wrap gap-3 rounded-md border bg-card px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Statut
          </span>
          {(Object.keys(STATUS_META) as BriefingStatus[]).map((s) => {
            const meta = STATUS_META[s];
            const active = status === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => handleStatusChange(s)}
                disabled={pending}
                title={meta.hint}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all border",
                  active
                    ? meta.cls + " bg-current/5 ring-1 ring-current/30"
                    : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted",
                )}
              >
                <span>{meta.emoji}</span>
                {meta.label}
              </button>
            );
          })}
          <span className="text-[11px] text-muted-foreground italic ml-1 hidden md:inline">
            · {STATUS_META[status].hint}
          </span>
        </div>
        <SaveIndicator state={saveState} error={saveError} />
      </div>

      {/* Section : Spectacle */}
      <Section icon={<Theater />} title="Spectacle">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Salle">
            <VenuePicker value={venue} onChange={handleVenueChange} />
          </Field>
          <Field label="Heure du show">
            {/* Lecture seule — source de vérité = deal.showTime. Pour modifier,
                l'user édite la fiche deal (évite double saisie + désynchro). */}
            <div className="h-9 inline-flex items-center gap-1.5 rounded-md border bg-muted/30 px-3 text-sm tabular-nums w-full">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span
                className={cn(
                  !showTimeFromDeal && "text-muted-foreground italic",
                )}
              >
                {showTimeFromDeal || "Non renseignée"}
              </span>
              {showTimeFromDeal && (
                <span className="text-[10px] text-muted-foreground/70 normal-case ml-1">
                  · depuis fiche deal
                </span>
              )}
            </div>
          </Field>
          <Field label="Heure de balance">
            <Input
              type="time"
              value={balanceTime}
              onChange={(e) => setBalanceTime(e.target.value)}
              onBlur={() => autoSave({ balanceTime: balanceTime || null })}
              placeholder="18:00"
            />
          </Field>
          {/* Adresse complète du lieu — Stan 2026-05-26 :
              "reprendre l'info complète du deal". Couvre les 2 cas :
              lieu KN référencé (adresse pas forcément en BDD) + booking
              entreprise avec seulement l'adresse libre. Prefill depuis
              Deal.venueAddress côté ensureBriefingWithPrefill. */}
          <Field label="Adresse du lieu" className="sm:col-span-2">
            <AddressAutocomplete
              value={venueAddress}
              onChange={(v) => {
                setVenueAddress(v);
                autoSave({ venueAddress: v || null });
              }}
              placeholder="N° et rue (autocomplete BAN data.gouv.fr)…"
            />
          </Field>
        </div>
      </Section>

      {/* Section : Hébergement & repas */}
      <Section icon={<Hotel />} title="Hébergement & repas">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
          {/* Hôtel */}
          <div className="space-y-2 rounded-md border bg-muted/10 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <Hotel className="h-3.5 w-3.5" />
              Hôtel
            </div>
            <Field label="Nom de l'hôtel">
              <Input
                value={hotelName}
                onChange={(e) => setHotelName(e.target.value)}
                onBlur={() => autoSave({ hotelName: hotelName || null })}
                placeholder="Ex. Mercure, Ibis Centre…"
              />
            </Field>
            <Field label="Adresse">
              <AddressAutocomplete
                value={hotelAddress}
                onChange={(v) => {
                  setHotelAddress(v);
                  autoSave({ hotelAddress: v || null });
                }}
                placeholder="N° et rue (autocomplete BAN)…"
              />
            </Field>
          </div>

          {/* Restaurant */}
          <div className="space-y-2 rounded-md border bg-muted/10 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <Utensils className="h-3.5 w-3.5" />
              Restaurant
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={restaurantCovered}
                onChange={(e) => {
                  setRestaurantCovered(e.target.checked);
                  autoSave({ restaurantCovered: e.target.checked });
                }}
                className="h-4 w-4 accent-[--yr-gold]"
              />
              <CheckCircle2 className="h-3.5 w-3.5 text-[--yr-gold]" />
              Repas pris en charge (même sans adresse encore)
            </label>
            <Field label="Nom du restaurant">
              <Input
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                onBlur={() =>
                  autoSave({ restaurantName: restaurantName || null })
                }
                placeholder="Ex. Bouillon Pigalle…"
              />
            </Field>
            <Field label="Adresse">
              <AddressAutocomplete
                value={restaurantAddress}
                onChange={(v) => {
                  setRestaurantAddress(v);
                  autoSave({ restaurantAddress: v || null });
                }}
                placeholder="N° et rue (autocomplete BAN)…"
              />
            </Field>
          </div>

          {/* Per diem — pleine largeur sous les 2 blocs */}
          <Field label="Per diem (par jour)" className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={perDiemFlag}
                onChange={(e) => {
                  setPerDiemFlag(e.target.checked);
                  autoSave({ perDiemFlag: e.target.checked });
                }}
                className="h-4 w-4 accent-[--yr-gold]"
              />
              <Input
                type="number"
                value={perDiemAmount}
                onChange={(e) => setPerDiemAmount(e.target.value)}
                onBlur={() =>
                  autoSave({
                    perDiemAmount: perDiemAmount
                      ? Number(perDiemAmount)
                      : null,
                  })
                }
                placeholder="€ par jour"
                disabled={!perDiemFlag}
                className="w-40"
              />
              <span className="text-xs text-muted-foreground">€ / jour</span>
            </div>
          </Field>
        </div>
      </Section>

      {/* Section : Trajets — placeholder Lot B2 */}
      <Section icon={<Train />} title="Trajets">
        <div className="rounded-md border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground italic text-center">
          Édition des trajets — à venir Lot B2 (aller / retour / inter-étapes
          avec runs voiture).
        </div>
      </Section>

      {/* Section : Contacts — placeholder Lot B3 */}
      <Section icon={<Users />} title="Contacts">
        <div className="rounded-md border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground italic text-center">
          Édition des contacts — à venir Lot B3 (picker annuaire KN + saisie
          inline avec rôles production / régisseur / VTC / etc.).
        </div>
      </Section>

      {/* Section : Notes */}
      <Section icon={<StickyNote />} title="Notes">
        <Textarea
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => autoSave({ notes: notes || null })}
          placeholder={`Briefing ${artistName}\n\nÉlément technique, repas, contacts urgents…`}
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Sauvegarde automatique à chaque modification.
        </p>
      </Section>
    </div>
  );
}

// ──────────────────────────── Sous-composants ────────────────────────────

function SaveIndicator({
  state,
  error,
}: {
  state: "idle" | "saving" | "saved" | "error";
  error: string | null;
}) {
  if (state === "idle") return null;
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Sauvegarde…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Sauvegardé
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
      ⚠ Échec : {error ?? "erreur"}
    </span>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border bg-card p-4 space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">
        <span className="h-7 w-7 rounded-md bg-[--yr-gold]/15 text-[--yr-gold] inline-flex items-center justify-center [&_svg]:h-3.5 [&_svg]:w-3.5">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}
