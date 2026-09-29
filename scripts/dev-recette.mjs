// Serveur de RECETTE (étape 4 du contrôle pré-déploiement — porté de KN,
// Stan 2026-09-29).
//
// Lance l'app en local sur une COPIE de la base de production (après
// répétition des migrations), coupée de l'extérieur :
//   - identifiants Google invalides → pas de connexion Google (se connecter
//     avec le mot de passe de secours APP_PASSWORD) ;
//   - clé Resend invalide → aucun email (FDR…) ne part ;
//   - API KN pointée sur le KN LOCAL (http://localhost:3000) → aucune
//     création / modification de contact ou de lieu dans le KN de production.
// La base de dev et le serveur de production ne sont pas touchés.
//
// Usage : node scripts/dev-recette.mjs <base.db>  (ex. backups/recette-source.db =
//         copie de rehearsal-after.db produite par predeploy:rehearsal)
// ⚠️ Arrêter le serveur de dev avant (même dossier .next, même port 3001).

import { copyFileSync, existsSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error("Usage : node scripts/dev-recette.mjs <base.db>");
  process.exit(1);
}
const target = path.join(root, "prisma", "recette.db");
rmSync(`${target}-journal`, { force: true });
copyFileSync(src, target);
const url = `file:${target.replace(/\\/g, "/")}`;

const OFF = "recette-desactive";
console.log(
  `Recette sur ${path.basename(src)} — Google, emails et KN de prod coupés. http://localhost:3001`,
);
const child = spawn("npx", ["next", "dev", "-p", "3001"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    DATABASE_URL: url,
    GOOGLE_CLIENT_ID: OFF,
    GOOGLE_CLIENT_SECRET: OFF,
    RESEND_API_KEY: OFF,
    KN_API_BASE_URL: "http://localhost:3000",
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
