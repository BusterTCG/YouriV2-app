/**
 * Helper générique d'export Excel — copie fidèle de KuroNeko-App
 * `lib/excel-export.ts` (cf. AGENTS.md règle "copie fidèle de KN").
 *
 * Différences :
 *   - Workbook.creator = "Pangee Prod" (au lieu de "Kuro Neko")
 *   - Couleur header = navy/gold Youri (identique KN, on garde le gold)
 *
 * Pattern volontaire : on ne tire pas ExcelJS dans le bundle initial.
 * Le caller fait l'import dynamique au moment du clic.
 */

import type { Worksheet } from "exceljs";

export type ExcelFormat = "EUR" | "PCT" | "DATE" | "TEXT";

export interface ExcelColumn<T> {
  header: string;
  width?: number;
  value: (row: T) => string | number | Date | null | undefined;
  format?: ExcelFormat;
}

export interface ExcelExportConfig<T> {
  title: string;
  subtitle?: string;
  sheetName: string;
  columns: ExcelColumn<T>[];
  rows: T[];
  filename: string;
  totals?: Record<number, number>;
  totalsLabel?: string;
}

const EUR_FMT = '#,##0" €";-#,##0" €"';
const PCT_FMT = "0.0%";
const DATE_FMT = "dd/mm/yyyy";

export async function exportToExcel<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ExcelJS: any,
  config: ExcelExportConfig<T>,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pangee Prod";
  wb.created = new Date();
  const ws: Worksheet = wb.addWorksheet(config.sheetName);

  const nCols = config.columns.length;
  const lastColLetter = colLetter(nCols - 1);

  // En-tête méta (lignes 1-3)
  ws.mergeCells(`A1:${lastColLetter}1`);
  ws.getCell("A1").value = config.title;
  ws.getCell("A1").font = { size: 14, bold: true };

  let metaRow = 2;
  if (config.subtitle) {
    ws.mergeCells(`A2:${lastColLetter}2`);
    ws.getCell("A2").value = config.subtitle;
    ws.getCell("A2").font = { size: 10, color: { argb: "FF666666" } };
    metaRow = 3;
  }
  ws.mergeCells(`A${metaRow}:${lastColLetter}${metaRow}`);
  ws.getCell(`A${metaRow}`).value =
    `Généré le ${formatNow()} · ${config.rows.length} ligne(s)`;
  ws.getCell(`A${metaRow}`).font = {
    size: 9,
    italic: true,
    color: { argb: "FF999999" },
  };

  // Header colonnes
  const headerRowIdx = metaRow + 2;
  const headerRow = ws.getRow(headerRowIdx);
  headerRow.values = config.columns.map((c) => c.header);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD4A93A" }, // gold (identique KN)
  };
  headerRow.alignment = { vertical: "middle" };

  ws.columns = config.columns.map((c) => ({ width: c.width ?? 15 }));

  // Données
  config.rows.forEach((row, rIdx) => {
    const xlsRow = ws.getRow(headerRowIdx + 1 + rIdx);
    config.columns.forEach((col, cIdx) => {
      const cell = xlsRow.getCell(cIdx + 1);
      const v = col.value(row);
      if (v == null || v === "") return;
      cell.value = v as string | number | Date;
      if (col.format === "EUR") cell.numFmt = EUR_FMT;
      else if (col.format === "PCT") cell.numFmt = PCT_FMT;
      else if (col.format === "DATE") cell.numFmt = DATE_FMT;
    });
  });

  // Ligne totaux
  if (config.totals && Object.keys(config.totals).length > 0) {
    const totalIdx = headerRowIdx + 1 + config.rows.length + 1;
    const totalRow = ws.getRow(totalIdx);
    totalRow.getCell(1).value = config.totalsLabel ?? "TOTAL";
    Object.entries(config.totals).forEach(([k, v]) => {
      const cell = totalRow.getCell(parseInt(k, 10) + 1);
      cell.value = v;
      cell.numFmt = EUR_FMT;
    });
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F1F1" },
    };
  }

  ws.views = [{ state: "frozen", ySplit: headerRowIdx }];

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${config.filename}.xlsx`,
  );
}

function colLetter(idx: number): string {
  let result = "";
  let n = idx;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

function formatNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function slugifyForFilename(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function filenameDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
