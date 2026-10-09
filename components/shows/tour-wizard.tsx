"use client";

// Assistant « Ajouter une tournée » (portage KN, Stan 2026-09-28) : plusieurs
// dates / villes d'un coup. Une ligne = une date (horaire « 19:00 / 21:30 » =
// doublé, 2 séances), salle de l'annuaire KN (la ville se remplit seule),
// modèle salle par ligne. Réglage commun : statut. (Pas de Google Agenda chez
// Youri.)

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Map as MapIcon, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createTourDates } from "@/lib/actions/tours";
import { VenuePicker, type VenueSnapshot } from "@/components/deals/venue-picker";

type VenueKind = "" | "PROD" | "CO_REAL" | "CESSION";
type Row = {
  key: number;
  day: string;
  showTime: string;
  venue: VenueSnapshot | null;
  city: string;
  venueDealKind: VenueKind;
};

const KIND_OPTIONS: Array<{ v: VenueKind; label: string }> = [
  { v: "", label: "—" },
  { v: "CO_REAL", label: "Co-réa" },
  { v: "PROD", label: "Location" },
  { v: "CESSION", label: "Cession" },
];

let seq = 0;
const emptyRow = (from?: Row): Row => ({
  key: ++seq,
  day: "",
  showTime: from?.showTime ?? "",
  venue: null,
  city: "",
  venueDealKind: from?.venueDealKind ?? "",
});

export function TourWizard({ productionId }: { productionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string[] | null>(null);
  const [rows, setRows] = useState<Row[]>(() => [emptyRow(), emptyRow(), emptyRow()]);
  const [status, setStatus] = useState<"CONFIRME" | "LEAD">("CONFIRME");

  function update(key: number, patch: Partial<Row>) {
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function onVenue(r: Row, v: VenueSnapshot | null) {
    update(r.key, { venue: v, city: v ? v.city || r.city : r.city });
  }

  const filled = rows.filter((r) => r.day && (r.venue || r.city.trim()));
  const sessions = filled.reduce(
    (s, r) => s + Math.max(1, r.showTime.split("/").filter((t) => t.trim()).length),
    0,
  );

  function submit() {
    setError(null);
    setReport(null);
    startTransition(async () => {
      const res = await createTourDates({
        productionId,
        status,
        rows: filled.map((r) => ({
          day: r.day,
          showTime: r.showTime || null,
          venue: r.venue
            ? { id: r.venue.id, name: r.venue.name, city: r.venue.city || null, capacity: r.venue.capacity ?? null }
            : null,
          city: r.city || null,
          venueDealKind: r.venueDealKind || null,
        })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      if (res.data!.errors.length) {
        // Erreur partielle : on retire les lignes déjà créées (sinon un
        // nouveau clic les recréerait en double) et on garde celles à corriger.
        const done = new Set(res.data!.createdRows.map((i) => filled[i]));
        setRows((prev) => {
          const left = prev.filter((r) => !done.has(r));
          return left.length ? left : [emptyRow()];
        });
        setReport([`${res.data!.created} date(s) créée(s).`, ...res.data!.errors]);
        return;
      }
      setOpen(false);
      setRows([emptyRow(), emptyRow(), emptyRow()]);
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <MapIcon className="h-4 w-4 mr-1.5" />
        Ajouter une tournée
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ajouter une tournée</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full min-w-[760px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[36px]" />
                  <col className="w-[150px]" />
                  <col className="w-[130px]" />
                  <col />
                  <col className="w-[150px]" />
                  <col className="w-[110px]" />
                  <col className="w-[64px]" />
                </colgroup>
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <tr>
                    <th className="px-2 py-1.5 text-left">#</th>
                    <th className="px-2 py-1.5 text-left">Date</th>
                    <th className="px-2 py-1.5 text-left">Horaire(s)</th>
                    <th className="px-2 py-1.5 text-left">Salle</th>
                    <th className="px-2 py-1.5 text-left">Ville</th>
                    <th className="px-2 py-1.5 text-left">Salle en</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, i) => (
                    <tr key={r.key}>
                      <td className="px-2 py-1 text-xs text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-1">
                        <Input type="date" className="h-8 w-full text-sm" value={r.day} onChange={(e) => update(r.key, { day: e.target.value })} />
                      </td>
                      <td className="px-2 py-1">
                        <Input className="h-8 w-full text-sm" value={r.showTime} onChange={(e) => update(r.key, { showTime: e.target.value })} />
                      </td>
                      <td className="px-2 py-1">
                        <VenuePicker value={r.venue} onChange={(v) => onVenue(r, v)} className="h-8 text-sm" />
                      </td>
                      <td className="px-2 py-1">
                        <Input className="h-8 w-full text-sm" placeholder="Ville" value={r.city} onChange={(e) => update(r.key, { city: e.target.value })} />
                      </td>
                      <td className="px-2 py-1">
                        <select
                          className="h-8 w-full rounded-md border bg-background px-1.5 text-sm"
                          value={r.venueDealKind}
                          onChange={(e) => update(r.key, { venueDealKind: e.target.value as VenueKind })}
                        >
                          {KIND_OPTIONS.map((o) => (
                            <option key={o.v} value={o.v}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1 py-1">
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            title="Dupliquer la ligne (même salle)"
                            className="p-1 text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              setRows((cur) => {
                                const idx = cur.findIndex((x) => x.key === r.key);
                                const copy = { ...r, key: ++seq, day: "" };
                                return [...cur.slice(0, idx + 1), copy, ...cur.slice(idx + 1)];
                              })
                            }
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Retirer la ligne"
                            className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                            disabled={rows.length <= 1}
                            onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setRows((cur) => [...cur, emptyRow(cur[cur.length - 1])])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Ligne
            </Button>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pour toutes</span>
              <select
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as "CONFIRME" | "LEAD")}
              >
                <option value="CONFIRME">Confirmé</option>
                <option value="LEAD">Lead</option>
              </select>
              <select
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value=""
                onChange={(e) => {
                  const v = e.target.value as VenueKind;
                  if (v) setRows((cur) => cur.map((r) => ({ ...r, venueDealKind: v })));
                }}
              >
                <option value="">Salle en… (appliquer à toutes)</option>
                <option value="CO_REAL">Co-réa</option>
                <option value="PROD">Location</option>
                <option value="CESSION">Cession</option>
              </select>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Doublé : écris les 2 horaires « 19:00 / 21:30 » (= 2 séances). Contrat artiste de la
              production et jauge de la salle repris automatiquement — tout reste modifiable sur
              chaque fiche.
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
            {report && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs space-y-0.5">
                {report.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Fermer
            </Button>
            <Button onClick={submit} disabled={pending || filled.length === 0}>
              {pending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {filled.length === 0
                ? "Créer les dates"
                : `Créer ${filled.length} date${filled.length > 1 ? "s" : ""}${
                    sessions > filled.length ? ` (${sessions} séances)` : ""
                  }`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

