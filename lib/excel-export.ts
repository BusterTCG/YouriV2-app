/**
 * Copie fidèle de KuroNeko-App `lib/excel-export.ts` (seule différence :
 * Workbook.creator = "Pangee Prod").
 *
 * Helper générique d'export Excel — utilisé par toutes les pages qui exposent
 * un bouton "Exporter Excel". Évite la duplication du code ExcelJS sur chaque
 * page (deals, tasks, shows, contacts, etc.).
 *
 * Pattern volontaire : on ne tire pas ExcelJS dans le bundle initial.
 * Le caller fait l'import dynamique au moment du clic — ce helper attend
 * que la lib soit déjà importée.
 *
 * Pour un nouvel export :
 *   1. Définis tes colonnes typées : `ExcelColumn<MaRow>[]`
 *   2. Appelle `exportToExcel({ title, subtitle, sheetName, columns, rows, filename })`
 *   3. Côté UI, déclenche l'appel avec un Button + state busy
 */

import type { Worksheet } from "exceljs";

/** Format de cellule Excel pour les colonnes typées numériques/date. */
export type ExcelFormat = "EUR" | "PCT" | "DATE" | "TEXT";

export interface ExcelColumn<T> {
  header: string;
  /** Largeur Excel en "unités" (~chars). Défaut 15. */
  width?: number;
  /**
   * Récupère la valeur de la cellule depuis la row.
   * Retourner null/undefined → cellule vide (pas de coercion en "null").
   */
  value: (row: T) => string | number | Date | null | undefined;
  /**
   * Format Excel :
   *   - "EUR"  : 1 234 €
   *   - "PCT"  : 12,5%  (attention : Excel veut 0.125 pour afficher 12,5%)
   *   - "DATE" : 31/12/2026
   *   - "TEXT" : tel quel (défaut)
   */
  format?: ExcelFormat;
}

/**
 * Groupe de colonnes affiché en bandeau au-dessus du header, avec un fond
 * coloré commun. Améliore la lisibilité quand un tableau a beaucoup de
 * colonnes (export show financier avec 25 colonnes par ex.).
 */
export interface ExcelColumnGroup {
  /** Libellé affiché dans la cellule mergée (centre). */
  label: string;
  /** 1ère colonne du groupe (0-based, inclus). */
  startIdx: number;
  /** Dernière colonne du groupe (0-based, inclus). */
  endIdx: number;
  /** Fond en argb (ex: "FFE7F3FE"). */
  bgColor?: string;
}

export interface ExcelExportConfig<T> {
  /** Titre A1 (gros, gras). */
  title: string;
  /** Description filtres/contexte (A2, plus petit). Optionnel. */
  subtitle?: string;
  /** Nom de l'onglet Excel. */
  sheetName: string;
  /** Colonnes typées. */
  columns: ExcelColumn<T>[];
  /** Lignes de données. */
  rows: T[];
  /** Nom de fichier sans extension. */
  filename: string;
  /**
   * Ligne de totaux à ajouter en bas — map index colonne (0-based) →
   * valeur affichée. Format de la colonne d'origine respecté (EUR / PCT / DATE).
   */
  totals?: Record<number, number>;
  /** Label de la ligne totaux (colonne 0). Défaut "TOTAL". */
  totalsLabel?: string;
  /**
   * Groupes de colonnes affichés en bandeau au-dessus du header. Optionnel.
   * Le fond `bgColor` est aussi propagé sur le header de la colonne et sur
   * les cellules data correspondantes (zébré léger par groupe).
   */
  columnGroups?: ExcelColumnGroup[];
  /**
   * Index (0-based) des colonnes dont les valeurs doivent être affichées en
   * gras (ex: colonnes Marge / Part artiste / Part KN pour ressortir
   * visuellement par rapport aux détails recettes/charges).
   */
  boldColumns?: number[];
  /**
   * Coloration manuelle de certaines colonnes (en sus du `boldColumns`).
   * Map index colonne → ARGB de la police (ex: vert pour TOTAL Recettes,
   * rouge pour TOTAL Charges).
   */
  colorColumns?: Record<number, string>;
}

const EUR_FMT = '#,##0" €";-#,##0" €"';
const PCT_FMT = "0.0%";
const DATE_FMT = "dd/mm/yyyy";

/**
 * Produit un fichier Excel téléchargé via blob.
 *
 * Requiert que `exceljs` soit importé dynamiquement par le caller :
 * ```ts
 * const ExcelJS = (await import("exceljs")).default;
 * await exportToExcel(ExcelJS, { title, columns, rows, ... });
 * ```
 */
export async function exportToExcel<T>(
  // ExcelJS est typé via le named import ci-dessus mais on l'accepte en any
  // pour ne pas forcer le caller à matcher exactement le type — l'API est
  // stable côté .Workbook() / .xlsx.writeBuffer().
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

  // ─── En-tête méta (lignes 1-3) ───
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

  // ─── Bande de groupes (au-dessus du header) ───
  // Affichée seulement si des columnGroups sont fournis.
  let headerRowIdx = metaRow + 2;
  if (config.columnGroups && config.columnGroups.length > 0) {
    const groupRowIdx = metaRow + 2;
    headerRowIdx = groupRowIdx + 1;
    const groupRow = ws.getRow(groupRowIdx);
    groupRow.height = 22;
    for (const grp of config.columnGroups) {
      const start = colLetter(grp.startIdx);
      const end = colLetter(grp.endIdx);
      ws.mergeCells(`${start}${groupRowIdx}:${end}${groupRowIdx}`);
      const cell = ws.getCell(`${start}${groupRowIdx}`);
      cell.value = grp.label;
      cell.font = {
        size: 11,
        bold: true,
        color: { argb: "FF1A2540" }, // KN navy
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      if (grp.bgColor) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: grp.bgColor },
        };
      }
      cell.border = {
        top: { style: "thin", color: { argb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { argb: "FFAAAAAA" } },
        left: { style: "thin", color: { argb: "FFCCCCCC" } },
        right: { style: "thin", color: { argb: "FFCCCCCC" } },
      };
    }
  }

  // ─── Header colonnes ───
  const headerRow = ws.getRow(headerRowIdx);
  headerRow.values = config.columns.map((c) => c.header);
  headerRow.height = 22;
  headerRow.font = { bold: true, color: { argb: "FF1A2540" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD4A93A" }, // gold (identique KN)
  };
  headerRow.alignment = { vertical: "middle", horizontal: "left", wrapText: true };

  // Largeurs
  ws.columns = config.columns.map((c) => ({ width: c.width ?? 15 }));

  // Bordures latérales sur le header pour matcher les data (séparateurs
  // entre groupes). Calculé après pour avoir accès à columnGroups.
  const groupRightEdgesHeader = new Set<number>();
  const groupLeftEdgesHeader = new Set<number>();
  if (config.columnGroups) {
    for (const grp of config.columnGroups) {
      groupLeftEdgesHeader.add(grp.startIdx);
      groupRightEdgesHeader.add(grp.endIdx);
    }
  }
  config.columns.forEach((_, cIdx) => {
    const isLeft = groupLeftEdgesHeader.has(cIdx);
    const isRight = groupRightEdgesHeader.has(cIdx);
    if (isLeft || isRight) {
      const cell = headerRow.getCell(cIdx + 1);
      cell.border = {
        ...cell.border,
        ...(isLeft && cIdx > 0
          ? { left: { style: "medium", color: { argb: "FFAAAAAA" } } }
          : {}),
        ...(isRight && cIdx < config.columns.length - 1
          ? { right: { style: "medium", color: { argb: "FFAAAAAA" } } }
          : {}),
      };
    }
  });

  // ─── Données ───
  // Map cIdx -> bgColor (s'il appartient à un groupe avec couleur) pour
  // applique un fond léger sur la colonne (mais on garde une variante zebra
  // pour la lisibilité).
  const colBgColor = new Map<number, string>();
  if (config.columnGroups) {
    for (const grp of config.columnGroups) {
      if (!grp.bgColor) continue;
      // Couleur "data" : on utilise une variante très claire de la couleur
      // du groupe (préfixe "FFF" pour clarifier — alpha plein, R/G/B pâles).
      const pale = paleVariant(grp.bgColor);
      for (let i = grp.startIdx; i <= grp.endIdx; i++) {
        colBgColor.set(i, pale);
      }
    }
  }
  const boldSet = new Set(config.boldColumns ?? []);
  const colorMap = config.colorColumns ?? {};
  // Calcule, pour chaque colonne, si elle est à la fin d'un groupe (= bord
  // droit épais) ou au début (= bord gauche épais). Sert à dessiner les
  // séparateurs verticaux entre groupes.
  const groupRightEdges = new Set<number>();
  const groupLeftEdges = new Set<number>();
  if (config.columnGroups) {
    for (const grp of config.columnGroups) {
      groupLeftEdges.add(grp.startIdx);
      groupRightEdges.add(grp.endIdx);
    }
  }
  config.rows.forEach((row, rIdx) => {
    const xlsRow = ws.getRow(headerRowIdx + 1 + rIdx);
    xlsRow.height = 18;
    config.columns.forEach((col, cIdx) => {
      const cell = xlsRow.getCell(cIdx + 1);
      const v = col.value(row);
      if (v != null && v !== "") {
        cell.value = v as string | number | Date;
        if (col.format === "EUR") cell.numFmt = EUR_FMT;
        else if (col.format === "PCT") cell.numFmt = PCT_FMT;
        else if (col.format === "DATE") cell.numFmt = DATE_FMT;
      }
      // Fond colonne + zebra (lignes paires = teinte plus claire)
      const groupBg = colBgColor.get(cIdx);
      if (groupBg) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb: rIdx % 2 === 0 ? groupBg : whiterVariant(groupBg),
          },
        };
      } else if (rIdx % 2 === 0) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF9F9F9" },
        };
      }
      // Couleur de police personnalisée (ex: vert pour Total Recettes,
      // rouge pour Total Charges). Ne touche pas au gras qui se gère via
      // boldColumns.
      const customColor = colorMap[cIdx];
      const wantBold = boldSet.has(cIdx);
      cell.font = {
        ...cell.font,
        bold: wantBold || cell.font?.bold || false,
        color: customColor
          ? { argb: customColor }
          : wantBold
            ? { argb: "FF1A2540" }
            : cell.font?.color,
      };
      // Bordures latérales pour délimiter les groupes (séparateur épais
      // entre Identité / Billetterie / Recettes / Charges / Synthèse).
      const isLeftEdge = groupLeftEdges.has(cIdx);
      const isRightEdge = groupRightEdges.has(cIdx);
      if (isLeftEdge || isRightEdge) {
        cell.border = {
          ...cell.border,
          ...(isLeftEdge && cIdx > 0
            ? { left: { style: "medium", color: { argb: "FFAAAAAA" } } }
            : {}),
          ...(isRightEdge && cIdx < config.columns.length - 1
            ? { right: { style: "medium", color: { argb: "FFAAAAAA" } } }
            : {}),
        };
      }
      cell.alignment = {
        ...cell.alignment,
        vertical: "middle",
      };
    });
  });

  // ─── Ligne totaux ───
  if (config.totals && Object.keys(config.totals).length > 0) {
    const totalIdx = headerRowIdx + 1 + config.rows.length + 1;
    const totalRow = ws.getRow(totalIdx);
    totalRow.height = 22;
    totalRow.getCell(1).value = config.totalsLabel ?? "TOTAL";
    Object.entries(config.totals).forEach(([k, v]) => {
      const colIdx = parseInt(k, 10);
      const cell = totalRow.getCell(colIdx + 1);
      cell.value = v;
      const col = config.columns[colIdx];
      if (col?.format === "EUR") cell.numFmt = EUR_FMT;
      else if (col?.format === "PCT") cell.numFmt = PCT_FMT;
      else if (col?.format === "DATE") cell.numFmt = DATE_FMT;
    });
    // Style de base : gras + fond doré + bordure haute / basse
    totalRow.font = { bold: true, color: { argb: "FF1A2540" } };
    totalRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEEE6CC" },
    };
    for (let i = 1; i <= nCols; i++) {
      totalRow.getCell(i).border = {
        top: { style: "medium", color: { argb: "FFD4A93A" } },
        bottom: { style: "medium", color: { argb: "FFD4A93A" } },
      };
    }
    // Couleur de police personnalisée par colonne (ex: vert pour TOTAL
    // Recettes, rouge pour TOTAL Charges). Doit être appliquée APRÈS le
    // style de base ci-dessus pour gagner.
    for (const [k, color] of Object.entries(colorMap)) {
      const cell = totalRow.getCell(parseInt(k, 10) + 1);
      cell.font = {
        ...cell.font,
        bold: true,
        color: { argb: color },
      };
    }
    // Bordures latérales pour conserver la délimitation des groupes sur
    // la ligne TOTAL.
    config.columns.forEach((_, cIdx) => {
      const isLeft = groupLeftEdges.has(cIdx);
      const isRight = groupRightEdges.has(cIdx);
      if (isLeft || isRight) {
        const cell = totalRow.getCell(cIdx + 1);
        cell.border = {
          ...cell.border,
          ...(isLeft && cIdx > 0
            ? { left: { style: "medium", color: { argb: "FFAAAAAA" } } }
            : {}),
          ...(isRight && cIdx < config.columns.length - 1
            ? { right: { style: "medium", color: { argb: "FFAAAAAA" } } }
            : {}),
        };
      }
    });
  }

  // Freeze header (inclut la bande de groupes si présente)
  ws.views = [{ state: "frozen", ySplit: headerRowIdx }];

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${config.filename}.xlsx`,
  );
}

// ─────────────── HELPERS ───────────────

/** Convertit un index colonne (0-based) en lettre Excel : 0 → A, 25 → Z, 26 → AA. */
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

/** Slugify lowercase + ASCII pour les noms de fichier. */
export function slugifyForFilename(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Variante "pâle" d'une couleur argb : on garde l'alpha + applique un mix
 * vers le blanc pour adoucir le fond (utilisé entre groupes de colonnes).
 */
function paleVariant(argb: string): string {
  if (argb.length !== 8) return argb;
  const a = argb.substring(0, 2);
  const r = parseInt(argb.substring(2, 4), 16);
  const g = parseInt(argb.substring(4, 6), 16);
  const b = parseInt(argb.substring(6, 8), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.85);
  const toHex = (c: number) => c.toString(16).padStart(2, "0").toUpperCase();
  return `${a}${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

/** Encore plus pâle que paleVariant — pour les lignes "impaires" du zebra. */
function whiterVariant(argb: string): string {
  if (argb.length !== 8) return argb;
  const a = argb.substring(0, 2);
  const r = parseInt(argb.substring(2, 4), 16);
  const g = parseInt(argb.substring(4, 6), 16);
  const b = parseInt(argb.substring(6, 8), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.95);
  const toHex = (c: number) => c.toString(16).padStart(2, "0").toUpperCase();
  return `${a}${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

/** Date YYYY-MM-DD pour les noms de fichier. */
export function filenameDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Déclenche le téléchargement d'un Blob via un <a> jetable. */
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
