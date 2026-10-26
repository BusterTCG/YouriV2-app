import { describe, expect, it } from "vitest";
import { dateStage, hasOpenMoney } from "@/lib/date-lifecycle";

const base = {
  status: "CONFIRMED",
  isPast: true,
  settled: false,
  openMoney: false,
  contractSigned: true,
  ticketingReady: true,
  vhrBooked: true,
};

describe("dateStage — date soldée (Stan 2026-10-26)", () => {
  it("quote-part versée et tout réglé → Soldée", () => {
    expect(dateStage({ ...base, settled: true })).toBe("SOLDEE");
  });
  it("quote-part versée mais charges à payer / recettes à encaisser → À solder", () => {
    expect(dateStage({ ...base, settled: true, openMoney: true })).toBe("A_SOLDER");
  });
  it("tout réglé sans appel de quote-part → À solder", () => {
    expect(dateStage(base)).toBe("A_SOLDER");
  });
  it("reste arrondi à l'euro", () => {
    expect(hasOpenMoney(0.3, -0.2)).toBe(false);
    expect(hasOpenMoney(0, 120)).toBe(true);
  });
});
