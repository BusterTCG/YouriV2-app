// @vitest-environment node
//
// Resynchro quotidienne des statuts artiste (portage KN, Stan 2026-09-30).
// Cas : billetterie encaissée et part artiste versée le soir même du
// spectacle. Au moment de la saisie, la date n'est pas encore « jouée »
// (isPast = lendemain) → statut « En cours ». Le lendemain, la 1re page
// ouverte resynchronise → « Payé », sans aucune modification.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { localDayKey } from "@/lib/finance/artist-status-daily";

const tmp = mkdtempSync(path.join(os.tmpdir(), "youri-status-"));
const dbUrl = `file:${path.join(tmp, "status.db").split(path.sep).join("/")}`;
process.env.DATABASE_URL = dbUrl;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any;
let S: any;
/* eslint-enable @typescript-eslint/no-explicit-any */

// Spectacle le 17/10/2026 à 20h (heure locale), saisies à 23h le soir même.
const SHOW_DAY = new Date(2026, 9, 17, 12);
const SAME_EVENING = new Date(2026, 9, 17, 23);
const NEXT_MORNING = new Date(2026, 9, 18, 9);

let dealId = "";
let productionId = "";

beforeAll(async () => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: dbUrl }, stdio: "pipe" });
  ({ prisma } = await import("@/lib/db"));
  S = await import("@/lib/finance/artist-account-server");

  const artist = await prisma.artist.create({ data: { name: "Sossam", slug: "sossam" } });
  const prod = await prisma.production.create({
    data: { artistId: artist.id, name: "Un Rêve Magique", artistShareKind: "PROD_EXE", prodExePct: 15, coprodKnPct: 0 },
  });
  productionId = prod.id;
  const deal = await prisma.deal.create({
    data: {
      category: "PROD_EXE",
      title: "Sossam - Un Rêve Magique @ Lyon",
      date: SHOW_DAY,
      status: "CONFIRME",
      productionId,
      artistAmount: 850,
      artistStatus: "N_A",
    },
  });
  dealId = deal.id;
  await prisma.performance.create({ data: { dealId, date: SHOW_DAY } });
  await prisma.productionLine.create({
    data: { dealId, kind: "REVENUE", label: "RECETTE_HT", amount: 1000, paymentStatus: "PAID" },
  });
  await prisma.artistMovement.create({
    data: { productionId, kind: "PAYMENT", amount: 850, date: SAME_EVENING },
  });
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(tmp, { recursive: true, force: true });
});

async function status() {
  return (await prisma.deal.findUnique({ where: { id: dealId } })).artistStatus;
}

describe("statuts artiste — resynchro quotidienne", () => {
  it("jour local du serveur", () => {
    expect(localDayKey(new Date(2026, 8, 30, 23, 59))).toBe("2026-09-30");
    expect(localDayKey(new Date(2026, 9, 1, 0, 0))).toBe("2026-10-01");
  });

  it("saisie le soir même : la date n'est pas encore jouée → « En cours »", async () => {
    await S.syncArtistStatuses(productionId, SAME_EVENING.getTime());
    expect(await status()).toBe("TO_INVOICE");
  });

  it("le lendemain, la 1re page ouverte passe la date en « Payé » sans modification", async () => {
    S.resetArtistStatusesDailyForTests();
    await S.syncArtistStatusesDaily(NEXT_MORNING);
    expect(await status()).toBe("PAID");
  });

  it("une seule resynchro par jour (les pages suivantes ne recalculent rien)", async () => {
    await prisma.deal.update({ where: { id: dealId }, data: { artistStatus: "TO_INVOICE" } });
    await S.syncArtistStatusesDaily(new Date(2026, 9, 18, 18));
    expect(await status()).toBe("TO_INVOICE");
    await S.syncArtistStatusesDaily(new Date(2026, 9, 19, 8));
    expect(await status()).toBe("PAID");
  });
});
