"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  EyeOff,
  Building,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import type {
  ProductionLineKind,
  ProductionLineLabel,
  PaymentStatus,
  VenueDealKind,
} from "@prisma/client";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MonthPickerField } from "./month-picker-field";
import {
  PRODUCTION_LINE_LABELS,
  PRODUCTION_LINE_KIND_OF,
  REVENUE_LABELS,
  visibleCostLabels,
  productionLineHint,
} from "@/lib/production-line-labels";
import { formatEur } from "@/components/deals/deal-helpers";
import {
  upsertProductionLine,
  addEmptyProductionLine,
  updateProductionLineById,
  deleteProductionLine,
} from "@/lib/actions/production-lines";
import { updateDealArtiste, setDealArtistStatus } from "@/lib/actions/deals";
import { cn } from "@/lib/utils";

/**
 * Éditeur de lignes show — copie fidèle KN simplifiée pour PROD_EXE only
 * (Sprint 4 Pangee). Template fixe : toutes les recettes / charges visibles,
 * saisie inline qui upsert via `upsertProductionLine`. Vide à 0 → soft-delete.
 *
 * Différences vs KN :
 *   - Pas de COPROD (artistShareKind toujours PROD_EXE chez Pangee)
 *   - Marge Brute / Part Artiste affichées en pied de tableau (inline)
 *   - Ligne virtuelle "Prod exé" toujours affichée (PROD_EXE par défaut)
 */

export type ProductionLineRow = {
  id: string;
  kind: ProductionLineKind;
  label: ProductionLineLabel;
  customLabel: string | null;
  amount: number;
  status: PaymentStatus;
  paidAt: Date | null;
  comment: string | null;
  coveredByVenue: boolean;
};

/** Ligne artiste affichée comme "Cachet Art." dans le tableau de prod
 *  (Stan 2026-05-26 v2 : édition inline directe ici, plus de section
 *  Artistes séparée au-dessus). */
export interface ArtisteLineRow {
  id: string;
  artistName: string;
  artistColor: string | null;
  cachetAmount: number | null;
  paymentStatus: PaymentStatus;
}

interface Props {
  dealId: string;
  initialLines: ProductionLineRow[];
  venueDealKind: VenueDealKind | null;
  prodExePct: number | null;
  /** Lignes artistes (DealArtiste) — affichées comme "Cachet Art." dans les
   *  charges après LOCATION, éditables inline. Multi-artiste = N lignes. */
  artistes: ArtisteLineRow[];
  /** Statut consolidé "Part Artiste" — driver UI séparé des cachets
   *  individuels (Stan 2026-05-27 v2). */
  artistStatus: PaymentStatus;
}

export function ProductionLinesEditor({
  dealId,
  initialLines,
  venueDealKind,
  prodExePct,
  artistes,
  artistStatus,
}: Props) {
  void dealId; // utilisé via les actions importées dans les sous-composants
  // Index par label : plusieurs lignes possibles par catégorie (sous-entrées).
  const byLabel = useMemo(() => {
    const m = new Map<ProductionLineLabel, ProductionLineRow[]>();
    for (const l of initialLines) {
      const arr = m.get(l.label) ?? [];
      arr.push(l);
      m.set(l.label, arr);
    }
    return m;
  }, [initialLines]);

  const visibleCosts = visibleCostLabels(venueDealKind);
  const visibleRevenues = REVENUE_LABELS;

  // Stan 2026-05-31 v3 — Lignes vides masquées par défaut (efficacité visuelle).
  // Un label est "avec contenu" si :
  //   - au moins 1 ligne avec amount > 0, OU
  //   - au moins 1 ligne coveredByVenue (cas "pris par la salle"), OU
  //   - >= 2 lignes (mode multi-entrées en cours).
  // Les autres restent masquées tant que l'user ne clique pas sur
  // "+ Ajouter…" qui les ajoute à `manuallyShown` (state local).
  //
  // EXCEPTION : `RECETTE_HT` reste toujours visible (revenu principal).
  const [manuallyShown, setManuallyShown] = useState<Set<ProductionLineLabel>>(
    new Set(),
  );

  function hasLineContent(label: ProductionLineLabel): boolean {
    const lines = byLabel.get(label) ?? [];
    if (lines.length === 0) return false;
    if (lines.some((l) => l.amount > 0)) return true;
    if (lines.some((l) => l.coveredByVenue)) return true;
    if (lines.length >= 2) return true; // multi-entrées
    return false;
  }

  // Recettes : RECETTE_HT toujours visible ; DL_PROD masquable.
  const displayedRevenues = visibleRevenues.filter(
    (label) =>
      label === "RECETTE_HT" ||
      hasLineContent(label) ||
      manuallyShown.has(label),
  );
  const hiddenRevenues = visibleRevenues.filter(
    (label) =>
      label !== "RECETTE_HT" &&
      !hasLineContent(label) &&
      !manuallyShown.has(label),
  );

  const displayedCosts = visibleCosts.filter(
    (label) => hasLineContent(label) || manuallyShown.has(label),
  );
  const hiddenCosts = visibleCosts.filter(
    (label) => !hasLineContent(label) && !manuallyShown.has(label),
  );

  function showHidden(label: ProductionLineLabel) {
    setManuallyShown((prev) => {
      const next = new Set(prev);
      next.add(label);
      return next;
    });
  }

  function hideManuallyShown(label: ProductionLineLabel) {
    setManuallyShown((prev) => {
      const next = new Set(prev);
      next.delete(label);
      return next;
    });
  }

  function sumOf(label: ProductionLineLabel): number {
    return (byLabel.get(label) ?? [])
      .filter((l) => !l.coveredByVenue)
      .reduce((s, l) => s + l.amount, 0);
  }

  const totalRevenue = visibleRevenues.reduce((s, label) => s + sumOf(label), 0);
  const realCost = visibleCosts.reduce((s, label) => s + sumOf(label), 0);

  // Ligne virtuelle "Prod exé" : ce que Pangee se retient en commission.
  const pct = prodExePct ?? 15;
  const prodExeAmount = totalRevenue > 0 ? Math.round((totalRevenue * pct) / 100) : 0;
  // Σ cachets artistes — Stan 2026-05-27 v2 : inclus dans les Charges, donc
  // déduit aussi de la Part Artiste (cohérent avec le tableau récap).
  const totalArtistes = artistes.reduce(
    (s, a) => s + (a.cachetAmount ?? 0),
    0,
  );
  const totalCost = realCost + prodExeAmount + totalArtistes;
  const margin = totalRevenue - totalCost;

  return (
    <div className="space-y-5">
      {/* Section Recettes — RECETTE_HT toujours visible, DL_PROD masquable */}
      <Section
        title="🟢 Recettes"
        total={totalRevenue}
        totalAccent="positive"
        icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
      >
        {displayedRevenues.map((label) => (
          <CategoryEditor
            key={label}
            dealId={dealId}
            label={label}
            lines={byLabel.get(label) ?? []}
            venueDealKind={venueDealKind}
            totalRevenue={totalRevenue}
            isManuallyShown={
              manuallyShown.has(label) && !hasLineContent(label)
            }
            onRemove={() => hideManuallyShown(label)}
          />
        ))}

        {hiddenRevenues.length > 0 && (
          <div className="px-3 py-2 bg-muted/20 border-t">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Ajouter une recette
                  <span className="text-muted-foreground/60 normal-case">
                    ({hiddenRevenues.length} disponible
                    {hiddenRevenues.length > 1 ? "s" : ""})
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={4}
                className="w-[220px] p-1"
              >
                <div className="flex flex-col">
                  {hiddenRevenues.map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => showHidden(label)}
                      className="text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors"
                    >
                      {PRODUCTION_LINE_LABELS[label]}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </Section>

      {/* Section Charges — total inclut la ligne virtuelle Prod exé */}
      <Section
        title="🔴 Charges"
        total={totalCost}
        totalAccent="negative"
        icon={<TrendingDown className="h-4 w-4 text-red-500" />}
      >
        {/* Stan 2026-05-31 v2 — Affiche uniquement les charges avec contenu.
            La ligne virtuelle "Prod exé" et les "Cachet Art." sont toujours
            insérées indépendamment du filtrage (basées sur des données
            calculées, pas sur les ProductionLine). */}
        {(() => {
          const elements: React.ReactNode[] = [];
          let insertedVirtualProdExe = false;
          let insertedCachets = false;

          for (const label of displayedCosts) {
            elements.push(
              <CategoryEditor
                key={label}
                dealId={dealId}
                label={label}
                lines={byLabel.get(label) ?? []}
                venueDealKind={venueDealKind}
                totalRevenue={totalRevenue}
                isManuallyShown={
                  manuallyShown.has(label) && !hasLineContent(label)
                }
                onRemove={() => hideManuallyShown(label)}
              />,
            );
            if (label === "SACD") {
              elements.push(
                <VirtualProdExeLine
                  key="virtual-prod-exe"
                  amount={prodExeAmount}
                  pct={pct}
                />,
              );
              insertedVirtualProdExe = true;
            }
            if (label === "LOCATION") {
              artistes.forEach((a) =>
                elements.push(
                  <ArtisteCachetRow key={`art-${a.id}`} artiste={a} />,
                ),
              );
              insertedCachets = true;
            }
          }

          // Si SACD ou LOCATION étaient masqués, on insère quand même la
          // ligne virtuelle et les cachets en début de section (pour ne pas
          // les perdre).
          if (!insertedVirtualProdExe) {
            elements.unshift(
              <VirtualProdExeLine
                key="virtual-prod-exe"
                amount={prodExeAmount}
                pct={pct}
              />,
            );
          }
          if (!insertedCachets && artistes.length > 0) {
            // Après la VirtualProdExeLine (qui est à l'index 0 si pas SACD).
            const insertAt = insertedVirtualProdExe ? 0 : 1;
            artistes.forEach((a, i) =>
              elements.splice(
                insertAt + i,
                0,
                <ArtisteCachetRow key={`art-${a.id}`} artiste={a} />,
              ),
            );
          }

          return elements;
        })()}

        {/* Bouton "+ Ajouter une charge" — affiché si des labels sont masqués */}
        {hiddenCosts.length > 0 && (
          <div className="px-3 py-2 bg-muted/20 border-t">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Ajouter une charge
                  <span className="text-muted-foreground/60 normal-case">
                    ({hiddenCosts.length} disponible
                    {hiddenCosts.length > 1 ? "s" : ""})
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={4}
                className="w-[220px] p-1"
              >
                <div className="flex flex-col">
                  {hiddenCosts.map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => showHidden(label)}
                      className="text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors"
                    >
                      {PRODUCTION_LINE_LABELS[label]}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {(venueDealKind === "CO_REAL" || venueDealKind === "CESSION") && (
          <p className="text-[11px] text-muted-foreground italic px-3 py-1.5">
            ℹ Location de salle non affichée (
            {venueDealKind === "CO_REAL" ? "co-réal" : "cession"} — pas de
            loyer à charge Pangee).
          </p>
        )}
      </Section>

      {/* Récap "Part Artiste" + toggle Payé global (driver du statut artiste).
          Stan 2026-05-27 v2 : PaidPill à côté du montant — toggle tous les
          DealArtiste du deal en une fois. */}
      <div className="rounded-md border bg-card px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <div
            className={cn(
              "text-xs uppercase tracking-wider font-semibold",
              margin >= 0
                ? "text-blue-700 dark:text-blue-400"
                : "text-red-700 dark:text-red-400",
            )}
          >
            = Part Artiste
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            CA − Charges − Commission Pangee ({pct}%)
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-24">
            <PartArtistePill
              dealId={dealId}
              artistStatus={artistStatus}
            />
          </div>
          <div
            className={cn(
              "text-2xl font-semibold tabular-nums",
              margin >= 0
                ? "text-blue-700 dark:text-blue-400"
                : "text-red-700 dark:text-red-400",
            )}
          >
            {formatEur(margin)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── helpers ───────────────────────────

/**
 * Pill "Payé" driver du statut Part Artiste consolidé. Stocké sur
 * `Deal.artistStatus`, INDÉPENDANT des `DealArtiste.paymentStatus` individuels
 * (Stan 2026-05-27 v2 : "le clic sur la part artiste ne doit pas créer un
 * clic sur le cachet artiste, c'est pas corrélé").
 */
function PartArtistePill({
  dealId,
  artistStatus,
}: {
  dealId: string;
  artistStatus: PaymentStatus;
}) {
  const [pending, startTransition] = useTransition();
  const paid = artistStatus === "PAID";

  function toggle() {
    const next: PaymentStatus = paid ? "TO_INVOICE" : "PAID";
    startTransition(async () => {
      await setDealArtistStatus({ dealId, status: next });
    });
  }

  return (
    <PaidPill paid={paid} onToggle={toggle} disabled={pending} label="Payé" />
  );
}

function VirtualProdExeLine({ amount, pct }: { amount: number; pct: number }) {
  void pct;
  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors flex-wrap sm:flex-nowrap">
      <div className="w-[200px] shrink-0 min-w-0">
        <div className="text-sm font-medium leading-tight">Prod exé</div>
        <div className="text-[11px] text-muted-foreground">
          Commission Pangee (calculée automatiquement)
        </div>
      </div>
      <div className="w-32 shrink-0">
        <Input
          type="number"
          value={amount}
          readOnly
          tabIndex={-1}
          className="h-8 text-sm text-right tabular-nums cursor-default focus-visible:ring-0 focus-visible:border-input"
        />
      </div>
      <div className="w-20 shrink-0" />
      <div className="w-[110px] shrink-0" />
      <div className="flex-1 min-w-[120px]" />
      {/* Spacer aligné sur le bouton "+" des LineEditor (Stan 2026-05-27 :
          garantit que tous les montants finissent à la même position X). */}
      <div className="w-7 shrink-0" />
    </div>
  );
}

/**
 * Ligne "Cachet Art." éditable inline — 1 par DealArtiste actif.
 * Stan 2026-05-27 : édition directe ici, plus de section Artistes séparée.
 * Auto-save du montant via updateDealArtiste, PaidPill pour le statut.
 */
function ArtisteCachetRow({ artiste }: { artiste: ArtisteLineRow }) {
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState<string>(
    artiste.cachetAmount != null ? String(artiste.cachetAmount) : "",
  );

  function onAmountBlur() {
    const next = amount === "" ? null : Number(amount);
    if (next !== artiste.cachetAmount) {
      startTransition(async () => {
        await updateDealArtiste({ id: artiste.id, cachetAmount: next });
      });
    }
  }

  function togglePaid() {
    const next =
      artiste.paymentStatus === "PAID" ? "TO_INVOICE" : "PAID";
    startTransition(async () => {
      await updateDealArtiste({ id: artiste.id, paymentStatus: next });
    });
  }
  const isPaid = artiste.paymentStatus === "PAID";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors flex-wrap sm:flex-nowrap",
        pending && "opacity-60",
      )}
    >
      <div className="w-[200px] shrink-0 min-w-0 flex items-center gap-2">
        {artiste.artistColor && (
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: artiste.artistColor }}
          />
        )}
        <div>
          <div className="text-sm font-medium leading-tight">Cachet Art.</div>
          <div className="text-[11px] text-muted-foreground">
            {artiste.artistName}
          </div>
        </div>
      </div>
      <div className="w-32 shrink-0">
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={onAmountBlur}
          placeholder="0 €"
          className="h-8 text-sm text-right tabular-nums"
        />
      </div>
      <div className="w-20 shrink-0">
        {/* Payé visible uniquement quand un cachet est saisi (Stan 2026-05-27) */}
        {artiste.cachetAmount != null && artiste.cachetAmount > 0 ? (
          <PaidPill paid={isPaid} onToggle={togglePaid} disabled={pending} />
        ) : null}
      </div>
      <div className="w-[110px] shrink-0" />
      <div className="flex-1 min-w-[120px]" />
      {/* Spacer aligné sur le bouton "+" des LineEditor */}
      <div className="w-7 shrink-0" />
    </div>
  );
}

function PaidPill({
  paid,
  onToggle,
  disabled,
  label = "Payé",
}: {
  paid: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Wording — "Payé" pour les charges (sortie cash), "Encaissé" pour les
   *  recettes (entrée cash). Stan 2026-05-27. */
  label?: string;
}) {
  const lcLabel = label.toLowerCase();
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={paid ? `Cliquer pour annuler — ${lcLabel}` : `Marquer comme ${lcLabel}`}
      className={cn(
        "w-full h-7 inline-flex items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors border",
        paid
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
      )}
    >
      <span
        className={cn(
          "h-3 w-3 rounded-sm border inline-flex items-center justify-center text-[9px] shrink-0",
          paid
            ? "bg-emerald-500 border-emerald-500 text-white"
            : "border-muted-foreground/40",
        )}
      >
        {paid && "✓"}
      </span>
      {label}
    </button>
  );
}

function Section({
  title,
  subtitle,
  children,
  total,
  totalAccent,
  icon,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  total?: number;
  totalAccent?: "positive" | "negative";
  icon?: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-1.5">
            {icon}
            {title}
          </h2>
          {subtitle && (
            <span className="text-[11px] text-muted-foreground truncate">{subtitle}</span>
          )}
        </div>
        {total != null && (
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-2">
              Total
            </span>
            <span
              className={cn(
                "text-base font-bold tabular-nums",
                totalAccent === "positive" && "text-emerald-600 dark:text-emerald-400",
                totalAccent === "negative" && "text-red-600 dark:text-red-400",
              )}
            >
              {formatEur(total)}
            </span>
          </div>
        )}
      </div>
      <div className="rounded-md border overflow-hidden divide-y">{children}</div>
    </section>
  );
}

// ─────────────────────────── catégorie (mono ou multi) ───────────────────────────

function CategoryEditor({
  dealId,
  label,
  lines,
  venueDealKind,
  totalRevenue,
  isManuallyShown,
  onRemove,
}: {
  dealId: string;
  label: ProductionLineLabel;
  lines: ProductionLineRow[];
  venueDealKind: VenueDealKind | null;
  /** CA total — utilisé pour le bouton "Auto 3.5%" sur la ligne CNM
   *  (Stan 2026-05-27 : taxe CNM = 3.5% du CA billetterie). */
  totalRevenue: number;
  /** Stan 2026-05-31 v3 : true si la ligne a été ajoutée via "+ Ajouter"
   *  alors qu'elle était masquée (et est toujours vide). Affiche un bouton ✕
   *  pour la masquer à nouveau. */
  isManuallyShown?: boolean;
  onRemove?: () => void;
}) {
  if (lines.length >= 2) {
    return <MultiLineEditor dealId={dealId} label={label} lines={lines} />;
  }
  return (
    <LineEditor
      dealId={dealId}
      label={label}
      line={lines[0]}
      venueDealKind={venueDealKind}
      totalRevenue={totalRevenue}
      isManuallyShown={isManuallyShown}
      onRemove={onRemove}
    />
  );
}

// ─────────────────────────── multi-entrées ───────────────────────────

function MultiLineEditor({
  dealId,
  label,
  lines,
}: {
  dealId: string;
  label: ProductionLineLabel;
  lines: ProductionLineRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [folded, setFolded] = useState(false);

  // Stan 2026-05-27 audit : exclure les sous-entrées "Pris par la salle"
  // du total catégorie pour rester cohérent avec le Total Charges de la
  // Section parente (sinon le header MultiLine affichait une somme gonflée).
  const total = lines
    .filter((l) => !l.coveredByVenue)
    .reduce((s, l) => s + l.amount, 0);
  const paidCount = lines.filter((l) => l.status === "PAID").length;
  const allPaid = paidCount === lines.length && lines.length > 0;

  function addSubEntry() {
    startTransition(async () => {
      await addEmptyProductionLine({
        dealId,
        kind: PRODUCTION_LINE_KIND_OF[label],
        label,
      });
    });
  }

  return (
    <div className={cn(pending && "opacity-60")}>
      <div className="flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors flex-wrap sm:flex-nowrap">
        <button
          type="button"
          onClick={() => setFolded((f) => !f)}
          className="w-[200px] shrink-0 min-w-0 inline-flex items-center gap-1.5 text-sm font-medium text-left hover:text-foreground transition-colors"
          title={folded ? "Déplier" : "Replier"}
        >
          {folded ? (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <span>{PRODUCTION_LINE_LABELS[label]}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold ml-1">
            ({lines.length})
          </span>
        </button>
        <div className="w-32 shrink-0">
          <Input
            type="text"
            value={total.toLocaleString("fr-FR")}
            readOnly
            tabIndex={-1}
            className="h-8 text-sm text-right tabular-nums cursor-default focus-visible:ring-0 focus-visible:border-input"
          />
        </div>
        <div className="w-20 shrink-0">
          <div
            className={cn(
              "h-7 inline-flex items-center justify-center gap-1 w-full rounded-md px-2 text-[11px] font-medium border",
              allPaid
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                : "border-border bg-muted/30 text-muted-foreground",
            )}
            title={`${paidCount} sur ${lines.length} payées`}
          >
            {paidCount}/{lines.length} payées
          </div>
        </div>
        <div className="w-[110px] shrink-0" />
        <div className="flex-1 min-w-[120px]" />
        <button
          type="button"
          onClick={addSubEntry}
          disabled={pending}
          title="Ajouter une sous-entrée"
          className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {!folded && (
        <div className="border-t divide-y bg-muted/10">
          {lines.map((l) => (
            <SubEntryRow
              key={l.id}
              line={l}
              label={label}
              isRevenue={PRODUCTION_LINE_KIND_OF[label] === "REVENUE"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubEntryRow({
  line,
  label,
  isRevenue,
}: {
  line: ProductionLineRow;
  label: ProductionLineLabel;
  isRevenue: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [customLabel, setCustomLabel] = useState<string>(line.customLabel ?? "");
  const [amount, setAmount] = useState<string>(String(line.amount));
  const [comment, setComment] = useState<string>(line.comment ?? "");

  function persist(patch: {
    customLabel?: string | null;
    amount?: number;
    comment?: string | null;
    status?: PaymentStatus;
  }) {
    startTransition(async () => {
      await updateProductionLineById(line.id, patch);
    });
  }

  function onLabelBlur() {
    const next = customLabel.trim();
    if (next !== (line.customLabel ?? "")) persist({ customLabel: next || null });
  }
  function onAmountBlur() {
    const n = Number(amount) || 0;
    if (n !== line.amount) persist({ amount: n });
  }
  function onCommentBlur() {
    if (comment !== (line.comment ?? "")) persist({ comment: comment || null });
  }
  function togglePaid() {
    const next: PaymentStatus = line.status === "PAID" ? "TO_INVOICE" : "PAID";
    persist({ status: next });
  }
  function remove() {
    startTransition(async () => {
      await deleteProductionLine(line.id);
    });
  }
  const isPaid = line.status === "PAID";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors flex-wrap sm:flex-nowrap",
        pending && "opacity-60",
      )}
    >
      <div className="w-[200px] shrink-0 min-w-0 flex items-center gap-2">
        <span className="text-muted-foreground/40 text-xs">└</span>
        <Input
          value={customLabel}
          onChange={(e) => setCustomLabel(e.target.value)}
          onBlur={onLabelBlur}
          placeholder="Nom du sous-poste"
          className="h-8 text-sm flex-1"
        />
      </div>
      <div className="w-32 shrink-0">
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={onAmountBlur}
          placeholder="0 €"
          className="h-8 text-sm text-right tabular-nums"
        />
      </div>
      <div className="w-20 shrink-0">
        <PaidPill
          paid={isPaid}
          onToggle={togglePaid}
          disabled={pending}
          label={isRevenue ? "Encaissé" : "Payé"}
        />
      </div>
      <div className="w-[110px] shrink-0">
        {isPaid && label === "RECETTE_HT" && (
          <MonthPickerField
            value={line.paidAt}
            onChange={(d) => {
              startTransition(async () => {
                await updateProductionLineById(line.id, { paidAt: d });
              });
            }}
            size="sm"
          />
        )}
      </div>
      <div className="flex-1 min-w-[120px]">
        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={onCommentBlur}
          placeholder=""
          className="h-8 text-xs"
        />
      </div>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        title="Supprimer cette sous-entrée"
        className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─────────────────────────── mono-entrée ───────────────────────────

function LineEditor({
  dealId,
  label,
  line,
  venueDealKind,
  totalRevenue,
  isManuallyShown,
  onRemove,
}: {
  dealId: string;
  label: ProductionLineLabel;
  line: ProductionLineRow | undefined;
  venueDealKind: VenueDealKind | null;
  totalRevenue: number;
  isManuallyShown?: boolean;
  onRemove?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const isCovered = line?.coveredByVenue ?? false;
  const [amount, setAmount] = useState<string>(
    line && !isCovered ? String(line.amount) : "",
  );
  const [comment, setComment] = useState<string>(line?.comment ?? "");

  const isCost = PRODUCTION_LINE_KIND_OF[label] === "COST";
  const showVenueToggle = isCost && venueDealKind === "CO_REAL";
  const hint = productionLineHint(label, venueDealKind);
  // Stan 2026-05-27 : bouton auto-calcul CNM = 3.5% du CA (taxe parafiscale).
  const isCnm = label === "CNM";
  const cnmAuto = isCnm && totalRevenue > 0 ? Math.round(totalRevenue * 0.035) : null;

  function persist(patch: {
    amount?: number;
    comment?: string;
    coveredByVenue?: boolean;
    status?: PaymentStatus;
  }) {
    startTransition(async () => {
      await upsertProductionLine({
        dealId,
        kind: PRODUCTION_LINE_KIND_OF[label],
        label,
        amount: patch.amount ?? (isCovered ? 0 : Number(amount) || 0),
        comment: patch.comment ?? comment,
        coveredByVenue: patch.coveredByVenue ?? isCovered,
        status: patch.status ?? line?.status ?? "TO_INVOICE",
      });
    });
  }

  function togglePaid() {
    const next: PaymentStatus = line?.status === "PAID" ? "TO_INVOICE" : "PAID";
    persist({ status: next });
  }

  const isPaid = line?.status === "PAID";
  const hasAmount = line != null && line.amount !== 0 && !line.coveredByVenue;

  function onAmountBlur() {
    const next = Number(amount) || 0;
    if (next !== (line?.amount ?? 0)) {
      persist({ amount: next, coveredByVenue: false });
    }
  }

  function onCommentBlur() {
    if (comment !== (line?.comment ?? "")) persist({ comment });
  }

  function toggleCovered() {
    const next = !isCovered;
    if (next) {
      setAmount("");
      persist({ amount: 0, coveredByVenue: true });
    } else {
      persist({ amount: 0, coveredByVenue: false });
    }
  }

  function addSubEntry() {
    startTransition(async () => {
      if (!line) {
        await addEmptyProductionLine({
          dealId,
          kind: PRODUCTION_LINE_KIND_OF[label],
          label,
        });
      }
      await addEmptyProductionLine({
        dealId,
        kind: PRODUCTION_LINE_KIND_OF[label],
        label,
      });
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors flex-wrap sm:flex-nowrap",
        pending && "opacity-60",
        isCovered && "bg-muted/30",
      )}
    >
      <div className="w-[200px] shrink-0 min-w-0">
        <div className="text-sm font-medium leading-tight flex items-center gap-1.5">
          {PRODUCTION_LINE_LABELS[label]}
          {/* Bouton auto-calcul CNM = 3.5% du CA (Stan 2026-05-27) */}
          {isCnm && cnmAuto != null && cnmAuto !== (line?.amount ?? 0) && (
            <button
              type="button"
              onClick={() => {
                setAmount(String(cnmAuto));
                persist({ amount: cnmAuto, coveredByVenue: false });
              }}
              disabled={pending}
              title={`Calcul auto : ${formatEur(totalRevenue)} × 3,5% = ${formatEur(cnmAuto)}`}
              className="inline-flex items-center rounded border border-[--yr-gold]/40 bg-[--yr-gold]/10 px-1.5 py-0.5 text-[10px] font-medium text-[--yr-gold] hover:bg-[--yr-gold]/20 transition-colors"
            >
              ✨ Auto 3,5%
            </button>
          )}
        </div>
        {isCovered ? (
          <div className="text-[11px] italic text-muted-foreground flex items-center gap-1">
            <Building className="h-3 w-3" />
            Pris par la salle
          </div>
        ) : (
          hint && <div className="text-[11px] text-muted-foreground">{hint}</div>
        )}
      </div>

      <div className="w-32 shrink-0">
        <Input
          type="number"
          value={isCovered ? "" : amount}
          disabled={isCovered}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={onAmountBlur}
          placeholder="0 €"
          className={cn(
            "h-8 text-sm text-right tabular-nums",
            isCovered && "bg-muted/50",
          )}
        />
      </div>

      <div className="w-20 shrink-0">
        {hasAmount ? (
          <PaidPill
            paid={isPaid}
            onToggle={togglePaid}
            disabled={pending}
            label={isCost ? "Payé" : "Encaissé"}
          />
        ) : null}
      </div>

      {/* Slot mois encaissement / "Salle ?" — Stan 2026-05-27 v2 :
          MonthPicker visible uniquement sur la ligne RECETTE_HT (date
          d'encaissement billetterie). Les autres lignes payées affichent
          juste le PaidPill sans date associée. */}
      <div className="w-[110px] shrink-0">
        {isPaid && hasAmount && line && label === "RECETTE_HT" ? (
          <MonthPickerField
            value={line.paidAt}
            onChange={(d) => {
              startTransition(async () => {
                await updateProductionLineById(line.id, { paidAt: d });
              });
            }}
            size="sm"
          />
        ) : showVenueToggle ? (
          <button
            type="button"
            onClick={toggleCovered}
            disabled={pending}
            className={cn(
              "shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors border",
              isCovered
                ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400"
                : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted",
            )}
            title="Pris par la salle (Co-Réal)"
          >
            {isCovered ? <Building className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {isCovered ? "Salle" : "Salle ?"}
          </button>
        ) : null}
      </div>

      <div className="flex-1 min-w-[120px]">
        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={onCommentBlur}
          placeholder=""
          className="h-8 text-xs"
          disabled={isCovered}
        />
      </div>

      {isManuallyShown && onRemove ? (
        // Si la ligne a été ajoutée par erreur (toujours vide) → bouton ✕
        // pour la retirer sans soft-delete (juste cacher du DOM local).
        <button
          type="button"
          onClick={() => {
            // Si une ligne DB existe encore mais vide, soft-delete pour
            // éviter le résidu. Sinon, juste masquer côté UI.
            if (line) {
              startTransition(async () => {
                await deleteProductionLine(line.id);
              });
            }
            onRemove();
          }}
          disabled={pending}
          title="Retirer cette ligne (ajoutée par erreur)"
          className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={addSubEntry}
          disabled={pending || isCovered}
          title="Ajouter une sous-entrée"
          className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}

      {pending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
    </div>
  );
}
