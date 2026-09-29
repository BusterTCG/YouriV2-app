import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Management fees d'une date de production (refonte Production 2026-09-29) :
 * la base = part Pangee de la date (`Deal.commissionAmount` = prod-exé % du
 * CA + co-prod % du bénéfice, frais généraux inclus). Les lignes déjà payées
 * gardent leur montant (snapshot du virement réel).
 */
const updates: Array<{ id: string; amount: number }> = [];
const dealRow = {
  category: "PROD_EXE",
  budgetAmount: null,
  commissionAmount: 2150,
  cachetsFeesPct: null,
  linkedToOwnProd: false,
  dealArtistes: [],
  dealCharges: [],
  managementFees: [
    { id: "apport-stan", sharePct: 10, paymentStatus: "TO_INVOICE" },
    { id: "work-certe", sharePct: 7.5, paymentStatus: "N_A" },
    { id: "work-angath", sharePct: 7.5, paymentStatus: "PAID" },
  ],
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    deal: { findUnique: vi.fn(async () => dealRow) },
    dealManagementFee: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { amount: number } }) => {
        updates.push({ id: where.id, amount: data.amount });
        return {};
      }),
    },
  },
}));

describe("recomputeMfForDeal — date de production", () => {
  beforeEach(() => {
    updates.length = 0;
  });

  it("calcule les fees sur la part Pangee et fige les lignes payées", async () => {
    const { recomputeMfForDeal } = await import("@/lib/management-fees-recompute");
    await recomputeMfForDeal("deal-1");
    expect(updates).toEqual([
      { id: "apport-stan", amount: 215 },
      { id: "work-certe", amount: Math.round(2150 * 0.075) },
    ]);
  });

  it("part Pangee ≤ 0 → fees à 0", async () => {
    dealRow.commissionAmount = -300;
    const { recomputeMfForDeal } = await import("@/lib/management-fees-recompute");
    await recomputeMfForDeal("deal-1");
    expect(updates.map((u) => u.amount)).toEqual([0, 0]);
    dealRow.commissionAmount = 2150;
  });
});
