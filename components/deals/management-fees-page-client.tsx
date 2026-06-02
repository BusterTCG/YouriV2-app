"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  TrendingUp,
  Users2,
  User,
} from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DealCategory, type ManagementFeeRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { PANGEE_TEAM } from "@/lib/pangee-team";
import { DEAL_CATEGORY_LABELS, formatEur } from "@/components/deals/deal-helpers";
import { PERIOD_PRESET_OPTIONS } from "@/lib/period-presets";
import { updateManagementFee } from "@/lib/actions/management-fees";
import { useEur } from "@/lib/privacy-context";
import { PrivacyToggle } from "@/components/dashboard/privacy-toggle";
import { PaidToggle } from "./paid-toggle";
import type {
  AssociateKpi,
  ManagementFeeRow,
  ManagementFeesListData,
} from "@/lib/management-fees-list";

/**
 * Client component qui rend la page /deals/management-fees :
 *   - Switcher Mes MF / Tous
 *   - Filtres (période / statut / catégorie deal)
 *   - KPI top par associé
 *   - Tableau lignes
 *
 * État géré via searchParams (URL) pour navigation back/forward + partage.
 */

const ROLE_LABELS: Record<ManagementFeeRole, string> = {
  APPORT: "Apport d'affaires",
  WORK: "Travail effectif",
};

interface Props {
  data: ManagementFeesListData;
  currentUserPangeeKey: string | null;
  scope: "mine" | "all";
}

export function ManagementFeesPageClient({
  data,
  currentUserPangeeKey,
  scope,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { rows, kpiByAssociate, filters, rangeLabel } = data;

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  function setScope(nextScope: "mine" | "all") {
    const next = new URLSearchParams(params.toString());
    next.set("scope", nextScope);
    next.delete("associate"); // reset explicit override
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  const hasMine = !!currentUserPangeeKey;
  const myMember = PANGEE_TEAM.find((m) => m.key === currentUserPangeeKey);

  return (
    <div className="space-y-5">
      {/* Ligne 1 : Switcher Mes MF / Tous + PrivacyToggle aligné à droite
          (Stan 2026-06-02 : eye à côté de Stan/Associés). */}
      {hasMine && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex items-center gap-2">
            <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setScope("mine")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors",
                  scope === "mine"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <User className="h-3.5 w-3.5" />
                {myMember?.firstName ?? "Mes MF"}
              </button>
              <button
                type="button"
                onClick={() => setScope("all")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors",
                  scope === "all"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Users2 className="h-3.5 w-3.5" />
                Associés
              </button>
            </div>
            <PrivacyToggle />
          </div>
          <span className="text-[11px] text-muted-foreground italic">
            {rows.length} ligne{rows.length > 1 ? "s" : ""} · {rangeLabel}
          </span>
        </div>
      )}

      {/* Ligne 2 : Filtres période / statut / catégorie (pattern bandeau
          horizontal style KN /shows) */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Période — pills toggle group */}
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5 flex-wrap">
          {PERIOD_PRESET_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setParam("period", o.value)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                filters.period === o.value
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Séparateur visuel */}
        <span className="text-muted-foreground/40 mx-1">·</span>

        {/* Statut — pills toggle group */}
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5 flex-wrap">
          <button
            type="button"
            onClick={() => setParam("status", "all")}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap",
              filters.status === "all"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Tous
          </button>
          <button
            type="button"
            onClick={() => setParam("status", "pending")}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors inline-flex items-center gap-1 whitespace-nowrap",
              filters.status === "pending"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>⏳</span>
            En cours
          </button>
          <button
            type="button"
            onClick={() => setParam("status", "paid")}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors inline-flex items-center gap-1 whitespace-nowrap",
              filters.status === "paid"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>✅</span>
            Encaissé
          </button>
        </div>

        {/* Séparateur */}
        <span className="text-muted-foreground/40 mx-1">·</span>

        {/* Catégorie — pills toggle group */}
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5 flex-wrap">
          <button
            type="button"
            onClick={() => setParam("category", null)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap",
              filters.category === null
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Toutes
          </button>
          <button
            type="button"
            onClick={() => setParam("category", "BOOKING")}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap",
              filters.category === "BOOKING"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Booking
          </button>
          <button
            type="button"
            onClick={() => setParam("category", "PROD_EXE")}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap",
              filters.category === "PROD_EXE"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Prod Exé
          </button>
          <button
            type="button"
            onClick={() => setParam("category", "CACHETS")}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap",
              filters.category === "CACHETS"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Cachets
          </button>
        </div>
      </div>

      {/* KPI par associé.
          Stan 2026-05-26 :
            - Mode "Mes MF" (perso, 1 seul associé) → card à gauche + bar chart
              mensuel à droite sur 2 colonnes
            - Mode "Associés" (équipe) → grid simple 3 cards */}
      {kpiByAssociate.length === 0 ? (
        <div className="rounded-md border bg-muted/10 py-10 text-center text-sm text-muted-foreground italic">
          Aucune management fee sur ce filtre.
        </div>
      ) : scope === "mine" && kpiByAssociate.length === 1 ? (
        <div className="grid gap-3 md:grid-cols-[minmax(260px,320px)_1fr]">
          <AssociateKpiCard kpi={kpiByAssociate[0]} />
          <MonthlyBarChart
            data={kpiByAssociate[0].monthlyPaid}
            associateName={
              PANGEE_TEAM.find((m) => m.key === kpiByAssociate[0].associateKey)
                ?.firstName ?? kpiByAssociate[0].associateKey
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {kpiByAssociate.map((kpi) => (
            <AssociateKpiCard key={kpi.associateKey} kpi={kpi} />
          ))}
        </div>
      )}

      {/* Tableau lignes détaillées */}
      {rows.length > 0 && (
        <div className="rounded-md border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                <tr>
                  <th className="text-left px-3 py-2 whitespace-nowrap">
                    Date
                  </th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">
                    Cat.
                  </th>
                  <th className="text-left px-3 py-2">Deal</th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">
                    Associé
                  </th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">
                    Rôle
                  </th>
                  <th className="text-right px-3 py-2 whitespace-nowrap">
                    Part
                  </th>
                  <th className="text-right px-3 py-2 whitespace-nowrap">
                    Montant
                  </th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">
                    Dispo paiement
                  </th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">
                    Statut
                  </th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">
                    Paiement
                  </th>
                  <th className="px-3 py-2 w-8" aria-hidden />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <FeeRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── Sous-composants ────────────────────────────

function AssociateKpiCard({ kpi }: { kpi: AssociateKpi }) {
  const member = PANGEE_TEAM.find((m) => m.key === kpi.associateKey);
  const displayName = member?.firstName ?? kpi.associateKey;
  const allPaid = kpi.pending === 0 && kpi.total > 0;
  const eur = useEur();

  return (
    <div className="rounded-md border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-[--yr-gold]/15 text-[--yr-gold] inline-flex items-center justify-center text-sm font-semibold">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="text-sm font-semibold leading-tight">
            {displayName}
          </div>
        </div>
        {kpi.pendingCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            <span>⏳</span>
            {kpi.pendingCount} en cours
          </span>
        ) : (
          allPaid && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
              <span>✅</span>
              Tout encaissé
            </span>
          )
        )}
      </div>

      {/* Total Management fees — gros chiffre */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Total Management fees
        </div>
        <div className="text-2xl font-semibold tabular-nums">
          {eur(kpi.total)}
        </div>
      </div>

      {/* Split paid/pending */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-semibold">
            ✅ Encaissé
          </div>
          <div className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {eur(kpi.paid)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold">
            ⏳ En cours
          </div>
          <div className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            {eur(kpi.pending)}
          </div>
        </div>
      </div>

    </div>
  );
}

// ──────────────────────────── MonthlyBarChart ────────────────────────────

/**
 * Graphique en barres mensuel des paiements encaissés (visible uniquement
 * en mode "Mes MF" — Stan 2026-05-26).
 *
 * Inverse les data DESC → ASC pour avoir la chronologie gauche→droite,
 * et complète les mois manquants avec 0 si moins de 6 mois sont présents
 * (pour éviter un chart trop creux). Si liste vide → empty state.
 */
function MonthlyBarChart({
  data,
  associateName,
}: {
  data: { key: string; label: string; amount: number }[];
  associateName: string;
}) {
  const eur = useEur();
  // Inverser pour avoir le mois le plus ancien à gauche (chrono ASC).
  // Le data DESC vient de lib/management-fees-list.ts (slice 6 récents).
  const sortedAsc = [...data].sort((a, b) => a.key.localeCompare(b.key));

  return (
    <div className="rounded-md border bg-card p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          {associateName} — Encaissé par mois
        </div>
      </div>
      {sortedAsc.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground italic py-8">
          Aucun encaissement sur cette période.
        </div>
      ) : (
        <div className="flex-1 min-h-[180px]">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={sortedAsc}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v)
                }
                width={40}
              />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as {
                    label: string;
                    amount: number;
                  };
                  return (
                    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                      <div className="font-medium">{p.label}</div>
                      <div className="tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">
                        {eur(p.amount)}
                      </div>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="amount"
                fill="var(--yr-gold)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function FeeRow({ row }: { row: ManagementFeeRow }) {
  const router = useRouter();
  const member = PANGEE_TEAM.find((m) => m.key === row.associateKey);
  const associateName = member?.firstName ?? row.associateKey;
  const isPaid = row.paymentStatus === "PAID";
  const eur = useEur();

  /** Toggle binaire En cours ↔ Encaissé via PaidToggle. Bascule PAID →
   *  paidAt auto = mois courant. Bascule PAID → en cours → paidAt nullifié
   *  (cf. updateManagementFee). */
  async function togglePaid(next: boolean) {
    const res = await updateManagementFee({
      id: row.id,
      isPaye: next,
    });
    if (res.ok) router.refresh();
  }

  return (
    <tr className="hover:bg-accent/30 transition-colors">
      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-xs text-muted-foreground">
        {format(row.dealDate, "d MMM yy", { locale: fr })}
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-[10px] uppercase tracking-wider text-muted-foreground">
        {DEAL_CATEGORY_LABELS[row.dealCategory]}
      </td>
      <td className="px-3 py-2 min-w-[180px]">
        <Link
          href={
            row.dealCategory === DealCategory.BOOKING
              ? `/deals/booking/${row.dealId}`
              : `/deals`
          }
          className="font-medium hover:underline"
        >
          {row.dealTitle}
        </Link>
      </td>
      <td className="px-3 py-2 whitespace-nowrap font-medium">
        {associateName}
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
        {ROLE_LABELS[row.role]}
      </td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-xs text-muted-foreground text-right">
        {Math.round(row.sharePct)}%
      </td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums font-medium text-right">
        {eur(row.amount)}
      </td>
      {/* "Dispo paiement" — feu vert quand budget + artistes + charges sont
          tous payés/encaissés sur le deal. Indique que la marge est définitive
          et que Stan peut verser le MF à l'associé. */}
      <td className="px-3 py-2 whitespace-nowrap">
        {row.dealReadyToPay ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
            title="Tout l'amont du deal est OK — paiement MF possible"
          >
            <CheckCircle2 className="h-3 w-3" />
            Dispo
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground italic"
            title="Le budget, des artistes ou des charges restent en cours"
          >
            <Clock className="h-3 w-3" />
            En attente
          </span>
        )}
      </td>
      {/* PaidToggle manuel — Stan coche quand il a versé le cash à l'associé.
          paidAt auto = mois courant (cf. updateManagementFee server action). */}
      <td className="px-3 py-2 whitespace-nowrap">
        <PaidToggle
          isOn={isPaid}
          onToggle={togglePaid}
          label="Encaissé"
          className="min-w-[110px]"
        />
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground tabular-nums">
        {row.paidAt
          ? format(row.paidAt, "MM/yy", { locale: fr })
          : "—"}
      </td>
      <td className="px-3 py-2 w-8">
        <Link
          href={
            row.dealCategory === DealCategory.BOOKING
              ? `/deals/booking/${row.dealId}`
              : `/deals`
          }
          className="text-muted-foreground hover:text-foreground"
          title="Ouvrir le deal"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </td>
    </tr>
  );
}
