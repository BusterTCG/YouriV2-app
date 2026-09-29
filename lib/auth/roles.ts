// Rôles et chemins autorisés — module PUR (Edge middleware, serveur, UI).
//
// Profil « Production » (portage du profil Nour de KuroNeko-App, Stan
// 2026-09-30) : compte booking@pangeeprod.com donné à Nour, externe aux
// associés. Accès limité à :
//   - Productions (deals Production uniquement, accès total) ;
//   - Artistes, Contacts, Lieux (accès total, sans export) ;
//   - Tâches (uniquement celles qui lui sont assignées) ;
//   - Management fees (uniquement les siennes, en lecture : les paiements
//     sont faits par les associés).
// Pas de dashboard, Booking, Cachets, reporting, corbeille ni réglages.

export type AppRole = "ADMIN" | "MEMBER" | "PRODUCTION";

/** Préfixes accessibles au rôle PRODUCTION (pages, impressions, API). */
export const PRODUCTION_PATHS = [
  "/shows",
  "/deals/prod-executive", // anciennes URLs → redirigées vers /shows
  "/deals/management-fees",
  "/artistes",
  "/contacts",
  "/lieux",
  "/taches",
  "/print",
  "/api/production-report",
  "/api/financial-export",
  "/api/fdr-pdf",
] as const;

export function isRestrictedRole(role: string | null | undefined): boolean {
  return role === "PRODUCTION";
}

/** Page d'arrivée après connexion. */
export function homeFor(role: string | null | undefined): string {
  return isRestrictedRole(role) ? "/shows" : "/dashboard";
}

/** Préfixe exact ou sous-chemin : `/showsx` n'est pas `/shows`. */
export function canAccessPath(role: string | null | undefined, pathname: string): boolean {
  if (!isRestrictedRole(role)) return true;
  return PRODUCTION_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
