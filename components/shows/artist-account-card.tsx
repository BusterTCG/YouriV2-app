"use client";

// Compte artiste d'une production (portage KN, Stan 2026-09-28). Quote-part
// appelable = dates jouées dont la billetterie est encaissée (appel de
// quote-part, pas une avance). Solde = appelable − versé + reçu de l'artiste
// + frais avancés à rembourser. Les statuts « réglé » artiste des dates en
// sont déduits automatiquement.
// Lot 3 (Stan 2026-10-01) : « Verser une quote-part » coche les dates jouées
// qu'elle solde (pré-cochées : billetterie encaissée) ; montant pré-rempli.
// Frais avancés par l'artiste (Stan 2026-10-12) : dus tout de suite ;
// remboursés avec la quote-part (cochés dans le même formulaire) ou par
// « Rendre l'avance ». « Versement de l'artiste » : règlement du déficit
// (solde d'exploitation en déficit) ou avance de trésorerie (à lui rendre,
// comme les frais avancés). En cas de déficit d'exploitation, frais et
// avances de l'artiste le comblent d'abord : seul l'excédent lui est rendu.

import { GlossaryHint } from "@/components/shows/glossary-hint";
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
import { ARTIST_MOVEMENT_LABEL } from "@/lib/finance/artist-account";
import { cn } from "@/lib/utils";

type MovementKind = "PAYMENT" | "REFUND" | "EXPENSES" | "CASH_ADVANCE";
type AdvanceKind = "LINE" | "OVERHEAD" | "CASH";
/** Formulaire ouvert (RECEIVED = argent reçu de l'artiste, type choisi). */
type FormKind = "PAYMENT" | "EXPENSES" | "RECEIVED";

export type ArtistAccountData = {
  acquired: number;
  callable: number;
  pendingCollection: number;
  forecast: number;
  /** Quote-parts versées (hors remboursement de frais). */
  paid: number;
  refunded: number;
  /** Dates pas encore jouées. */
  upcoming: number;
  /** Frais avancés + avances de trésorerie : total, rendus, restant dû. */
  advances: number;
  advancesPaid: number;
  advancesDue: number;
  quotePartBalance: number;
  balance: number;
  movements: Array<{
    id: string;
    kind: MovementKind;
    amount: number;
    /** Part qui rembourse des frais avancés. */
    advanceAmount: number;
    /** "YYYY-MM-DD" */
    date: string;
    note: string | null;
    /** Avance de trésorerie : deals dont la part artiste la constitue. */
    dealLabels?: string[];
  }>;
  /** Dû à l'artiste : frais avancés (charges, frais généraux) et avances de trésorerie. */
  advanceItems: Array<{
    kind: AdvanceKind;
    id: string;
    label: string;
    amount: number;
    refunded: boolean;
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

/** Deal de l'artiste pas encore payé, utilisable comme avance de trésorerie. */
export type AdvanceableDeal = { id: string; label: string; amount: number };

const MOVEMENT_LABEL = ARTIST_MOVEMENT_LABEL;

const advanceKey = (a: { kind: AdvanceKind; id: string }) => `${a.kind}:${a.id}`;

export function ArtistAccountCard({
  productionId,
  artistName,
  account,
  settleable = [],
  openForDealId = null,
  advanceableDeals = [],
}: {
  productionId: string;
  artistName: string;
  account: ArtistAccountData;
  settleable?: SettleableDate[];
  /** Arrivée depuis une date (« À régler · compte artiste → ») : formulaire
   *  de versement ouvert, cette date cochée (Stan 2026-10-01). */
  openForDealId?: string | null;
  /** Deals non payés de l'artiste, à cocher pour une avance de trésorerie
   *  (Stan 2026-10-16 : sa part sur ces deals sert d'avance). */
  advanceableDeals?: AdvanceableDeal[];
}) {
  const openFor = openForDealId ? settleable.find((d) => d.id === openForDealId) ?? null : null;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<null | FormKind>(openFor ? "PAYMENT" : null);
  /** Argent reçu de l'artiste : remboursement ou avance de trésorerie. */
  const [received, setReceived] = useState<"REFUND" | "CASH_ADVANCE">("REFUND");
  const [amount, setAmount] = useState(openFor && openFor.artistAmount > 0 ? String(openFor.artistAmount) : "");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState<Set<string>>(() => new Set(openFor ? [openFor.id] : []));
  const [checkedAdv, setCheckedAdv] = useState<Set<string>>(() => new Set());
  const [checkedDeals, setCheckedDeals] = useState<Set<string>>(() => new Set());
  const b = account.balance;
  const openAdvances = account.advanceItems.filter((a) => !a.refunded);

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const sumOf = (ids: Set<string>) =>
    round2(settleable.filter((d) => ids.has(d.id)).reduce((s, d) => s + d.artistAmount, 0));
  const advSumOf = (keys: Set<string>) =>
    round2(openAdvances.filter((a) => keys.has(advanceKey(a))).reduce((s, a) => s + a.amount, 0));
  const advSum = advSumOf(checkedAdv);

  // Déficit d'exploitation : frais / avances de l'artiste le comblent d'abord ;
  // seul l'excédent est à lui rendre (Stan 2026-10-12).
  const deficit = Math.max(0, -account.quotePartBalance);
  const absorbed = round2(Math.min(deficit, Math.max(0, account.advancesDue)));
  const toReturn = round2(Math.max(0, account.advancesDue - absorbed));
  const absorbedOf = new Map<string, number>();
  {
    let left = absorbed;
    for (const a of openAdvances) {
      const part = round2(Math.min(a.amount, Math.max(0, left)));
      absorbedOf.set(advanceKey(a), part);
      left = round2(left - part);
    }
  }
  /** Statut d'un frais avancé / d'une avance de trésorerie. */
  function advanceStatus(a: { kind: AdvanceKind; id: string; amount: number; refunded: boolean }) {
    const abs = a.refunded ? 0 : absorbedOf.get(advanceKey(a)) ?? 0;
    const full = !a.refunded && abs > 0 && Math.round(abs) >= Math.round(a.amount);
    return {
      text: a.refunded
        ? "✓ Rendue"
        : full
          ? "Imputée sur le déficit"
          : abs > 0
            ? `Imputée en partie · ${fmt(a.amount - abs)} à rendre`
            : "À rendre",
      className: a.refunded
        ? "text-emerald-700 dark:text-emerald-400"
        : abs > 0
          ? "text-sky-700 dark:text-sky-400"
          : "text-amber-700 dark:text-amber-400",
    };
  }
  // Frais avancés listés à part ; les avances de trésorerie sont des
  // mouvements (statut affiché sur leur ligne).
  const expenseItems = account.advanceItems.filter((a) => a.kind !== "CASH");
  const cashItem = new Map(account.advanceItems.filter((a) => a.kind === "CASH").map((a) => [a.id, a]));

  /** Remboursement de frais / avances : au plus l'excédent sur le déficit. */
  const expensesAmount = (keys: Set<string>) => round2(Math.min(advSumOf(keys), toReturn));

  /** Montant proposé : dates cochées (ou solde quote-part) + frais cochés. */
  function suggest(dates: Set<string>, adv: Set<string>): string {
    const base = settleable.length > 0 ? Math.max(0, sumOf(dates)) : Math.max(0, account.quotePartBalance);
    const total = round2(base + advSumOf(adv));
    return total > 0 ? String(total) : "";
  }

  function open(kind: FormKind) {
    setForm(kind);
    setError(null);
    setNote("");
    setCheckedDeals(new Set());
    // Frais / avances à rendre : tous cochés d'office (remboursement ; quote-part
    // seulement sans déficit — sinon ils comblent le déficit).
    const adv =
      kind === "EXPENSES" || (kind === "PAYMENT" && deficit === 0)
        ? new Set(openAdvances.map(advanceKey))
        : new Set<string>();
    setCheckedAdv(adv);
    if (kind === "PAYMENT") {
      const pre = new Set(settleable.filter((d) => d.collected).map((d) => d.id));
      setChecked(pre);
      setAmount(suggest(pre, adv));
      return;
    }
    setChecked(new Set());
    if (kind === "EXPENSES") {
      setAmount(String(expensesAmount(adv)));
      return;
    }
    // Déficit restant (après frais / avances imputés) → remboursement proposé.
    const owed = round2(Math.max(0, -b));
    setReceived(owed > 0 ? "REFUND" : "CASH_ADVANCE");
    setAmount(owed ? String(owed) : "");
  }

  function chooseReceived(kind: "REFUND" | "CASH_ADVANCE") {
    setReceived(kind);
    const owed = round2(Math.max(0, -b));
    if (kind === "REFUND" && owed > 0 && !amount) setAmount(String(owed));
  }

  /** Avance depuis des deals non payés : montant = parts artiste cochées. */
  function toggleDeal(id: string) {
    const next = new Set(checkedDeals);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedDeals(next);
    const total = round2(advanceableDeals.filter((d) => next.has(d.id)).reduce((s, d) => s + d.amount, 0));
    setAmount(total > 0 ? String(total) : "");
  }

  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
    setAmount(suggest(next, checkedAdv));
  }

  function toggleAdv(key: string) {
    const next = new Set(checkedAdv);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCheckedAdv(next);
    setAmount(form === "EXPENSES" ? String(expensesAmount(next)) : suggest(checked, next));
  }

  function save() {
    if (!form) return;
    setError(null);
    const n = parseFloat(amount.replace(/\s/g, "").replace(",", ".")) || 0;
    const settling = form === "PAYMENT" && checked.size > 0;
    const pick = (k: AdvanceKind) =>
      openAdvances.filter((a) => a.kind === k && checkedAdv.has(advanceKey(a))).map((a) => a.id);
    const advances = { lines: pick("LINE"), overheads: pick("OVERHEAD"), cash: pick("CASH") };
    const kind: MovementKind = form === "RECEIVED" ? received : form;
    if (form === "EXPENSES" && checkedAdv.size === 0) {
      setError("Coche au moins un frais ou une avance");
      return;
    }
    if (form === "EXPENSES" && n > advSum + 0.005) {
      setError("Montant supérieur aux frais / avances cochés");
      return;
    }
    if (!settling && n <= 0) {
      setError("Montant requis");
      return;
    }
    if (n < 0) {
      setError("Montant invalide");
      return;
    }
    if (form === "PAYMENT" && n + 0.005 < advSum) {
      setError("Montant inférieur aux frais cochés");
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
            advances,
          })
        : await addArtistMovement({
            productionId,
            kind,
            amount: n,
            date: new Date(`${date}T12:00:00Z`),
            note: note || null,
            advances: form === "RECEIVED" ? undefined : advances,
            cashDeals: kind === "CASH_ADVANCE" ? [...checkedDeals] : [],
          });
      if (!res.ok) setError(res.error);
      else setForm(null);
      router.refresh();
    });
  }

  const showAdvances =
    form === "EXPENSES" || (form === "PAYMENT" && openAdvances.length > 0 && deficit === 0);

  return (
    <div className="rounded-md border bg-card">
      <div className="px-4 py-2.5 border-b flex items-center justify-between gap-2 flex-wrap">
        <SectionTitle tone="violet" as="h3" icon={<HandCoins className="h-3.5 w-3.5" />}>
          Compte artiste · {artistName} <GlossaryHint term="quotePart" />
        </SectionTitle>
        <div className="flex items-center gap-2 flex-wrap">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Button size="sm" className="h-7" onClick={() => open("PAYMENT")} title="Pangee verse à l'artiste">
            + Versement de quote-part
          </Button>
          {toReturn > 0.5 && openAdvances.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => open("EXPENSES")}
              title="Pangee a rendu à l'artiste son avance / ses frais avancés (au-delà du déficit)"
            >
              + Rendre l&apos;avance
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => open("RECEIVED")}
            title="L'artiste verse à Pangee : règlement du déficit ou avance de trésorerie"
          >
            + Versement de l&apos;artiste
          </Button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3 text-sm">
        {/* Chiffres */}
        <div className={cn("grid grid-cols-2 gap-3", account.advances !== 0 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
          <Figure label="Part artiste" hint="dates jouées" value={account.acquired} />
          <Figure label="Appelable" hint="billetterie encaissée" value={account.callable} strong />
          <Figure label="En attente" hint="billetterie pas reçue" value={account.pendingCollection} muted />
          <Figure label="Net versé" hint="quote-parts − déficit réglé" value={account.paid - account.refunded} muted />
          {account.advances !== 0 && (
            <Figure
              label="Avances à rendre"
              hint={
                absorbed > 0
                  ? `${fmt(absorbed)} imputés sur le déficit`
                  : `à rendre à l'artiste · ${fmt(account.advances)} au total`
              }
              value={toReturn}
              strong={Math.round(toReturn) !== 0}
              muted={Math.round(toReturn) === 0}
              term
            />
          )}
        </div>

        {/* Frais avancés par l'artiste */}
        {expenseItems.length > 0 && (
          <div className="rounded-md border divide-y">
            <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              Frais avancés par l&apos;artiste
            </div>
            {expenseItems.map((a) => {
              const st = advanceStatus(a);
              return (
                <div key={advanceKey(a)} className="flex items-center gap-3 px-3 py-1.5">
                  <span className="flex-1 min-w-0 truncate">{a.label}</span>
                  <span className={cn("text-[11px] font-medium text-right", st.className)}>{st.text}</span>
                  <span className="font-semibold tabular-nums w-24 text-right">
                    <SensitiveAmount value={a.amount} />
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Mouvements */}
        {account.movements.length > 0 && (
          <div className="rounded-md border divide-y">
            {account.movements.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-3 py-1.5">
                <span className="w-24 tabular-nums text-muted-foreground">
                  {format(new Date(`${m.date}T12:00:00Z`), "dd/MM/yyyy")}
                </span>
                <span className="flex-1 min-w-0 truncate">
                  {MOVEMENT_LABEL[m.kind]}
                  {m.kind === "PAYMENT" && m.advanceAmount > 0 && (
                    <span className="text-muted-foreground"> (dont frais / avances rendus {fmt(m.advanceAmount)})</span>
                  )}
                  {m.dealLabels && m.dealLabels.length > 0 && (
                    <span className="text-muted-foreground"> · depuis {m.dealLabels.join(", ")}</span>
                  )}
                  {m.note && <span className="text-muted-foreground"> — {m.note}</span>}
                </span>
                {m.kind === "CASH_ADVANCE" && cashItem.get(m.id) && (
                  <span className={cn("text-[11px] font-medium text-right", advanceStatus(cashItem.get(m.id)!).className)}>
                    {advanceStatus(cashItem.get(m.id)!).text}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  {fromArtist(m.kind) ? "artiste → Pangee" : "Pangee → artiste"}
                </span>
                <span className="font-semibold tabular-nums">
                  {fromArtist(m.kind) ? "+ " : "− "}
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
            {form === "RECEIVED" ? (
              <div className="w-full space-y-1">
                <div className="text-xs font-semibold">
                  Versement de l&apos;artiste
                  <span className="font-normal text-muted-foreground"> · l&apos;artiste verse à Pangee</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {(
                    [
                      ["REFUND", "Règlement du déficit", "solde l'exploitation"],
                      ["CASH_ADVANCE", "Avance de trésorerie", "comble d'abord un déficit, le reste lui est rendu"],
                    ] as const
                  ).map(([k, title, hint]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => chooseReceived(k)}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-left text-xs transition-colors",
                        received === k
                          ? "border-violet-500/60 bg-violet-500/10 text-foreground"
                          : "bg-card text-muted-foreground hover:bg-accent/40",
                      )}
                    >
                      <div className="font-semibold">{title}</div>
                      <div className="text-[11px]">{hint}</div>
                    </button>
                  ))}
                </div>
                {received === "CASH_ADVANCE" && advanceableDeals.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="text-[11px] text-muted-foreground">
                      Avance depuis des deals pas encore payés à l&apos;artiste (optionnel) — sa part sur
                      ces deals sert d&apos;avance ; leur statut ne change pas.
                    </div>
                    <div className="rounded-md border bg-card divide-y">
                      {advanceableDeals.map((d) => (
                        <label
                          key={d.id}
                          className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-accent/30"
                        >
                          <input
                            type="checkbox"
                            checked={checkedDeals.has(d.id)}
                            onChange={() => toggleDeal(d.id)}
                            className="h-3.5 w-3.5 accent-violet-600"
                          />
                          <span className="flex-1 min-w-0 truncate">{d.label}</span>
                          <span className="tabular-nums font-medium w-24 text-right">
                            <SensitiveAmount value={d.amount} />
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <span className="text-xs font-semibold">
                {form === "EXPENSES" ? "Rendre l'avance" : MOVEMENT_LABEL[form]}
                <span className="font-normal text-muted-foreground"> · Pangee verse à l&apos;artiste</span>
              </span>
            )}
            <Input type="date" className="h-8 w-40 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="w-28">
              <Input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Montant €"
                className={cn("h-8 text-sm text-right tabular-nums")}
              />
            </div>
            <Input
              className="h-8 w-56 text-sm"
              placeholder={form === "EXPENSES" ? "Note (ex. virement train)" : "Note (ex. quote-part sept.)"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
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
                  frais généraux figée. Montant = somme des parts artiste cochées
                  {openAdvances.length > 0 ? " + frais avancés cochés" : ""} (modifiable ; 0 = solder
                  sans versement).
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
            {showAdvances && (
              <div className="w-full space-y-1 pt-1">
                <div className="text-[11px] text-muted-foreground">
                  {form === "EXPENSES"
                    ? absorbed > 0
                      ? `Déficit d'exploitation ${fmt(deficit)} comblé d'abord par ces frais / avances : seul l'excédent (${fmt(toReturn)}) est à rendre.`
                      : "Frais avancés et avances de trésorerie rendus par ce versement."
                    : `Frais avancés / avances de trésorerie rendus avec cette quote-part${
                        advSum > 0 ? ` (${fmt(advSum)} inclus dans le montant)` : ""
                      }.`}
                </div>
                <div className="rounded-md border bg-card divide-y">
                  {openAdvances.map((a) => (
                    <label
                      key={advanceKey(a)}
                      className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-accent/30"
                    >
                      <input
                        type="checkbox"
                        checked={checkedAdv.has(advanceKey(a))}
                        onChange={() => toggleAdv(advanceKey(a))}
                        className="h-3.5 w-3.5 accent-violet-600"
                      />
                      <span className="flex-1 min-w-0 truncate">{a.label}</span>
                      <span className="tabular-nums font-medium w-24 text-right">
                        <SensitiveAmount value={a.amount} />
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
                Compte soldé
              </>
            ) : b > 0 ? (
              "À verser à l'artiste"
            ) : account.upcoming > 0 ? (
              "Déficit à date"
            ) : (
              "Déficit final, dû par l'artiste"
            )}
          </div>
          {Math.round(b) !== 0 && (
            <div className="text-xl font-semibold">
              <SensitiveAmount value={Math.abs(b)} />
            </div>
          )}
          {absorbed > 0 ? (
            <div className="w-full text-xs">
              Déficit d&apos;exploitation {fmt(deficit)} − frais / avances de l&apos;artiste {fmt(account.advancesDue)}
              {b > 0 ? ` : l'excédent ${fmt(toReturn)} est à lui rendre.` : " (imputées sur le déficit)."}
            </div>
          ) : Math.round(account.advancesDue) !== 0 && Math.round(b) !== 0 ? (
            <div className="w-full text-xs">
              dont quote-part {fmt(account.quotePartBalance)} · frais / avances à rendre {fmt(account.advancesDue)}
            </div>
          ) : null}
          {b < 0 && Math.round(b) !== 0 && (
            <div className="w-full text-xs">
              {account.upcoming > 0
                ? `Compensé d'abord par les prochaines dates (${account.upcoming} à venir). S'il reste négatif en fin d'exploitation, l'artiste le règle (« Versement de l'artiste » → Règlement du déficit).`
                : "L'artiste règle le déficit : « Versement de l'artiste » → Règlement du déficit."}
            </div>
          )}
          <div className="w-full text-[11px] text-muted-foreground">
            Appelable {fmt(account.callable)} − versé {fmt(account.paid)}
            {account.refunded ? ` + déficit réglé ${fmt(account.refunded)}` : ""}
            {account.advancesDue ? ` + frais / avances de l'artiste ${fmt(account.advancesDue)}` : ""}. Sont
            appelables les dates jouées dont la billetterie est encaissée, et les dates soldées ; une date
            en déficit se compense avec les dates positives. Frais avancés et avances de trésorerie
            comblent d&apos;abord un déficit ; le reste est rendu à l&apos;artiste.
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
  term,
}: {
  label: string;
  hint: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
  /** Bulle « ? » frais avancés. */
  term?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold inline-flex items-center gap-1">
        {label}
        {term && <GlossaryHint term="artistAdvance" />}
      </div>
      <div className={cn("text-lg font-semibold", muted && "text-muted-foreground", strong && "text-foreground")}>
        <SensitiveAmount value={value} />
      </div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

/** Argent venu de l'artiste (remboursement, avance de trésorerie). */
function fromArtist(kind: MovementKind): boolean {
  return kind === "REFUND" || kind === "CASH_ADVANCE";
}

function fmt(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}
