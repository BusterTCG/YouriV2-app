// Compte de production d'une date — rendu imprimable A4 paysage
// (portage KN, Stan 2026-09-27). Même design que le bilan d'exploitation (kit commun
// components/shows/report-print-kit.tsx). Rendu par /print/compte/[showId],
// converti en PDF par /api/financial-export/[showId]?format=pdf.

import { format } from "date-fns";
import { formatEur } from "@/components/deals/deal-helpers";
import { reportNotes } from "@/lib/production-report";
import type { DealReport, DealReportLine } from "@/lib/deal-report";
import { KpiTiles } from "@/components/shows/kpi-visuals";
import {
  FinanceTable,
  HeadRow,
  ReportShell,
  Section,
  StatTable,
} from "@/components/shows/report-print-kit";

export function DealReportPrint({ r }: { r: DealReport }) {
  const a = r.audience;
  const n = (v: number | null) => (v ? v.toLocaleString("fr-FR") : "—");
  const revenues = r.lines.filter((l) => l.kind === "REVENUE");
  const costs = r.lines.filter((l) => l.kind === "COST");

  return (
    <ReportShell
      kicker="Compte de production"
      title={r.title}
      subtitle={r.artistName + (r.productionName && r.productionName !== r.title ? ` · ${r.productionName}` : "")}
      rightLabel="Date"
      rightMain={r.dateLabel}
      rightSub={`${r.venueLabel} · ${r.statusLabel} · édité le ${format(r.generatedAt, "dd/MM/yyyy")}`}
      contract={r.contractLabel}
      notes={reportNotes(r)}
    >
      <KpiTiles kpis={r.kpis} variant="print" single />

      <Section title="1. Synthèse">
        <div className="grid gap-6 items-start" style={{ gridTemplateColumns: "1fr 1.6fr" }}>
          <StatTable
            header={["Public", ""]}
            rows={[
              { label: "Représentations", values: [n(a.performances)] },
              { label: "Jauge totale", values: [n(a.capacity)] },
              { label: "Payants", values: [n(a.paying)] },
              { label: "Invités", values: [n(a.invited)] },
              { label: "Remplissage", values: [a.fillRate != null ? `${a.fillRate} %` : "—"] },
              { label: "Ticket moyen", values: [a.ticketMoyen != null ? formatEur(a.ticketMoyen) : "—"] },
            ]}
          />
          <FinanceTable columns={[{ label: "Montant", f: r.finance }]} rates={r.rates} />
        </div>
      </Section>

      <Section title="2. Détail des postes">
        <table className="w-full text-[12px] tabular-nums">
          <thead>
            <HeadRow cols={["Poste", "Détail", "Montant", "Statut", "Payé le", "Commentaire"]} />
          </thead>
          <tbody>
            <LinesGroup title="Recettes" lines={revenues} total={r.finance.revenue} />
            <LinesGroup title="Charges" lines={costs} total={r.finance.lineCost + r.finance.overhead} />
          </tbody>
        </table>
      </Section>
    </ReportShell>
  );
}

function LinesGroup({ title, lines, total }: { title: string; lines: DealReportLine[]; total: number }) {
  return (
    <>
      <tr>
        <td colSpan={6} className="pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {title}
        </td>
      </tr>
      {lines.length === 0 ? (
        <tr>
          <td colSpan={6} className="py-1 px-1 italic text-slate-400">
            Aucune ligne saisie.
          </td>
        </tr>
      ) : (
        lines.map((l, i) => (
          <tr key={`${l.poste}-${i}`} className="border-b border-slate-200">
            <td className="py-1 px-1 pl-4">{l.poste}</td>
            <td className="py-1 px-1 text-slate-600">{l.detail ?? ""}</td>
            <td className="py-1 px-1 text-right whitespace-nowrap">{formatEur(l.amount)}</td>
            <td className="py-1 px-1">{l.statusLabel}</td>
            <td className="py-1 px-1 text-right">{l.paidAt ? format(l.paidAt, "dd/MM/yyyy") : ""}</td>
            <td className="py-1 px-1 text-slate-600">{l.comment ?? ""}</td>
          </tr>
        ))
      )}
      <tr className="font-semibold bg-slate-50">
        <td className="py-1 px-1" colSpan={2}>
          Total {title.toLowerCase()}
        </td>
        <td className="py-1 px-1 text-right whitespace-nowrap">{formatEur(total)}</td>
        <td colSpan={3} />
      </tr>
    </>
  );
}
