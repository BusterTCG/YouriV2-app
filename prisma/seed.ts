/**
 * Seed Prisma — Youri V2
 *
 * Sprint 0 : AppSetting bootstrap.
 * Sprint 1 : 3 users (Stan ADMIN, Certe MEMBER, Angath MEMBER) avec mdp bcrypt.
 *
 * Le mdp initial = APP_PASSWORD env var (cf. .env.local). Chaque user peut le
 * changer plus tard via /settings/users (ADMIN reset) ou via un futur écran
 * "mon profil" (Sprint ultérieur).
 *
 * Idempotent : `upsert` partout, peut être rerun sans casser les données
 * existantes (sauf les champs `update:` qui sont remis à jour).
 */
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { slugify } from "../lib/slug";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD =
  process.env.APP_PASSWORD ?? "ChangeMeBeforeProd2026";

const USERS = [
  {
    email: "stan@pangeeprod.com",
    name: "Stan",
    role: UserRole.ADMIN,
    color: "#7c3aed", // violet
  },
  {
    email: "certe@pangeeprod.com",
    name: "Certe",
    role: UserRole.MEMBER,
    color: "#0ea5e9", // bleu cyan
  },
  {
    email: "angath@pangeeprod.com",
    name: "Angath",
    role: UserRole.MEMBER,
    color: "#f59e0b", // amber
  },
] as const;

/**
 * 3 artistes d'exemple pour Sprint 2 — Stan pourra les renommer / supprimer
 * via /artistes. Couleurs pré-choisies pour des badges agréables.
 */
const ARTISTS = [
  { name: "Artiste Test 1", color: "#ec4899" }, // pink
  { name: "Artiste Test 2", color: "#10b981" }, // emerald
  { name: "Artiste Test 3", color: "#f97316" }, // orange
] as const;

async function main() {
  console.log("🌱 Seed Youri V2");

  // ─── AppSetting bootstrap ───
  await prisma.appSetting.upsert({
    where: { key: "bootstrap-version" },
    update: { value: "0.3.0" }, // bump Sprint 2
    create: { key: "bootstrap-version", value: "0.3.0" },
  });
  console.log("  ✓ AppSetting bootstrap-version");

  // ─── 3 artistes d'exemple (idempotent par name unique) ───
  for (const artist of ARTISTS) {
    await prisma.artist.upsert({
      where: { name: artist.name },
      // En update on ne touche pas à color/notes (l'user a pu les personnaliser)
      update: {},
      create: {
        name: artist.name,
        slug: slugify(artist.name),
        color: artist.color,
      },
    });
    console.log(`  ✓ Artist ${artist.name}`);
  }

  // ─── 3 users ───
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  for (const user of USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      // En update on ne touche PAS au mdp (l'user a pu le changer après seed
      // initial). On met juste à jour les méta-données système.
      update: {
        name: user.name,
        role: user.role,
        color: user.color,
        active: true,
      },
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        color: user.color,
        passwordHash,
      },
    });
    console.log(`  ✓ User ${user.name} (${user.role})`);
  }

  console.log("✅ Seed terminé");
  console.log(
    `\nℹ Mdp initial pour les 3 users : APP_PASSWORD du .env (= "${DEFAULT_PASSWORD.slice(0, 4)}…").`,
  );
  console.log(
    "ℹ Au prochain login, change le mdp via /settings/users (ADMIN).\n",
  );
}

main()
  .catch((e) => {
    console.error("❌ Seed échoué", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
