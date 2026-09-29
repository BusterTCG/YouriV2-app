// Bilan d'exploitation — rendu imprimable A4 paysage (portage KN, Stan 2026-09-27).
// Rendu par /print/production/[id], converti en PDF par Chromium
// (/api/production-report/[id]?format=pdf). Mise en page commune :
// components/shows/report-print-kit.tsx (partagée avec le compte de production).

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { formatEur } from "@/components/deals/deal-helpers";
import {
  COST_ROWS,
  REPORT_LINE_SHORT,
  REVENUE_LABELS,
  costRowLabel,
  costRowValue,
  dateFillRate,
  dateVenueLabel,
  reportNotes,
  resultLabels,
  type FinanceBlock,
} from "@/lib/production-report";
import type { ProductionReport } from "@/lib/production-report-server";
import { KpiTiles } from "@/components/shows/kpi-visuals";
import {
  Eur,
  FinanceTable,
  HeadRow,
  NAVY,
  Num,
  ReportShell,
  Section,
  StatTable,
} from "@/components/shows/report-print-kit";

export function ProductionReportPrint({ r }: { r: ProductionReport }) {
  const p = r.production;
  const period =
    p.firstDate && p.lastDate
      ? `${format(p.firstDate, "d MMMM yyyy", { locale: fr })} → ${format(p.lastDate, "d MMMM yyyy", { locale: fr })}`
      : "Aucune date";
  const dual = r.hasUpcoming;
  const colLabels = dual ? ["Réalisé", "Estimé"] : ["Total"];
  const aud = dual ? [r.audience.realized, r.audience.forecast] : [r.audience.forecast];
  const fins = dual ? [r.finance.realized, r.finance.forecast] : [r.finance.forecast];
  const n = (v: number | null) => (v ? v.toLocaleString("fr-FR") : "—");
  // Colonnes de fin selon le contrat : prod-exé (rémunération Pangee), co-prod (partage).
  // (y compris contrat « Résidences » distinct)
  const { showFee: prodExe, showSplit: coprod } = resultLabels(r.rates);

  return (
    <ReportShell
      kicker="Bilan d'exploitation"
      title={p.name}
      subtitle={p.artist.name}
      rightLabel="Période"
      rightMain={period}
      rightSub={`${
        p.status === "CLOSED"
          ? `Exploitation clôturée${p.closedAt ? ` le ${format(p.closedAt, "dd/MM/yyyy")}` : ""}`
          : "Exploitation en cours"
      } · édité le ${format(r.generatedAt, "dd/MM/yyyy")}`}
      contract={r.contractLabel}
      notes={reportNotes(r)}
    >
      <KpiTiles kpis={r.kpis} variant="print" />

      <Section title="1. Synthèse">
        <div className="grid gap-6 items-start" style={{ gridTemplateColumns: "1fr 1.6fr" }}>
          <StatTable
            header={["Public", ...colLabels]}
            rows={[
              { label: "Représentations", values: aud.map((a) => n(a.performances)) },
              { label: "Payants", values: aud.map((a) => n(a.paying)) },
              { label: "Invités", values: aud.map((a) => n(a.invited)) },
              { label: "Remplissage", values: aud.map((a) => (a.fillRate != null ? `${a.fillRate} %` : "—")) },
            ]}
          />
          <FinanceTable
            columns={fins.map((f, i) => ({ label: colLabels[i], f }))}
            rates={r.rates}
          />
        </div>
      </Section>

      <Section title="2. Détail par date">
        <table className="w-full text-[10px] tabular-nums leading-tight">
          <thead>
            <HeadRow
              small
              cols={[
                "Date",
                "Lieu",
                "Repr.",
                "Payants",
                ...REVENUE_LABELS.map((l) => REPORT_LINE_SHORT[l]),
                ...COST_ROWS.map((c) => costRowLabel(c, true)),
                ...(prodExe ? ["Prod-exé Pangee"] : []),
                coprod ? "Bénéfice" : "Net artiste",
                ...(coprod ? ["Part Pangee", "Part artiste"] : []),
              ]}
            />
          </thead>
          <tbody>
            {r.dates.map((d) => {
              const cancelled = d.status === "ANNULE";
              const fill = dateFillRate(d);
              return (
                <tr
                  key={d.id}
                  className="border-b border-slate-200"
                  style={{
                    color: cancelled ? "#9ca3af" : d.isPast ? NAVY : "#4b5563",
                    fontStyle: cancelled ? "italic" : undefined,
                  }}
                >
                  <td className="py-1 px-1 whitespace-nowrap capitalize">
                    {d.isMultiDate
                      ? format(new Date(`${d.monthKey}-01T12:00:00Z`), "MMM yyyy", { locale: fr })
                      : format(d.date, "dd/MM/yy")}
                  </td>
                  <td className="py-1 px-1">
                    {dateVenueLabel(d)}
                    {cancelled && " (annulée)"}
                  </td>
                  <Num v={d.performances} />
                  <td className="py-1 px-1 text-right whitespace-nowrap">
                    {d.paying ? d.paying : "—"}
                    {fill != null && <span className="text-slate-500"> ({fill}%)</span>}
                  </td>
                  <MoneyCells f={d.finance} prodExe={prodExe} coprod={coprod} />
                </tr>
              );
            })}
            <tr className="font-semibold bg-slate-100">
              <td className="py-1 px-1" colSpan={2}>
                Total
              </td>
              <Num v={r.audience.forecast.performances} />
              <Num v={r.audience.forecast.paying} />
              <MoneyCells f={r.finance.forecast} prodExe={prodExe} coprod={coprod} />
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="3. Compte artiste">
        <div className="grid gap-6 items-start" style={{ gridTemplateColumns: "1fr 1.3fr" }}>
          <table className="w-full text-sm tabular-nums">
            <tbody>
              {[
                ["Part artiste acquise (dates jouées)", r.account.acquired],
                ["Dont appelable (billetterie reçue)", r.account.callable],
                ["Quote-parts versées", -r.account.paid],
                ...(r.account.refunded ? [["Remboursements de l'artiste", r.account.refunded] as [string, number]] : []),
              ].map(([label, v]) => (
                <tr key={label as string} className="border-b border-slate-200">
                  <td className="py-1 px-1">{label}</td>
                  <td className="py-1 px-1 text-right">{Math.round(v as number) === 0 ? "—" : formatEur(v as number)}</td>
                </tr>
              ))}
              <tr className="font-semibold" style={{ background: "#fbf5e4" }}>
                <td className="py-1 px-1">
                  {r.account.balance > 0
                    ? "Solde dû à l'artiste"
                    : r.account.balance < 0
                      ? "Solde dû par l'artiste"
                      : "Compte soldé"}
                </td>
                <td className="py-1 px-1 text-right">
                  {Math.round(r.account.balance) === 0 ? "—" : formatEur(Math.abs(r.account.balance))}
                </td>
              </tr>
            </tbody>
          </table>
          {r.account.movements.length === 0 ? (
            <p className="text-sm italic text-slate-500">Aucun versement enregistré.</p>
          ) : (
            <table className="w-full text-sm tabular-nums">
              <thead>
                <HeadRow cols={["Date", "Libellé", "Montant"]} />
              </thead>
              <tbody>
                {r.account.movements.map((m) => (
                  <tr key={m.id} className="border-b border-slate-200">
                    <td className="py-1 px-1 whitespace-nowrap">{format(m.date, "dd/MM/yyyy")}</td>
                    <td className="py-1 px-1">
                      {m.kind === "PAYMENT" ? "Quote-part versée" : "Remboursement de l'artiste"}
                      {m.note && <span className="text-slate-500"> — {m.note}</span>}
                    </td>
                    <td className="py-1 px-1 text-right">
                      {m.kind === "PAYMENT" ? "− " : "+ "}
                      {formatEur(m.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Section>

      <Section title="4. Frais généraux">
        {p.overheads.length === 0 ? (
          <p className="text-sm italic text-slate-500">Aucun frais général.</p>
        ) : (
          <table className="text-sm tabular-nums" style={{ width: "60%" }}>
            <thead>
              <HeadRow cols={["Date", "Libellé", "Montant", "Statut"]} />
            </thead>
            <tbody>
              {p.overheads.map((o) => (
                <tr key={o.id} className="border-b border-slate-200">
                  <td className="py-1 px-1 whitespace-nowrap">{o.date ? format(o.date, "dd/MM/yyyy") : ""}</td>
                  <td className="py-1 px-1">
                    {o.label}
                    {o.comment && <span className="text-slate-500"> — {o.comment}</span>}
                  </td>
                  <td className="py-1 px-1 text-right">{formatEur(o.amount)}</td>
                  <td className="py-1 px-1">{o.status === "PAID" ? "Payé" : "À payer"}</td>
                </tr>
              ))}
              <tr className="font-semibold bg-slate-100">
                <td className="py-1 px-1" colSpan={2}>
                  Total
                  {p.performancesPlanned > 0 && (
                    <span className="font-normal text-slate-500 text-xs">
                      {" "}— soit {p.perPerformance.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} € / repr.
                      ({p.performancesPlanned} repr.)
                    </span>
                  )}
                </td>
                <td className="py-1 px-1 text-right">{formatEur(p.overheadTotal)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </Section>
    </ReportShell>
  );
}

/** Colonnes montants d'une ligne de date : recettes, charges, puis fin selon le modèle. */
function MoneyCells({ f, prodExe, coprod }: { f: FinanceBlock; prodExe: boolean; coprod: boolean }) {
  return (
    <>
      {REVENUE_LABELS.map((l) => (
        <Eur key={l} v={f.byLabel[l]} />
      ))}
      {COST_ROWS.map((c) => (
        <Eur key={c} v={costRowValue(f, c)} />
      ))}
      {prodExe && <Eur v={f.knFee} gold />}
      <Eur v={f.result} sign />
      {coprod && (
        <>
          <Eur v={f.knShare} gold />
          <Eur v={f.artist} sign />
        </>
      )}
    </>
  );
}
