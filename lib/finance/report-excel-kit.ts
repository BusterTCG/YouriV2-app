// Kit Excel commun aux documents financiers d'une production (portage KN, Stan 2026-09-27) :
// bilan d'exploitation (production) et compte de production (date) partagent
// la même charte (bleu nuit + or) et la même structure de compte
// d'exploitation. Toute évolution de mise en page se fait ICI.
//
// Server-only (ExcelJS, fs Node).
//
// ⚠️ Les management fees n'apparaissent jamais dans ces documents.

import { promises as fs } from "node:fs";
import path from "node:path";
import type ExcelJS from "exceljs";
import {
  COST_ROWS,
  REPORT_LINE_LABELS,
  REVENUE_LABELS,
  costRowLabel,
  costRowValue,
  resultLabels,
  type FinanceBlock,
  type ReportRates,
} from "@/lib/production-report";

export const YR_GOLD = "FFD4A93A";
export const YR_NAVY = "FF1A2540";
export const HEADER_BG = "FFF7F0DC";
export const SUBTOTAL_BG = "FFF5F5F5";
export const GOLD_BG = "FFFBF5E4";
export const POSITIVE = "FF108536";
export const NEGATIVE = "FFCC2C2C";
export const MUTED = "FF6B7280";
export const EUR = `#,##0\\ "€";-#,##0\\ "€";"—"`;
export const INT = `#,##0;-#,##0;"—"`;

export function sheetOptions(
  orientation: "portrait" | "landscape",
): Partial<ExcelJS.AddWorksheetOptions> {
  return {
    properties: { defaultRowHeight: 16 },
    pageSetup: {
      paperSize: 9,
      orientation,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  };
}

/**
 * En-tête de document : titre (A1), sous-titre or (A2), lignes d'info (A3…),
 * logo à droite. Retourne la première ligne libre.
 */
export async function writeDocHeader(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  o: { title: string; subtitle: string; infos: string[]; logoCol: number },
): Promise<number> {
  try {
    const logo = await fs.readFile(path.join(process.cwd(), "public", "logo-mark.png"));
    const id = wb.addImage({ buffer: new Uint8Array(logo).buffer as ArrayBuffer, extension: "png" });
    ws.addImage(id, { tl: { col: o.logoCol, row: 0.1 }, ext: { width: 64, height: 64 }, editAs: "absolute" });
  } catch {
    // logo absent → document lisible sans
  }
  text(ws, "A1", o.title, { bold: true, size: 16 });
  text(ws, "A2", o.subtitle, { bold: true, size: 13, color: YR_GOLD });
  o.infos.forEach((info, i) => text(ws, `A${3 + i}`, info, { color: "FF555555" }));
  return 3 + o.infos.length + 1;
}

/**
 * Compte d'exploitation (même structure partout) : recettes, CA, charges
 * (postes vides masqués, frais généraux après la SACD), puis selon le modèle :
 *   prod-exé → rémunération Pangee dans les charges, fin sur « Net artiste » ;
 *   co-prod  → résultat, puis partage Part Pangee / Part artiste.
 * `columns` : une colonne de montants par périmètre (ex. Réalisé / Estimé).
 * Retourne la dernière ligne écrite.
 */
export function writeFinanceTable(
  ws: ExcelJS.Worksheet,
  start: number,
  columns: Array<{ label: string; f: FinanceBlock }>,
  rates: ReportRates,
): number {
  const L = resultLabels(rates);
  const width = 1 + columns.length;
  tableHeader(ws, start, ["Compte d'exploitation", ...columns.map((c) => c.label)]);
  let row = start + 1;
  const line = (
    label: string,
    get: (f: FinanceBlock) => number,
    o: { indent?: boolean; strong?: boolean; signed?: boolean; gold?: boolean; hideZero?: boolean } = {},
  ) => {
    const vals = columns.map((c) => get(c.f));
    if (o.hideZero && vals.every((v) => Math.round(v) === 0)) return;
    text(ws, `A${row}`, label, { bold: o.strong || o.gold, indent: o.indent ? 1 : 0 });
    vals.forEach((v, i) => num(ws, cell(2 + i, row), v, EUR, o.strong || o.gold, o.signed));
    if (o.strong) fillRow(ws, row, SUBTOTAL_BG, width);
    if (o.gold) fillRow(ws, row, GOLD_BG, width);
    row++;
  };
  group(ws, row++, "RECETTES");
  for (const l of REVENUE_LABELS) line(REPORT_LINE_LABELS[l], (f) => f.byLabel[l], { indent: true, hideZero: true });
  line("Chiffre d'affaires", (f) => f.revenue, { strong: true });
  group(ws, row++, "CHARGES");
  for (const c of COST_ROWS) line(costRowLabel(c), (f) => costRowValue(f, c), { indent: true, hideZero: true });
  if (L.showFee) line(L.knFee, (f) => f.knFee, { indent: true, gold: true });
  line("Total charges", (f) => f.totalCost, { strong: true });
  line(L.result, (f) => f.result, { strong: true, signed: true });
  if (L.showSplit) {
    line(L.kn, (f) => f.knShare, { gold: true });
    line(L.artist, (f) => f.artist, { strong: true, signed: true });
  }
  return row - 1;
}

/** Tableau de chiffres simples (public, billetterie…). Retourne la dernière ligne. */
export function writeStatTable(
  ws: ExcelJS.Worksheet,
  start: number,
  header: string[],
  rows: Array<{ label: string; values: Array<number | null>; fmt: string }>,
): number {
  tableHeader(ws, start, header);
  let row = start + 1;
  for (const r of rows) {
    text(ws, `A${row}`, r.label);
    r.values.forEach((v, i) => num(ws, cell(2 + i, row), v, r.fmt));
    row++;
  }
  return row - 1;
}

/** Notes de bas de document (italique, fusionnées sur `lastCol` colonnes). */
export function writeNotes(ws: ExcelJS.Worksheet, start: number, notes: string[], lastCol: number) {
  let row = start;
  for (const n of notes) {
    ws.getCell(`A${row}`).value = n;
    ws.mergeCells(row, 1, row, lastCol);
    ws.getCell(`A${row}`).font = { size: 9, italic: true, color: { argb: "FF666666" } };
    ws.getCell(`A${row}`).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(row).height = 26;
    row++;
  }
}

export function sectionTitle(ws: ExcelJS.Worksheet, row: number, title: string, cols: number) {
  const c = ws.getCell(`A${row}`);
  c.value = title;
  c.font = { size: 12, bold: true, color: { argb: YR_NAVY } };
  ws.getRow(row).height = 22;
  for (let i = 1; i <= cols; i++) {
    ws.getRow(row).getCell(i).border = { bottom: { style: "medium", color: { argb: YR_GOLD } } };
  }
}

const LEFT_HEADERS = new Set(["Lieu", "Libellé", "Détail", "Statut", "Commentaire", "Poste"]);

export function tableHeader(ws: ExcelJS.Worksheet, row: number, labels: string[]) {
  labels.forEach((l, i) => {
    const c = ws.getRow(row).getCell(i + 1);
    c.value = l;
    c.font = { size: 9, bold: true, color: { argb: l === "Prod-exé Pangee" || l === "Part Pangee" ? "FF9A7415" : YR_NAVY } };
    c.alignment = {
      horizontal: i === 0 || LEFT_HEADERS.has(l) ? "left" : "right",
      wrapText: true,
      vertical: "bottom",
    };
  });
  fillRow(ws, row, HEADER_BG, labels.length);
}

export function group(ws: ExcelJS.Worksheet, row: number, label: string) {
  text(ws, `A${row}`, label, { bold: true, size: 9, color: "FF777777" });
}

export function text(
  ws: ExcelJS.Worksheet,
  addr: string,
  value: string,
  o: { bold?: boolean; italic?: boolean; color?: string; size?: number; indent?: number } = {},
) {
  const c = ws.getCell(addr);
  c.value = value;
  c.font = { size: o.size ?? 10, bold: !!o.bold, italic: !!o.italic, color: { argb: o.color ?? YR_NAVY } };
  if (o.indent) c.alignment = { indent: o.indent };
}

export function num(
  ws: ExcelJS.Worksheet,
  addr: string,
  v: number | null,
  fmt: string,
  bold = false,
  signed = false,
) {
  const c = ws.getCell(addr);
  c.value = v == null ? null : fmt === EUR ? Math.round(v * 100) / 100 : v;
  c.numFmt = fmt;
  c.alignment = { horizontal: "right" };
  const color = signed && v != null && Math.round(v) !== 0 ? (v > 0 ? POSITIVE : NEGATIVE) : YR_NAVY;
  c.font = { size: 10, bold, color: { argb: color } };
}

export function fillRow(ws: ExcelJS.Worksheet, row: number, argb: string, cols: number) {
  for (let i = 1; i <= cols; i++) ws.getRow(row).getCell(i).fill = solid(argb);
}

export function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** (colonne 1-based, ligne) → adresse "A1". */
export function cell(col: number, row: number): string {
  let s = "";
  let n = col;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return `${s}${row}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
