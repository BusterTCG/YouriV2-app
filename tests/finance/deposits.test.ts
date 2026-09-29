import { describe, it, expect } from "vitest";
import { depositState, totalToRecover } from "@/lib/finance/deposits";

describe("acompte salle = caution", () => {
  it("non récupéré → montant entier à récupérer", () => {
    expect(depositState({ amount: 3000, refundedAt: null })).toEqual({ toRecover: 3000, recovered: false });
  });

  it("récupéré → plus rien à récupérer", () => {
    expect(depositState({ amount: 3000, refundedAt: new Date() })).toEqual({ toRecover: 0, recovered: true });
  });

  it("total à récupérer = acomptes non récupérés", () => {
    expect(
      totalToRecover([
        { amount: 3000, refundedAt: null },
        { amount: 1500, refundedAt: new Date() },
        { amount: 500, refundedAt: null },
      ]),
    ).toBe(3500);
  });
});
