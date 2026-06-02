import "server-only";

import { getCurrentTasksForAssignee } from "@/lib/queries/tasks";
import type { DealCategory } from "@prisma/client";

/**
 * Notifications dérivées à la volée — Sprint 8 Stan 2026-06-02.
 *
 * Pattern KN (cf. `KuroNeko-App/lib/notifications.ts`) : pas de table BDD
 * dédiée, on agrège à la volée depuis les data existantes. Toujours frais,
 * pas de désync possible.
 *
 * V1 : une seule catégorie — "Mes tâches courantes" (1re TODO par deal
 * assignée à l'user connecté). Les autres alertes (à facturer, à reverser,
 * cette semaine) sont déjà dans /dashboard et n'ont pas besoin d'être
 * dupliquées dans la cloche pour V1.
 *
 * Extensions possibles V2 :
 *   - `to_invoice_old` : deals > 30j sans budget PAID
 *   - `to_pay_artist`  : Pangee encaissé mais artiste pas payé
 *   - `briefing_due`   : FDR incomplète sur deal < J+14
 */

export type NotificationKind = "my_task";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  /** Sous-titre court (catégorie deal + titre deal). */
  subtitle: string;
  /** Date du deal liée (pour afficher la deadline implicite). */
  date: Date;
  category: DealCategory;
  /** URL fiche détail deal pour ouvrir au clic. */
  href: string;
}

/** URL fiche détail deal par catégorie (= dashboard.ts dealHref). */
function dealHref(category: DealCategory, id: string): string {
  switch (category) {
    case "BOOKING":
      return `/deals/booking/${id}`;
    case "PROD_EXE":
      return `/deals/prod-executive/${id}`;
    case "CACHETS":
      return `/deals/cachets/${id}`;
  }
}

/**
 * Charge les notifications de l'user. Retourne `[]` si l'user n'a pas de
 * `pangeeKey` (= pas d'associé Pangee, donc pas de tâches assignées).
 */
export async function getNotifications(opts: {
  myPangeeKey: string | null;
}): Promise<NotificationItem[]> {
  const { myPangeeKey } = opts;
  if (!myPangeeKey) return [];

  const myTasks = await getCurrentTasksForAssignee(myPangeeKey);
  return myTasks.map<NotificationItem>((t) => ({
    id: t.id,
    kind: "my_task",
    title: t.label,
    subtitle: t.deal.title,
    date: t.deal.date,
    category: t.deal.category,
    href: dealHref(t.deal.category, t.deal.id),
  }));
}
