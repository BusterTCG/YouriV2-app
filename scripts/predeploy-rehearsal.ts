// Répétition pré-déploiement (étape 2 du contrôle — porté de KN, Stan 2026-09-29).
//
// Joue les migrations en attente sur une COPIE d'une sauvegarde de la base de
// production, recalcule les deals Production comme le fera l'app, puis compare
// avant / après : volumes par table, montants et statuts de chaque deal,
// management fees. Ne touche ni à la base de dev ni au serveur.
//
// Usage :
//   npm run predeploy:rehearsal -- <sauvegarde-prod.db> [rapport.md]
//
// Produit <dossier>/rehearsal-before.db, rehearsal-after.db et le rapport
// Markdown (par défaut <dossier>/rehearsal-report.md).

import { copyFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const src = process.argv[2];
if (!src) {
  console.error("Usage : scripts/predeploy-rehearsal.ts <sauvegarde-prod.db> [rapport.md]");
  process.exit(1);
}
const dir = path.dirname(path.resolve(src));
const beforePath = path.join(dir, "rehearsal-before.db");
const afterPath = path.join(dir, "rehearsal-after.db");
const reportPath = process.argv[3] ?? path.join(dir, "rehearsal-report.md");
const url = (p: string) => `file:${p.replace(/\\/g, "/")}`;

type Row = Record<string, unknown>;
const MONEY = [
  "budgetAmount",
  "grossAmount",
  "commissionPct",
  "commissionAmount",
  "artistAmount",
  "mfAmount",
] as const;
const STATUS = ["status", "artistStatus", "budgetPaymentStatus"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  BOOKING: "Booking",
  PROD_EXE: "Production",
  CACHETS: "Cachets",
};

function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x)));
}
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
const eur = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}`);

async function snapshot(dbUrl: string) {
  const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const tables = plain(
      (await db.$queryRawUnsafe(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      )) as Row[],
    ).map((r) => String(r.name));
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const [r] = plain((await db.$queryRawUnsafe(`SELECT count(*) AS n FROM "${t}"`)) as Row[]);
      counts[t] = Number(r.n);
    }
    // Deal Youri : pas d'artistId, les artistes passent par DealArtiste.
    const deals = plain(
      (await db.$queryRawUnsafe(
        `SELECT d.id, d.title, d.category, d.status, d.deletedAt, d.showName, d.artistStatus, d.budgetPaymentStatus,
                d.budgetAmount, d.grossAmount, d.commissionPct, d.commissionAmount, d.artistAmount,
                (SELECT group_concat(a.name, ', ') FROM "DealArtiste" da JOIN "Artist" a ON a.id = da.artistId
                  WHERE da.dealId = d.id AND da.deletedAt IS NULL) AS artist,
                (SELECT coalesce(sum(mf.amount), 0) FROM "DealManagementFee" mf
                  WHERE mf.dealId = d.id AND mf.deletedAt IS NULL) AS mfAmount
           FROM "Deal" d`,
      )) as Row[],
    );
    const [mig] = plain(
      (await db.$queryRawUnsafe(
        `SELECT migration_name AS m FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1`,
      )) as Row[],
    );
    return { counts, deals, lastMigration: String(mig?.m ?? "?") };
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  copyFileSync(src, beforePath);
  copyFileSync(src, afterPath);
  const before = await snapshot(url(beforePath));

  // 1. Migrations (mêmes commandes que deploy.ps1).
  const log: string[] = [];
  try {
    const out = execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: url(afterPath) },
      encoding: "utf8",
    });
    log.push(...out.split("\n").filter((l) => /migration|applied|Applying/i.test(l)));
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    writeFileSync(reportPath, `# Répétition : ÉCHEC des migrations\n\n\`\`\`\n${err.stdout ?? ""}\n${err.stderr ?? ""}\n\`\`\`\n`);
    console.error("Migrations en échec — voir", reportPath);
    process.exit(2);
  }

  // 2. Recalcul des deals Production + management fees (ce que fera l'app à
  //    la première modification) — Prisma de l'app pointé sur la copie.
  process.env.DATABASE_URL = url(afterPath);
  const { prisma } = await import("../lib/db");
  const { recomputeProductionFinancials, recomputeShowFinancials } = await import(
    "../lib/finance/show-financials"
  );
  // Dates dont le taux prod-exé d'origine diffère de leur contrat cible
  // (contrat résidences pour un mois de résidence séparé, sinon contrat
  // principal) : le recalcul leur applique le contrat → montants modifiés.
  // Lu AVANT le recalcul (taux d'origine des dates).
  const mixed = (await prisma.$queryRawUnsafe(
    `SELECT p."name" AS prod, a."name" AS artist,
            group_concat(d."title" || ' (' || CAST(d."prodExePct" AS TEXT) || ' % → ' ||
              CAST(CASE WHEN d."residencyId" IS NOT NULL AND p."residencyContractSeparate" = 1
                        THEN p."residencyProdExePct" ELSE p."prodExePct" END AS TEXT) || ' %)', ' ; ') AS rates
       FROM "Deal" d JOIN "Production" p ON p."id" = d."productionId" JOIN "Artist" a ON a."id" = p."artistId"
      WHERE d."deletedAt" IS NULL
        AND CAST(d."prodExePct" AS REAL) <> CAST(CASE WHEN d."residencyId" IS NOT NULL AND p."residencyContractSeparate" = 1
                                                     THEN p."residencyProdExePct" ELSE p."prodExePct" END AS REAL)
      GROUP BY p."id"`,
  )) as Array<{ prod: string; artist: string; rates: string }>;
  const productions = await prisma.production.findMany({
    include: {
      artist: { select: { name: true } },
      _count: { select: { deals: true } },
    },
    orderBy: [{ artistId: "asc" }, { name: "asc" }],
  });
  for (const p of productions) await recomputeProductionFinancials(p.id);
  const unlinked = await prisma.deal.findMany({
    where: { category: "PROD_EXE", deletedAt: null, productionId: null },
    select: { id: true, title: true, showName: true },
  });
  for (const d of unlinked) await recomputeShowFinancials(d.id);
  const residencies = await prisma.residency.findMany({
    include: {
      production: { select: { name: true } },
      _count: { select: { deals: true } },
    },
  });
  const noPerf = await prisma.deal.findMany({
    where: { category: "PROD_EXE", deletedAt: null, performances: { none: {} } },
    select: { title: true },
  });
  const multiPaying = await prisma.deal.findMany({
    where: { category: "PROD_EXE", deletedAt: null, isMultiDate: true, paying: { gt: 0 } },
    select: { title: true, paying: true },
  });
  const movements = await prisma.artistMovement.findMany({
    include: { production: { select: { name: true } } },
  });
  await prisma.$disconnect();

  const after = await snapshot(url(afterPath));

  // 3. Comparaisons.
  const md: string[] = [];
  md.push(`# Répétition pré-déploiement`, ``);
  md.push(`- Sauvegarde : \`${path.basename(src)}\``);
  md.push(`- Migration en prod : \`${before.lastMigration}\` → après : \`${after.lastMigration}\``);
  md.push(`- Migrations appliquées :`, ...log.map((l) => `  - ${l.trim()}`), ``);

  md.push(`## Volumes par table`, ``, `| Table | Avant | Après | Écart |`, `|---|---:|---:|---:|`);
  const allTables = [...new Set([...Object.keys(before.counts), ...Object.keys(after.counts)])].sort();
  for (const t of allTables) {
    const b = before.counts[t];
    const a = after.counts[t];
    if (b === a) continue;
    md.push(`| ${t} | ${b ?? "—"} | ${a ?? "—"} | ${a != null && b != null ? a - b : "nouvelle"} |`);
  }
  md.push(``, `Tables inchangées : ${allTables.filter((t) => before.counts[t] === after.counts[t]).join(", ")}`, ``);

  const afterById = new Map(after.deals.map((d) => [String(d.id), d]));
  const missing = before.deals.filter((d) => !afterById.has(String(d.id)));
  md.push(`## Deals`, ``);
  md.push(`- Avant : ${before.deals.length} · après : ${after.deals.length} · disparus : **${missing.length}**`);
  for (const d of missing) md.push(`  - ⚠️ ${d.title} (${d.id})`);

  const changed: string[] = [];
  let pangeeBefore = 0;
  let pangeeAfter = 0;
  let mfBefore = 0;
  let mfAfter = 0;
  for (const b of before.deals) {
    const a = afterById.get(String(b.id));
    if (!a) continue;
    if (b.deletedAt == null && b.status !== "ANNULE" && b.category === "PROD_EXE") {
      pangeeBefore += num(b.commissionAmount) ?? 0;
      pangeeAfter += num(a.commissionAmount) ?? 0;
    }
    if (b.deletedAt == null) {
      mfBefore += num(b.mfAmount) ?? 0;
      mfAfter += num(a.mfAmount) ?? 0;
    }
    const diffs: string[] = [];
    for (const k of MONEY) {
      const x = num(b[k]);
      const y = num(a[k]);
      if ((x ?? 0).toFixed(2) !== (y ?? 0).toFixed(2)) diffs.push(`${k} ${eur(x)} → ${eur(y)}`);
    }
    for (const k of STATUS) if (b[k] !== a[k]) diffs.push(`${k} ${String(b[k])} → ${String(a[k])}`);
    if (diffs.length) {
      changed.push(
        `| ${a.artist ?? ""} | ${String(a.title).replace(/\|/g, "/")} | ${CATEGORY_LABEL[String(a.category)] ?? a.category}${b.deletedAt ? " (corbeille)" : ""} | ${diffs.join(" ; ")} |`,
      );
    }
  }
  md.push(
    `- Part Pangee Production totale (deals actifs non annulés) : ${eur(pangeeBefore)} € → ${eur(pangeeAfter)} € (écart ${eur(pangeeAfter - pangeeBefore)} €)`,
    `- Management fees totales (deals actifs) : ${eur(mfBefore)} € → ${eur(mfAfter)} € (écart ${eur(mfAfter - mfBefore)} €)`,
    ``,
    `### Deals dont un montant ou un statut change (${changed.length})`,
    ``,
  );
  if (changed.length) md.push(`| Artiste(s) | Deal | Catégorie | Changements |`, `|---|---|---|---|`, ...changed);
  else md.push(`Aucun.`);
  md.push(``);

  md.push(`## Productions créées (${productions.length})`, ``, `| Artiste | Production | Dates |`, `|---|---|---:|`);
  for (const p of productions) md.push(`| ${p.artist.name} | ${p.name} | ${p._count.deals} |`);
  md.push(``, `## Dates de production non rattachées (${unlinked.length})`, ``);
  md.push(
    unlinked.length
      ? unlinked
          .map((d) => `- ${d.title}${d.showName ? ` (spectacle « ${d.showName} »)` : " (pas de nom de spectacle)"}`)
          .join("\n")
      : "Aucune.",
    ``,
    `(Sans artiste ou sans nom de spectacle : à rattacher depuis /shows → « Dates à rattacher ».)`,
    ``,
  );

  md.push(`## Résidences créées (${residencies.length})`, ``, `| Production | Résidence | Mois |`, `|---|---|---:|`);
  for (const r of residencies) md.push(`| ${r.production.name} | ${r.name} | ${r._count.deals} |`);
  md.push(
    ``,
    `## Contrôles séances`,
    ``,
    `- Dates de production actives sans séance : ${noPerf.length}${noPerf.length ? " — " + noPerf.map((d) => d.title).join(", ") : ""}`,
    `- Mois complets avec payants en cumul (à ventiler séance par séance) : ${multiPaying.length}${multiPaying.length ? " — " + multiPaying.map((d) => `${d.title} (${d.paying})`).join(", ") : ""}`,
    ``,
  );

  md.push(
    `## Compte artiste`,
    ``,
    `- Mouvements repris (dates marquées « Part artiste payée ») : ${movements.length}${movements.length ? " — " + movements.map((m) => `${m.production.name} ${Number(m.amount).toFixed(2)} € (${m.kind})`).join(", ") : ""}`,
    `- ⚠️ Une date « payée » dont la billetterie n'est pas encaissée n'est pas appelable : son statut repasse « à régler » et le compte artiste affiche un trop-versé (voir les changements artistStatus ci-dessus).`,
    ``,
  );

  md.push(
    `## Dates dont le taux diffère de leur contrat (${mixed.length})`,
    ``,
    mixed.length
      ? mixed.map((m) => `- ⚠️ ${m.artist} — ${m.prod} : ${m.rates} → alignées sur le contrat de la production (montants modifiés, voir « Deals dont un montant change »)`).join("\n")
      : "Aucune.",
    ``,
  );

  writeFileSync(reportPath, md.join("\n") + "\n");
  console.log("Rapport :", reportPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
