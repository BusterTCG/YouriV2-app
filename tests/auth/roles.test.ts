import { describe, it, expect } from "vitest";
import { canAccessPath, homeFor, isRestrictedRole } from "@/lib/auth/roles";

// Profil « Production » (Nour — portage du profil Nour KN, Stan 2026-09-30).
describe("rôles et chemins", () => {
  it("associés : tout est accessible, arrivée sur le dashboard", () => {
    for (const role of ["ADMIN", "MEMBER"]) {
      expect(isRestrictedRole(role)).toBe(false);
      expect(homeFor(role)).toBe("/dashboard");
      for (const p of ["/dashboard", "/deals/booking", "/reporting", "/trash", "/settings"]) {
        expect(canAccessPath(role, p)).toBe(true);
      }
    }
  });

  it("Nour : Productions, Booking, MF, Artistes, Contacts, Lieux, Tâches, impressions", () => {
    expect(isRestrictedRole("PRODUCTION")).toBe(true);
    expect(homeFor("PRODUCTION")).toBe("/shows");
    for (const p of [
      "/shows",
      "/shows/abc",
      "/shows/abc/briefing",
      "/shows/production/xyz",
      "/deals/management-fees",
      "/deals/booking",
      "/deals/booking/abc",
      "/deals/booking/abc/fdr",
      "/artistes",
      "/artistes/sossam",
      "/contacts",
      "/lieux",
      "/taches",
      "/print/fdr/abc",
      "/api/production-report/xyz",
      "/api/financial-export/abc",
      "/api/fdr-pdf/abc",
    ]) {
      expect(canAccessPath("PRODUCTION", p), p).toBe(true);
    }
  });

  it("Nour : pas de dashboard, Cachets, reporting, corbeille ni réglages", () => {
    for (const p of [
      "/",
      "/dashboard",
      "/deals",
      "/deals/bookingx",
      "/deals/cachets",
      "/reporting",
      "/trash",
      "/settings",
      "/settings/users",
      "/showsx",
      "/artistesx",
    ]) {
      expect(canAccessPath("PRODUCTION", p), p).toBe(false);
    }
  });
});
