/**
 * GET /api/health
 *
 * Health check pour le pipeline de déploiement (deploy.ps1) et le monitoring
 * externe. Vérifie que l'app répond ET que la DB Postgres/SQLite est accessible.
 *
 * Réponses :
 *   200 { ok: true, db: "up", version }
 *   503 { ok: false, db: "down", error }
 *
 * Pas d'auth — endpoint public exposé pour permettre le health check sans
 * dépendre du cookie session ou de l'API token inter-app.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic"; // pas de cache, doit refléter l'état réel

export async function GET() {
  try {
    // Ping DB le plus simple possible : `SELECT 1` via raw query.
    // Sur Prisma + SQLite : retourne [{ "1": 1 }]
    // Sur Prisma + Postgres : retourne [{ "?column?": 1 }]
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      ok: true,
      db: "up",
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        db: "down",
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
