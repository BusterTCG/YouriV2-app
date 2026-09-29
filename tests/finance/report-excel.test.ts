import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildDealReportXlsx } from "@/lib/finance/deal-report-excel";
import { financeOf } from "@/lib/production-report";
import { dealPnl } from "@/lib/finance/production-overhead";
import type { DealReport } from "@/lib/deal-report";

/**
 * Compte de production Excel (portage KN) : le document ne contient QUE le
 * compte d'exploitation de la date — jamais de management fees (règle Stan
 * 2026-09-29) — et la ligne « Cachets artistes » (spécificité Youri).
 */
describe("compte de production Excel", () => {
  const contract = { artistShareKind: "PROD_EXE" as const, prodExePct: 15, coprodKnPct: 0 };
  const pnl = dealPnl(
    [
      { kind: "REVENUE", amount: 10000 },
      { kind: "COST", amount: 1000 },
      { kind: "COST", amount: 500 },
    ],
    0,
    contract,
  );
  const report: DealReport = {
    generatedAt: new Date("2026-09-29T12:00:00Z"),
    title: "Insomniaque",
    artistName: "Artiste Test 1",
    productionName: "Insomniaque",
    dateLabel: "Vendredi 6 février 2026",
    venueLabel: "Scenacle · Besançon",
    statusLabel: "Confirmé",
    rates: { pe: 15, cp: 0 },
    contractLabel: "Prod-exé : Pangee 15 % du chiffre d'affaires",
    audience: { performances: 1, capacity: 150, paying: 120, invited: 5, fillRate: 80, ticketMoyen: 83 },
    finance: financeOf([{ byLabel: { RECETTE_HT: 10000, LOCATION: 1000 }, pnl, cachets: 500 }]),
    kpis: { fillRate: 80, paying: 120, capacity: 150, ticketAvg: 83, played: 0, planned: 1, resultPerPerf: 8500, scope: "all" },
    lines: [
      { kind: "REVENUE", poste: "Billetterie HT", detail: null, amount: 10000, statusLabel: "Encaissé", paidAt: null, comment: null },
      { kind: "COST", poste: "Location salle", detail: null, amount: 1000, statusLabel: "Payé", paidAt: null, comment: null },
      { kind: "COST", poste: "Cachet artiste", detail: "Artiste Test 1", amount: 500, statusLabel: "Payé", paidAt: null, comment: null },
    ],
    fileBase: "Compte de production - test",
  };

  it("contient le compte d'exploitation et les cachets, sans management fees", async () => {
    const buf = await buildDealReportXlsx(report);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const texts: string[] = [];
    wb.eachSheet((ws) =>
      ws.eachRow((row) => row.eachCell((c) => texts.push(String(c.value ?? "")))),
    );
    const all = texts.join(" | ");
    expect(all).toContain("Cachets artistes");
    expect(all).toContain("Rémunération prod-exé Pangee");
    expect(all).not.toMatch(/management|mgmt|marge nette|apport d'affaires|travail effectif/i);
    expect(all).not.toMatch(/Kuro Neko/i);
  });
});
