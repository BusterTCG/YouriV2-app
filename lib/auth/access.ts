import "server-only";

// Gardes serveur du profil « Production » (Nour, Stan 2026-09-30) — portage
// de lib/auth/access.ts KN. Le middleware bloque les pages par chemin ; ces
// gardes protègent les server actions (appelables hors des pages).

import type { DealCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth/users";
import { isRestrictedRole } from "@/lib/auth/roles";

export const ACCESS_DENIED_MESSAGE = "Accès non autorisé pour ce compte.";
export const PRODUCTION_ONLY_MESSAGE = "Ce compte n'a accès qu'aux deals Production.";

export function isRestricted(user: Pick<CurrentUser, "role">): boolean {
  return isRestrictedRole(user.role);
}

/** Actions réservées aux associés (corbeille, paiements, réglages…). */
export async function requireFullAccess(): Promise<CurrentUser> {
  const user = await requireUser();
  if (isRestricted(user)) throw new Error(ACCESS_DENIED_MESSAGE);
  return user;
}

export function canUseDealCategory(
  user: Pick<CurrentUser, "role">,
  category: DealCategory | string | null | undefined,
): boolean {
  return !isRestricted(user) || category === "PROD_EXE";
}

/** Catégorie d'un nouveau deal. */
export async function requireDealCategoryAccess(category: DealCategory | string): Promise<CurrentUser> {
  const user = await requireUser();
  if (!canUseDealCategory(user, category)) throw new Error(PRODUCTION_ONLY_MESSAGE);
  return user;
}

/** Deal existant (corbeille comprise) : Production uniquement pour ce profil. */
export async function requireDealAccess(dealId: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isRestricted(user)) return user;
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { category: true } });
  if (!deal || deal.category !== "PROD_EXE") throw new Error(PRODUCTION_ONLY_MESSAGE);
  return user;
}

/** Variante page / route : vrai si le compte peut ouvrir ce deal. */
export async function canAccessDeal(dealId: string): Promise<boolean> {
  try {
    await requireDealAccess(dealId);
    return true;
  } catch {
    return false;
  }
}
