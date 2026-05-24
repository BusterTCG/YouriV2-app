import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

/**
 * Extension Prisma : ajoute automatiquement `deletedAt: null` à toutes les
 * requêtes find* / count / aggregate / groupBy sur les modèles soft-deletables.
 *
 * Pour récupérer aussi les éléments supprimés (corbeille), utiliser explicitement :
 *   prisma.task.findMany({ where: { deletedAt: { not: null } } })
 *
 * Le filtre n'est appliqué que si `where.deletedAt` n'est PAS déjà spécifié.
 *
 * NOTE Sprint 0 : la liste SOFT_DELETE_MODELS est VIDE pour l'instant — aucun
 * modèle métier n'existe encore. Elle sera peuplée au Sprint 1 (User n'est PAS
 * soft-deletable, juste désactivable via `active: false`), Sprint 2 (Artist),
 * Sprint 3 (Deal + DealArtiste), Sprint 6 (Task), etc.
 *
 * Cf. docs/process/code-conventions.md § Prisma.
 */
const SOFT_DELETE_MODELS = [] as const;

function softDeleteExtension(client: PrismaClient) {
  // Tant que SOFT_DELETE_MODELS est vide, on retourne le client sans extension.
  // Quand on ajoutera des modèles soft-deletables, on étendra ici (cf. KN
  // lib/db.ts pour le pattern complet : query.task.findMany / findFirst /
  // findUnique / count / aggregate / groupBy avec ensureNotDeleted).
  if (SOFT_DELETE_MODELS.length === 0) {
    return client.$extends({ name: "softDelete-noop" });
  }
  return client; // placeholder — vraie impl au Sprint 6
}

function createPrismaClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  return softDeleteExtension(base);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Re-exporte Prisma pour les types (Prisma.PrismaClientKnownRequestError, etc.)
export { Prisma };

// Liste les modèles soft-deletables (utilisé par la page corbeille future)
export const SOFT_DELETABLE = SOFT_DELETE_MODELS;
