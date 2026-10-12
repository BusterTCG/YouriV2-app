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

describe("computeArtistAccount — frais avancés par l'artiste (Stan 2026-10-12)", () => {
  const deals = [d("sept", "2026-09-19", 1000), d("oct", "2026-10-17", 800, { collected: false })];

  it("dus tout de suite, même billetterie pas reçue, en plus de la quote-part", () => {
    const a = computeArtistAccount(deals, [], [{ amount: 120 }, { amount: 80 }]);
    expect(a.advances).toBe(200);
    expect(a.advancesDue).toBe(200);
    expect(a.quotePartBalance).toBe(1000);
    expect(a.balance).toBe(1200);
  });

  it("remboursés avec la quote-part : la part frais ne règle pas les dates", () => {
    const a = computeArtistAccount(
      deals,
      [{ kind: "PAYMENT", amount: 1100, advanceAmount: 200 }],
      [{ amount: 200 }],
    );
    expect(a.paid).toBe(900);
    expect(a.advancesPaid).toBe(200);
    expect(a.advancesDue).toBe(0);
    expect(a.balance).toBe(100);
    expect(a.statuses.get("sept")).toBe("TO_INVOICE"); // 900 < 1 000
  });

  it("remboursés par un versement séparé (EXPENSES)", () => {
    const a = computeArtistAccount(
      deals,
      [
        { kind: "EXPENSES", amount: 200 },
        { kind: "PAYMENT", amount: 1000 },
      ],
      [{ amount: 200 }],
    );
    expect(a.paid).toBe(1000);
    expect(a.advancesDue).toBe(0);
    expect(a.balance).toBe(0);
    expect(a.statuses.get("sept")).toBe("PAID");
  });

  it("artiste qui doit à Pangee : les frais avancés viennent en déduction", () => {
    const loss = [d("a", "2026-09-01", -500)];
    const a = computeArtistAccount(loss, [], [{ amount: 150 }]);
    expect(a.balance).toBe(-350);
  });
});

describe("computeArtistAccount — compensation et avance de trésorerie (Stan 2026-10-12)", () => {
  it("date en déficit compensée par une date positive suivante : les deux réglées", () => {
    const deals = [d("a", "2026-09-01", -300), d("b", "2026-09-08", 1000)];
    const a = computeArtistAccount(deals, [{ kind: "PAYMENT", amount: 700 }]);
    expect(a.balance).toBe(0);
    expect(a.statuses.get("a")).toBe("PAID");
    expect(a.statuses.get("b")).toBe("PAID");
  });

  it("date positive puis déficit : le versement du net règle les deux", () => {
    const deals = [d("a", "2026-09-01", 1000), d("b", "2026-09-08", -300)];
    const a = computeArtistAccount(deals, [{ kind: "PAYMENT", amount: 700 }]);
    expect(a.statuses.get("a")).toBe("PAID");
    expect(a.statuses.get("b")).toBe("PAID");
  });

  it("déficit à date avec des dates à venir", () => {
    const deals = [d("a", "2026-09-01", -300), d("b", "2026-12-01", 1000, { isPast: false, collected: false })];
    const a = computeArtistAccount(deals, []);
    expect(a.balance).toBe(-300);
    expect(a.upcoming).toBe(1);
  });

  it("avance de trésorerie : due à l'artiste, rendue avec la quote-part, sans régler de date", () => {
    const deals = [d("a", "2026-09-01", 1000)];
    const recv = computeArtistAccount(deals, [{ kind: "CASH_ADVANCE", amount: 500 }]);
    expect(recv.cashAdvances).toBe(500);
    expect(recv.advancesDue).toBe(500);
    expect(recv.balance).toBe(1500);
    expect(recv.statuses.get("a")).toBe("TO_INVOICE");
    const back = computeArtistAccount(deals, [
      { kind: "CASH_ADVANCE", amount: 500 },
      { kind: "PAYMENT", amount: 1500, advanceAmount: 500 },
    ]);
    expect(back.balance).toBe(0);
    expect(back.statuses.get("a")).toBe("PAID");
  });

  it("remboursement d'un déficit (REFUND) : solde l'exploitation", () => {
    const a = computeArtistAccount([d("a", "2026-09-01", -440)], [{ kind: "REFUND", amount: 440 }]);
    expect(a.balance).toBe(0);
    expect(a.advancesDue).toBe(0);
  });
});
