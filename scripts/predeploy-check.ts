// Contrôles automatiques pré-déploiement (étape 1 — porté de KN, Stan 2026-09-29).
//
// Enchaîne : état git propre, tests, types, lint (erreurs), cohérence
// schéma ↔ migrations, build de production. S'arrête au premier échec avec
// un code de sortie non nul — à lancer avant `scripts/deploy.ps1`.
//
// Usage : npm run predeploy
// ⚠️ Arrêter le serveur de dev avant (le build partage le dossier .next).

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

type Step = { name: string; cmd: string | (() => string) };

const shadowDir = mkdtempSync(path.join(os.tmpdir(), "youri-predeploy-"));
const shadowUrl = `file:${path.join(shadowDir, "shadow.db").replace(/\\/g, "/")}`;

const steps: Step[] = [
  {
    name: "Git : aucune modification non commitée",
    cmd: () => {
      const out = execSync("git status --porcelain", { encoding: "utf8" }).trim();
      if (out) throw new Error(`Fichiers non commités :\n${out}`);
      return "propre";
    },
  },
  { name: "Tests (vitest)", cmd: "npx vitest run" },
  { name: "Types (tsc)", cmd: "npx tsc --noEmit -p ." },
  { name: "Lint (erreurs)", cmd: "npx eslint . --quiet" },
  {
    name: "Schéma Prisma = migrations",
    cmd: () => {
      const out = execSync(
        `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "${shadowUrl}" --exit-code`,
        { encoding: "utf8" },
      );
      return out.trim().split("\n").pop() ?? "";
    },
  },
  { name: "Build de production (next build)", cmd: "npm run build" },
];

let failed = false;
for (const [i, step] of steps.entries()) {
  const label = `[${i + 1}/${steps.length}] ${step.name}`;
  const t0 = Date.now();
  try {
    if (typeof step.cmd === "string") {
      execSync(step.cmd, { stdio: "pipe", encoding: "utf8" });
    } else {
      step.cmd();
    }
    console.log(`✅ ${label} (${Math.round((Date.now() - t0) / 1000)} s)`);
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    console.error(`❌ ${label}`);
    console.error([err.stdout, err.stderr, err.message].filter(Boolean).join("\n").slice(-4000));
    failed = true;
    break;
  }
}
rmSync(shadowDir, { recursive: true, force: true });

if (failed) {
  console.error("\nContrôle pré-déploiement ÉCHOUÉ — ne pas déployer.");
  process.exit(1);
}
console.log("\nContrôle pré-déploiement OK.");
