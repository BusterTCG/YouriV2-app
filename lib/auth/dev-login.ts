// Connexion automatique en DEV (Stan 2026-10-16, idem KN) — module pur (middleware
// Edge + route handler).
//
// En dev local, se reconnecter via Google à chaque fois est pénible : sans
// session valide, le middleware envoie vers /api/auth/dev-login qui ouvre une
// session pour DEV_AUTO_LOGIN_EMAIL (.env.local).
//
// Triple garde — JAMAIS actif en prod :
//   1. NODE_ENV === "development" (`next dev` ; `next build/start` = production)
//   2. DEV_AUTO_LOGIN_EMAIL renseigné (uniquement dans .env.local)
//   3. Requête locale (localhost / réseau privé) : un tunnel cloudflared vers
//      le dev garde la page de connexion.

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|[\w-]+\.localhost|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/i;

/** Email de connexion automatique, ou null si la connexion auto est inactive. */
export function devAutoLoginEmail(host: string | null): string | null {
  if (process.env.NODE_ENV !== "development") return null;
  const email = process.env.DEV_AUTO_LOGIN_EMAIL?.trim();
  if (!email || !host || !LOCAL_HOST.test(host)) return null;
  return email;
}

/** Chemin de retour sûr (interne à l'app). */
export function safeReturnPath(from: string | null): string {
  return from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
}
