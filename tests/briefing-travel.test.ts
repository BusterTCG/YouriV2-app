import { describe, it, expect } from "vitest";
import { parseRuns, parseTravelers, travelersLabel } from "@/lib/briefing-travel";

describe("parseRuns", () => {
  it("lit le format départ / arrivée", () => {
    expect(parseRuns([{ from: "GARE", to: "HÔTEL", time: "10:00" }], "OUTBOUND")).toEqual([
      { from: "GARE", to: "HÔTEL", time: "10:00" },
    ]);
  });

  it("reprend l'ancien format { location } selon le sens du trajet", () => {
    const legacy = [{ location: "HÔTEL", time: "09:00" }];
    expect(parseRuns(legacy, "OUTBOUND")).toEqual([{ from: "", to: "HÔTEL", time: "09:00" }]);
    expect(parseRuns(legacy, "RETURN")).toEqual([{ from: "HÔTEL", to: "", time: "09:00" }]);
    expect(parseRuns(legacy, "INTER")).toEqual([{ from: "", to: "HÔTEL", time: "09:00" }]);
  });

  it("ignore un JSON absent ou invalide", () => {
    expect(parseRuns(null, "OUTBOUND")).toEqual([]);
    expect(parseRuns([null, 3], "OUTBOUND")).toEqual([]);
  });
});

describe("parseTravelers", () => {
  it("garde artistes du deal et noms libres, écarte les noms vides", () => {
    const t = parseTravelers([
      { artistId: "a1", name: "Boriss" },
      { name: "  Jean  " },
      { name: "" },
      "x",
    ]);
    expect(t).toEqual([{ artistId: "a1", name: "Boriss" }, { name: "Jean" }]);
    expect(travelersLabel(t)).toBe("Boriss, Jean");
  });

  it("null = tout le monde (aucun nom)", () => {
    expect(parseTravelers(null)).toEqual([]);
    expect(travelersLabel([])).toBe("");
  });
});
