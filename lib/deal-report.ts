import "server-only";

// Compte de production d'une date (portage KN, Stan 2026-09-27) — même
// architecture et même design que le bilan d'exploitation : synthèse (public +
// compte d'exploitation selon le contrat) puis détail des postes. Données
// communes aux sorties Excel (lib/finance/deal-report-excel.ts) et PDF
// (/print/compte/[showId]).
//
// Spécificités Youri : cachets artistes (DealArtiste) = postes de charges ;
// lignes « Pris par la salle » affichées mais hors calcul (comme les scalars).
// ⚠️ Les management fees n'apparaissent JAMAIS dans ce document.

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { PaymentStatus, ProductionLineLabel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getProductionOverheadAllocation } from "@/lib/finance/show-financials";
import { contractRates, dealPnl } from "@/lib/finance/production-overhead";
import { performanceTotals } from "@/lib/performances";
import { dealStatusLabel } from "@/components/deals/deal-helpers";
import {
  COST_ROWS,
  REPORT_LINE_LABELS,
  REVENUE_LABELS,
  contractLabel,
  financeOf,
  type FinanceBlock,
  type ReportRates,
  type ShowKpis,
} from "@/lib/production-report";

export type DealReportLine = {
  kind: "REVENUE" | "COST";
  poste: string;
  detail: string | null;
  amount: number;
  statusLabel: string;
  paidAt: Date | null;
  comment: string | null;
};

export type DealReport = {
  generatedAt: Date;
  title: string;
  artistName: string;
  productionName: string | null;
  dateLabel: string;
  venueLabel: string;
  statusLabel: string;
  rates: ReportRates;
  contractLabel: string;
  audience: {
    performances: number;
    capacity: number | null;
    paying: number | null;
    invited: number | null;
    fillRate: number | null;
    ticketMoyen: number | null;
  };
  finance: FinanceBlock;
  kpis: ShowKpis;
  lines: DealReportLine[];
  fileBase: string;
};

const VENUE_MODEL: Record<string, string> = {
  PROD: "Location de salle (billetterie encaissée par Pangee)",
  CO_REAL: "Co-réalisation",
  CESSION: "Cession",
};

export async function getDealReport(dealId: string, nowMs: number): Promise<DealReport | null> {
  const d = await prisma.deal.findFirst({
    where: { id: dealId, deletedAt: null, category: "PROD_EXE" },
    include: {
      production: { select: { name: true, artist: { select: { name: true } } } },
      productionLines: { where: { deletedAt: null }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      dealArtistes: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: { artist: { select: { name: true } } },
      },
      performances: true,
    },
  });
  if (!d) return null;
  void nowMs;

  const cancelled = d.status === "ANNULE";
  const totals = performanceTotals(d.performances, d.capacity);
  const performances = cancelled ? 0 : d.performances.length ? totals.count : (d.performanceCount ?? 1);
  const allocation = d.productionId ? await getProductionOverheadAllocation(d.productionId) : null;
  const overheadShare = allocation?.byDeal.get(d.id) ?? 0;
  const contract = {
    artistShareKind: d.artistShareKind,
    coprodKnPct: d.coprodKnPct != null ? Number(d.coprodKnPct) : null,
    prodExePct: d.prodExePct != null ? Number(d.prodExePct) : null,
  };
  // Lignes « Pris par la salle » hors calcul (cf. scalars).
  const counted = d.productionLines.filter((l) => !l.coveredByVenue);
  const byLabel: Partial<Record<ProductionLineLabel, number>> = {};
  for (const l of counted) byLabel[l.label] = (byLabel[l.label] ?? 0) + Number(l.amount);
  const cachetRows = d.dealArtistes.filter((a) => a.cachetAmount != null && Number(a.cachetAmount) !== 0);
  const cachets = cachetRows.reduce((s, a) => s + Number(a.cachetAmount), 0);
  const pnl = dealPnl(
    [
      ...counted.map((l) => ({ kind: l.kind, amount: Number(l.amount) })),
      ...(cachets ? [{ kind: "COST" as const, amount: cachets }] : []),
    ],
    overheadShare,
    contract,
  );
  const rates = contractRates(contract);

  // ── Public
  const capacity = totals.capacity ?? (d.capacity ? d.capacity * Math.max(performances, 1) : null);
  const fillRate = capacity && d.paying ? Math.round((d.paying / capacity) * 100) : null;
  const ticketBase =
    d.venueDealKind === "CO_REAL" && d.coRealGrossCa != null && Number(d.coRealGrossCa) > 0
      ? Number(d.coRealGrossCa)
      : byLabel.RECETTE_HT ?? 0;
  const ticketMoyen = d.paying && ticketBase > 0 ? Math.round(ticketBase / d.paying) : null;

  // ── Détail des postes (ordre du bilan : frais généraux après la SACD,
  // cachets après la location). Lignes à 0 € masquées, sauf « pris par la salle ».
  const shown = d.productionLines.filter((l) => Number(l.amount) !== 0 || l.coveredByVenue);
  const lines: DealReportLine[] = [];
  for (const label of REVENUE_LABELS) {
    for (const l of shown.filter((x) => x.label === label)) lines.push(toLine(l, "REVENUE"));
  }
  for (const c of COST_ROWS) {
    if (c === "OVERHEAD") {
      if (overheadShare !== 0 && allocation) {
        lines.push({
          kind: "COST",
          poste: "Frais généraux",
          detail: `${performances} repr. × ${allocation.perPerformance.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`,
          amount: overheadShare,
          statusLabel: "—",
          paidAt: null,
          comment: d.production ? `Frais communs de « ${d.production.name} »` : null,
        });
      }
      continue;
    }
    if (c === "CACHETS") {
      for (const a of cachetRows) {
        lines.push({
          kind: "COST",
          poste: "Cachet artiste",
          detail: a.artist.name,
          amount: Number(a.cachetAmount),
          statusLabel: statusLabel(a.paymentStatus, "COST"),
          paidAt: a.paidAt,
          comment: a.notes,
        });
      }
      continue;
    }
    for (const l of shown.filter((x) => x.label === c && x.kind === "COST")) lines.push(toLine(l, "COST"));
  }

  const days = [...new Set(d.performances.filter((p) => !p.cancelled).map((p) => p.date.toISOString().slice(0, 10)))].sort();
  const monthDate = days[0] ? new Date(`${days[0]}T12:00:00Z`) : d.date;
  const dateLabel = d.isMultiDate
    ? `${cap(format(monthDate, "MMMM yyyy", { locale: fr }))} · ${performances} représentation${performances > 1 ? "s" : ""}`
    : cap(format(d.date, "EEEE d MMMM yyyy", { locale: fr })) + (d.showTime ? ` · ${d.showTime}` : "");
  const venueLabel = [d.venueName, d.venueCity].filter(Boolean).join(" · ") || "Lieu à définir";
  const venueModel = d.venueDealKind
    ? VENUE_MODEL[d.venueDealKind] +
      (d.venueDealKind === "CO_REAL" && d.coRealKnPct != null ? ` ${Number(d.coRealKnPct)} % Pangee` : "")
    : null;

  const artistName = d.production?.artist.name ?? d.dealArtistes[0]?.artist.name ?? "—";
  const showName = d.showName?.trim() || d.title;
  return {
    generatedAt: new Date(nowMs),
    title: showName,
    artistName,
    productionName: d.production?.name ?? null,
    dateLabel,
    venueLabel,
    statusLabel: dealStatusLabel(d.status).label,
    rates,
    contractLabel: contractLabel(contract) + (venueModel ? ` · Salle : ${venueModel}` : ""),
    audience: {
      performances,
      capacity,
      paying: d.paying,
      invited: d.invited,
      fillRate,
      ticketMoyen,
    },
    finance: financeOf([{ byLabel, pnl, cachets }]),
    kpis: {
      fillRate,
      paying: d.paying ?? 0,
      capacity: capacity ?? 0,
      ticketAvg: ticketMoyen,
      played: 0,
      planned: performances,
      resultPerPerf: performances ? Math.round(pnl.margin / performances) : null,
      scope: "all",
    },
    lines,
    fileBase: `Compte de production - ${artistName} - ${showName} - ${format(monthDate, "yyyy-MM-dd")}`
      .replace(/[^\w\s\-àâäéèêëîïôöùûüç]/gi, "")
      .replace(/\s+/g, " ")
      .trim(),
  };
}

function toLine(
  l: {
    label: ProductionLineLabel;
    customLabel: string | null;
    amount: { toString(): string } | null;
    paymentStatus: PaymentStatus;
    paidAt: Date | null;
    comment: string | null;
    coveredByVenue: boolean;
  },
  kind: "REVENUE" | "COST",
): DealReportLine {
  return {
    kind,
    poste: REPORT_LINE_LABELS[l.label],
    detail: l.coveredByVenue ? "Pris en charge par la salle" : l.customLabel,
    amount: l.coveredByVenue ? 0 : Number(l.amount ?? 0),
    statusLabel: statusLabel(l.paymentStatus, kind),
    paidAt: l.paidAt,
    comment: l.comment,
  };
}

function statusLabel(s: PaymentStatus, kind: "REVENUE" | "COST"): string {
  if (s === "PAID") return kind === "REVENUE" ? "Encaissé" : "Payé";
  if (s === "INVOICED") return "Facturé";
  if (s === "VALIDATED") return "Validé";
  if (s === "DISPUTE") return "Litige";
  if (s === "N_A") return "—";
  return kind === "REVENUE" ? "À encaisser" : "À payer";
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
