import "server-only";

import { prisma } from "@/lib/db";
import { logError } from "@/lib/errors";
import { getCurrentUser } from "@/lib/auth/users";

/**
 * Journal d'audit — Sprint 10 (copie du pattern KuroNeko `lib/audit.ts`,
 * enrichi de l'ACTEUR car Youri est multi-user : on veut savoir QUI a fait
 * l'action, pas seulement quoi).
 *
 * `logAudit()` enregistre une trace d'opération sensible dans `AuditEntry`.
 * Échoue silencieusement (log console) — l'audit ne doit JAMAIS bloquer le
 * flux métier si l'insertion échoue.
 *
 * L'acteur est résolu via `getCurrentUser()` (déjà dédupliqué par le `cache()`
 * React dans le même render → pas de query supplémentaire quand l'action a
 * déjà appelé `requireUser()`). `actorName` est un snapshot pour garder la
 * trace lisible même si l'user est supprimé plus tard (relation SetNull).
 */

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "permanently_delete";

export async function logAudit(params: {
  entity: string;
  entityId: string;
  action: AuditAction;
  before?: unknown;
  summary?: string;
}): Promise<void> {
  try {
    const actor = await getCurrentUser();
    await prisma.auditEntry.create({
      data: {
        entity: params.entity,
        entityId: params.entityId,
        action: params.action,
        before: params.before == null ? null : safeStringify(params.before),
        summary: params.summary ?? null,
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? null,
      },
    });
  } catch (e) {
    // L'audit ne doit jamais bloquer une opération métier.
    logError(e, {
      context: "logAudit",
      entity: params.entity,
      action: params.action,
    });
  }
}

/**
 * JSON.stringify qui ne crashe jamais — convertit les Decimal Prisma et les
 * Date proprement, et tronque les très gros objets pour éviter de saturer la
 * base (limite 5000 caractères).
 */
function safeStringify(v: unknown): string {
  try {
    const s = JSON.stringify(v, (_key, value) => {
      if (
        value &&
        typeof value === "object" &&
        value.constructor?.name === "Decimal"
      ) {
        return value.toString();
      }
      return value;
    });
    return s.length > 5000 ? s.slice(0, 5000) + "…(tronqué)" : s;
  } catch {
    return "[non-sérialisable]";
  }
}
