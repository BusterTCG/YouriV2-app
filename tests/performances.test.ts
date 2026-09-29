import { describe, it, expect } from "vitest";
import { dayToUtcNoon, performanceTotals } from "@/lib/performances";

/** Séances = source de vérité des totaux d'une date (portage KN, étape 2). */
describe("performanceTotals", () => {
  const p = (o: Partial<Parameters<typeof performanceTotals>[0][number]>) => ({
    cancelled: false,
    capacity: null,
    paying: null,
    invited: null,
    grossTicketing: null,
    ...o,
  });

  it("somme les séances non annulées, jauge de la date par défaut", () => {
    const t = performanceTotals(
      [p({ paying: 20, grossTicketing: 300 }), p({ paying: 25, capacity: 40, grossTicketing: 375 }), p({ paying: 99, cancelled: true })],
      30,
    );
    expect(t).toEqual({ count: 2, capacity: 70, paying: 45, invited: null, grossTicketing: 675 });
  });

  it("toutes les séances annulées → 0 représentation", () => {
    const t = performanceTotals([p({ cancelled: true }), p({ cancelled: true })], 30);
    expect(t.count).toBe(0);
    expect(t.capacity).toBeNull();
  });

  it("rien de saisi → null (le cumul historique est conservé)", () => {
    expect(performanceTotals([p({})], null).paying).toBeNull();
  });

  it("jour → UTC midi", () => {
    expect(dayToUtcNoon("2026-10-03").toISOString()).toBe("2026-10-03T12:00:00.000Z");
  });
});
