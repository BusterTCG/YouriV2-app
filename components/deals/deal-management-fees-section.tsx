"use client";

import { useState, useTransition } from "react";
import { HandCoins, Loader2, TrendingDown, Users2 } from "lucide-react";
import type { ManagementFeeRole, PaymentStatus } from "@prisma/client";
import { PANGEE_TEAM } from "@/lib/pangee-team";
import {
  setManagementFeePool,
  updateManagementFee,
} from "@/lib/actions/management-fees";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import { cn } from "@/lib/utils";
import { PaidToggle } from "./paid-toggle";
import { DealSectionHeader } from "./deal-section-header";
import { SectionStatusBadge } from "./section-status-badge";

/**
 * Section Management fees — rémunération associés sur la marge du deal.
 *
 * Layout 🅱 Compact (Stan 2026-05-26) :
 *   - Lignes par associé (pas de notes)
 *   - Statut binaire En cours / Payé via PaidToggle (pas le Select 4 valeurs
 *     des artistes — Stan veut simple : facturé ou pas)
 *   - Pool % éditable + chips multi-select Stan/Certe/Angath
 *   - Footer "💎 Marge nette Pangee" doré
 *
 * Cadre Stan 2026-05-26 :
 *   - Marge Youri = Budget − Artistes − Charges (avant MF)
 *   - Total MF = Σ amount snapshot
 *   - Marge nette Pangee = Marge Youri − Total MF
 */

export interface DealManagementFeeRow {
  id: string;
  role: ManagementFeeRole;
  associateKey: string;
  sharePct: number;
  amount: number | null;
  paymentStatus: PaymentStatus;
  paidAt: Date | null;
  notes: string | null;
}

interface Props {
  dealId: string;
  /** Budget Youri du deal — base de calcul du % marge nette (Stan 2026-05-26). */
  budgetAmount: number;
  /** Marge Youri brute (avant MF) — base de calcul des montants MF. */
  margeYouri: number;
  fees: DealManagementFeeRow[];
  /** Budget encaissé (paymentStatus = PAID). */
  isEncaisse: boolean;
  /** Tous les artistes du deal sont payés (paymentStatus = PAID sur chaque
   *  DealArtiste actif). Sert au tag "Dispo pour paiement" — on ne paye les
   *  MF que quand tout l'amont est OK. */
  allArtistesPaid: boolean;
  /** Toutes les charges du deal sont payées (paymentStatus = PAID). */
  allChargesPaid: boolean;
}

const ROLE_LABELS: Record<ManagementFeeRole, string> = {
  APPORT: "Apport d'affaires",
  WORK: "Travail effectif",
};

const ROLE_ICONS: Record<
  ManagementFeeRole,
  React.ComponentType<{ className?: string }>
> = {
  APPORT: HandCoins,
  WORK: Users2,
};

/**
 * Pool % par défaut PAR catégorie (Stan 2026-05-26 v2) :
 *   - APPORT (apport d'affaires) : 10%
 *   - WORK   (travail effectif)  : 15%
 * Modifiable au cas par cas via l'input compact dans le header du bloc.
 */
const DEFAULT_POOL_PCT: Record<ManagementFeeRole, number> = {
  APPORT: 10,
  WORK: 15,
};

export function DealManagementFeesSection({
  dealId,
  budgetAmount,
  margeYouri,
  fees,
  isEncaisse,
  allArtistesPaid,
  allChargesPaid,
}: Props) {
  // Tri alphabétique par firstName de l'associé (Stan 2026-05-26).
  // L'ordre dans PANGEE_TEAM est déjà alphabétique → on l'utilise comme
  // référence pour aligner les rows fees sur les chips.
  const teamOrder = new Map(PANGEE_TEAM.map((m, i) => [m.key, i]));
  const sortByAssociate = (a: DealManagementFeeRow, b: DealManagementFeeRow) =>
    (teamOrder.get(a.associateKey) ?? 99) -
    (teamOrder.get(b.associateKey) ?? 99);

  const apportFees = fees.filter((f) => f.role === "APPORT").sort(sortByAssociate);
  const workFees = fees.filter((f) => f.role === "WORK").sort(sortByAssociate);

  // Si la marge Youri est négative ou nulle, pas de management fees
  // (Stan 2026-05-26 : on ne reverse rien quand le deal est dans le rouge).
  const noMfReason = margeYouri <= 0;
  const rawTotal = fees.reduce((acc, f) => acc + (f.amount ?? 0), 0);
  const total = noMfReason ? 0 : rawTotal;
  const margeNette = margeYouri - total;
  const paidCount = fees.filter((f) => f.paymentStatus === "PAID").length;
  const allPaid = fees.length > 0 && paidCount === fees.length;
  const pendingCount = fees.length - paidCount;

  /** Tag "Dispo pour paiement" (Stan 2026-05-26) : le deal est prêt à
   *  régler ses MF si TOUT l'amont est OK :
   *   - Budget encaissé par Pangee
   *   - Tous les artistes payés
   *   - Toutes les charges payées
   *   - Marge Youri positive (sinon pas de MF du tout)
   *  Tant qu'au moins une condition n'est pas remplie, on n'a pas le cash
   *  ou on a un risque → pas la peine de reverser les MF tout de suite. */
  const isReadyToPay =
    isEncaisse && allArtistesPaid && allChargesPaid && !noMfReason;

  return (
    <section className="space-y-1.5">
      <DealSectionHeader
        icon={<TrendingDown className="h-4 w-4 text-red-500" />}
        title="💼 Management fees"
        subtitle={
          <div className="inline-flex items-center gap-1.5 flex-wrap">
            {isReadyToPay && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                ✓ Dispo pour paiement
              </span>
            )}
            {fees.length > 0 && (
              <SectionStatusBadge
                done={allPaid}
                label={
                  allPaid
                    ? "Tout payé"
                    : `${pendingCount} en cours / ${fees.length}`
                }
              />
            )}
          </div>
        }
        total={total}
        totalAccent="negative"
      />
      <div className="rounded-md border overflow-hidden divide-y">
        {noMfReason ? (
          <div className="px-3 py-4 text-sm text-amber-700 dark:text-amber-400 italic text-center bg-amber-50 dark:bg-amber-950/20">
            ⚠ Pas de management fees — la marge Youri est nulle ou négative.
          </div>
        ) : (
          <>
            <ManagementFeeBlock
              dealId={dealId}
              role="APPORT"
              fees={apportFees}
              margeYouri={margeYouri}
            />
            <ManagementFeeBlock
              dealId={dealId}
              role="WORK"
              fees={workFees}
              margeYouri={margeYouri}
            />
          </>
        )}

        {/* Footer "= Marge nette Youri" — même style visuel que "= Marge Youri" :
            text-2xl, vert si positif / rouge si négatif (Stan 2026-05-26). */}
        <div className="px-4 py-3 flex items-baseline justify-between">
          <div>
            <div
              className={cn(
                "text-xs uppercase tracking-wider font-semibold",
                margeNette >= 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-red-700 dark:text-red-400",
              )}
            >
              = Marge Nette
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Marge Brute − Management fees
              {isEncaisse
                ? " · ✓ budget encaissé"
                : " · ⏳ budget non encaissé"}
            </div>
          </div>
          <div className="text-right">
            <div
              className={cn(
                "text-2xl font-semibold tabular-nums",
                margeNette >= 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-red-700 dark:text-red-400",
              )}
            >
              <SensitiveAmount value={margeNette} />
            </div>
            {budgetAmount > 0 && (
              <div className="text-xs text-muted-foreground tabular-nums">
                {Math.round((margeNette / budgetAmount) * 100)}% du budget
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────── ManagementFeeBlock (par catégorie) ────────────────────────────

function ManagementFeeBlock({
  dealId,
  role,
  fees,
  margeYouri,
}: {
  dealId: string;
  role: ManagementFeeRole;
  fees: DealManagementFeeRow[];
  margeYouri: number;
}) {
  const [pending, startTransition] = useTransition();
  const Icon = ROLE_ICONS[role];

  // Pool % actuel = somme des sharePct si fees présentes, sinon le défaut
  // de la catégorie (APPORT 10% / WORK 15%).
  // Stan 2026-05-26 : pas de décimale dans les % affichés → on round à l'entier.
  // Le calcul interne du sharePct (et donc du amount) garde sa précision.
  const currentPoolPct =
    fees.length > 0
      ? Math.round(fees.reduce((acc, f) => acc + Number(f.sharePct), 0))
      : DEFAULT_POOL_PCT[role];
  const [poolPct, setPoolPct] = useState<string>(String(currentPoolPct));
  const selectedKeys = new Set(fees.map((f) => f.associateKey));

  function commitSelection(newKeys: Set<string>, newPoolPct?: number) {
    const pct = newPoolPct ?? (Number(poolPct) || 0);
    startTransition(async () => {
      await setManagementFeePool({
        dealId,
        role,
        poolPct: pct,
        associateKeys: Array.from(newKeys),
        margeYouri,
      });
    });
  }

  function toggleAssociate(key: string) {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    commitSelection(next);
  }

  function commitPoolPct() {
    const pct = Number(poolPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setPoolPct(String(currentPoolPct));
      return;
    }
    if (pct === currentPoolPct) return;
    commitSelection(selectedKeys, pct);
  }

  return (
    <div className="px-3 py-2">
      {/* Header bloc compact : icône + titre + pool % + chips */}
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <Icon className="h-3.5 w-3.5 text-amber-600 shrink-0" />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground/80">
          {ROLE_LABELS[role]}
        </span>

        {/* Pool % éditable — discret, taille alignée sur le label */}
        <span className="inline-flex items-baseline gap-0.5">
          <input
            type="text"
            inputMode="decimal"
            value={poolPct}
            onChange={(e) => setPoolPct(e.target.value)}
            onBlur={commitPoolPct}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              else if (e.key === "Escape") setPoolPct(String(currentPoolPct));
            }}
            className="h-4 w-7 rounded bg-muted/40 border-0 px-1 text-[11px] tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-foreground/20 focus:bg-background"
            disabled={pending}
          />
          <span className="text-[11px] text-muted-foreground">%</span>
        </span>

        {/* Chips multi-select associés */}
        <div className="flex items-center gap-1 flex-wrap ml-auto">
          {PANGEE_TEAM.map((m) => {
            const isSelected = selectedKeys.has(m.key);
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => toggleAssociate(m.key)}
                disabled={pending}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                  isSelected
                    ? "border-yr-gold/40 bg-yr-gold/10 text-yr-gold"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
                )}
              >
                {pending && isSelected && (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                )}
                {m.firstName}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lignes par associé — ultra compactes. Indentation réduite mobile. */}
      {fees.length > 0 ? (
        <div className="space-y-1 sm:space-y-0.5 pl-0 sm:pl-5">
          {fees.map((fee) => (
            <ManagementFeeRow key={fee.id} fee={fee} />
          ))}
        </div>
      ) : (
        <div className="pl-0 sm:pl-5 text-[11px] text-muted-foreground italic">
          Aucun associé — clique sur un chip pour ajouter.
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── ManagementFeeRow (1 ligne par associé) ────────────────────────────

function ManagementFeeRow({ fee }: { fee: DealManagementFeeRow }) {
  const member = PANGEE_TEAM.find((m) => m.key === fee.associateKey);
  const displayName = member?.firstName ?? fee.associateKey;

  async function togglePaye(next: boolean) {
    await updateManagementFee({ id: fee.id, isPaye: next });
  }

  return (
    // Stan 2026-06-02 mobile : largeurs fixes (80+40+80+128px + gaps + pl-5)
    // débordaient sur iPhone 390px → le toggle "Encaissé" était coupé.
    // Mobile : nom en flex-1 truncate + toggle réduit w-24. Desktop inchangé.
    <div className="flex items-center gap-2 sm:gap-3 text-sm tabular-nums min-w-0">
      {/* Nom */}
      <span className="font-medium flex-1 min-w-0 truncate sm:flex-none sm:w-20 sm:shrink-0">
        {displayName}
      </span>

      {/* Part % — entier sans décimale (Stan 2026-05-26) */}
      <span className="text-muted-foreground text-xs w-10 shrink-0 text-right">
        {Math.round(Number(fee.sharePct))}%
      </span>

      {/* Montant € */}
      <span className="font-medium shrink-0 text-right sm:w-20">
        <SensitiveAmount value={fee.amount ?? 0} />
      </span>

      {/* PaidToggle manuel — Stan coche quand il a versé le cash à l'associé */}
      <div className="w-24 sm:w-32 shrink-0">
        <PaidToggle
          isOn={fee.paymentStatus === "PAID"}
          onToggle={togglePaye}
          label="Encaissé"
          className="w-full justify-center"
        />
      </div>
    </div>
  );
}
