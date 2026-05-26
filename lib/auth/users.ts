import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

/**
 * Helpers user-side : récupération de l'user courant depuis la session +
 * gardes ADMIN/MEMBER pour les server actions et pages.
 *
 * `cache()` de React = dédup les appels à `getCurrentUser()` dans le même
 * render — si 3 composants l'appellent, on fait 1 seule query Prisma.
 *
 * Cf. docs/architecture-decisions.md § Users & permissions.
 */

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  color: string;
  active: boolean;
  /** Clé associé Pangee (stan / certe / angath / null). Sert au pré-filtrage
   *  de la page /deals/management-fees sur l'associé connecté. */
  pangeeKey: string | null;
}

/**
 * Renvoie l'user courant ou `null` si pas de session valide / user désactivé.
 * Dédupliqué par render React (cache).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      color: true,
      active: true,
      pangeeKey: true,
    },
  });

  // User supprimé de la BDD ou désactivé → traiter comme non connecté.
  if (!user || !user.active) return null;

  return user;
});

/**
 * Exige une session valide. Redirige vers /login si absent.
 * À utiliser en haut des server components / server actions / route handlers
 * qui nécessitent obligatoirement un user connecté.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Exige un user ADMIN. Redirige vers /dashboard si pas ADMIN (pas vers /login,
 * pour ne pas exposer l'existence de la ressource protégée à un MEMBER).
 *
 * À utiliser pour /settings/users et /settings/templates.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== UserRole.ADMIN) redirect("/dashboard");
  return user;
}

/**
 * Vrai si l'user courant est ADMIN. Pour les conditions UI (afficher/masquer
 * un bouton, un lien). NE PAS utiliser comme garde de sécurité — toujours
 * doubler avec `requireAdmin()` dans la server action correspondante.
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === UserRole.ADMIN;
}
