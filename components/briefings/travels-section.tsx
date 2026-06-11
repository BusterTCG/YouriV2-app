"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ArrowRight,
  Clock,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Train,
} from "lucide-react";
import type { TravelDirection } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerField } from "@/components/tasks/date-picker-field";
import { cn } from "@/lib/utils";
import {
  createTravel,
  deleteTravel,
  updateTravel,
} from "@/lib/actions/briefings";

/**
 * Section Trajets de la FDR — Lot B2 (copie fidèle KN show §
 * briefing-editor TravelsList + TravelCard + NewTravelRow + EditTravelRow
 * + RunsSection).
 *
 * Layout : cards visuelles en grid 2 colonnes, pastille couleur selon le
 * sens (ALLER bleu, RETOUR ambre, INTER gris), from→to en gros, runs
 * voiture en sous-lignes (gare → hôtel → salle, stockés en JSON).
 *
 * Pré-remplissage smart :
 *   - ALLER : toStation = "GARE DE {showCity}" par défaut
 *   - RETOUR : fromStation = "GARE DE {showCity}", toStation = origine de
 *     l'aller (miroir auto). Toggle direction = re-calcule les défauts si
 *     l'user n'a pas déjà saisi.
 */

export type TravelRun = { location: string; time: string };

export type TravelRow = {
  id: string;
  direction: TravelDirection;
  date: Date;
  fromStation: string;
  fromTime: string;
  toStation: string;
  toTime: string;
  comment: string | null;
  runs: TravelRun[];
};

const DIRECTION_LABELS: Record<TravelDirection, string> = {
  OUTBOUND: "Aller",
  RETURN: "Retour",
  INTER: "Inter-étapes",
};

interface Props {
  briefingId: string;
  travels: TravelRow[];
  /** Date du deal — défaut pour les trajets neufs. */
  eventDate: Date;
  /** Ville du show — sert à pré-remplir GARE DE {ville} sur aller/retour. */
  showCity: string;
}

export function TravelsSection({
  briefingId,
  travels,
  eventDate,
  showCity,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(id: string) {
    if (!confirm("Supprimer ce trajet ?")) return;
    startTransition(async () => {
      await deleteTravel(id);
    });
  }

  return (
    <div className="space-y-3">
      {travels.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground italic">
          Aucun trajet pour le moment.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {travels.map((t) =>
          editingId === t.id ? (
            <EditTravelRow
              key={t.id}
              travel={t}
              onCancel={() => setEditingId(null)}
              onSaved={() => setEditingId(null)}
            />
          ) : (
            <TravelCard
              key={t.id}
              travel={t}
              onEdit={() => setEditingId(t.id)}
              onRemove={() => remove(t.id)}
            />
          ),
        )}
      </div>

      {adding ? (
        <NewTravelRow
          briefingId={briefingId}
          eventDate={eventDate}
          showCity={showCity}
          existingTravels={travels}
          onCancel={() => setAdding(false)}
          onCreated={() => setAdding(false)}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAdding(true)}
          disabled={pending}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Ajouter un trajet
        </Button>
      )}
    </div>
  );
}

// ──────────────────────────── TravelCard (lecture) ────────────────────────────

function TravelCard({
  travel,
  onEdit,
  onRemove,
}: {
  travel: TravelRow;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const directionStyle: Record<
    TravelDirection,
    { bg: string; text: string; label: string }
  > = {
    OUTBOUND: {
      bg: "bg-blue-500/10 border-blue-500/30",
      text: "text-blue-700 dark:text-blue-400",
      label: "Aller",
    },
    RETURN: {
      bg: "bg-amber-500/10 border-amber-500/30",
      text: "text-amber-700 dark:text-amber-400",
      label: "Retour",
    },
    INTER: {
      bg: "bg-muted/30 border-border",
      text: "text-muted-foreground",
      label: "Inter",
    },
  };
  const style = directionStyle[travel.direction];

  return (
    <div className="relative rounded-lg border bg-card overflow-hidden">
      {/* Header coloré : sens + date */}
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2 border-b",
          style.bg,
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 text-xs uppercase tracking-wider font-bold",
            style.text,
          )}
        >
          <Train className="h-3.5 w-3.5" />
          {style.label}
          <span className="text-muted-foreground/70 font-normal normal-case">
            · {format(travel.date, "EEEE d MMMM", { locale: fr })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/50"
            onClick={onEdit}
            title="Modifier ce trajet"
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onRemove}
            title="Supprimer ce trajet"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* From → To en gros */}
      <div className="px-3 py-3 grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
        <div className="min-w-0 text-right">
          <div
            className="font-semibold text-sm truncate uppercase"
            title={travel.fromStation}
          >
            {travel.fromStation || "—"}
          </div>
          <div className="text-xs text-muted-foreground tabular-nums inline-flex items-center gap-1 justify-end">
            <Clock className="h-3 w-3" />
            {travel.fromTime || "--:--"}
          </div>
        </div>
        <ArrowRight className={cn("h-5 w-5 shrink-0", style.text)} />
        <div className="min-w-0 text-left">
          <div
            className="font-semibold text-sm truncate uppercase"
            title={travel.toStation}
          >
            {travel.toStation || "—"}
          </div>
          <div className="text-xs text-muted-foreground tabular-nums inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {travel.toTime || "--:--"}
          </div>
        </div>
      </div>

      {/* Runs / transferts (sous-lignes) */}
      {travel.runs.length > 0 && (
        <div className="border-t bg-background/60">
          {travel.runs.map((r, idx) => (
            <div
              key={idx}
              className="px-3 py-1.5 text-xs flex items-center gap-3 border-b last:border-b-0 border-muted/40"
            >
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground border rounded px-1.5 py-0.5">
                Run {travel.runs.length > 1 ? idx + 1 : ""}
              </span>
              <span className="font-medium uppercase">{r.location || "—"}</span>
              <span className="text-muted-foreground tabular-nums">
                <span>Heure :</span> {r.time}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Commentaire optionnel */}
      {travel.comment && (
        <div className="px-3 py-2 border-t text-xs text-muted-foreground italic bg-muted/20">
          {travel.comment}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── NewTravelRow (création) ────────────────────────────

function NewTravelRow({
  briefingId,
  eventDate,
  showCity,
  existingTravels,
  onCancel,
  onCreated,
}: {
  briefingId: string;
  eventDate: Date;
  showCity: string;
  existingTravels: TravelRow[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const upper = (s: string) => s.toUpperCase();
  const gareDe = (city: string) => {
    const c = upper(city).trim();
    return c ? `GARE DE ${c}` : "";
  };
  const showCityGare = gareDe(showCity);
  const existingOutbound = existingTravels.find(
    (t) => t.direction === "OUTBOUND",
  );

  const [direction, setDirection] = useState<TravelDirection>("OUTBOUND");
  const [date, setDate] = useState<Date>(eventDate);
  const [fromStation, setFromStation] = useState("");
  const [fromTime, setFromTime] = useState("");
  const [toStation, setToStation] = useState(showCityGare);
  const [toTime, setToTime] = useState("");
  const [comment, setComment] = useState("");
  const [runs, setRuns] = useState<TravelRun[]>([]);

  function onChangeDirection(next: TravelDirection) {
    setDirection(next);
    if (next === "OUTBOUND") {
      if (!toStation || toStation === showCityGare) setToStation(showCityGare);
      if (fromStation === showCityGare) setFromStation("");
    } else if (next === "RETURN") {
      if (!fromStation || fromStation === showCityGare) {
        setFromStation(showCityGare);
      }
      const allerOrigin = existingOutbound?.fromStation
        ? upper(existingOutbound.fromStation)
        : "";
      if (allerOrigin && (!toStation || toStation === showCityGare)) {
        setToStation(allerOrigin);
      } else if (toStation === showCityGare) {
        setToStation("");
      }
    }
  }

  function submit() {
    startTransition(async () => {
      const res = await createTravel({
        briefingId,
        direction,
        date,
        fromStation,
        fromTime,
        toStation,
        toTime,
        comment: comment || null,
        runs: runs.filter((r) => r.location.trim() && r.time.trim()),
      });
      if (res.ok) onCreated();
    });
  }

  return (
    <TravelFormShell
      title="Nouveau trajet"
      direction={direction}
      onChangeDirection={onChangeDirection}
      date={date}
      setDate={setDate}
      fromStation={fromStation}
      setFromStation={(v) => setFromStation(upper(v))}
      fromTime={fromTime}
      setFromTime={setFromTime}
      toStation={toStation}
      setToStation={(v) => setToStation(upper(v))}
      toTime={toTime}
      setToTime={setToTime}
      comment={comment}
      setComment={setComment}
      runs={runs}
      setRuns={setRuns}
      pending={pending}
      onCancel={onCancel}
      onSubmit={submit}
      submitLabel="Ajouter"
    />
  );
}

// ──────────────────────────── EditTravelRow (édition) ────────────────────────────

function EditTravelRow({
  travel,
  onCancel,
  onSaved,
}: {
  travel: TravelRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const upper = (s: string) => s.toUpperCase();

  const [direction, setDirection] = useState<TravelDirection>(travel.direction);
  const [date, setDate] = useState<Date>(travel.date);
  const [fromStation, setFromStation] = useState(travel.fromStation || "");
  const [fromTime, setFromTime] = useState(travel.fromTime || "");
  const [toStation, setToStation] = useState(travel.toStation || "");
  const [toTime, setToTime] = useState(travel.toTime || "");
  const [comment, setComment] = useState(travel.comment ?? "");
  const [runs, setRuns] = useState<TravelRun[]>(travel.runs ?? []);

  function submit() {
    startTransition(async () => {
      const res = await updateTravel({
        id: travel.id,
        patch: {
          direction,
          date,
          fromStation: upper(fromStation),
          fromTime,
          toStation: upper(toStation),
          toTime,
          comment: comment || null,
          runs: runs.filter((r) => r.location.trim() && r.time.trim()),
        },
      });
      if (res.ok) onSaved();
    });
  }

  return (
    <TravelFormShell
      title="Modifier ce trajet"
      isEdit
      direction={direction}
      onChangeDirection={setDirection}
      date={date}
      setDate={setDate}
      fromStation={fromStation}
      setFromStation={(v) => setFromStation(upper(v))}
      fromTime={fromTime}
      setFromTime={setFromTime}
      toStation={toStation}
      setToStation={(v) => setToStation(upper(v))}
      toTime={toTime}
      setToTime={setToTime}
      comment={comment}
      setComment={setComment}
      runs={runs}
      setRuns={setRuns}
      pending={pending}
      onCancel={onCancel}
      onSubmit={submit}
      submitLabel="Enregistrer"
    />
  );
}

// ──────────────────────────── Form shell partagé ────────────────────────────

/**
 * Shell de form partagé entre NewTravelRow et EditTravelRow (DRY).
 * Toute la UI est identique, seuls les handlers + label CTA changent.
 */
function TravelFormShell({
  title,
  isEdit,
  direction,
  onChangeDirection,
  date,
  setDate,
  fromStation,
  setFromStation,
  fromTime,
  setFromTime,
  toStation,
  setToStation,
  toTime,
  setToTime,
  comment,
  setComment,
  runs,
  setRuns,
  pending,
  onCancel,
  onSubmit,
  submitLabel,
}: {
  title: string;
  isEdit?: boolean;
  direction: TravelDirection;
  onChangeDirection: (d: TravelDirection) => void;
  date: Date;
  setDate: (d: Date) => void;
  fromStation: string;
  setFromStation: (v: string) => void;
  fromTime: string;
  setFromTime: (v: string) => void;
  toStation: string;
  setToStation: (v: string) => void;
  toTime: string;
  setToTime: (v: string) => void;
  comment: string;
  setComment: (v: string) => void;
  runs: TravelRun[];
  setRuns: (next: TravelRun[]) => void;
  pending: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <div className="rounded-md border-2 border-yr-gold/30 bg-yr-gold/5 p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-yr-gold flex items-center gap-1.5">
        {isEdit ? <Pencil className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        {title}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Field label="Sens">
          <Select
            value={direction}
            onValueChange={(v) => onChangeDirection(v as TravelDirection)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DIRECTION_LABELS) as TravelDirection[]).map((d) => (
                <SelectItem key={d} value={d}>
                  {DIRECTION_LABELS[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date">
          <DatePickerField
            value={date}
            onChange={(d) => d && setDate(d)}
            allowClear={false}
          />
        </Field>
        <Field label="Heure départ">
          <Input
            type="time"
            value={fromTime}
            onChange={(e) => setFromTime(e.target.value)}
            placeholder="08:30"
            className="h-8 text-sm"
          />
        </Field>
        <Field label="Heure arrivée">
          <Input
            type="time"
            value={toTime}
            onChange={(e) => setToTime(e.target.value)}
            placeholder="10:45"
            className="h-8 text-sm"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="Gare/Aéroport départ">
          {/* Pas de className="uppercase" : le state est déjà forcé en
              MAJUSCULES via le handler onChange parent. Doubler le CSS
              uppercase faisait paraître les caractères encore plus larges
              que le reste (Stan 2026-05-26). */}
          <Input
            value={fromStation}
            onChange={(e) => setFromStation(e.target.value)}
            placeholder=""
            className="h-8 text-sm"
          />
        </Field>
        <Field label="Gare/Aéroport arrivée">
          <Input
            value={toStation}
            onChange={(e) => setToStation(e.target.value)}
            placeholder=""
            className="h-8 text-sm"
          />
        </Field>
      </div>

      {/* Runs / transferts (liste dynamique) — AVANT le commentaire */}
      <RunsSection direction={direction} runs={runs} onChange={setRuns} />

      <Field label="Commentaire">
        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder=""
          className="h-8 text-sm"
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={pending}
        >
          Annuler
        </Button>
        <Button
          size="sm"
          onClick={onSubmit}
          disabled={pending || !fromStation || !toStation}
        >
          {pending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

// ──────────────────────────── RunsSection (runs imbriqués) ────────────────────────────

function RunsSection({
  direction,
  runs,
  onChange,
}: {
  direction: TravelDirection;
  runs: TravelRun[];
  onChange: (next: TravelRun[]) => void;
}) {
  const locationLabel =
    direction === "OUTBOUND" ? "Destination" : "Lieu de pickup";
  const hint =
    direction === "OUTBOUND"
      ? "Voiture qui prend à l'arrivée et amène ailleurs (hôtel, salle, restau…)"
      : direction === "RETURN"
        ? "Voiture qui prend l'artiste quelque part et l'amène à la gare"
        : "Transferts entre étapes";

  function update(idx: number, patch: Partial<TravelRun>) {
    const next = [...runs];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }
  function remove(idx: number) {
    onChange(runs.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...runs, { location: "", time: "" }]);
  }

  return (
    <div className="rounded-md border border-dashed border-muted-foreground/30 bg-background p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
          <span className="font-medium">🚐 Runs / transferts</span>
          <span className="text-[10px] italic">— {hint}</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          className="h-7"
        >
          <Plus className="h-3 w-3 mr-1" />
          Ajouter un run
        </Button>
      </div>
      {runs.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">
          Aucun run. Clique sur « Ajouter un run » si l&apos;artiste doit être
          pris en charge en voiture après / avant le trajet.
        </p>
      ) : (
        <div className="space-y-2">
          {runs.map((run, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[1fr_120px_auto] gap-2 items-end bg-muted/30 rounded-md p-2"
            >
              <Field label={`${locationLabel} ${idx + 1}`}>
                <Input
                  value={run.location}
                  onChange={(e) => update(idx, { location: e.target.value })}
                  placeholder=""
                  className="h-8 text-sm"
                />
              </Field>
              <Field label="Heure pickup">
                <Input
                  type="time"
                  value={run.time}
                  onChange={(e) => update(idx, { time: e.target.value })}
                  className="h-8 text-sm"
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(idx)}
                className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                title="Supprimer ce run"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── Field local ────────────────────────────

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
