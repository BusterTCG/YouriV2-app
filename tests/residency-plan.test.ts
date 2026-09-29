import { describe, it, expect } from "vitest";
import { groupPlanByMonth, planKey, planResidency } from "@/lib/residency-plan";

describe("planResidency", () => {
  it("vendredis + samedis de septembre à décembre, une séance par soir", () => {
    const p = planResidency({
      startDay: "2026-09-18",
      endDay: "2026-12-19",
      weekdays: [5, 6],
      times: ["19:30"],
    });
    expect(p[0]).toEqual({ day: "2026-09-18", time: "19:30" }); // vendredi
    expect(p[1]).toEqual({ day: "2026-09-19", time: "19:30" }); // samedi
    expect(p.every((x) => [5, 6].includes(new Date(`${x.day}T12:00:00Z`).getUTCDay()))).toBe(true);
    const months = groupPlanByMonth(p).map((m) => m.month);
    expect(months).toEqual(["2026-09", "2026-10", "2026-11", "2026-12"]);
  });

  it("doublé : 2 séances le même soir", () => {
    const p = planResidency({
      startDay: "2026-10-03",
      endDay: "2026-10-03",
      weekdays: [6],
      times: ["19:30", "21:30"],
    });
    expect(p).toEqual([
      { day: "2026-10-03", time: "19:30" },
      { day: "2026-10-03", time: "21:30" },
    ]);
  });

  it("séances décochées exclues", () => {
    const p = planResidency({
      startDay: "2026-10-01",
      endDay: "2026-10-31",
      weekdays: [5],
      times: ["20:00"],
      excluded: [planKey({ day: "2026-10-09", time: "20:00" })],
    });
    expect(p.map((x) => x.day)).toEqual(["2026-10-02", "2026-10-16", "2026-10-23", "2026-10-30"]);
  });

  it("période invalide ou aucun jour → rien", () => {
    expect(planResidency({ startDay: "2026-10-10", endDay: "2026-10-01", weekdays: [5], times: [] })).toEqual([]);
    expect(planResidency({ startDay: "2026-10-01", endDay: "2026-10-10", weekdays: [], times: [] })).toEqual([]);
  });
});
