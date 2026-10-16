/**
 * GET /api/auth/dev-login?from=/dashboard
 *
 * Connexion automatique en DEV uniquement (Stan 2026-10-16, idem KN) — ouvre
 * une session pour l'user actif DEV_AUTO_LOGIN_EMAIL puis renvoie vers
 * `from`. 404 en prod, sans l'env var ou hors réseau local (cf.
 * lib/auth/dev-login.ts).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { devAutoLoginEmail, safeReturnPath } from "@/lib/auth/dev-login";

export async function GET(req: Request) {
  const email = devAutoLoginEmail(req.headers.get("host"));
  if (!email) return new NextResponse("Not found", { status: 404 });
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, active: true },
  });
  if (!user?.active) return new NextResponse(`Aucun user actif « ${email} »`, { status: 404 });
  await createSession({ userId: user.id, email: user.email, role: user.role, source: "PASSWORD" });
  const url = new URL(req.url);
  return NextResponse.redirect(new URL(safeReturnPath(url.searchParams.get("from")), url));
}
