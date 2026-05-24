import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { AuthSource, UserRole } from "@prisma/client";

/**
 * Gestion de la session utilisateur — Youri V2 (multi-user, 3 comptes Pangee).
 *
 * Architecture :
 *   - Cookie HTTP-only `youri-session`
 *   - Contenu = JWT signé HS256 avec `SESSION_SECRET` (env var, 32+ chars)
 *   - Payload = { userId, email, role, source }
 *   - Expiration cookie + JWT = 365 jours
 *
 * Sécurité :
 *   - `httpOnly` : pas accessible en JS côté browser (anti-XSS)
 *   - `secure`   : transmis uniquement en HTTPS (sauf en dev local)
 *   - `sameSite=lax` : pas envoyé en cross-origin POST (anti-CSRF léger)
 *   - `path=/`   : valide sur toute l'app
 *
 * Pour révoquer toutes les sessions actives (perte d'appareil, suspicion
 * de compromission) : changer `SESSION_SECRET` côté serveur et restart →
 * tous les JWT signés avec l'ancien secret deviennent invalides.
 */

const COOKIE_NAME = "youri-session";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 365 jours

export interface SessionPayload extends JWTPayload {
  /** ID Prisma de l'user (cuid). */
  userId: string;
  /** Email de l'user connecté. */
  email: string;
  /** Rôle (ADMIN | MEMBER). */
  role: UserRole;
  /** Source de l'auth (GOOGLE | PASSWORD). Trace pour debug + audit. */
  source: AuthSource;
}

/**
 * Récupère et vérifie la session active depuis le cookie. Retourne `null` si :
 *   - Cookie absent
 *   - JWT invalide ou expiré
 *   - Signature ne matche pas le secret actuel (rotation, fraude)
 *
 * À appeler depuis les server components / server actions / route handlers.
 * Pour OBLIGER une session, utiliser `requireUser()` de lib/auth/users.ts.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    return payload as SessionPayload;
  } catch {
    // Token corrompu, expiré, ou secret a changé → traité comme non connecté.
    return null;
  }
}

/**
 * Crée une session et pose le cookie signé. À appeler depuis les route
 * handlers d'auth après vérification réussie (OAuth callback / mdp valide).
 */
export async function createSession(
  payload: Omit<SessionPayload, "iat" | "exp">,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + COOKIE_MAX_AGE_SECONDS;

  const token = await new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * Détruit la session côté serveur (suppression cookie). Le JWT lui-même
 * reste valide jusqu'à son exp si quelqu'un l'a copié — mais sans cookie le
 * middleware ne pourra plus le lire, donc inoffensif.
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Récupère le secret de signature depuis l'env. Lève une erreur explicite
 * si absent (sinon les JWT seraient signés avec une string vide → trivialement
 * forgeables).
 */
function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET manquant ou trop court (32+ caractères requis). " +
        "Génère via : node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return new TextEncoder().encode(secret);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
