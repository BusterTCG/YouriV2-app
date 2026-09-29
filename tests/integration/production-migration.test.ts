// @vitest-environment node
//
// Reprise des données PROD_EXE existantes par les migrations « Production »
// (portage KN) : base SQLite temporaire à l'état d'avant le portage, données
// insérées, puis migrations du portage appliquées et recalcul de l'app.
//
// Cas Sossam (Stan 2026-09-30) : 10 % sur la résidence à Paris, 15 % sur les
// autres dates → contrat principal 15 %, « Contrat résidences » séparé 10 %,
// aucun taux de date modifié par le recalcul.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const PORT_MIGRATIONS_FROM = "20260929180000";
const root = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), "youri-mig-"));
const dbUrl = `file:${path.join(tmp, "mig.db").split(path.sep).join("/")}`;
process.env.DATABASE_URL = dbUrl;

const migDir = path.join(root, "prisma", "migrations");
const tmpMig = path.join(tmp, "migrations");

function copyMigrations(filter: (name: string) => boolean) {
  for (const name of readdirSync(migDir)) {
    if (name === "migration_lock.toml" || filter(name)) {
      cpSync(path.join(migDir, name), path.join(tmpMig, name), { recursive: true });
    }
  }
}
function deploy() {
  execSync(`npx prisma migrate deploy --schema "${path.join(tmp, "schema.prisma")}"`, {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "pipe",
  });
}

const T0 = Date.UTC(2027, 0, 1, 12);
const day = (m: number, d: number) => Date.UTC(2027, m - 1, d, 12);

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any;
/* eslint-enable @typescript-eslint/no-explicit-any */

beforeAll(async () => {
  mkdirSync(tmpMig, { recursive: true });
  cpSync(path.join(root, "prisma", "schema.prisma"), path.join(tmp, "schema.prisma"));
  // 1. Base à l'état d'avant le portage.
  copyMigrations((n) => n < PORT_MIGRATIONS_FROM);
  deploy();

  // 2. Données existantes (format Prisma SQLite : dates en ms epoch).
  const deal = (id: string, title: string, show: string, date: number, pct: number | null, multi = 0, venue = "") =>
    `INSERT INTO "Deal" ("id","category","title","showName","date","prodExePct","isMultiDate","venueName","status","createdAt","updatedAt")
     VALUES ('${id}','PROD_EXE','${title}','${show}',${date},${pct ?? "NULL"},${multi},${venue ? `'${venue}'` : "NULL"},'CONFIRME',${T0},${T0});`;
  const da = (id: string, dealId: string, artistId: string) =>
    `INSERT INTO "DealArtiste" ("id","dealId","artistId","createdAt","updatedAt") VALUES ('${id}','${dealId}','${artistId}',${T0},${T0});`;
  const sql = [
    `INSERT INTO "Artist" ("id","name","slug","createdAt","updatedAt") VALUES
       ('a-sossam','Sossam','sossam',${T0},${T0}),
       ('a-solo','Solo','solo',${T0},${T0}),
       ('a-resid','Resid','resid',${T0},${T0});`,
    // Sossam : résidence Paris (2 mois à 10 %) + 2 dates de tournée à 15 %.
    deal("s-jan", "Sossam - Seule @ Paris", "Seule", day(1, 10), 10, 1, "Théâtre de Paris"),
    deal("s-feb", "Sossam - Seule @ Paris", "Seule", day(2, 10), 10, 1, "Théâtre de Paris"),
    deal("s-lyon", "Sossam - Seule @ Lyon", "Seule", day(3, 5), 15, 0, "Bourse du Travail"),
    deal("s-lille", "Sossam - Seule @ Lille", "Seule", day(4, 5), null, 0, "Le Sébasto"),
    da("da1", "s-jan", "a-sossam"), da("da2", "s-feb", "a-sossam"),
    da("da3", "s-lyon", "a-sossam"), da("da4", "s-lille", "a-sossam"),
    // Solo : dates uniques à 12 % → pas de contrat résidences séparé.
    deal("o-1", "Solo - Tour @ Nantes", "Tour", day(3, 1), 12),
    deal("o-2", "Solo - Tour @ Rennes", "Tour", day(3, 2), 12),
    da("da5", "o-1", "a-solo"), da("da6", "o-2", "a-solo"),
    // Resid : uniquement une résidence à 8 % → contrat principal 8 %.
    deal("r-1", "Resid - Show @ Bordeaux", "Show", day(5, 1), 8, 1, "Le Femina"),
    da("da7", "r-1", "a-resid"),
  ].join("\n");
  const sqlFile = path.join(tmp, "seed.sql");
  writeFileSync(sqlFile, sql);
  execSync(`npx prisma db execute --file "${sqlFile}" --schema "${path.join(tmp, "schema.prisma")}"`, {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "pipe",
  });

  // 3. Migrations du portage.
  copyMigrations((n) => n >= PORT_MIGRATIONS_FROM);
  deploy();

  ({ prisma } = await import("@/lib/db"));
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(tmp, { recursive: true, force: true });
});

const pct = (v: unknown) => (v == null ? null : Number(v));

describe("reprise des données — contrat résidences distinct (modèle KN)", () => {
  it("Sossam : contrat principal 15 %, contrat résidences séparé 10 %", async () => {
    const prod = await prisma.production.findFirstOrThrow({ where: { artistId: "a-sossam" } });
    expect(prod.name).toBe("Seule");
    expect(pct(prod.prodExePct)).toBe(15);
    expect(prod.residencyContractSeparate).toBe(true);
    expect(prod.residencyArtistShareKind).toBe("PROD_EXE");
    expect(pct(prod.residencyProdExePct)).toBe(10);
    expect(pct(prod.residencyCoprodKnPct)).toBe(0);

    const residency = await prisma.residency.findFirstOrThrow({
      where: { productionId: prod.id },
      include: { deals: { select: { id: true } } },
    });
    expect(residency.deals.map((d: { id: string }) => d.id).sort()).toEqual(["s-feb", "s-jan"]);
  });

  it("dates uniques seules : pas de contrat résidences séparé", async () => {
    const prod = await prisma.production.findFirstOrThrow({ where: { artistId: "a-solo" } });
    expect(pct(prod.prodExePct)).toBe(12);
    expect(prod.residencyContractSeparate).toBe(false);
  });

  it("résidence seule : son taux devient le contrat principal", async () => {
    const prod = await prisma.production.findFirstOrThrow({ where: { artistId: "a-resid" } });
    expect(pct(prod.prodExePct)).toBe(8);
    expect(prod.residencyContractSeparate).toBe(false);
  });

  it("le recalcul de l'app ne change le taux d'aucune date", async () => {
    const { recomputeProductionFinancials } = await import("@/lib/finance/show-financials");
    for (const p of await prisma.production.findMany()) await recomputeProductionFinancials(p.id);
    const deals = await prisma.deal.findMany({ select: { id: true, prodExePct: true } });
    const byId = Object.fromEntries(deals.map((d: { id: string; prodExePct: unknown }) => [d.id, pct(d.prodExePct)]));
    expect(byId).toEqual({
      "s-jan": 10,
      "s-feb": 10,
      "s-lyon": 15,
      "s-lille": 15, // vide = 15 % par défaut (Youri)
      "o-1": 12,
      "o-2": 12,
      "r-1": 8,
    });
  });
});
