// @vitest-environment node
//
// Profil « Production » (Nour, booking@pangeeprod.com — portage du profil
// Nour KN, Stan 2026-09-30) : gardes des server actions sur une base SQLite
// temporaire construite par les vraies migrations.
//
// Nour : deals Production (accès total), Artistes / Contacts / Lieux, ses
// tâches, ses MF en lecture. Refusé : Booking, Cachets, paiements MF,
// corbeille (restaurer / supprimer définitivement), templates, tâches des
// autres.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = mkdtempSync(path.join(os.tmpdir(), "youri-acl-"));
const dbUrl = `file:${path.join(tmp, "acl.db").split(path.sep).join("/")}`;
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
const NOUR = {
  id: "u-nour",
  email: "nour-test@pangeeprod.com",
  name: "Nour",
  role: "PRODUCTION" as const,
  color: "#ec4899",
  active: true,
  pangeeKey: "nour",
};
let current: typeof STAN | typeof NOUR = STAN;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/auth/users", () => ({
  getCurrentUser: vi.fn(async () => current),
  requireUser: vi.fn(async () => current),
  requireAdmin: vi.fn(async () => current),
  isAdmin: vi.fn(async () => current.role === "ADMIN"),
}));

type Res<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };
function ok<T>(r: Res<T>): T {
  if (!r.ok) throw new Error(`Action en échec : ${r.error}`);
  return r.data as T;
}
function denied(r: Res) {
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toMatch(/Accès non autorisé|deals Production/);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any;
let A: any, TK: any, MF: any, C: any, TT: any, AR: any, BR: any, PL: any, ACC: any, SST: any;
/* eslint-enable @typescript-eslint/no-explicit-any */

let artist = "";
let booking = "";
let prod = "";

beforeAll(async () => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: dbUrl }, stdio: "pipe" });
  ({ prisma } = await import("@/lib/db"));
  A = await import("@/lib/actions/deals");
  TK = await import("@/lib/actions/tasks");
  MF = await import("@/lib/actions/management-fees");
  C = await import("@/lib/actions/cachets");
  TT = await import("@/lib/actions/task-templates");
  AR = await import("@/lib/actions/artists");
  BR = await import("@/lib/actions/briefings");
  PL = await import("@/lib/actions/production-lines");
  ACC = await import("@/lib/auth/access");
  SST = await import("@/lib/actions/sync-show-tasks");

  await prisma.user.create({ data: { ...STAN, passwordHash: "x" } });
  await prisma.user.create({ data: { ...NOUR, passwordHash: "x" } });
  artist = (await prisma.artist.create({ data: { name: "Sossam", slug: "sossam" } })).id;
  current = STAN;
  booking = ok<{ id: string }>(
    await A.createDeal({ category: "BOOKING", title: "Booking", date: new Date("2026-11-10"), initialArtistId: artist }),
  ).id;
  prod = ok<{ id: string }>(
    await A.createDeal({
      category: "PROD_EXE",
      title: "Sossam - Rêve @ Dix Heures",
      date: new Date("2026-11-14"),
      status: "CONFIRME",
      initialArtistId: artist,
      showName: "Rêve",
      venueDealKind: "PROD",
      prodExePct: 15,
    }),
  ).id;
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(tmp, { recursive: true, force: true });
});

describe("profil « Production » (Nour) — gardes serveur", () => {
  it("la migration crée le compte booking@pangeeprod.com (Nour, PRODUCTION, mot de passe inutilisable)", async () => {
    const u = await prisma.user.findUnique({ where: { email: "booking@pangeeprod.com" } });
    expect(u).toMatchObject({ name: "Nour", role: "PRODUCTION", pangeeKey: "nour", active: true });
    expect(u.passwordHash).toMatch(/^\$2[ab]\$10\$/);
  });

  it("deals : Production oui, Booking / Cachets non", async () => {
    current = NOUR;
    denied(await A.createDeal({ category: "BOOKING", title: "X", date: new Date("2026-12-01") }));
    denied(await A.createDeal({ category: "CACHETS", title: "X", date: new Date("2026-12-01") }));
    const created = ok<{ id: string }>(
      await A.createDeal({
        category: "PROD_EXE",
        title: "Sossam - Rêve @ Lyon",
        date: new Date("2026-12-05"),
        initialArtistId: artist,
        showName: "Rêve",
        venueDealKind: "PROD",
      }),
    );
    expect(created.id).toBeTruthy();

    denied(await A.setDealStatus({ dealId: booking, status: "CONFIRME" }));
    ok(await A.setDealStatus({ dealId: prod, status: "EN_COURS" }));
    denied(await A.updateDealMeta({ id: booking, title: "Piraté" }));
    denied(await A.addDealCharge({ dealId: booking, label: "Frais", amount: 10 }));
    denied(await A.softDeleteDeal(booking));
    expect(await ACC.canAccessDeal(booking)).toBe(false);
    expect(await ACC.canAccessDeal(prod)).toBe(true);
    expect((await prisma.deal.findUnique({ where: { id: booking } })).title).toBe("Booking");
  });

  it("FDR, lignes de production, suivi : deals Production uniquement", async () => {
    current = NOUR;
    denied(await BR.ensureBriefingWithPrefill(booking));
    ok(await BR.ensureBriefingWithPrefill(prod));
    denied(await PL.addEmptyProductionLine({ dealId: booking, kind: "COST", label: "TECH" }));
    denied(await SST.syncShowTaskToggle(booking, "contractSigned", true));
  });

  it("corbeille : Nour met à la corbeille une date Production, seuls les associés restaurent", async () => {
    current = NOUR;
    ok(await A.softDeleteDeal(prod));
    denied(await A.restoreDeal(prod));
    denied(await A.permanentlyDeleteDeal(prod));
    current = STAN;
    ok(await A.restoreDeal(prod));
  });

  it("management fees : Nour est bénéficiaire mais ne modifie rien (paiements faits par les associés)", async () => {
    current = STAN;
    ok(await MF.setManagementFeePool({ dealId: prod, role: "WORK", poolPct: 10, associateKeys: ["nour"], margeYouri: 1000 }));
    const fee = await prisma.dealManagementFee.findFirst({ where: { dealId: prod, associateKey: "nour" } });
    expect(fee).toBeTruthy();
    current = NOUR;
    denied(await MF.updateManagementFee({ id: fee.id, isPaye: true }));
    denied(await MF.setManagementFeePool({ dealId: prod, role: "WORK", poolPct: 50, associateKeys: ["nour"], margeYouri: 1000 }));
    expect((await prisma.dealManagementFee.findUnique({ where: { id: fee.id } })).paymentStatus).not.toBe("PAID");
  });

  it("tâches : uniquement celles qui lui sont assignées", async () => {
    current = STAN;
    const mine = await prisma.task.create({ data: { dealId: prod, label: "Tâche Nour", order: 50, assigneeKey: "nour" } });
    const other = await prisma.task.create({ data: { dealId: prod, label: "Tâche Stan", order: 99, assigneeKey: "stan" } });

    current = NOUR;
    ok(await TK.markTaskDone(mine.id));
    ok(await TK.markTaskTodo(mine.id));
    ok(await TK.updateTask({ id: mine.id, notes: "OK" }));
    denied(await TK.updateTask({ id: mine.id, assigneeKey: "stan" }));
    denied(await TK.markTaskDone(other.id));
    denied(await TK.updateTask({ id: other.id, notes: "x" }));
    denied(await TK.addTaskToDeal({ dealId: prod, label: "Nouvelle" }));
    denied(await TK.softDeleteTask(mine.id));
  });

  it("réservé aux associés : Cachets, templates de tâches, corbeille artistes", async () => {
    current = NOUR;
    denied(await C.addCachetPrestation({ dealId: booking, prestataire: "X", amount: 100 }));
    denied(await TT.createTaskTemplate({ category: "PROD_EXE", label: "X" }));
    denied(await AR.restoreArtist(artist));
    denied(await AR.permanentlyDeleteArtist(artist));
  });

  it("artistes : accès total (création)", async () => {
    current = NOUR;
    ok(await AR.createArtist({ name: "Nouvel artiste" }));
    expect(await prisma.artist.findFirst({ where: { name: "Nouvel artiste" } })).toBeTruthy();
  });
});
