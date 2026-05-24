import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Middleware Next.js — protège TOUTES les routes de l'app sauf une liste
 * explicite de routes publiques. S'exécute sur l'Edge Runtime à chaque
 * requête avant le rendu de la page / l'exécution du handler.
 *
 * Logique :
 *   1. Route publique (login, callback OAuth, assets statiques) → laisse passer
 *   2. Cookie youri-session présent + JWT valide → laisse passer
 *   3. Sinon → redirection 307 vers /login (pour les pages) ou 401 (pour les API)
 *
 * Note Edge Runtime : `jose` est compatible Edge (utilise WebCrypto natif),
 * contrairement aux libs jsonwebtoken classiques. C'est pour ça qu'on n'a pas
 * utilisé `prisma` ici (incompat Edge sans Accelerate).
 */

const SESSION_COOKIE = "youri-session";

/** Routes publiques : tout le reste est protégé par le middleware. */
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/google",
  "/api/auth/google/callback",
  "/api/auth/password",
  "/api/auth/logout",
  // Health check public (utilisé par deploy.ps1 + monitoring) — pas d'auth
  // pour permettre le check sans cookie.
  "/api/health",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Routes publiques — laisse passer sans vérif
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Vérif session
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
      return NextResponse.next(); // session valide
    } catch {
      // JWT invalide / expiré → traité comme non connecté ci-dessous
    }
  }

  // Pas connecté
  if (pathname.startsWith("/api/")) {
    // API → 401 JSON pour ne pas casser les clients fetch (ils peuvent
    // intercepter ce code pour rediriger l'user).
    return NextResponse.json(
      { ok: false, error: "Non authentifié" },
      { status: 401 },
    );
  }

  // Page → redirection vers /login avec ?from=... pour revenir après login
  const loginUrl = new URL("/login", req.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("from", pathname);
  }
  return NextResponse.redirect(loginUrl);
}

/**
 * Matcher : applique le middleware à toutes les routes SAUF :
 *   - /_next/* (assets Next.js)
 *   - /favicon.ico et autres assets racine
 *   - /uploads/* (fichiers uploads users — peut être servi publiquement)
 *   - icones PWA / Apple Touch / favicon PNG (servies depuis public/)
 *   - manifest.webmanifest (PWA manifest)
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|uploads|apple-touch-icon.png|icon-180.png|icon-192.png|icon-512.png|icon-1024.png|favicon-32.png|logo-mark.png|manifest.webmanifest).*)",
  ],
};

/**
 * Récupère le secret depuis l'env du runtime Edge. Fail-closed si absent :
 * refuse TOUTES les sessions et redirige tout sur /login (pour éviter qu'une
 * erreur de config laisse l'app ouverte).
 */
function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    console.error(
      "[middleware] SESSION_SECRET manquant ou trop court — toutes les sessions rejetées.",
    );
    throw new Error("SESSION_SECRET non configuré");
  }
  return new TextEncoder().encode(secret);
}
