/**
 * Gestion centralisée des erreurs côté serveur.
 *
 * - logError() : log enrichi côté serveur (hook futur Sentry)
 * - humanizeError() : transforme une exception en message user-friendly (FR)
 * - safeAction() : wrapper Server Action qui catch + log + retourne ActionResult
 *
 * Cf. docs/process/code-conventions.md § Server Actions.
 */

import { Prisma } from "@prisma/client";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Log une erreur côté serveur avec un contexte structuré. */
export function logError(error: unknown, context: Record<string, unknown> = {}): void {
  const ts = new Date().toISOString();
  const ctxStr = Object.keys(context).length ? ` ${JSON.stringify(context)}` : "";
  if (error instanceof Error) {
    console.error(`[Youri ${ts}]${ctxStr}`, error.name, error.message);
    if (error.stack && process.env.NODE_ENV !== "production") {
      console.error(error.stack);
    }
  } else {
    console.error(`[Youri ${ts}]${ctxStr}`, error);
  }
}

/**
 * Transforme une erreur en message lisible par l'utilisateur final.
 * Connaît les codes Prisma courants.
 */
export function humanizeError(e: unknown): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2025") return "Élément introuvable";
    if (e.code === "P2002") return "Cette donnée existe déjà (doublon)";
    if (e.code === "P2003") return "Référence invalide";
    if (e.code === "P2014") return "Cette opération romprait une relation existante";
    return `Erreur base de données (${e.code})`;
  }
  if (e instanceof Prisma.PrismaClientValidationError) {
    return "Données invalides envoyées à la base";
  }
  if (e instanceof Error) return e.message;
  return "Erreur inconnue";
}

/**
 * Wrap un Server Action pour log + standardiser le retour.
 *
 * Usage :
 *   export async function createDeal(input: unknown) {
 *     return safeAction("createDeal", async () => {
 *       const data = DealSchema.parse(input);
 *       return prisma.deal.create({ data });
 *     }, { input });
 *   }
 */
export async function safeAction<T>(
  name: string,
  fn: () => Promise<T>,
  context: Record<string, unknown> = {},
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    logError(e, { action: name, ...context });
    return { ok: false, error: humanizeError(e) };
  }
}
