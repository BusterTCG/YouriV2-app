/**
 * POST /api/auth/password
 *
 * Login mot de passe de secours — multi-user.
 * Body : `{ email: string, password: string }`
 *
 * Logique :
 *   1. Cherche l'user actif avec cet email
 *   2. Compare le password avec passwordHash via bcrypt (constant-time interne)
 *   3. Si OK → crée la session JWT (cookie youri-session) + 200
 *   4. Si KO → 401 + délai artificiel ~250ms (anti-bruteforce)
 *
 * NB : on ne distingue PAS "user inconnu" vs "mauvais mdp" dans la réponse
 * (toujours "Identifiants invalides") pour ne pas permettre l'énumération
 * d'emails.
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Email et mot de passe requis" },
      { status: 400 },
    );
  }

  // ATTENTION : on cherche TOUS les users (actifs ET désactivés) pour calculer
  // le hash et avoir un temps constant. Le check `active` se fait après la
  // comparaison bcrypt — sinon on leak l'existence du compte par timing.
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      active: true,
      passwordHash: true,
    },
  });

  // Hash bidon de longueur réaliste pour préserver le timing constant
  // quand l'user n'existe pas (bcrypt sans données vraies serait trop rapide).
  const DUMMY_HASH =
    "$2b$10$abcdefghijklmnopqrstuv.uvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcde";

  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid || !user.active) {
    // Délai artificiel pour rendre le bruteforce coûteux.
    await new Promise((r) => setTimeout(r, 250));
    return NextResponse.json(
      { ok: false, error: "Identifiants invalides" },
      { status: 401 },
    );
  }

  await createSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    source: "PASSWORD",
  });

  // Update lastLogin (non bloquant — fire & forget)
  prisma.user
    .update({
      where: { id: user.id },
      data: { lastAuthSource: "PASSWORD", lastLoginAt: new Date() },
    })
    .catch((e) => console.error("[auth/password] lastLogin update failed", e));

  return NextResponse.json({ ok: true });
}
