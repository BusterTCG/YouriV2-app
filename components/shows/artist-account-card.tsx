"use client";

// Compte artiste d'une production (portage KN, Stan 2026-09-28). Quote-part
// appelable = dates jouées dont la billetterie est encaissée (appel de
// quote-part, pas une avance). Solde = appelable − versé + remboursé. Les
// statuts « réglé » artiste des dates en sont déduits automatiquement.
// Lot 3 (Stan 2026-10-01) : « Verser une quote-part » coche les dates jouées
// qu'elle solde (pré-cochées : billetterie encaissée) ; montant pré-rempli.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CheckCircle2, HandCoins, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import { SectionTitle } from "@/components/shows/section-title";
import {
  addArtistMovement,
  deleteArtistMovement,
  settleDatesWithPayment,
} from "@/lib/actions/artist-movements";
import { cn } from "@/lib/utils";

export type ArtistAccountData = {
  acquired: number;
  callable: number;
  pendingCollection: number;
  forecast: number;
  paid: number;
  refunded: number;
  balance: number;
  movements: Array<{
    id: string;
    kind: "PAYMENT" | "REFUND";
    amount: number;
    /** "YYYY-MM-DD" */
    date: string;
    note: string | null;
  }>;
};

/** Date jouée pas encore soldée, proposée au versement d'une quote-part. */
export type SettleableDate = {
  id: string;
  /** « 12/09/2026 · Petite Loge » */
  label: string;
  /** Part artiste de la date (peut être négative). */
  artistAmount: number;
  /** Billetterie encaissée → pré-cochée. */
  collected: boolean;
};

export function ArtistAccountCard({
  productionId,
  artistName,
  account,
  settleable = [],
}: {
  productionId: string;
  artistName: string;
  account: ArtistAccountData;
  settleable?: SettleableDate[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<null | "PAYMENT" | "REFUND">(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const b = account.balance;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const sumOf = (ids: Set<string>) =>
    round2(settleable.filter((d) => ids.has(d.id)).reduce((s, d) => s + d.artistAmount, 0));

  function open(kind: "PAYMENT" | "REFUND") {
    setForm(kind);
    setError(null);
    setNote("");
    if (kind === "PAYMENT" && settleable.length > 0) {
      const pre = new Set(settleable.filter((d) => d.collected).map((d) => d.id));
      setChecked(pre);
      const total = sumOf(pre);
      setAmount(total > 0 ? String(total) : "");
      return;
    }
    setChecked(new Set());
    const suggested = kind === "PAYMENT" ? Math.max(0, b) : Math.max(0, -b);
    setAmount(suggested ? String(round2(suggested)) : "");
  }

  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
    const total = sumOf(next);
    setAmount(total > 0 ? String(total) : "");
  }

  function save() {
    const n = parseFloat(amount.replace(/\s/g, "").replace(",", ".")) || 0;
    const settling = form === "PAYMENT" && checked.size > 0;
    if (!settling && n <= 0) {
      setError("Montant requis");
      return;
    }
    if (n < 0) {
      setError("Montant invalide");
      return;
    }
    startTransition(async () => {
      const res = settling
        ? await settleDatesWithPayment({
            productionId,
            dealIds: [...checked],
            amount: n,
            date: new Date(`${date}T12:00:00Z`),
            note: note || null,
          })
        : await addArtistMovement({
            productionId,
            kind: form,
            amount: n,
            date: new Date(`${date}T12:00:00Z`),
            note: note || null,
          });
      if (!res.ok) setError(res.error);
      else setForm(null);
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border bg-card">
      <div className="px-4 py-2.5 border-b flex items-center justify-between gap-2 flex-wrap">
        <SectionTitle tone="violet" as="h3" icon={<HandCoins className="h-3.5 w-3.5" />}>
          Compte artiste · {artistName}
        </SectionTitle>
        <div className="flex items-center gap-2">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Button size="sm" className="h-7" onClick={() => open("PAYMENT")}>
            + Verser une quote-part
          </Button>
          <Button size="sm" variant="outline" className="h-7" onClick={() => open("REFUND")}>
            + Remboursement de l&apos;artiste
          </Button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3 text-sm">
        {/* Chiffres */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Figure label="Part acquise" hint="dates jouées" value={account.acquired} />
          <Figure label="Dont appelable" hint="billetterie reçue" value={account.callable} strong />
          <Figure label="En attente" hint="billetterie pas encore reçue" value={account.pendingCollection} muted />
          <Figure label="Déjà versé" hint="quote-parts − remboursements" value={account.paid - account.refunded} muted />
        </div>

        {/* Mouvements */}
        {account.movements.length > 0 && (
          <div className="rounded-md border divide-y">
            {account.movements.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-3 py-1.5">
                <span className="w-24 tabular-nums text-muted-foreground">
                  {format(new Date(`${m.date}T12:00:00Z`), "dd/MM/yyyy")}
                </span>
                <span className="flex-1 min-w-0 truncate">
                  {m.kind === "PAYMENT" ? "Quote-part versée à l'artiste" : "Remboursement de l'artiste"}
                  {m.note && <span className="text-muted-foreground"> — {m.note}</span>}
                </span>
                <span className="font-semibold tabular-nums">
                  {m.kind === "PAYMENT" ? "− " : "+ "}
                  <SensitiveAmount value={m.amount} />
                </span>
                <button
                  type="button"
                  title="Supprimer"
                  disabled={pending}
                  className="p-1 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (confirm("Supprimer ce mouvement ?")) {
                      setError(null);
                      startTransition(async () => {
                        const res = await deleteArtistMovement(m.id);
                        if (!res.ok) setError(res.error);
                        router.refresh();
                      });
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && !form && <p className="text-xs text-destructive">{error}</p>}

        {/* Saisie */}
        {form && (
          <div className="rounded-md border bg-muted/20 px-3 py-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold">
              {form === "PAYMENT" ? "Quote-part versée à l'artiste" : "Remboursement de l'artiste"}
            </span>
            <Input type="date" className="h-8 w-40 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="w-28">
              <Input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Montant €"
                className="h-8 text-sm text-right tabular-nums"
              />
            </div>
            <Input className="h-8 w-56 text-sm" placeholder="Note (ex. quote-part sept.)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button size="sm" className="h-8" onClick={save} disabled={pending}>
              {form === "PAYMENT" && checked.size > 0
                ? `Verser et solder ${checked.size} date${checked.size > 1 ? "s" : ""}`
                : "Enregistrer"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setForm(null)}>
              Annuler
            </Button>
            {error && <span className="text-xs text-destructive">{error}</span>}
            {form === "PAYMENT" && settleable.length > 0 && (
              <div className="w-full space-y-1 pt-1">
                <div className="text-[11px] text-muted-foreground">
                  Dates soldées par ce versement — leurs comptes seront clos et leur quote-part de
                  frais généraux figée. Montant = somme des parts artiste cochées (modifiable ; 0 =
                  solder sans versement).
                </div>
                <div className="rounded-md border bg-card divide-y">
                  {settleable.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-accent/30">
                      <input
                        type="checkbox"
                        checked={checked.has(d.id)}
                        onChange={() => toggle(d.id)}
                        className="h-3.5 w-3.5 accent-violet-600"
                      />
                      <span className="flex-1 min-w-0 truncate">{d.label}</span>
                      {!d.collected && <span className="text-amber-700 dark:text-amber-400">billetterie pas reçue</span>}
                      <span className={cn("tabular-nums font-medium w-24 text-right", d.artistAmount < 0 && "text-red-600 dark:text-red-400")}>
                        <SensitiveAmount value={d.artistAmount} />
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Solde */}
        <div
          className={cn(
            "rounded-md border-2 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap",
            Math.round(b) === 0 && "border-emerald-500/40 bg-emerald-500/5",
            b > 0 && Math.round(b) !== 0 && "border-amber-500/60 bg-amber-500/10",
            b < 0 && Math.round(b) !== 0 && "border-sky-500/50 bg-sky-500/10",
          )}
        >
          <div className="font-semibold inline-flex items-center gap-1.5">
            {Math.round(b) === 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Compte soldé — rien à verser
              </>
            ) : b > 0 ? (
              "Quote-part disponible à verser à l'artiste"
            ) : (
              "L'artiste doit à Pangee"
            )}
          </div>
          {Math.round(b) !== 0 && (
            <div className="text-xl font-semibold">
              <SensitiveAmount value={Math.abs(b)} />
            </div>
          )}
          <div className="w-full text-[11px] text-muted-foreground">
            Appelable {fmt(account.callable)} − versé {fmt(account.paid)}
            {account.refunded ? ` + remboursé ${fmt(account.refunded)}` : ""}. Sont appelables les dates
            jouées dont la billetterie est encaissée, et les dates soldées.
          </div>
        </div>
      </div>
    </div>
  );
}

function Figure({
  label,
  hint,
  value,
  strong,
  muted,
}: {
  label: string;
  hint: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={cn("text-lg font-semibold", muted && "text-muted-foreground", strong && "text-foreground")}>
        <SensitiveAmount value={value} />
      </div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function fmt(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}
