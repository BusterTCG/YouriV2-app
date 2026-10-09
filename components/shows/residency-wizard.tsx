"use client";

// Assistant « Résidence » (portage KN, étape 2) : salle, période sur
// plusieurs mois, jours de la semaine, horaire(s) (doublé), jauge, modèle
// salle → aperçu des séances regroupées par mois (clic = exclure une séance)
// → création / complément de la résidence (1 mois = 1 fiche financière).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarRange, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { planResidencyPerformances } from "@/lib/actions/residencies";
import { VenuePicker, type VenueSnapshot } from "@/components/deals/venue-picker";
import { groupPlanByMonth, planKey, planResidency } from "@/lib/residency-plan";
import { cn } from "@/lib/utils";

const WEEKDAYS: Array<{ v: number; label: string }> = [
  { v: 1, label: "Lun" },
  { v: 2, label: "Mar" },
  { v: 3, label: "Mer" },
  { v: 4, label: "Jeu" },
  { v: 5, label: "Ven" },
  { v: 6, label: "Sam" },
  { v: 0, label: "Dim" },
];

interface Props {
  productionId: string;
  /** Résidence existante à compléter (sinon création). */
  residency?: { id: string; name: string } | null;
  /** Libellé du bouton déclencheur. */
  label?: string;
  variant?: "default" | "outline";
}

export function ResidencyWizard({ productionId, residency, label, variant = "default" }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [venue, setVenue] = useState<VenueSnapshot | null>(null);
  const [name, setName] = useState("");
  const [startDay, setStartDay] = useState("");
  const [endDay, setEndDay] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([5, 6]);
  const [times, setTimes] = useState<string[]>(["19:30"]);
  const [capacity, setCapacity] = useState("");
  const [venueDealKind, setVenueDealKind] = useState<string>("CO_REAL");
  const [coRealKnPct, setCoRealKnPct] = useState("");
  const [status, setStatus] = useState<"CONFIRME" | "LEAD">("CONFIRME");
  const [excluded, setExcluded] = useState<string[]>([]);

  const plan = useMemo(
    () => planResidency({ startDay, endDay, weekdays, times }),
    [startDay, endDay, weekdays, times],
  );
  const kept = plan.filter((p) => !excluded.includes(planKey(p)));
  const months = groupPlanByMonth(plan);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await planResidencyPerformances({
        productionId,
        residencyId: residency?.id ?? null,
        venue: venue ? { id: venue.id, name: venue.name, city: venue.city || null } : null,
        name: name || null,
        startDay,
        endDay,
        weekdays,
        times: times.filter((t) => t.trim()),
        excluded,
        capacity: capacity ? Number(capacity) : null,
        venueDealKind: residency ? null : venueDealKind,
        coRealKnPct: coRealKnPct ? Number(coRealKnPct) : null,
        status,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.push(`/shows/residence/${res.data!.residencyId}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        <CalendarRange className="h-4 w-4 mr-1.5" />
        {label ?? (residency ? "Ajouter des séances" : "Ajouter une résidence")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {residency ? `Ajouter des séances — ${residency.name}` : "Ajouter une résidence"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            {!residency && (
              <Row label="Salle">
                <div className="w-[260px]">
                  <VenuePicker
                    value={venue}
                    onChange={(v) => {
                      setVenue(v);
                      // Jauge par défaut = capacité de la salle (annuaire KN).
                      if (v?.capacity && !capacity) setCapacity(String(v.capacity));
                    }}
                  />
                </div>
                {!venue && (
                  <Input className="h-9 w-56" placeholder="ou nom libre de la salle" value={name} onChange={(e) => setName(e.target.value)} />
                )}
              </Row>
            )}

            <Row label="Période">
              <Input type="date" className="h-9 w-40" value={startDay} onChange={(e) => setStartDay(e.target.value)} />
              <span className="text-muted-foreground">au</span>
              <Input type="date" className="h-9 w-40" value={endDay} onChange={(e) => setEndDay(e.target.value)} />
            </Row>

            <Row label="Jours">
              <div className="flex gap-1">
                {WEEKDAYS.map((w) => {
                  const on = weekdays.includes(w.v);
                  return (
                    <button
                      key={w.v}
                      type="button"
                      onClick={() => setWeekdays((cur) => (on ? cur.filter((x) => x !== w.v) : [...cur, w.v]))}
                      className={cn(
                        "h-8 w-11 rounded-md border text-xs font-medium transition-colors",
                        on ? "bg-yr-gold/20 border-yr-gold text-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </Row>

            <Row label="Horaire(s)">
              {times.map((t, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    className="h-9 w-20"
                    value={t}
                    onChange={(e) => setTimes((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  {times.length > 1 && (
                    <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setTimes((cur) => cur.filter((_, j) => j !== i))}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {times.length < 3 && (
                <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setTimes((cur) => [...cur, ""])}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Doublé
                </Button>
              )}
            </Row>

            <Row label="Jauge / séance">
              <Input className="h-9 w-24" inputMode="numeric" value={capacity} placeholder="ex. 25" onChange={(e) => setCapacity(e.target.value)} />
              {!residency && (
                <>
                  <span className="text-muted-foreground ml-2">Salle</span>
                  <Select value={venueDealKind} onValueChange={setVenueDealKind}>
                    <SelectTrigger className="h-9 w-auto min-w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CO_REAL">Co-réalisation</SelectItem>
                      <SelectItem value="PROD">Location</SelectItem>
                      <SelectItem value="CESSION">Cession</SelectItem>
                    </SelectContent>
                  </Select>
                  {venueDealKind === "CO_REAL" && (
                    <div className="flex items-center gap-1">
                      <Input className="h-9 w-16" inputMode="numeric" value={coRealKnPct} onChange={(e) => setCoRealKnPct(e.target.value)} />
                      <span className="text-muted-foreground">% Pangee</span>
                    </div>
                  )}
                </>
              )}
            </Row>

            <Row label="Statut">
              <Select value={status} onValueChange={(v) => setStatus(v as "CONFIRME" | "LEAD")}>
                <SelectTrigger className="h-9 w-auto min-w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONFIRME">Confirmé</SelectItem>
                  <SelectItem value="LEAD">Lead</SelectItem>
                </SelectContent>
              </Select>
            </Row>

            {/* Aperçu */}
            <div className="rounded-md border bg-muted/20 p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Aperçu · {kept.length} séance{kept.length > 1 ? "s" : ""} sur {months.length} mois
                {excluded.length > 0 && <span className="normal-case font-normal"> ({excluded.length} retirée{excluded.length > 1 ? "s" : ""})</span>}
              </div>
              {plan.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Choisis une période et des jours.</p>
              ) : (
                months.map((m) => (
                  <div key={m.month} className="space-y-1">
                    <div className="text-xs font-semibold capitalize">
                      {format(new Date(`${m.month}-01T12:00:00Z`), "MMMM yyyy", { locale: fr })}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {m.perfs.map((p) => {
                        const k = planKey(p);
                        const off = excluded.includes(k);
                        return (
                          <button
                            key={k}
                            type="button"
                            title={off ? "Rétablir" : "Retirer cette séance"}
                            onClick={() => setExcluded((cur) => (off ? cur.filter((x) => x !== k) : [...cur, k]))}
                            className={cn(
                              "rounded border px-1.5 py-0.5 text-[11px] tabular-nums capitalize transition-colors",
                              off ? "line-through opacity-40 bg-transparent" : "bg-card hover:border-destructive/50",
                            )}
                          >
                            {format(new Date(`${p.day}T12:00:00Z`), "EEE d", { locale: fr })}
                            {p.time && ` · ${p.time}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={pending || kept.length === 0}>
              {pending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {residency ? `Ajouter ${kept.length} séance${kept.length > 1 ? "s" : ""}` : `Créer la résidence (${kept.length} séances)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}
