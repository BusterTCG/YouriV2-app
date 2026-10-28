// @vitest-environment node
//
// Booking : changer le CA recalcule les artistes au % du CA (Stan 2026-10-27).
// Un artiste ou un management fee déjà payé garde son montant (= virement
// réel) ; l'écart s'affiche côté UI comme complément à verser.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = mkdtempSync(path.join(os.tmpdir(), "youri-budget-"));
const dbUrl = `file:${path.join(tmp, "budget.db").split(path.sep).join("/")}`;
process.env.DATABASE_URL = dbUrl;

const STAN = {
  id: "u-stan",
  email: "stan@pangeeprod.com",
  name: "Stan",
  role: "ADMIN" as const,
  color: "#7c3aed",
  active: true,
  pangeeKey: "stan",
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/auth/users", () => ({
  getCurrentUser: vi.fn(async () => STAN),
  requireUser: vi.fn(async () => STAN),
  requireAdmin: vi.fn(async () => STAN),
  isAdmin: vi.fn(async () => true),
}));

type Res<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };
function ok<T>(r: Res<T>): T {
  if (!r.ok) throw new Error(`Action en échec : ${r.error}`);
  return r.data as T;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any;
let A: any, MF: any;
/* eslint-enable @typescript-eslint/no-explicit-any */

beforeAll(async () => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: dbUrl }, stdio: "pipe" });
  ({ prisma } = await import("@/lib/db"));
  A = await import("@/lib/actions/deals");
  MF = await import("@/lib/actions/management-fees");
  await prisma.user.create({ data: { ...STAN, passwordHash: "x" } });
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(tmp, { recursive: true, force: true });
});

describe("Booking — changement de CA", () => {
  it("le cachet au % suit le CA ; artiste et MF payés restent figés", async () => {
    const a1 = (await prisma.artist.create({ data: { name: "A1", slug: "a1" } })).id;
    const a2 = (await prisma.artist.create({ data: { name: "A2", slug: "a2" } })).id;
    const dealId = ok<{ id: string }>(
      await A.createDeal({ category: "BOOKING", title: "Booking", date: new Date("2026-11-10") }),
    ).id;
    ok(await A.updateDealBudget({ dealId, amount: 10000 }));
    const open = ok<{ id: string }>(await A.addDealArtist({ dealId, artistId: a1, cachetAmount: 3500, sharePct: 35 })).id;
    const paid = ok<{ id: string }>(await A.addDealArtist({ dealId, artistId: a2, cachetAmount: 1000, sharePct: 10 })).id;
    ok(await A.updateDealArtiste({ id: paid, paymentStatus: "PAID" }));

    // Marge = 10000 − 3500 − 1000 = 5500 → Nour 15 % = 825, payé.
    ok(await MF.setManagementFeePool({ dealId, role: "WORK", poolPct: 15, associateKeys: ["nour"], margeYouri: 5500 }));
    const fee = await prisma.dealManagementFee.findFirst({ where: { dealId, associateKey: "nour" } });
    expect(Number(fee.amount)).toBe(825);
    ok(await MF.updateManagementFee({ id: fee.id, isPaye: true }));

    ok(await A.updateDealBudget({ dealId, amount: 12000 }));

    const rows = await prisma.dealArtiste.findMany({ where: { dealId } });
    const byId = new Map(rows.map((r: { id: string }) => [r.id, r]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(Number((byId.get(open) as any).cachetAmount)).toBe(4200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(Number((byId.get(paid) as any).cachetAmount)).toBe(1000);
    // MF payé : montant figé (le complément s'affiche côté UI).
    expect(Number((await prisma.dealManagementFee.findUnique({ where: { id: fee.id } })).amount)).toBe(825);
  });
});
