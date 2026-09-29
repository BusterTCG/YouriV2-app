import { describe, it, expect, vi } from "vitest";

/**
 * Régression (étape 2) : une date mise à la corbeille voit ses DealArtiste
 * partir aussi (cascade soft-delete). Le rattachement ne doit PAS alors la
 * détacher de sa production / résidence — sinon une restauration la remet
 * hors de sa résidence.
 */
const updates: unknown[] = [];
const recomputed: string[] = [];

vi.mock("@/lib/db", () => ({
  prisma: {
    deal: {
      findUnique: vi.fn(async () => ({
        id: "m1",
        category: "PROD_EXE",
        showName: "Insomniaque",
        productionId: "prd1",
        deletedAt: new Date(),
        residency: { id: "rsd1", productionId: "prd1" },
      })),
      update: vi.fn(async (args: unknown) => {
        updates.push(args);
        return {};
      }),
    },
    // Artiste principal introuvable (DealArtiste à la corbeille).
    dealArtiste: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/finance/show-financials", () => ({
  recomputeProductionFinancials: vi.fn(async (id: string) => {
    recomputed.push(id);
  }),
  recomputeShowFinancials: vi.fn(),
}));

describe("syncDealProductionLink — date en corbeille", () => {
  it("garde production et résidence, recalcule la production", async () => {
    const { syncDealProductionLink } = await import("@/lib/finance/production-link");
    await syncDealProductionLink("m1");
    expect(updates).toEqual([]);
    expect(recomputed).toEqual(["prd1"]);
  });
});
