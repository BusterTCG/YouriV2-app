// @vitest-environment node
//
// Garde-fou anti-dérive KuroNeko-App ↔ YouriV2-app (Stan 2026-10-01).
//
// Les fichiers ci-dessous sont COMMUNS aux deux apps (même fichier, même
// chemin) : ce test échoue s'ils divergent. Seuls les écarts voulus sont
// neutralisés avant comparaison :
//   - lignes de commentaire (en-têtes « portage KN », dates…) ;
//   - couleur de marque (kn-gold / yr-gold) ;
//   - statut annulé (CANCELLED / ANNULE) ;
//   - chemin du composant SensitiveAmount (shared / dashboard).
//
// Fichier identique dans les deux repos. Le repo jumeau doit être cloné à
// côté (C:\Users\stani\Dev\…) ; sinon le test est ignoré (VPS, CI).
//
// Modifier un fichier commun = le reporter dans l'autre repo (ou retirer le
// fichier de la liste en expliquant pourquoi il diverge).

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const SHARED_FILES = [
  "lib/date-lifecycle.ts",
  "lib/production-glossary.ts",
  "lib/finance/settlement-rules.ts",
  "lib/residency-shared-fields.ts",
  "components/shows/kpi-visuals.tsx",
  "components/shows/stage-pill.tsx",
  "components/shows/glossary-hint.tsx",
  "components/shows/settled-banner.tsx",
  "components/shows/close-production-button.tsx",
  "components/shows/production-create-button.tsx",
  "components/shows/date-rows.tsx",
  "components/shows/upcoming-list.tsx",
];

const here = process.cwd();
const pkgName = JSON.parse(readFileSync(path.join(here, "package.json"), "utf8")).name as string;
const twinDir = path.resolve(here, "..", pkgName.startsWith("kuroneko") ? "YouriV2-app" : "KuroNeko-App");
const hasTwin = existsSync(path.join(twinDir, "package.json"));

export function normalize(src: string): string {
  return src
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*") || t === "");
    })
    .join("\n")
    .replace(/\b(kn|yr)-gold\b/g, "BRAND-gold")
    .replace(/"(CANCELLED|ANNULE)"/g, '"CANCELLED_STATUS"')
    .replace(/@\/components\/(shared|dashboard)\/sensitive-amount/g, "@/components/SENSITIVE/sensitive-amount");
}

describe.skipIf(!hasTwin)("fichiers communs KuroNeko-App ↔ YouriV2-app", () => {
  for (const file of SHARED_FILES) {
    it(file, () => {
      const mine = path.join(here, file);
      const twin = path.join(twinDir, file);
      expect(existsSync(mine), `${file} absent ici`).toBe(true);
      expect(existsSync(twin), `${file} absent du repo jumeau`).toBe(true);
      expect(normalize(readFileSync(mine, "utf8"))).toBe(normalize(readFileSync(twin, "utf8")));
    });
  }
});
