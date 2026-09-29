import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { financeOf } from "@/lib/production-report";
import { dealPnl } from "@/lib/finance/production-overhead";

/**
 * Règle Stan (2026-09-29) : les management fees sont une tambouille interne
 * Pangee. Elles ne doivent JAMAIS apparaître dans les bilans d'exploitation,
 * les comptes de production, les exports PDF / Excel ni le compte artiste —
 * uniquement dans les écrans internes (fiche date, page Management fees,
 * dashboard / reporting).
 *
 * Garde statique : aucun module qui alimente ces sorties ne lit les
 * management fees. Tout nouveau fichier de bilan / export / compte artiste
 * doit être ajouté à REPORT_SOURCES.
 */
const ROOT = path.resolve(__dirname, "../..");

const REPORT_SOURCES = [
  "lib/productions.ts",
  "lib/production-report.ts",
  "lib/finance/production-overhead.ts",
  "components/shows",
  "app/(app)/shows/production",
  "app/(app)/shows/residence",
  "lib/performances.ts",
  "lib/residency-plan.ts",
  "lib/finance/deposits.ts",
  "lib/finance/artist-account.ts",
  "lib/finance/artist-account-server.ts",
  "lib/actions/artist-movements.ts",
  "lib/production-report-server.ts",
  "lib/deal-report.ts",
  "lib/finance/report-excel-kit.ts",
  "lib/finance/production-report-excel.ts",
  "lib/finance/deal-report-excel.ts",
  "lib/pdf/report-response.ts",
  "app/print/production",
  "app/print/compte",
  "app/api/production-report",
  "app/api/financial-export",
];

const FORBIDDEN = /managementFee|DealManagementFee|management-fees|ManagementFee|margeNette|totalMf/i;

function filesOf(rel: string): string[] {
  const abs = path.join(ROOT, rel);
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs, { recursive: true })
    .map((f) => path.join(abs, String(f)))
    .filter((f) => /\.(ts|tsx)$/.test(f) && statSync(f).isFile());
}

describe("management fees absentes des bilans / exports / compte artiste", () => {
  const files = REPORT_SOURCES.flatMap(filesOf);

  it("couvre bien des fichiers", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const rel of REPORT_SOURCES) {
    it(`${rel} ne référence pas les management fees`, () => {
      for (const f of filesOf(rel)) {
        const src = readFileSync(f, "utf8")
          // Les commentaires qui rappellent la règle sont autorisés.
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/.*$/gm, "");
        expect(src, path.relative(ROOT, f)).not.toMatch(FORBIDDEN);
      }
    });
  }

  it("le compte d'exploitation ne dépend que des lignes, cachets, frais généraux et contrat", () => {
    const contract = { artistShareKind: "PROD_EXE" as const, prodExePct: 15, coprodKnPct: 0 };
    const date = {
      byLabel: { RECETTE_HT: 10000, SACD: 1000 },
      cachets: 500,
      pnl: dealPnl(
        [
          { kind: "REVENUE", amount: 10000 },
          { kind: "COST", amount: 1000 },
          { kind: "COST", amount: 500 },
        ],
        300,
        contract,
      ),
    };
    const f = financeOf([date]);
    // Part Pangee = 15 % du CA, sans aucune déduction de management fees.
    expect(f.kn).toBe(1500);
    expect(f.knFee).toBe(1500);
    // Net artiste = CA − charges (1 000 + 500 cachets) − frais gén. 300 − prod-exé.
    expect(f.artist).toBe(10000 - 1500 - 300 - 1500);
    expect(f.cachets).toBe(500);
    expect(f.overhead).toBe(300);
    expect(f.totalCost).toBe(1500 + 300 + 1500);
    expect(Object.keys(f)).not.toContain("managementFees");
  });
});
