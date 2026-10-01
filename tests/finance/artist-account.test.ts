import { describe, it, expect } from "vitest";
import { computeArtistAccount, type AccountDeal } from "@/lib/finance/artist-account";

const d = (id: string, day: string, artistAmount: number, opts: Partial<AccountDeal> = {}): AccountDeal => ({
  id,
  date: new Date(`${day}T12:00:00Z`),
  isPast: true,
  cancelled: false,
  collected: true,
  artistAmount,
  ...opts,
});

describe("computeArtistAccount", () => {
  const deals = [
    d("sept", "2026-09-19", 1000),
    d("oct", "2026-10-17", 1500),
    d("nov", "2026-11-14", 800, { collected: false }), // jouée, billetterie pas reçue
    d("dec", "2026-12-12", 2000, { isPast: false, collected: false }), // à venir
  ];

  it("appelable = dates jouées ET encaissées", () => {
    const a = computeArtistAccount(deals, []);
    expect(a.acquired).toBe(3300);
    expect(a.callable).toBe(2500);
    expect(a.pendingCollection).toBe(800);
    expect(a.forecast).toBe(5300);
    expect(a.balance).toBe(2500);
  });

  it("versements → solde et statuts dérivés dans l'ordre des dates", () => {
    const a = computeArtistAccount(deals, [{ kind: "PAYMENT", amount: 1200 }]);
    expect(a.balance).toBe(1300);
    expect(a.statuses.get("sept")).toBe("PAID"); // 1 000 couvert
    expect(a.statuses.get("oct")).toBe("TO_INVOICE"); // cumul 2 500 > 1 200
    expect(a.statuses.get("nov")).toBe("TO_INVOICE"); // pas appelable
    expect(a.statuses.get("dec")).toBe("TO_INVOICE");
  });

  it("tout versé → dates appelables réglées, solde nul", () => {
    const a = computeArtistAccount(deals, [{ kind: "PAYMENT", amount: 2500 }]);
    expect(a.balance).toBe(0);
    expect(a.statuses.get("oct")).toBe("PAID");
  });

  it("date à perte : l'artiste doit, couvert par son remboursement", () => {
    const loss = [d("a", "2026-09-01", -500)];
    expect(computeArtistAccount(loss, []).balance).toBe(-500);
    const a = computeArtistAccount(loss, [{ kind: "REFUND", amount: 500 }]);
    expect(a.balance).toBe(0);
    expect(a.statuses.get("a")).toBe("PAID");
  });

  it("date annulée sans montant exclue", () => {
    const a = computeArtistAccount([d("x", "2026-09-01", 0, { cancelled: true })], []);
    expect(a.acquired).toBe(0);
    expect(a.forecast).toBe(0);
    expect(a.balance).toBe(0);
  });

  it("date annulée avec frais engagés comptée (même règle que le bilan)", () => {
    const a = computeArtistAccount([d("x", "2026-09-01", -300, { cancelled: true })], []);
    expect(a.acquired).toBe(-300);
    expect(a.balance).toBe(-300);
  });

  it("date en perte : réglée seulement quand l'artiste a remboursé", () => {
    const loss = [d("x", "2026-09-01", -500)];
    expect(computeArtistAccount(loss, []).statuses.get("x")).toBe("TO_INVOICE");
    expect(computeArtistAccount(loss, []).balance).toBe(-500);
    const refunded = computeArtistAccount(loss, [{ kind: "REFUND", amount: 500 }]);
    expect(refunded.statuses.get("x")).toBe("PAID");
    expect(refunded.balance).toBe(0);
  });
});

describe("computeArtistAccount — dates soldées (lot 3, Stan 2026-10-01)", () => {
  it("date soldée par un appel de quote-part : appelable et réglée même billetterie non reçue", () => {
    const deals = [
      d("sept", "2026-09-19", 1000, { collected: false, settled: true }),
      d("oct", "2026-10-17", 1500, { collected: false, settled: true }),
      d("nov", "2026-11-14", 800),
    ];
    const a = computeArtistAccount(deals, [{ kind: "PAYMENT", amount: 2500 }]);
    expect(a.callable).toBe(3300);
    expect(a.balance).toBe(800);
    expect(a.statuses.get("sept")).toBe("PAID");
    expect(a.statuses.get("oct")).toBe("PAID");
    // Le versement a été absorbé par les dates soldées : novembre reste à régler.
    expect(a.statuses.get("nov")).toBe("TO_INVOICE");
  });
});
