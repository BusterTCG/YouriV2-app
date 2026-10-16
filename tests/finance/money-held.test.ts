import { describe, it, expect } from "vitest";
import { heldOnDeal, receivedRatio, withVat, type HeldDealInput } from "@/lib/finance/money-held";

const deal = (opts: Partial<HeldDealInput> = {}): HeldDealInput => ({
  expected: 10000,
  received: 10000,
  artists: [{ amount: 6000, status: "TO_INVOICE" }],
  charges: [{ amount: 500, status: "TO_INVOICE" }],
  fees: [{ amount: 300, status: "N_A" }],
  ...opts,
});

describe("heldOnDeal", () => {
  it("budget reçu, rien versé → artistes, charges et MF à reverser", () => {
    expect(heldOnDeal(deal())).toEqual({ artists: 6000, charges: 500, fees: 300 });
  });

  it("tout ce qui est « Payé » sort du total", () => {
    const held = heldOnDeal(
      deal({
        artists: [
          { amount: 6000, status: "PAID" },
          { amount: 1000, status: "INVOICED" },
        ],
        charges: [{ amount: 500, status: "PAID" }],
        fees: [{ amount: 300, status: "PAID" }],
      }),
    );
    expect(held).toEqual({ artists: 1000, charges: 0, fees: 0 });
  });

  it("rien de reçu → rien sur le compte", () => {
    expect(heldOnDeal(deal({ received: 0 }))).toEqual({ artists: 0, charges: 0, fees: 0 });
  });

  it("acompte de 50 % reçu → 50 % de chaque versement", () => {
    expect(heldOnDeal(deal({ received: 5000 }))).toEqual({ artists: 3000, charges: 250, fees: 150 });
  });

  it("montant vide ou nul → jamais dû", () => {
    const held = heldOnDeal(deal({ artists: [{ amount: null, status: "TO_INVOICE" }], charges: [], fees: [] }));
    expect(held).toEqual({ artists: 0, charges: 0, fees: 0 });
  });
});

describe("receivedRatio", () => {
  it("plafonné à 100 %, 0 sans montant attendu", () => {
    expect(receivedRatio(1000, 1200)).toBe(1);
    expect(receivedRatio(0, 500)).toBe(0);
  });
});

describe("withVat", () => {
  it("TVA indicative à 20 %", () => {
    expect(withVat(1000)).toEqual({ vat: 200, ttc: 1200 });
  });
});
