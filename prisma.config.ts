import path from "node:path";
import "dotenv/config";
import { defineConfig } from "@prisma/config";

/**
 * Configuration Prisma — remplace l'ancien `package.json#prisma` (deprecated
 * en Prisma 6, sera supprimé en Prisma 7).
 *
 * ⚠ Note importante : quand un `prisma.config.ts` est détecté, Prisma
 * n'auto-load PAS le `.env` (comportement différent de `package.json#prisma`).
 * On import donc explicitement `dotenv/config` au-dessus pour que la variable
 * `DATABASE_URL` soit disponible côté schema (`env("DATABASE_URL")`).
 *
 * Réf : https://pris.ly/prisma-config
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
