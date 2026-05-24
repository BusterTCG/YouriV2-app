/**
 * POST /api/auth/logout
 *
 * Détruit la session côté serveur (suppression du cookie youri-session).
 * Le JWT lui-même reste valide jusqu'à son exp si quelqu'un l'a copié — mais
 * sans cookie le middleware ne pourra plus le lire.
 */
import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
