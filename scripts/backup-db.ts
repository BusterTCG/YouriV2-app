/**
 * Sauvegarde automatique de la base locale (Youri V2).
 *
 * Dev (SQLite) : copie prisma/dev.db vers backups/dev-YYYYMMDD-HHmm.db.
 * Rotation FIFO 30 backups. Lancé automatiquement avant `npm run dev` via le
 * hook predev. Manuellement via `npm run backup`.
 *
 * Prod (Postgres) : utiliser scripts/vps-backup.sh côté VPS (pg_dump quotidien).
 * Ce script-ci ne fait RIEN en prod (skip silencieux si pas de fichier .db).
 *
 * Cf. docs/process/dev-scripts.md.
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SOURCE_DB = path.join(ROOT, "prisma", "dev.db");
const BACKUP_DIR = path.join(ROOT, "backups");
const KEEP = 30;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function timestamp(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    "-",
    pad(d.getHours()),
    pad(d.getMinutes()),
  ].join("");
}

function rotateOldBackups() {
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("dev-") && f.endsWith(".db"))
    .map((f) => ({
      name: f,
      mtime: statSync(path.join(BACKUP_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  const toDelete = files.slice(KEEP);
  for (const f of toDelete) {
    unlinkSync(path.join(BACKUP_DIR, f.name));
  }
  return { kept: Math.min(files.length, KEEP), deleted: toDelete.length };
}

function main() {
  if (!existsSync(SOURCE_DB)) {
    console.log(`ℹ pas de base à sauvegarder (${SOURCE_DB} introuvable)`);
    return;
  }
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const target = path.join(BACKUP_DIR, `dev-${timestamp()}.db`);
  copyFileSync(SOURCE_DB, target);
  const sizeKb = (statSync(target).size / 1024).toFixed(1);
  const rotation = rotateOldBackups();
  console.log(
    `💾 backup ${path.basename(target)} (${sizeKb} KB) · ${rotation.kept} backups conservés${rotation.deleted > 0 ? ` · ${rotation.deleted} ancien(s) supprimé(s)` : ""}`,
  );
}

main();
