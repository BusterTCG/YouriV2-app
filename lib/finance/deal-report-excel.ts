// Compte de production d'une date — sortie Excel (portage KN, Stan 2026-09-27).
// Même design et même architecture que le bilan d'exploitation : kit commun
// lib/finance/report-excel-kit.ts.
//
// Server-only (ExcelJS).

import ExcelJS from "exceljs";
import { format } from "date-fns";
import {
  EUR,
  INT,
  SUBTOTAL_BG,
  fillRow,
  group,
  num,
  sectionTitle,
  sheetOptions,
  tableHeader,
  text,
  writeDocHeader,
  writeFinanceTable,
  writeNotes,
  writeStatTable,
} from "@/lib/finance/report-excel-kit";
import { reportNotes } from "@/lib/production-report";
import type { DealReport, DealReportLine } from "@/lib/deal-report";

export async function buildDealReportXlsx(r: DealReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pangee Prod";
  wb.created = r.generatedAt;
  const ws = wb.addWorksheet("Compte de production", sheetOptions("portrait"));
  ws.columns = [{ width: 36 }, { width: 26 }, { width: 14 }, { width: 13 }, { width: 12 }, { width: 36 }];

  let row = await writeDocHeader(wb, ws, {
    title: "COMPTE DE PRODUCTION",
    subtitle: `${r.title} — ${r.artistName}`,
    infos: [
      `${r.dateLabel} · ${r.venueLabel}`,
      `${r.statusLabel} · édité le ${format(r.generatedAt, "dd/MM/yyyy")}`,
      `Contrat : ${r.contractLabel}`,
    ],
    logoCol: 5.3,
  });

  // 1. Synthèse
  sectionTitle(ws, row, "1. SYNTHÈSE", 6);
  const a = r.audience;
  row = writeStatTable(ws, row + 1, ["Public", ""], [
    { label: "Représentations", values: [a.performances], fmt: INT },
    { label: "Jauge totale", values: [a.capacity], fmt: INT },
    { label: "Payants", values: [a.paying], fmt: INT },
    { label: "Invités", values: [a.invited], fmt: INT },
    { label: "Remplissage", values: [a.fillRate != null ? a.fillRate / 100 : null], fmt: "0%" },
    { label: "Ticket moyen", values: [a.ticketMoyen], fmt: EUR },
    { label: "Résultat par représentation", values: [r.kpis.resultPerPerf], fmt: EUR },
  ]);
  row = writeFinanceTable(ws, row + 2, [{ label: "Montant", f: r.finance }], r.rates);

  // 2. Détail des postes
  row += 2;
  sectionTitle(ws, row, "2. DÉTAIL DES POSTES", 6);
  tableHeader(ws, row + 1, ["Poste", "Détail", "Montant", "Statut", "Payé le", "Commentaire"]);
  row += 2;
  row = writeGroup(ws, row, "RECETTES", r.lines.filter((l) => l.kind === "REVENUE"), r.finance.revenue);
  row = writeGroup(
    ws,
    row,
    "CHARGES",
    r.lines.filter((l) => l.kind === "COST"),
    r.finance.lineCost + r.finance.overhead,
  );

  writeNotes(ws, row + 1, reportNotes(r), 6);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

function writeGroup(
  ws: ExcelJS.Worksheet,
  start: number,
  title: string,
  lines: DealReportLine[],
  total: number,
): number {
  let row = start;
  group(ws, row++, title);
  if (lines.length === 0) {
    text(ws, `A${row++}`, "Aucune ligne saisie.", { italic: true, color: "FF999999" });
  }
  for (const l of lines) {
    text(ws, `A${row}`, l.poste, { indent: 1 });
    text(ws, `B${row}`, l.detail ?? "", { color: "FF555555" });
    num(ws, `C${row}`, l.amount, EUR);
    text(ws, `D${row}`, l.statusLabel);
    text(ws, `E${row}`, l.paidAt ? format(l.paidAt, "dd/MM/yyyy") : "");
    text(ws, `F${row}`, l.comment ?? "", { color: "FF555555" });
    row++;
  }
  text(ws, `A${row}`, `Total ${title.toLowerCase()}`, { bold: true });
  num(ws, `C${row}`, total, EUR, true);
  fillRow(ws, row, SUBTOTAL_BG, 6);
  return row + 1;
}
