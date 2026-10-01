// Bilan d'exploitation d'une production — sortie Excel (portage KN, Stan 2026-09-27).
// Charte + compte d'exploitation communs : lib/finance/report-excel-kit.ts
// (partagés avec le compte de production d'une date).
//
// Server-only (ExcelJS).

import ExcelJS from "exceljs";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  EUR,
  GOLD_BG,
  INT,
  YR_NAVY,
  MUTED,
  SUBTOTAL_BG,
  capitalize,
  cell,
  fillRow,
  num,
  sectionTitle,
  sheetOptions,
  solid,
  tableHeader,
  text,
  writeDocHeader,
  writeFinanceTable,
  writeNotes,
  writeStatTable,
} from "@/lib/finance/report-excel-kit";
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

export async function buildProductionReportXlsx(r: ProductionReport): Promise<Buffer> {
  const p = r.production;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pangee Prod";
  wb.created = r.generatedAt;

  const ws = wb.addWorksheet("Bilan d'exploitation", sheetOptions("portrait"));
  ws.columns = [{ width: 42 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
  const period =
    p.firstDate && p.lastDate
      ? `${format(p.firstDate, "d MMMM yyyy", { locale: fr })} → ${format(p.lastDate, "d MMMM yyyy", { locale: fr })}`
      : "Aucune date";
  let row = await writeDocHeader(wb, ws, {
    title: "BILAN D'EXPLOITATION",
    subtitle: `${p.name} — ${p.artist.name}`,
    infos: [
      `Période : ${period}`,
      (p.status === "CLOSED"
        ? `Exploitation clôturée${p.closedAt ? ` le ${format(p.closedAt, "dd/MM/yyyy")}` : ""}`
        : "Exploitation en cours") + ` · édité le ${format(r.generatedAt, "dd/MM/yyyy")}`,
      `Contrat : ${r.contractLabel}`,
    ],
    logoCol: 3.6,
  });

  // 1. Synthèse
  sectionTitle(ws, row, "1. SYNTHÈSE", 5);
  const colLabels = [r.upcomingCount > 0 ? "Réalisé à date" : "Total"];
  const aud = [r.audience];
  row = writeStatTable(ws, row + 1, ["Public", ...colLabels], [
    { label: "Représentations", values: aud.map((a) => a.performances), fmt: INT },
    { label: "Payants", values: aud.map((a) => a.paying), fmt: INT },
    { label: "Invités", values: aud.map((a) => a.invited), fmt: INT },
    { label: "Remplissage", values: aud.map((a) => (a.fillRate != null ? a.fillRate / 100 : null)), fmt: "0%" },
  ]);
  row = writeStatTable(ws, row + 2, ["Indicateurs", "Dates jouées"], [
    { label: "Ticket moyen (billetterie ÷ payants)", values: [r.kpis.ticketAvg], fmt: EUR },
    { label: "Résultat par représentation", values: [r.kpis.resultPerPerf], fmt: EUR },
    { label: "Représentations jouées", values: [r.kpis.played], fmt: INT },
  ]);
  const fins = [r.finance];
  row = writeFinanceTable(
    ws,
    row + 2,
    fins.map((f, i) => ({ label: colLabels[i], f })),
    r.rates,
  );

  // 2. Compte artiste
  row += 2;
  sectionTitle(ws, row, "2. COMPTE ARTISTE", 5);
  const acc = r.account;
  row = writeStatTable(ws, row + 1, ["Compte artiste", "Montant"], [
    { label: "Part artiste acquise (dates jouées)", values: [acc.acquired], fmt: EUR },
    { label: "Dont appelable (billetterie reçue)", values: [acc.callable], fmt: EUR },
    { label: "Quote-parts versées", values: [-acc.paid], fmt: EUR },
    { label: "Remboursements de l'artiste", values: [acc.refunded], fmt: EUR },
    {
      label:
        acc.balance > 0 ? "Solde dû à l'artiste" : acc.balance < 0 ? "Solde dû par l'artiste" : "Compte soldé",
      values: [Math.abs(acc.balance)],
      fmt: EUR,
    },
  ]);
  fillRow(ws, row, SUBTOTAL_BG, 2);
  if (acc.movements.length) {
    row += 2;
    tableHeader(ws, row, ["Versement", "Date", "Montant"]);
    for (const m of acc.movements) {
      row++;
      text(ws, `A${row}`, (m.kind === "PAYMENT" ? "Quote-part versée" : "Remboursement de l'artiste") + (m.note ? ` — ${m.note}` : ""));
      text(ws, `B${row}`, format(m.date, "dd/MM/yyyy"));
      num(ws, `C${row}`, m.kind === "PAYMENT" ? -m.amount : m.amount, EUR);
    }
  }

  // 3. Frais généraux
  row += 2;
  sectionTitle(ws, row, "3. FRAIS GÉNÉRAUX", 5);
  tableHeader(ws, row + 1, ["Libellé", "Date", "Montant", "Statut"]);
  row += 2;
  if (p.overheads.length === 0) {
    text(ws, `A${row}`, "Aucun frais général.", { italic: true, color: "FF999999" });
  } else {
    for (const o of p.overheads) {
      text(ws, `A${row}`, o.label + (o.comment ? ` — ${o.comment}` : ""));
      text(ws, `B${row}`, o.date ? format(o.date, "dd/MM/yyyy") : "");
      num(ws, `C${row}`, o.amount, EUR);
      text(ws, `D${row}`, o.status === "PAID" ? "Payé" : "À payer");
      row++;
    }
    text(ws, `A${row}`, "Total", { bold: true });
    num(ws, `C${row}`, p.overheadTotal, EUR, true);
    if (p.performancesPlanned > 0) {
      text(
        ws,
        `D${row}`,
        `soit ${p.perPerformance.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} € / repr. (${p.performancesPlanned} repr.)`,
        { italic: true, color: "FF555555", size: 9 },
      );
    }
    fillRow(ws, row, SUBTOTAL_BG, 3);
  }
  writeNotes(ws, row + 2, [...reportNotes(r), "Détail de chaque poste, date par date : onglet « Détail par date »."], 5);

  // Détail par date : onglet dédié (chaque poste en colonne).
  addDates(wb.addWorksheet("Détail par date", sheetOptions("landscape")), r);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

function addDates(ws: ExcelJS.Worksheet, r: ProductionReport) {
  const heads = [
    "Date",
    "Lieu",
    "Repr.",
    "Payants",
    "Rempl.",
    ...REVENUE_LABELS.map((l) => REPORT_LINE_SHORT[l]),
    ...COST_ROWS.map((c) => costRowLabel(c, true)),
    ...endHeads(r),
  ];
  ws.columns = heads.map((_, i) => ({ width: i === 1 ? 30 : 11 }));
  text(ws, "A1", `DÉTAIL PAR DATE — ${r.production.name} (${r.production.artist.name})`, { bold: true, size: 13 });
  tableHeader(ws, 3, heads);
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 3 }];

  let row = 4;
  const moneyCols = (f: FinanceBlock, bold: boolean) => {
    let c = 6;
    for (const l of REVENUE_LABELS) num(ws, cell(c++, row), f.byLabel[l], EUR, bold);
    for (const k of COST_ROWS) num(ws, cell(c++, row), costRowValue(f, k), EUR, bold);
    for (const [v, signed, gold] of endValues(r, f)) {
      num(ws, cell(c, row), v, EUR, bold, signed);
      if (gold && !bold) ws.getCell(cell(c, row)).fill = solid(GOLD_BG);
      c++;
    }
  };
  for (const d of r.dates) {
    const cancelled = d.status === "ANNULE";
    const color = cancelled ? "FF999999" : d.isPast ? YR_NAVY : MUTED;
    text(
      ws,
      `A${row}`,
      d.isMultiDate
        ? capitalize(format(new Date(`${d.monthKey}-01T12:00:00Z`), "MMM yyyy", { locale: fr }))
        : format(d.date, "dd/MM/yyyy"),
      { color, italic: cancelled },
    );
    text(ws, `B${row}`, dateVenueLabel(d) + (cancelled ? " (annulée)" : ""), {
      color,
      italic: cancelled,
    });
    num(ws, `C${row}`, d.performances, INT);
    num(ws, `D${row}`, d.paying, INT);
    const fill = dateFillRate(d);
    num(ws, `E${row}`, fill != null ? fill / 100 : null, "0%");
    moneyCols(d.finance, false);
    row++;
  }
  text(ws, `A${row}`, "Total", { bold: true });
  num(ws, `C${row}`, r.audience.performances, INT, true);
  num(ws, `D${row}`, r.audience.paying, INT, true);
  moneyCols(r.finance, true);
  fillRow(ws, row, SUBTOTAL_BG, heads.length);
}

/** En-têtes des colonnes de fin selon le contrat. */
function endHeads(r: ProductionReport): string[] {
  // Colonnes selon le(s) contrat(s) — y compris contrat « Résidences » distinct.
  const { showFee: pe, showSplit: cp } = resultLabels(r.rates);
  return [...(pe ? ["Prod-exé Pangee"] : []), cp ? "Bénéfice" : "Net artiste", ...(cp ? ["Part Pangee", "Part artiste"] : [])];
}

/** Valeurs des colonnes de fin : [montant, signé (couleur +/−), fond or]. */
function endValues(r: ProductionReport, f: FinanceBlock): Array<[number, boolean, boolean]> {
  // Colonnes selon le(s) contrat(s) — y compris contrat « Résidences » distinct.
  const { showFee: pe, showSplit: cp } = resultLabels(r.rates);
  return [
    ...(pe ? ([[f.knFee, false, true]] as Array<[number, boolean, boolean]>) : []),
    [f.result, true, false],
    ...(cp
      ? ([
          [f.knShare, false, true],
          [f.artist, true, false],
        ] as Array<[number, boolean, boolean]>)
      : []),
  ];
}
