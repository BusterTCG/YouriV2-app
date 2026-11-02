// Bilan d'exploitation — rendu imprimable A4 paysage (portage KN, Stan 2026-09-27).
// Rendu par /print/production/[id], converti en PDF par Chromium
// (/api/production-report/[id]?format=pdf). Mise en page commune :
// components/shows/report-print-kit.tsx (partagée avec le compte de production).

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { formatEur } from "@/components/deals/deal-helpers";
import {
  REPORT_LINE_SHORT,
  costRowLabel,
  costRowValue,
  dateFillRate,
  dateVenueLabel,
  detailColumns,
  reportNotes,
  resultLabels,
  type FinanceBlock,
} from "@/lib/production-report";
import type { ProductionReport } from "@/lib/production-report-server";
import { ARTIST_MOVEMENT_LABEL as MOVEMENT_LABEL, artistBalanceLabel } from "@/lib/finance/artist-account";
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
  const colLabels = [r.upcomingCount > 0 ? "Réalisé à date" : "Total"];
  const aud = [r.audience];
  const fins = [r.finance];
  const n = (v: number | null) => (v ? v.toLocaleString("fr-FR") : "—");
  // Colonnes de fin selon le contrat : prod-exé (rémunération Pangee), co-prod (partage).
  // (y compris contrat « Résidences » distinct)
  const { showFee: prodExe, showSplit: coprod } = resultLabels(r.rates);
  const columns = detailColumns(r.dates);
  // Sections présentes seulement si elles ont du contenu.
  const paidUpcoming = r.account.upcomingCostItems;
  const extra = paidUpcoming.length > 0 ? 1 : 0;

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
      notes={reportNotes({ ...r, hasOverhead: p.overheads.length > 0 })}
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
                ...columns.revenues.map((l) => REPORT_LINE_SHORT[l]),
                ...columns.costs.map((c) => costRowLabel(c, true)),
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
                  <MoneyCells f={d.finance} columns={columns} prodExe={prodExe} coprod={coprod} />
                </tr>
              );
            })}
            <tr className="font-semibold bg-slate-100">
              <td className="py-1 px-1" colSpan={2}>
                Total
              </td>
              <Num v={r.audience.performances} />
              <Num v={r.audience.paying} />
              <MoneyCells f={r.finance} columns={columns} prodExe={prodExe} coprod={coprod} />
            </tr>
          </tbody>
        </table>
      </Section>

      {extra > 0 && (
        <Section title="3. Dépenses déjà payées sur dates à venir">
          <table className="text-sm tabular-nums" style={{ width: "60%" }}>
            <thead>
              <HeadRow cols={["Date", "Libellé", "Montant"]} />
            </thead>
            <tbody>
              {paidUpcoming.map((e) => (
                <tr key={e.id} className="border-b border-slate-200">
                  <td className="py-1 px-1 whitespace-nowrap capitalize">{e.dateLabel}</td>
                  <td className="py-1 px-1">{e.label}</td>
                  <td className="py-1 px-1 text-right">{formatEur(e.amount)}</td>
                </tr>
              ))}
              <tr className="font-semibold bg-slate-100">
                <td className="py-1 px-1" colSpan={2}>Total</td>
                <td className="py-1 px-1 text-right">{formatEur(r.paidUpcomingTotal)}</td>
              </tr>
            </tbody>
          </table>
        </Section>
      )}

      <Section title={`${3 + extra}. Compte artiste`}>
        <div className="grid gap-6 items-start" style={{ gridTemplateColumns: "1fr 1.3fr" }}>
          <table className="w-full text-sm tabular-nums">
            <tbody>
              {[
                ["Part artiste acquise (dates jouées)", r.account.acquired],
                ...(Math.round(r.account.upcomingCosts) !== 0
                  ? [[`Déjà payé sur dates à venir${coprod ? " (part artiste)" : ""}`, -r.account.upcomingCosts] as [string, number]]
                  : []),
                ...(Math.round(r.account.pendingCollection) !== 0
                  ? [["Billetterie à recevoir", -r.account.pendingCollection] as [string, number]]
                  : []),
                ...(Math.round(r.account.collectionOffset) !== 0
                  ? [["Compensé par cette billetterie", r.account.collectionOffset] as [string, number]]
                  : []),
                ["Quote-parts versées", -r.account.paid],
                ...(r.account.refunded ? [["Déficit réglé par l'artiste", r.account.refunded] as [string, number]] : []),
                ...(r.account.advances
                  ? [
                      ["Dépenses payées par l'artiste", r.account.advances - r.account.cashAdvances] as [string, number],
                      ["Avance virée par l'artiste", r.account.cashAdvances] as [string, number],
                      ["Remboursé à l'artiste", -r.account.advancesPaid] as [string, number],
                    ]
                  : []),
              ].map(([label, v]) => (
                <tr key={label as string} className="border-b border-slate-200">
                  <td className="py-1 px-1">{label}</td>
                  <td className="py-1 px-1 text-right">{Math.round(v as number) === 0 ? "—" : formatEur(v as number)}</td>
                </tr>
              ))}
              <tr className="font-semibold" style={{ background: "#fbf5e4" }}>
                <td className="py-1 px-1">{artistBalanceLabel(r.account)}</td>
                <td className="py-1 px-1 text-right">
                  {Math.round(r.account.balance) === 0 ? "—" : formatEur(Math.abs(r.account.balance))}
                </td>
              </tr>
              {Math.round(r.account.payableOnCollection) > 0 && (
                <tr className="border-b border-slate-200">
                  <td className="py-1 px-1">À verser une fois la billetterie reçue</td>
                  <td className="py-1 px-1 text-right">{formatEur(r.account.payableOnCollection)}</td>
                </tr>
              )}
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
                      {MOVEMENT_LABEL[m.kind]}
                      {m.kind === "PAYMENT" && m.advanceAmount > 0 && (
                        <span className="text-slate-500"> (dont frais avancés {formatEur(m.advanceAmount)})</span>
                      )}
                      {m.note && <span className="text-slate-500"> — {m.note}</span>}
                    </td>
                    <td className="py-1 px-1 text-right">
                      {m.kind === "REFUND" || m.kind === "CASH_ADVANCE" ? "+ " : "− "}
                      {formatEur(m.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Section>

      {p.overheads.length > 0 && (
        <Section title={`${4 + extra}. Frais généraux`}>
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
                  <td className="py-1 px-1">
                    {o.paidByArtist
                      ? o.artistRefunded
                        ? "Payé par l'artiste, rendu"
                        : "Payé par l'artiste, à rendre"
                      : o.status === "PAID"
                        ? "Payé"
                        : "À payer"}
                  </td>
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
        </Section>
      )}
    </ReportShell>
  );
}

/** Colonnes montants d'une ligne de date : recettes, charges, puis fin selon le modèle. */
function MoneyCells({
  f,
  columns,
  prodExe,
  coprod,
}: {
  f: FinanceBlock;
  columns: ReturnType<typeof detailColumns>;
  prodExe: boolean;
  coprod: boolean;
}) {
  return (
    <>
      {columns.revenues.map((l) => (
        <Eur key={l} v={f.byLabel[l]} />
      ))}
      {columns.costs.map((c) => (
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
