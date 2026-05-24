/**
 * Resync les mots de passe des 3 users sur `APP_PASSWORD` (env var).
 *
 * Usage : `npm run db:reset-passwords`
 *
 * Quand l'utiliser :
 *   - Au démarrage initial (Sprint 1) après seed pour appliquer un mdp choisi
 *   - Après changement de `APP_PASSWORD` dans `.env.local` si on veut tout
 *     re-synchroniser
 *   - En cas d'urgence (un user a perdu son mdp et l'ADMIN n'est pas dispo)
 *
 * ⚠️ Cela écrase TOUS les mdp custom (y compris ceux changés via
 * /settings/users). À utiliser intentionnellement.
 *
 * Le seed (`npm run db:seed`) lui NE TOUCHE PAS aux mdp existants — c'est
 * pour ça qu'on a un script séparé.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = process.env.APP_PASSWORD;
  if (!password || password.length < 8) {
    console.error("❌ APP_PASSWORD manquant ou < 8 chars dans .env / .env.local");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  const result = await prisma.user.updateMany({
    data: { passwordHash: hash },
  });

  console.log(`✅ ${result.count} user(s) mdp réinitialisé(s) sur APP_PASSWORD`);
  console.log(`   (mdp : ${password.slice(0, 2)}…${password.slice(-1)}, ${password.length} chars)`);
}

main()
  .catch((e) => {
    console.error("❌ Reset échoué", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
