/**
 * GET /api/auth/google
 *
 * Initie le flow OAuth 2.0 Google : construit l'URL d'authorize Google et
 * redirige le navigateur vers cette URL. Google demande à l'user de se
 * connecter + consentir, puis redirige vers /api/auth/google/callback.
 *
 * Pré-requis env :
 *   - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (Google Cloud Console → OAuth Client)
 *   - GOOGLE_SIGNIN_REDIRECT_URI (URI déclarée comme authorized dans la console)
 *
 * Cf. docs/process/vps-deploy.md § OAuth Google.
 */
import { NextResponse } from "next/server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_SIGNIN_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Google OAuth non configuré (GOOGLE_CLIENT_ID / GOOGLE_SIGNIN_REDIRECT_URI absents). " +
          "Utilise le mot de passe de secours pour l'instant.",
      },
      { status: 503 },
    );
  }

  // Préserve la destination d'origine (si l'user voulait /deals et a été
  // redirigé vers /login, on veut le ramener à /deals après login).
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "/dashboard";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    // `state` = transport opaque pour ramener la destination après callback.
    // Pas de signature ici (le but est juste de remember `from`, pas de gérer
    // un anti-CSRF — Google gère ça via le code one-time).
    state: from,
  });

  return NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
}
