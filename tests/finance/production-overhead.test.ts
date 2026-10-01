import { describe, it, expect } from "vitest";
import {
  allocateOverhead,
  computeShowScalars,
  dealPnl,
  performanceCountOf,
} from "@/lib/finance/production-overhead";

describe("performanceCountOf", () => {
  it("nombre de séances prioritaire (un doublé = 2 représentations)", () => {
    expect(performanceCountOf({ isMultiDate: false, performanceCount: 2, multiDateDates: null })).toBe(2);
  });
  it("legacy : date simple sans compteur = 1 représentation", () => {
    expect(performanceCountOf({ isMultiDate: false, performanceCount: null, multiDateDates: null })).toBe(1);
  });
  it("legacy : mois complet sans compteur = nombre de jours cochés", () => {
    expect(
      performanceCountOf({
        isMultiDate: true,
        performanceCount: null,
        multiDateDates: ["2026-09-03", "2026-09-04", "2026-09-05"],
      }),
    ).toBe(3);
  });
  it("mois complet sans jours → compteur manuel, sinon 1", () => {
    expect(performanceCountOf({ isMultiDate: true, performanceCount: 5, multiDateDates: null })).toBe(5);
    expect(performanceCountOf({ isMultiDate: true, performanceCount: null, multiDateDates: [] })).toBe(1);
  });
  it("toutes les séances annulées (compteur 0) → aucune représentation", () => {
    expect(performanceCountOf({ isMultiDate: false, performanceCount: 0, multiDateDates: null })).toBe(0);
    expect(
      performanceCountOf({ isMultiDate: true, performanceCount: 0, multiDateDates: ["2026-09-03"] }),
    ).toBe(0);
  });
});

describe("allocateOverhead — prorata des représentations", () => {
  it("carte SNCF lissée sur toutes les représentations (futures incluses)", () => {
    // Sept 8 repr., oct 10, nov 12 → 30 repr., 1 200 € → 40 €/repr.
    const a = allocateOverhead(
      [
        { id: "sept", status: "CONFIRME", performances: 8 },
        { id: "oct", status: "CONFIRME", performances: 10 },
        { id: "nov", status: "LEAD", performances: 12 },
      ],
      1200,
    );
    expect(a.perPerformance).toBe(40);
    expect(a.byDeal.get("sept")).toBe(320);
    expect(a.byDeal.get("oct")).toBe(400);
    expect(a.byDeal.get("nov")).toBe(480);
    expect(a.unallocated).toBe(0);
  });

  it("dates annulées exclues du prorata", () => {
    const a = allocateOverhead(
      [
        { id: "a", status: "CONFIRME", performances: 1 },
        { id: "b", status: "ANNULE", performances: 1 },
      ],
      300,
    );
    expect(a.byDeal.get("a")).toBe(300);
    expect(a.byDeal.get("b")).toBe(0);
  });

  it("somme des quotes-parts = total au centime (reliquat d'arrondi)", () => {
    const a = allocateOverhead(
      [
        { id: "a", status: "CONFIRME", performances: 1 },
        { id: "b", status: "CONFIRME", performances: 1 },
        { id: "c", status: "CONFIRME", performances: 1 },
      ],
      100,
    );
    const sum = [...a.byDeal.values()].reduce((s, v) => s + v, 0);
    expect(Math.round(sum * 100) / 100).toBe(100);
  });

  it("date soldée : quote-part figée, ajout de dates sans effet sur elle (Stan 2026-10-01)", () => {
    // Sept soldée à 320 € (1 200 € sur 30 repr.) ; on ajoute déc 10 repr.
    const a = allocateOverhead(
      [
        { id: "sept", status: "CONFIRME", performances: 8, frozenShare: 320 },
        { id: "oct", status: "CONFIRME", performances: 10 },
        { id: "nov", status: "CONFIRME", performances: 12 },
        { id: "dec", status: "CONFIRME", performances: 10 },
      ],
      1200,
    );
    expect(a.byDeal.get("sept")).toBe(320);
    // 880 € restants sur 32 repr. non soldées.
    expect(a.perPerformance).toBe(27.5);
    expect(a.byDeal.get("oct")).toBe(275);
    expect(a.byDeal.get("dec")).toBe(275);
    const sum = [...a.byDeal.values()].reduce((s, v) => s + v, 0);
    expect(Math.round(sum * 100) / 100).toBe(1200);
  });

  it("frais ajouté après coup : seules les dates non soldées le portent ; toutes soldées → non réparti", () => {
    const a = allocateOverhead(
      [
        { id: "sept", status: "CONFIRME", performances: 8, frozenShare: 320 },
        { id: "oct", status: "CONFIRME", performances: 10 },
      ],
      1500,
    );
    expect(a.byDeal.get("sept")).toBe(320);
    expect(a.byDeal.get("oct")).toBe(1180);
    const all = allocateOverhead([{ id: "sept", status: "CONFIRME", performances: 8, frozenShare: 320 }], 500);
    expect(all.byDeal.get("sept")).toBe(320);
    expect(all.unallocated).toBe(180);
  });

  it("aucune représentation active → frais non répartis", () => {
    const a = allocateOverhead([{ id: "a", status: "ANNULE", performances: 1 }], 500);
    expect(a.unallocated).toBe(500);
    expect(a.byDeal.get("a")).toBe(0);
  });
});

describe("computeShowScalars / dealPnl", () => {
  it("co-prod : partage du bénéfice après frais généraux", () => {
    const p = dealPnl(
      [
        { kind: "REVENUE", amount: 5000 },
        { kind: "COST", amount: 1000 },
      ],
      500,
      { artistShareKind: "COPROD", coprodKnPct: 20, prodExePct: null },
    );
    expect(p.margin).toBe(3500);
    expect(p.knAmount).toBe(700);
    expect(p.artistAmount).toBe(2800);
  });

  it("co-prod linéaire : somme des dates = partage sur le résultat global", () => {
    const c = { artistShareKind: "COPROD" as const, coprodKnPct: 20, prodExePct: null };
    const d1 = computeShowScalars(3000, 1000, c)!; // +2000
    const d2 = computeShowScalars(500, 1500, c)!; // −1000 (date à perte)
    const global = computeShowScalars(3500, 2500, c)!; // +1000
    expect(d1.knAmount + d2.knAmount).toBe(global.knAmount);
    expect(d1.artistAmount + d2.artistAmount).toBe(global.artistAmount);
  });

  it("prod-exé : KN sur le CA, frais généraux à la charge de l'artiste", () => {
    const s = computeShowScalars(10000, 4000, {
      artistShareKind: "PROD_EXE",
      coprodKnPct: null,
      prodExePct: 15,
    })!;
    expect(s.knAmount).toBe(1500);
    expect(s.artistAmount).toBe(4500);
  });

  it("mixte : prod-exé sur le CA puis co-prod sur le bénéfice restant", () => {
    // CA 10 000 − charges 4 000 = 6 000 ; prod-exé 10 % → 1 000 ; reste 5 000 ; co-prod 20 % → 1 000
    const s = computeShowScalars(10000, 4000, {
      artistShareKind: "PROD_EXE",
      prodExePct: 10,
      coprodKnPct: 20,
    })!;
    expect(s.knFee).toBe(1000);
    expect(s.profit).toBe(5000);
    expect(s.knShare).toBe(1000);
    expect(s.knAmount).toBe(2000);
    expect(s.artistAmount).toBe(4000);
  });

  it("sans modèle artiste → null", () => {
    expect(computeShowScalars(1000, 0, { artistShareKind: null, coprodKnPct: null, prodExePct: null })).toBeNull();
  });
});
