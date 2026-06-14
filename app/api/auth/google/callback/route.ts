/**
 * GET /api/auth/google/callback
 *
 * Callback OAuth 2.0 Google. Reçoit `?code=...&state=...` après que l'user a
 * consenti, échange le code contre un access_token + id_token Google, vérifie
 * l'email retourné contre la whitelist `AUTH_ALLOWED_EMAILS`, et crée la
 * session si OK.
 *
 * Note : on n'importe PAS la lib `googleapis` ici (lourde) — un simple POST
 * vers le token endpoint Google + parse du id_token (JWT) suffit.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token: string;
}

interface GoogleIdTokenPayload {
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "/dashboard";
  const error = url.searchParams.get("error");

  if (error) {
    return loginError(`OAuth refusé : ${error}`);
  }
  if (!code) {
    return loginError("Code OAuth manquant");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_SIGNIN_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return loginError("Google OAuth non configuré côté serveur");
  }

  // 1. Échange code → token Google
  let token: GoogleTokenResponse;
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error("[google/callback] token exchange failed", res.status, txt);
      return loginError("Échange OAuth échoué");
    }
    token = (await res.json()) as GoogleTokenResponse;
  } catch (e) {
    console.error("[google/callback] fetch failed", e);
    return loginError("Erreur réseau OAuth");
  }

  // 2. Parse l'id_token (JWT — partie payload base64url décodée)
  // Pas de vérif signature ici : on vient de l'échanger via HTTPS directement
  // avec Google + on utilise nos client_secret/code → confiance suffisante.
  const idTokenPayload = decodeJwtPayload<GoogleIdTokenPayload>(token.id_token);
  if (!idTokenPayload || !idTokenPayload.email) {
    return loginError("id_token Google invalide");
  }
  if (!idTokenPayload.email_verified) {
    return loginError("Email Google non vérifié");
  }

  const email = idTokenPayload.email.toLowerCase();

  // 3. Vérif whitelist
  const allowedEmails = (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (allowedEmails.length === 0) {
    return loginError("AUTH_ALLOWED_EMAILS non configuré côté serveur");
  }
  if (!allowedEmails.includes(email)) {
    return loginError("Email non autorisé");
  }

  // 4. Cherche le user en BDD (créé via seed). On le crée pas à la volée —
  // si l'email est whitelist mais pas seedé, c'est un état incohérent, on
  // log et refuse.
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      active: true,
    },
  });

  if (!user) {
    console.error(`[google/callback] email whitelist mais pas en BDD : ${email}`);
    return loginError("Compte non provisionné — contacte l'administrateur");
  }
  if (!user.active) {
    return loginError("Compte désactivé");
  }

  // 5. Crée la session
  await createSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    source: "GOOGLE",
  });

  prisma.user
    .update({
      where: { id: user.id },
      data: { lastAuthSource: "GOOGLE", lastLoginAt: new Date() },
    })
    .catch((e) => console.error("[google/callback] lastLogin update failed", e));

  // 6. Redirect vers la destination originelle (ou /dashboard).
  // Garde anti open-redirect : on rejette les URLs protocol-relative (`//evil`)
  // et `/\evil` qui résoudraient vers un domaine externe (audit 2026-06-15).
  const dest =
    state.startsWith("/") &&
    !state.startsWith("//") &&
    !state.startsWith("/\\")
      ? state
      : "/dashboard";
  return NextResponse.redirect(new URL(dest, req.url));
}

// ─────────── Helpers ───────────

function loginError(message: string): NextResponse {
  // Redirect /login?error=... pour afficher l'erreur dans l'UI au lieu de
  // crasher en JSON brut.
  const url = new URL("/login", "http://x");
  url.searchParams.set("error", message);
  return NextResponse.redirect(url.pathname + url.search, { status: 307 });
}

function decodeJwtPayload<T>(jwt: string): T | null {
  try {
    const [, payload] = jwt.split(".");
    if (!payload) return null;
    // base64url → base64
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
