/**
 * Seed Prisma — Youri V2
 *
 * Sprint 0 : seed minimal (AppSetting "bootstrap-version" = "0.1.0").
 * Sera enrichi au Sprint 1 (3 users seedés), Sprint 2 (Artist exemples),
 * Sprint 6 (TaskTemplate par défaut), etc.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seed Youri V2 — bootstrap");

  await prisma.appSetting.upsert({
    where: { key: "bootstrap-version" },
    update: { value: "0.1.0" },
    create: { key: "bootstrap-version", value: "0.1.0" },
  });

  console.log("✅ Seed terminé");
}

main()
  .catch((e) => {
    console.error("❌ Seed échoué", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
