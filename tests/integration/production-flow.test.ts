// @vitest-environment node
//
// Recette automatisée de la refonte « Production » (étapes 1 → 5, portage KN).
//
// Base SQLite TEMPORAIRE construite par les vraies migrations (prisma migrate
// deploy), puis les vraies server actions appelées une à une — seuls
// l'authentification (utilisateur de test) et le cache Next (revalidatePath)
// sont simulés. Rejouable avant chaque déploiement : `npm test`.
//
// Couvre : rattachement auto, contrat 2 taux, frais généraux, management fees
// (base = part Pangee, lignes payées figées), séances, résidences (contrat
// distinct, relevé, check-list + tâches), acompte = caution, tournées,
// corbeille (liens conservés), compte artiste (statuts dérivés), bilans et
// comptes de production (cohérents avec les scalars, sans management fees),
// et les écrans internes existants (listes, MF, dashboard, reporting).

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = mkdtempSync(path.join(os.tmpdir(), "youri-it-"));
const dbUrl = `file:${path.join(tmp, "it.db").replace(/\\/g, "/")}`;
process.env.DATABASE_URL = dbUrl;

const TEST_USER = {
  id: "u-test",
  email: "test@pangeeprod.com",
  name: "Stan",
  role: "ADMIN" as const,
  color: "#3b82f6",
  active: true,
  pangeeKey: "stan",
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/auth/users", () => ({
  getCurrentUser: vi.fn(async () => TEST_USER),
  requireUser: vi.fn(async () => TEST_USER),
  requireAdmin: vi.fn(async () => TEST_USER),
  isAdmin: vi.fn(async () => true),
}));

type Res<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };
function ok<T>(r: Res<T>): T {
  if (!r.ok) throw new Error(`Action en échec : ${r.error}`);
  return r.data as T;
}
const num = (v: unknown) => (v == null ? null : Number(v));

// Modules chargés APRÈS la construction de la base (DATABASE_URL).
/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any;
let A: any; // actions deals
let P: any; // productions
let PF: any; // performances
let R: any; // residencies
let D: any; // deposits
let T: any; // tours
let AM: any; // artist movements
let PL: any; // production lines
let PE: any; // prod-executive (updateShowDetails)
let MF: any; // management fees
/* eslint-enable @typescript-eslint/no-explicit-any */

let artistA = "";
let artistB = "";

beforeAll(async () => {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "pipe",
  });
  ({ prisma } = await import("@/lib/db"));
  A = await import("@/lib/actions/deals");
  P = await import("@/lib/actions/productions");
  PF = await import("@/lib/actions/performances");
  R = await import("@/lib/actions/residencies");
  D = await import("@/lib/actions/deposits");
  T = await import("@/lib/actions/tours");
  AM = await import("@/lib/actions/artist-movements");
  PL = await import("@/lib/actions/production-lines");
  PE = await import("@/lib/actions/prod-executive");
  MF = await import("@/lib/actions/management-fees");

  await prisma.user.create({ data: { ...TEST_USER, passwordHash: "x" } });
  artistA = (await prisma.artist.create({ data: { name: "Artiste A", slug: "artiste-a" } })).id;
  artistB = (await prisma.artist.create({ data: { name: "Artiste B", slug: "artiste-b" } })).id;
  await prisma.taskTemplate.createMany({
    data: [
      { category: "PROD_EXE", order: 1, label: "Signature du contrat" },
      { category: "PROD_EXE", order: 2, label: "Mise en ligne billetterie" },
      { category: "PROD_EXE", order: 3, label: "Gestion VHR" },
    ],
  });
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(tmp, { recursive: true, force: true });
});

async function deal(id: string) {
  return prisma.deal.findUnique({
    where: { id },
    include: {
      performances: { orderBy: [{ date: "asc" }, { time: "asc" }] },
      managementFees: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
      tasks: { where: { deletedAt: null } },
    },
  });
}

async function newDate(o: {
  day: string;
  time?: string;
  showName: string;
  artistId: string;
  venueDealKind?: "PROD" | "CO_REAL" | "CESSION";
  pe?: number;
  cp?: number;
}): Promise<string> {
  const r = ok<{ id: string }>(
    await A.createDeal({
      category: "PROD_EXE",
      title: `Test - ${o.showName} @ ${o.day}`,
      date: new Date(`${o.day}T00:00:00.000Z`),
      showTime: o.time ?? null,
      status: "CONFIRME",
      initialArtistId: o.artistId,
      showName: o.showName,
      venueDealKind: o.venueDealKind ?? "PROD",
      prodExePct: o.pe ?? 15,
      coprodKnPct: o.cp ?? 0,
    }),
  );
  return r.id;
}

// Identifiants partagés entre les scénarios (exécutés dans l'ordre).
let prodId = "";
let d1 = ""; // date passée, jouée
let d2 = ""; // date à venir

describe("Étape 1 — socle Production", () => {
  it("une date crée sa production (artiste + nom), avec séance, contrat et tâches", async () => {
    d1 = await newDate({ day: "2026-06-12", time: "20:30", showName: "Insomniaque", artistId: artistA });
    const x = await deal(d1);
    expect(x.productionId).toBeTruthy();
    prodId = x.productionId;
    expect(x.artistShareKind).toBe("PROD_EXE");
    expect(num(x.prodExePct)).toBe(15);
    expect(x.performances).toHaveLength(1);
    expect(x.performances[0].date.toISOString()).toBe("2026-06-12T12:00:00.000Z");
    expect(x.performanceCount).toBe(1);
    expect(x.tasks.length).toBe(3);
    const p = await prisma.production.findUnique({ where: { id: prodId } });
    expect(p.name).toBe("Insomniaque");
    expect(p.artistId).toBe(artistA);
  });

  it("même artiste + même spectacle (casse / espaces différents) → même production", async () => {
    d2 = await newDate({ day: "2026-12-04", time: "21:00", showName: "  INSOMNIAQUE ", artistId: artistA });
    expect((await deal(d2)).productionId).toBe(prodId);
  });

  it("autre artiste, même nom → autre production", async () => {
    const other = await newDate({ day: "2026-12-05", showName: "Insomniaque", artistId: artistB });
    const o = await deal(other);
    expect(o.productionId).not.toBe(prodId);
    ok(await A.permanentlyDeleteDeal(other));
    await prisma.production.delete({ where: { id: o.productionId } });
  });

  it("recette, charges et cachet → scalars (prod-exé 15 %)", async () => {
    ok(await PL.upsertProductionLine({ dealId: d1, kind: "REVENUE", label: "RECETTE_HT", amount: 10000, status: "PAID" }));
    ok(await PL.upsertProductionLine({ dealId: d1, kind: "COST", label: "LOCATION", amount: 3000, status: "PAID" }));
    const da = await prisma.dealArtiste.findFirst({ where: { dealId: d1, deletedAt: null } });
    ok(await A.updateDealArtiste({ id: da.id, cachetAmount: 1000 }));
    const x = await deal(d1);
    // knFee 1 500 ; profit = 10 000 − 3 000 − 1 000 − 1 500 = 4 500
    expect(num(x.commissionAmount)).toBe(1500);
    expect(num(x.artistAmount)).toBe(4500);
    expect(x.budgetPaymentStatus).toBe("PAID");
  });

  it("management fees : base = part Pangee", async () => {
    ok(await MF.setManagementFeePool({ dealId: d1, role: "APPORT", poolPct: 10, associateKeys: ["stan"], margeYouri: 1500 }));
    ok(await MF.setManagementFeePool({ dealId: d1, role: "WORK", poolPct: 15, associateKeys: ["certe", "angath"], margeYouri: 1500 }));
    const x = await deal(d1);
    const amounts = x.managementFees.map((m: { amount: unknown }) => num(m.amount)).sort();
    expect(amounts).toEqual([113, 113, 150].sort()); // 10 % = 150 ; 7,5 % = 112,5 → 113
  });

  it("frais généraux 300 € répartis au prorata des représentations (1 + 1)", async () => {
    ok(await P.createOverhead(prodId, { label: "Carte SNCF", amount: 300 }));
    const x = await deal(d1);
    expect(num(x.artistAmount)).toBe(4500 - 150);
    expect(num(x.commissionAmount)).toBe(1500); // prod-exé seule : inchangée
  });

  it("co-prod 20 % → part Pangee, part artiste, MF recalculées ; MF payée figée", async () => {
    const paid = (await deal(d1)).managementFees.find((m: { associateKey: string }) => m.associateKey === "stan");
    ok(await MF.updateManagementFee({ id: paid.id, isPaye: true }));
    ok(await P.updateProduction(prodId, { coprodKnPct: 20 }));
    const x = await deal(d1);
    // profit = 10 000 − 3 000 − 1 000 − 150 − 1 500 = 4 350 ; knShare = 870
    expect(num(x.coprodKnPct)).toBe(20);
    expect(num(x.commissionAmount)).toBe(1500 + 870);
    expect(num(x.artistAmount)).toBe(4350 - 870);
    const byKey = Object.fromEntries(x.managementFees.map((m: { associateKey: string; amount: unknown }) => [m.associateKey, num(m.amount)]));
    expect(byKey.stan).toBe(150); // payée → figée
    expect(byKey.certe).toBe(Math.round(2370 * 0.075));
    ok(await P.updateProduction(prodId, { coprodKnPct: 0 }));
  });

  it("date annulée → 0 € de frais généraux, l'autre porte tout", async () => {
    ok(await A.setDealStatus({ dealId: d2, status: "ANNULE" }));
    expect(num((await deal(d1)).artistAmount)).toBe(4500 - 300);
    ok(await A.setDealStatus({ dealId: d2, status: "CONFIRME" }));
    expect(num((await deal(d1)).artistAmount)).toBe(4500 - 150);
  });

  it("renommage : nom unique par artiste, dates et titres suivent", async () => {
    const other = await newDate({ day: "2027-02-01", showName: "Autre show", artistId: artistA });
    const otherProd = (await deal(other)).productionId;
    const clash = await P.updateProduction(prodId, { name: "autre SHOW" });
    expect(clash.ok).toBe(false);
    ok(await A.permanentlyDeleteDeal(other));
    await prisma.production.delete({ where: { id: otherProd } });
    ok(await P.updateProduction(prodId, { name: "Insomniaque 2" }));
    expect((await deal(d2)).showName).toBe("Insomniaque 2");
    ok(await P.updateProduction(prodId, { name: "Insomniaque" }));
  });

  it("contrat verrouillé sur la date : updateShowDetails ignore prodExePct", async () => {
    ok(await PE.updateShowDetails({ id: d1, prodExePct: 50 }));
    expect(num((await deal(d1)).prodExePct)).toBe(15);
  });
});

describe("Étape 2 — séances et résidences", () => {
  it("séances : payants, billetterie (salle louée → Recette HT), doublé, annulation", async () => {
    const x = await deal(d2);
    ok(await PF.updatePerformance(x.performances[0].id, { paying: 80, grossTicketing: 1200 }));
    ok(await PF.addPerformances({ dealId: d2, items: [{ day: "2026-12-04", time: "23:00" }] }));
    let y = await deal(d2);
    expect(y.performances).toHaveLength(2);
    expect(y.performanceCount).toBe(2);
    expect(y.showTime).toBe("21:00 / 23:00");
    expect(y.paying).toBe(80);
    const recette = await prisma.productionLine.findFirst({ where: { dealId: d2, label: "RECETTE_HT", deletedAt: null } });
    expect(num(recette.amount)).toBe(1200);
    for (const p of y.performances) ok(await PF.updatePerformance(p.id, { cancelled: true }));
    y = await deal(d2);
    expect(y.performanceCount).toBe(0);
    // plus de représentation → d1 porte tous les frais généraux
    expect(num((await deal(d1)).artistAmount)).toBe(4500 - 300);
    ok(await PF.updatePerformance(y.performances[0].id, { cancelled: false }));
    const del = await PF.deletePerformance(y.performances[1].id);
    expect(del.ok).toBe(true);
    const last = await PF.deletePerformance(y.performances[0].id);
    expect(last.ok).toBe(false); // une date garde au moins une séance
  });

  it("date simple modifiée → la séance suit le jour et l'horaire", async () => {
    ok(await A.updateDealMeta({ id: d2, date: new Date("2026-12-11T00:00:00.000Z"), showTime: "20:00" }));
    const y = await deal(d2);
    expect(y.performances[0].date.toISOString()).toBe("2026-12-11T12:00:00.000Z");
    expect(y.performances[0].time).toBe("20:00");
  });

  let residencyId = "";
  it("assistant résidence : mois, séances, contrat, tâches ; ajout sans doublon", async () => {
    const r = ok<{ residencyId: string; months: number; performances: number }>(
      await R.planResidencyPerformances({
        productionId: prodId,
        name: "Loge Test",
        startDay: "2026-11-01",
        endDay: "2026-12-31",
        weekdays: [5, 6],
        times: ["19:30"],
        excluded: ["2026-12-25|19:30"],
        capacity: 25,
        venueDealKind: "CO_REAL",
        coRealKnPct: 50,
        status: "CONFIRME",
      }),
    );
    residencyId = r.residencyId;
    expect(r.months).toBe(2);
    expect(r.performances).toBe(16 - 1);
    const months = await prisma.deal.findMany({ where: { residencyId }, include: { performances: true, tasks: true, dealArtistes: true } });
    expect(months).toHaveLength(2);
    for (const m of months) {
      expect(m.productionId).toBe(prodId);
      expect(m.isMultiDate).toBe(true);
      expect(m.tasks.length).toBe(3);
      expect(m.dealArtistes[0].artistId).toBe(artistA);
    }
    const again = ok<{ performances: number }>(
      await R.planResidencyPerformances({
        productionId: prodId,
        residencyId,
        startDay: "2026-12-01",
        endDay: "2027-01-10",
        weekdays: [5, 6],
        times: ["19:30"],
        status: "CONFIRME",
      }),
    );
    expect(again.performances).toBe(1 + 4); // 25/12 + 4 en janvier
    expect(await prisma.deal.count({ where: { residencyId } })).toBe(3);
  });

  it("contrat « Résidences » distinct : seuls les mois de résidence l'appliquent", async () => {
    ok(await P.updateProduction(prodId, { residencyContractSeparate: true }));
    ok(await P.updateProduction(prodId, { residencyCoprodKnPct: 20 }));
    const nov = await prisma.deal.findFirst({ where: { residencyId }, orderBy: { date: "asc" } });
    expect(num(nov.coprodKnPct)).toBe(20);
    expect(num((await deal(d1)).coprodKnPct)).toBe(0);
    ok(await PL.upsertProductionLine({ dealId: nov.id, kind: "REVENUE", label: "RECETTE_HT", amount: 400, status: "PAID" }));
    const n2 = await deal(nov.id);
    const share = (await import("@/lib/finance/show-financials")).getProductionOverheadAllocation;
    const overhead = (await share(prodId)).byDeal.get(nov.id) ?? 0;
    const profit = 400 - overhead - 60;
    expect(num(n2.commissionAmount)).toBe(60 + Math.round(profit * 0.2));
    expect(num(n2.artistAmount)).toBeCloseTo(profit - Math.round(profit * 0.2), 2);
  });

  it("check-list résidence → tous les mois + tâches du pipeline", async () => {
    ok(await R.setResidencyChecklist(residencyId, { contractSigned: true }));
    const months = await prisma.deal.findMany({ where: { residencyId }, include: { tasks: true } });
    for (const m of months) {
      expect(m.contractSigned).toBe(true);
      expect(m.tasks.find((t: { label: string }) => /contrat/i.test(t.label)).status).toBe("DONE");
    }
  });

  it("page d'un mois : « Tous les mois » répercute suivi / modèle salle / jauge, « Ce mois seulement » non (Stan 2026-10-01)", async () => {
    const [first, ...rest] = await prisma.deal.findMany({ where: { residencyId }, orderBy: { date: "asc" } });
    ok(await PE.updateShowDetails({ id: first.id, vhrBooked: true, venueDealKind: "CO_REAL", coRealKnPct: 60, capacity: 120, applyToResidency: true }));
    for (const m of await prisma.deal.findMany({ where: { residencyId }, include: { tasks: true } })) {
      expect(m).toMatchObject({ vhrBooked: true, venueDealKind: "CO_REAL", capacity: 120 });
      expect(num(m.coRealKnPct)).toBe(60);
      // Tâche du mois modifié : cochée par la carte (client) ; autres mois : serveur.
      if (m.id !== first.id) expect(m.tasks.find((t: { label: string }) => /vhr/i.test(t.label)).status).toBe("DONE");
    }
    // Ce mois seulement : les autres mois gardent leur valeur.
    ok(await PE.updateShowDetails({ id: first.id, venueDealKind: "CESSION", applyToResidency: false }));
    expect((await prisma.deal.findUnique({ where: { id: first.id } })).venueDealKind).toBe("CESSION");
    for (const m of rest) expect((await prisma.deal.findUnique({ where: { id: m.id } })).venueDealKind).toBe("CO_REAL");
    // Remise en état pour la suite du scénario.
    ok(await PE.updateShowDetails({ id: first.id, vhrBooked: false, venueDealKind: "PROD", coRealKnPct: null, applyToResidency: true }));
  });

  it("acompte non récupéré → suppression refusée ; récupéré → mois en corbeille, liens conservés, restauration, suppression définitive", async () => {
    ok(await D.upsertVenueDeposit({ residencyId, amount: 1000, paidAt: new Date("2026-10-01T12:00:00Z") }));
    const refused = await R.deleteResidency(residencyId);
    expect(refused.ok).toBe(false);
    const dep = await prisma.venueDeposit.findFirst({ where: { residencyId } });
    ok(await D.setDepositRefunded(dep.id, new Date()));
    ok(await R.deleteResidency(residencyId));
    const trashed = await prisma.deal.findMany({ where: { residencyId } });
    expect(trashed.every((m: { deletedAt: Date | null; productionId: string }) => m.deletedAt && m.productionId === prodId)).toBe(true);
    ok(await A.restoreDeal(trashed[0].id));
    const restored = await deal(trashed[0].id);
    expect(restored.deletedAt).toBeNull();
    expect(restored.residencyId).toBe(residencyId);
    expect(restored.productionId).toBe(prodId);
    for (const m of await prisma.deal.findMany({ where: { residencyId } })) {
      if (!m.deletedAt) ok(await A.softDeleteDeal(m.id));
      ok(await A.permanentlyDeleteDeal(m.id));
    }
    expect(await prisma.residency.findUnique({ where: { id: residencyId } })).toBeNull();
    ok(await P.updateProduction(prodId, { residencyContractSeparate: false }));
  });
});

describe("Étape 3 — acompte date et tournée", () => {
  it("tournée : 2 lignes (doublé = 2 séances), contrat et artiste de la production", async () => {
    const r = ok<{ created: number; errors: string[]; createdRows: number[] }>(
      await T.createTourDates({
        productionId: prodId,
        status: "CONFIRME",
        rows: [
          { day: "2027-01-15", showTime: "20:00", city: "Lyon", venueDealKind: "CESSION" },
          { day: "2027-01-16", showTime: "19:00 / 21:30", venue: { id: "kn-1", name: "Salle X", city: "Nantes", capacity: 300 } },
        ],
      }),
    );
    expect(r.created).toBe(2);
    expect(r.createdRows).toEqual([0, 1]);
    const dates = await prisma.deal.findMany({
      where: { productionId: prodId, date: { gte: new Date("2027-01-01") } },
      include: { performances: true, dealArtistes: true },
      orderBy: { date: "asc" },
    });
    expect(dates).toHaveLength(2);
    expect(dates[1].performances).toHaveLength(2);
    expect(dates[1].capacity).toBe(300);
    expect(dates[1].venueCity).toBe("Nantes");
    expect(dates[0].dealArtistes[0].artistId).toBe(artistA);
    // Acompte date de tournée (caution, sans impact sur le résultat).
    const before = num((await deal(dates[0].id)).artistAmount);
    ok(await D.upsertVenueDeposit({ dealId: dates[0].id, amount: 500 }));
    expect(num((await deal(dates[0].id)).artistAmount)).toBe(before);
    const { getProductionSummaries } = await import("@/lib/productions");
    const [s] = await getProductionSummaries({ id: prodId }, Date.now());
    expect(s.deposits.find((x: { toRecover: number }) => x.toRecover === 500)).toBeTruthy();
    for (const dt of dates) {
      ok(await A.softDeleteDeal(dt.id));
      ok(await A.permanentlyDeleteDeal(dt.id));
    }
  });

  it("validation : ligne sans salle ni ville refusée", async () => {
    const r = await T.createTourDates({ productionId: prodId, rows: [{ day: "2027-03-01" }] });
    expect(r.ok).toBe(false);
  });
});

describe("Étape 4 — compte artiste", () => {
  it("statut artiste dérivé du compte ; case manuelle refusée", async () => {
    const manual = await A.setDealArtistStatus({ dealId: d1, status: "PAID" });
    expect(manual.ok).toBe(false);
    const due = num((await deal(d1)).artistAmount)!; // date jouée, billetterie encaissée
    expect((await deal(d1)).artistStatus).toBe("TO_INVOICE");
    ok(await AM.addArtistMovement({ productionId: prodId, kind: "PAYMENT", amount: due, date: new Date() }));
    expect((await deal(d1)).artistStatus).toBe("PAID");
    const { getArtistAccount } = await import("@/lib/finance/artist-account-server");
    const acc = await getArtistAccount(prodId, Date.now());
    expect(acc.callable).toBe(due);
    expect(acc.balance).toBe(0);
    const m = await prisma.artistMovement.findFirst({ where: { productionId: prodId } });
    ok(await AM.deleteArtistMovement(m.id));
    expect((await deal(d1)).artistStatus).toBe("TO_INVOICE");
  });
});

describe("Étape 5 — bilans et comptes (cohérence, sans management fees)", () => {
  it("bilan : total = somme des dates = scalars ; frais généraux entièrement répartis", async () => {
    const { getProductionReport } = await import("@/lib/production-report-server");
    const r = (await getProductionReport(prodId, Date.now()))!;
    const scalars = await prisma.deal.findMany({
      where: { productionId: prodId, deletedAt: null },
      select: { id: true, commissionAmount: true, artistAmount: true },
    });
    // Toutes les dates (jouées ou non) = scalars ; frais généraux entièrement répartis.
    const all = r.production.deals;
    for (const s of scalars) {
      const v = all.find((d: { id: string }) => d.id === s.id)!;
      expect(v.pnl.knAmount).toBe(num(s.commissionAmount));
      expect(v.pnl.artistAmount).toBeCloseTo(num(s.artistAmount)!, 2);
    }
    expect(all.reduce((t: number, d) => t + d.pnl.overheadShare, 0)).toBeCloseTo(300, 2);
    expect(all.reduce((t: number, d) => t + d.cachets, 0)).toBe(1000);
    // Bilan = état à date (Stan 2026-10-01) : dates jouées uniquement.
    const played = all.filter((d) => d.isPast);
    expect(r.dates.every((d) => d.isPast || d.status === "ANNULE")).toBe(true);
    expect(r.upcomingCount).toBe(all.length - r.dates.length);
    expect(r.finance.overhead).toBeCloseTo(played.reduce((t: number, d) => t + d.pnl.overheadShare, 0), 2);
    expect(r.finance.kn).toBe(played.reduce((t: number, d) => t + (d.pnl.knAmount ?? 0), 0));
    expect(JSON.stringify(r)).not.toMatch(/managementFee|margeNette/i);
  });

  it("compte de production d'une date = scalars ; Excel sans management fees", async () => {
    const { getDealReport } = await import("@/lib/deal-report");
    const { buildDealReportXlsx } = await import("@/lib/finance/deal-report-excel");
    const { buildProductionReportXlsx } = await import("@/lib/finance/production-report-excel");
    const { getProductionReport } = await import("@/lib/production-report-server");
    const r = (await getDealReport(d1, Date.now()))!;
    const x = await deal(d1);
    expect(r.finance.kn).toBe(num(x.commissionAmount));
    expect(r.finance.artist).toBeCloseTo(num(x.artistAmount)!, 2);
    expect(r.lines.some((l: { poste: string }) => l.poste === "Cachet artiste")).toBe(true);
    const ExcelJS = (await import("exceljs")).default;
    for (const buf of [
      await buildDealReportXlsx(r),
      await buildProductionReportXlsx((await getProductionReport(prodId, Date.now()))!),
    ]) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const texts: string[] = [];
      wb.eachSheet((ws: { eachRow: (cb: (row: { eachCell: (cb2: (c: { value: unknown }) => void) => void }) => void) => void }) =>
        ws.eachRow((row) => row.eachCell((c) => texts.push(String(c.value ?? "")))),
      );
      expect(texts.join(" ")).not.toMatch(/management|mgmt|marge nette|apport d'affaires|travail effectif/i);
    }
  });
});

describe("Correctifs de la revue pré-déploiement", () => {
  it("doublons de production (même nom normalisé) fusionnés au rattachement", async () => {
    const dup = await prisma.production.create({ data: { artistId: artistA, name: "insomniaque ", prodExePct: 15, artistShareKind: "PROD_EXE" } });
    await prisma.productionOverhead.create({ data: { productionId: dup.id, label: "Affiches", amount: 100 } });
    const extra = await newDate({ day: "2027-03-10", showName: "Insomniaque", artistId: artistA });
    expect((await deal(extra)).productionId).toBe(prodId);
    expect(await prisma.production.findUnique({ where: { id: dup.id } })).toBeNull();
    expect(await prisma.productionOverhead.count({ where: { productionId: prodId } })).toBe(2);
    ok(await A.softDeleteDeal(extra));
    ok(await A.permanentlyDeleteDeal(extra));
    await prisma.productionOverhead.deleteMany({ where: { label: "Affiches" } });
  });

  it("check-list résidence : liste blanche (aucune autre colonne écrite)", async () => {
    const r = await R.setResidencyChecklist("x", { commissionAmount: 0 } as never);
    expect(r.ok).toBe(false);
  });

  it("résidence d'une autre production refusée ; séance d'une date en corbeille refusée", async () => {
    const other = await prisma.production.create({ data: { artistId: artistB, name: "Autre" } });
    const res = await prisma.residency.create({ data: { productionId: other.id, name: "Ailleurs" } });
    const r = await R.planResidencyPerformances({
      productionId: prodId, residencyId: res.id, startDay: "2027-04-01", endDay: "2027-04-07", weekdays: [5], times: ["20:00"],
    });
    expect(r.ok).toBe(false);
    await prisma.residency.delete({ where: { id: res.id } });
    await prisma.production.delete({ where: { id: other.id } });
    const tmpDate = await newDate({ day: "2027-05-01", showName: "Insomniaque", artistId: artistA });
    const perf = (await deal(tmpDate)).performances[0];
    ok(await A.softDeleteDeal(tmpDate));
    expect((await PF.updatePerformance(perf.id, { paying: 10 })).ok).toBe(false);
    expect((await D.upsertVenueDeposit({ dealId: tmpDate, amount: 100 })).ok).toBe(false);
    ok(await A.permanentlyDeleteDeal(tmpDate));
  });

  it("contrat co-prod seule sur une date hors production : pas de 15 % implicite", async () => {
    const c = ok<{ id: string }>(
      await A.createDeal({ category: "PROD_EXE", title: "Hors prod", date: new Date("2027-06-01"), prodExePct: null, coprodKnPct: 30, venueDealKind: "PROD" }),
    );
    ok(await PL.upsertProductionLine({ dealId: c.id, kind: "REVENUE", label: "RECETTE_HT", amount: 1000 }));
    const x = await deal(c.id);
    expect(x.productionId).toBeNull(); // pas d'artiste
    expect(x.artistShareKind).toBe("COPROD");
    expect(num(x.commissionAmount)).toBe(300);
    ok(await A.softDeleteDeal(c.id));
    ok(await A.permanentlyDeleteDeal(c.id));
  });

  it("suppression définitive d'un artiste qui porte une production refusée", async () => {
    const { permanentlyDeleteArtist } = await import("@/lib/actions/artists");
    await prisma.artist.update({ where: { id: artistA }, data: { deletedAt: new Date() } });
    const r = await permanentlyDeleteArtist(artistA);
    expect(r.ok).toBe(false);
    await prisma.artist.update({ where: { id: artistA }, data: { deletedAt: null } });
  });
});

describe("Écrans internes existants (non-régression)", () => {
  it("Management fees, dashboard, reporting se calculent", async () => {
    const { getManagementFeesList } = await import("@/lib/management-fees-list");
    const mf = await getManagementFeesList({ associateKey: null, status: "all", period: "all", category: null });
    expect(mf.rows.length).toBeGreaterThanOrEqual(3);
    const { getDashboardData } = await import("@/lib/dashboard");
    await getDashboardData({ period: "year", category: "all", artistSlug: null, myPangeeKey: "stan" });
    const { getReportingData } = await import("@/lib/reporting");
    await getReportingData({ period: "all", artistSlug: null });
  });

  it("Booking et Cachets : création / suppression / restauration inchangées", async () => {
    const b = ok<{ id: string }>(
      await A.createDeal({ category: "BOOKING", title: "Booking test", date: new Date("2026-10-10"), initialArtistId: artistB }),
    );
    const bk = await deal(b.id);
    expect(bk.productionId).toBeNull();
    expect(bk.performances).toHaveLength(0);
    ok(await A.softDeleteDeal(b.id));
    ok(await A.restoreDeal(b.id));
    const c = ok<{ id: string }>(
      await A.createDeal({ category: "CACHETS", title: "Cachets test", date: new Date("2026-10-01"), initialArtistId: artistB, budgetAmount: null }),
    );
    expect((await deal(c.id)).productionId).toBeNull();
  });
});

describe("Lot 3 — solder par appel de quote-part, frais généraux figés (Stan 2026-10-01)", () => {
  const ids: string[] = [];
  let prod = "";
  const share = async (dealId: string) =>
    (await (await import("@/lib/finance/show-financials")).getProductionOverheadAllocation(prod)).byDeal.get(dealId);

  it("3 dates jouées, 300 € de frais généraux → 100 € chacune", async () => {
    for (const day of ["2025-03-01", "2025-03-08", "2025-03-15"]) {
      const id = await newDate({ day, showName: "Soldes", artistId: artistB });
      ok(await PL.upsertProductionLine({ dealId: id, kind: "REVENUE", label: "RECETTE_HT", amount: 1000, status: "PAID" }));
      ids.push(id);
    }
    prod = (await deal(ids[0])).productionId;
    ok(await P.createOverhead(prod, { label: "Affiches", amount: 300 }));
    for (const id of ids) expect(await share(id)).toBe(100);
  });

  it("verser une quote-part en cochant la 1re date : soldée, quote-part figée, statut artiste réglé", async () => {
    const before = await deal(ids[0]);
    const due = num(before.artistAmount)!;
    ok(await AM.settleDatesWithPayment({ productionId: prod, dealIds: [ids[0]], amount: due, date: new Date("2025-04-01T12:00:00Z") }));
    const s = await deal(ids[0]);
    expect(s.settledAt).not.toBeNull();
    expect(num(s.settledOverheadShare)).toBe(100);
    expect(s.settledMovementId).toBeTruthy();
    expect(s.artistStatus).toBe("PAID");
    const { getProductionSummaries } = await import("@/lib/productions");
    const [summary] = await getProductionSummaries({ id: prod }, Date.now());
    expect(summary.deals.find((d: { id: string }) => d.id === ids[0]).stage).toBe("SOLDEE");
    expect(summary.deals.find((d: { id: string }) => d.id === ids[1]).stage).toBe("A_SOLDER");
    // Déjà soldée → refusé.
    const again = await AM.settleDatesWithPayment({ productionId: prod, dealIds: [ids[0]], amount: 0, date: new Date() });
    expect(again.ok).toBe(false);
  });

  it("ajouter une date : la date soldée garde 100 €, le reste se répartit sur les autres", async () => {
    const artistBefore = num((await deal(ids[0])).artistAmount);
    ids.push(await newDate({ day: "2025-03-22", showName: "Soldes", artistId: artistB }));
    expect(await share(ids[0])).toBe(100);
    expect(await share(ids[1])).toBeCloseTo(66.67, 2);
    expect(num((await deal(ids[0])).artistAmount)).toBe(artistBefore);
  });

  it("date à venir : on ne peut pas la solder", async () => {
    const future = await newDate({ day: "2099-01-01", showName: "Soldes", artistId: artistB });
    const r = await AM.settleDatesWithPayment({ productionId: prod, dealIds: [future], amount: 0, date: new Date() });
    expect(r.ok).toBe(false);
    ok(await A.permanentlyDeleteDeal(future));
  });

  it("solder sans versement puis rouvrir ; supprimer le versement rouvre la date qu'il soldait", async () => {
    const movements = await prisma.artistMovement.count({ where: { productionId: prod } });
    ok(await AM.settleDatesWithPayment({ productionId: prod, dealIds: [ids[1]], amount: 0, date: new Date("2025-04-02T12:00:00Z") }));
    expect(await prisma.artistMovement.count({ where: { productionId: prod } })).toBe(movements);
    expect((await deal(ids[1])).settledAt).not.toBeNull();
    ok(await AM.reopenSettledDeal(ids[1]));
    expect((await deal(ids[1])).settledAt).toBeNull();

    const m = await prisma.artistMovement.findFirst({ where: { productionId: prod } });
    ok(await AM.deleteArtistMovement(m.id));
    const reopened = await deal(ids[0]);
    expect(reopened.settledAt).toBeNull();
    expect(reopened.settledOverheadShare).toBeNull();
    // Plus rien de figé : 300 € sur 4 dates.
    expect(await share(ids[0])).toBe(75);
  });

  it("reprise de l'existant : date soldée sans quote-part figée → figée à sa valeur actuelle", async () => {
    await prisma.deal.update({ where: { id: ids[2] }, data: { settledAt: new Date() } });
    const { freezeSettledOverheads } = await import("@/lib/finance/show-financials");
    await freezeSettledOverheads(prod);
    expect(num((await deal(ids[2])).settledOverheadShare)).toBe(75);
  });
});
