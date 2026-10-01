// @vitest-environment node
//
// Migration 20261001120000_add_task_paiement_taxes (Stan 2026-10-01) :
// « Paiement taxes SACD CNM » inséré avant « Paiement Artiste » dans le
// modèle PROD_EXE et sur les dates dont le paiement artiste reste à faire.
// Rejoue le SQL de la migration sur une base temporaire peuplée.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = mkdtempSync(path.join(os.tmpdir(), "youri-taxes-"));
const dbUrl = `file:${path.join(tmp, "taxes.db").split(path.sep).join("/")}`;
process.env.DATABASE_URL = dbUrl;

const LABELS = [
  "Validation date",
  "Signature du contrat",
  "Mise en ligne",
  "Gestion VHR",
  "Envoie FDR",
  "Envoie Facture",
  "Paiement Artiste",
];
const NEW = "Paiement taxes SACD CNM";

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any;
/* eslint-enable @typescript-eslint/no-explicit-any */
let open = "";
let paid = "";
let booking = "";

async function runMigrationSql() {
  const sql = readFileSync(
    path.join(process.cwd(), "prisma/migrations/20261001120000_add_task_paiement_taxes/migration.sql"),
    "utf8",
  );
  const statements = sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of statements) await prisma.$executeRawUnsafe(s);
}

async function labelsOf(dealId: string) {
  const tasks = await prisma.task.findMany({ where: { dealId, deletedAt: null }, orderBy: { order: "asc" } });
  return tasks.map((t: { label: string }) => t.label);
}

beforeAll(async () => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: dbUrl }, stdio: "pipe" });
  ({ prisma } = await import("@/lib/db"));
  await prisma.taskTemplate.createMany({
    data: [
      ...LABELS.map((label, order) => ({ category: "PROD_EXE", order, label })),
      { category: "BOOKING", order: 0, label: "Envoi de Facture" },
    ],
  });
  const mk = async (category: string, title: string) =>
    (await prisma.deal.create({ data: { category, title, date: new Date("2026-11-14T12:00:00Z") } })).id;
  open = await mk("PROD_EXE", "Date ouverte");
  paid = await mk("PROD_EXE", "Date réglée");
  booking = await mk("BOOKING", "Booking");
  for (const [dealId, doneArtist] of [
    [open, false],
    [paid, true],
  ] as const) {
    await prisma.task.createMany({
      data: LABELS.map((label, order) => ({
        dealId,
        order,
        label,
        status: label === "Paiement Artiste" && doneArtist ? "DONE" : "TODO",
      })),
    });
  }
  await prisma.task.create({ data: { dealId: booking, order: 0, label: "Paiement Artiste" } });
  await runMigrationSql();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(tmp, { recursive: true, force: true });
});

describe("migration « Paiement taxes SACD CNM »", () => {
  it("modèle PROD_EXE : inséré entre Envoie Facture et Paiement Artiste", async () => {
    const tpl = await prisma.taskTemplate.findMany({
      where: { category: "PROD_EXE", deletedAt: null },
      orderBy: { order: "asc" },
    });
    expect(tpl.map((t: { label: string }) => t.label)).toEqual([...LABELS.slice(0, 6), NEW, "Paiement Artiste"]);
    expect(tpl.map((t: { order: number }) => t.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(tpl[6].defaultAssigneeKey).toBe("angath");
  });

  it("dates : ajoutée si le paiement artiste reste à faire, pas sur les dates réglées ni hors production", async () => {
    expect(await labelsOf(open)).toEqual([...LABELS.slice(0, 6), NEW, "Paiement Artiste"]);
    const t = await prisma.task.findFirst({ where: { dealId: open, label: NEW } });
    expect(t).toMatchObject({ status: "TODO", order: 6, assigneeKey: "angath" });
    expect(t.templateId).toBeTruthy();
    expect(await labelsOf(paid)).toEqual(LABELS);
    expect(await labelsOf(booking)).toEqual(["Paiement Artiste"]);
  });

  it("idempotente : rejouée, elle ne duplique rien", async () => {
    await runMigrationSql();
    expect(await prisma.taskTemplate.count({ where: { label: NEW } })).toBe(1);
    expect(await prisma.task.count({ where: { label: NEW } })).toBe(1);
  });
});
