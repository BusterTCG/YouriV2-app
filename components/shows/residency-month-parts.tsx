"use client";

// Pièces interactives de la fiche Résidence (portage KN, étape 2) :
// - relevé du mois (Recette HT nette versée par le théâtre) + encaissement,
//   avec la billetterie des séances en comparaison. Le montant se saisit à
//   UN seul endroit : le bloc Financier du mois (Stan 2026-10-01) ;
// - suivi Contrat / MEV / VHR appliqué à tous les mois.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import type { PaymentStatus, VenueDealKind } from "@prisma/client";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import { upsertProductionLine } from "@/lib/actions/production-lines";
import { deleteResidency, setResidencyChecklist } from "@/lib/actions/residencies";
import { cn } from "@/lib/utils";

export function MonthReleve({
  dealId,
  venueDealKind,
  recetteHt,
  recetteLines,
  status,
  ticketing,
  manual = false,
}: {
  dealId: string;
  venueDealKind: VenueDealKind | null;
  /** Salle louée : Recette HT saisie à la main (sinon = billetterie). */
  manual?: boolean;
  /** Somme des lignes RECETTE_HT du mois. */
  recetteHt: number;
  /** Nombre de lignes RECETTE_HT (sous-entrées → édition sur la fiche du mois). */
  recetteLines: number;
  status: PaymentStatus | null;
  /** Billetterie HT des séances du mois (null si non saisie). */
  ticketing: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const auto = venueDealKind === "PROD" && !manual;
  const paid = status === "PAID";

  function save(amount: number, nextStatus: PaymentStatus) {
    setError(null);
    startTransition(async () => {
      const res = await upsertProductionLine({
        dealId,
        kind: "REVENUE",
        label: "RECETTE_HT",
        amount,
        status: nextStatus,
      });
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap text-sm">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {venueDealKind === "CO_REAL" ? "Relevé du mois (part nette)" : "Recette HT du mois"}
      </span>
      <span className="font-semibold tabular-nums">
        <SensitiveAmount value={recetteHt} />
        <span className="text-[11px] font-normal text-muted-foreground ml-1">
          {auto
            ? "(= billetterie des séances)"
            : venueDealKind === "PROD"
              ? "(saisie à la main)"
              : recetteLines > 1
                ? "(plusieurs lignes)"
                : ""}
        </span>
      </span>
      <Link
        href={`/shows/${dealId}?tab=comptes`}
        className="text-[11px] text-sky-700 dark:text-sky-400 hover:underline"
      >
        {recetteHt === 0 ? "Saisir dans Financier →" : "Modifier dans Financier →"}
      </Link>
      {recetteHt !== 0 && recetteLines <= 1 && (
        <button
          type="button"
          disabled={pending}
          onClick={() => save(recetteHt, paid ? "TO_INVOICE" : "PAID")}
          className={cn(
            "h-7 rounded-md px-2 text-[11px] font-medium border transition-colors",
            paid
              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
              : "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400",
          )}
        >
          {paid ? "✓ Encaissé" : "⏳ À encaisser"}
        </button>
      )}
      {ticketing != null && !auto && ticketing !== recetteHt && (
        <span className="text-[11px] text-muted-foreground">
          Billetterie des séances : <SensitiveAmount value={ticketing} />
        </span>
      )}
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

export function ResidencyChecklist({
  residencyId,
  contractSigned,
  ticketingReady,
  vhrBooked,
}: {
  residencyId: string;
  contractSigned: boolean;
  ticketingReady: boolean;
  vhrBooked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toggle = (patch: Parameters<typeof setResidencyChecklist>[1]) =>
    startTransition(async () => {
      setError(null);
      const res = await setResidencyChecklist(residencyId, patch);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  const pill = (label: string, on: boolean, patch: Parameters<typeof setResidencyChecklist>[1]) => (
    <button
      type="button"
      disabled={pending}
      onClick={() => toggle(patch)}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors",
        on
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 font-semibold"
          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
      )}
    >
      {label} {on ? "✓" : ""}
    </button>
  );
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Suivi</span>
      {pill("Contrat signé", contractSigned, { contractSigned: !contractSigned })}
      {pill("MEV billetterie", ticketingReady, { ticketingReady: !ticketingReady })}
      {pill("VHR pris", vhrBooked, { vhrBooked: !vhrBooked })}
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

/** Supprimer la résidence (mois à la corbeille, restaurables). */
export function DeleteResidencyButton({
  residencyId,
  name,
  months,
}: {
  residencyId: string;
  name: string;
  months: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const msg =
            months > 0
              ? `Supprimer la résidence « ${name} » ? Ses ${months} mois (séances, relevés, charges) partent à la corbeille — restaurables depuis la Corbeille.`
              : `Supprimer la résidence « ${name} » ?`;
          if (!confirm(msg)) return;
          startTransition(async () => {
            const res = await deleteResidency(residencyId);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.push(`/shows/production/${res.data!.productionId}`);
            router.refresh();
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        Supprimer la résidence
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </>
  );
}
