"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { MonthPickerField } from "./month-picker-field";
import { DealSectionHeader } from "./deal-section-header";
import { SectionStatusBadge } from "./section-status-badge";
import { PaidPill } from "./paid-pill";
import { updateDealArtiste } from "@/lib/actions/deals";
import { computeCachetBreakdownFromBudget } from "@/lib/finance/cachet-payroll";
import type { BookingDealArtistRow } from "@/lib/deals-list-types";

/**
 * Section Artiste — variante CACHETS (Stan 2026-05-30).
 *
 * Affiche directement les montants calculés à partir du CA (Σ prestations) +
 * du % de marge Pangee :
 *   - Cachet brut (= ce qui apparaît sur la fiche de paie GUSO/CDDU)
 *   - Cachet net estimé (= ce que l'artiste touche après cotisations)
 *
 * Case à cocher "Payé" : toggle `DealArtiste.paymentStatus` PAID/TO_INVOICE.
 *
 * Mode `linkedToOwnProd` : pas de prestation → l'utilisateur saisit le brut
 * directement (input), le net est calculé à la volée. Le toggle Payé reste.
 */
interface Props {
  dealId: string;
  artiste: BookingDealArtistRow | null;
  /** CA total facturé aux prestataires (Σ prestations actives). */
  totalBudget: number;
  cachetsFeesPct: number;
  linkedToOwnProd: boolean;
}

export function CachetArtisteSection({
  artiste,
  totalBudget,
  cachetsFeesPct,
  linkedToOwnProd,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [manualBrut, setManualBrut] = useState<string>(
    linkedToOwnProd && artiste?.amount != null ? String(artiste.amount) : "",
  );

  if (!artiste) {
    return (
      <section className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
        Aucun artiste lié à ce deal — modifie le deal pour ajouter un artiste.
      </section>
    );
  }

  // Calcul des montants
  let brut: number;
  let net: number;
  if (linkedToOwnProd) {
    // Mode interne : brut saisi manuellement, net calculé
    brut = artiste.amount != null ? Number(artiste.amount) : 0;
    const breakdown = computeCachetBreakdownFromBudget(brut, 0); // pct=0 → enveloppe=brut
    // Recalcule juste le net
    net = breakdown.net > 0 ? Math.round(brut * (1 - 25 / 100)) : 0;
  } else {
    // Mode standard : breakdown depuis CA
    const breakdown = computeCachetBreakdownFromBudget(totalBudget, cachetsFeesPct);
    brut = breakdown.brut;
    net = breakdown.net;
  }

  const isPaid = artiste.paymentStatus === "PAID";
  const initials = artiste.artist.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function togglePaid() {
    startTransition(async () => {
      await updateDealArtiste({
        id: artiste!.id,
        isPaye: !isPaid,
      });
    });
  }

  function persistManualBrut() {
    const next = manualBrut === "" ? null : Number(manualBrut);
    if (next !== artiste!.amount) {
      startTransition(async () => {
        await updateDealArtiste({
          id: artiste!.id,
          cachetAmount: next,
        });
      });
    }
  }

  return (
    <section className="space-y-1.5">
      {/* Header canonique — total ROUGE (sortie cash = charge artiste). */}
      <DealSectionHeader
        icon={<TrendingDown className="h-4 w-4 text-red-500" />}
        title="🔴 Artiste"
        subtitle={
          brut > 0 && (
            <SectionStatusBadge
              done={isPaid}
              label={isPaid ? "Payé" : "En cours"}
            />
          )
        }
        total={brut}
        totalAccent="negative"
      />

      {/* Ligne artiste */}
      <div
        className={cn(
          "rounded-md border bg-card px-3 py-3 flex items-center gap-4 flex-wrap sm:flex-nowrap",
          pending && "opacity-60",
        )}
      >
        {/* Avatar + nom */}
        <div className="flex items-center gap-2 min-w-0 sm:w-[200px]">
          <div
            className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold text-white"
            style={{ backgroundColor: artiste.artist.color ?? "#1a2540" }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium leading-tight truncate">
              {artiste.artist.name}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Intermittent · GUSO
            </div>
          </div>
        </div>

        {/* Cachet brut */}
        <div className="space-y-0.5 sm:w-[150px]">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Cachet brut (GUSO)
          </div>
          {linkedToOwnProd ? (
            <div className="relative">
              <Input
                type="number"
                value={manualBrut}
                onChange={(e) => setManualBrut(e.target.value)}
                onBlur={persistManualBrut}
                placeholder="0"
                min={0}
                step="0.01"
                className="h-8 text-sm text-right tabular-nums pr-6"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                €
              </span>
            </div>
          ) : (
            <div className="text-sm font-semibold tabular-nums">
              {brut.toLocaleString("fr-FR")} €
            </div>
          )}
        </div>

        {/* Cachet net estimé */}
        <div className="space-y-0.5 sm:w-[150px]">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Net touché (estimé)
          </div>
          <div className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {net.toLocaleString("fr-FR")} €
          </div>
        </div>

        {/* PaidPill standardisé (pattern app) */}
        <div className="w-24 shrink-0">
          <PaidPill
            paid={isPaid}
            onToggle={togglePaid}
            disabled={pending || brut <= 0}
            label="Payé"
          />
        </div>

        {/* Date de paiement (visible si payé) */}
        <div className="w-[110px] shrink-0">
          {isPaid && (
            <MonthPickerField
              value={artiste.paidAt}
              onChange={(d) =>
                startTransition(async () => {
                  await updateDealArtiste({
                    id: artiste!.id,
                    paidAt: d,
                  });
                })
              }
              size="sm"
            />
          )}
        </div>
      </div>

      {/* Footer explicatif court */}
      {brut > 0 && !linkedToOwnProd && (
        <p className="text-[10px] text-muted-foreground italic px-1">
          Brut GUSO calculé depuis le CA : ({100 - cachetsFeesPct}% du CA) ÷ 1,43.
          Net ≈ brut × 0,75 (annexe 10 intermittents, 2026).
          {isPaid && artiste.paidAt && (
            <>
              {" "}· Payé le {format(artiste.paidAt, "MMM yyyy", { locale: fr })}.
            </>
          )}
        </p>
      )}
    </section>
  );
}
