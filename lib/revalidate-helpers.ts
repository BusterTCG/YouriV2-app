import "server-only";

import { revalidatePath } from "next/cache";

/**
 * Invalide le cache Next.js pour toutes les pages impactées par une mutation
 * deal-related (tâche, budget, artiste, charge, MF, production-line, cachet
 * prestation, etc.).
 *
 * Stan 2026-06-02 : centralisé pour éviter d'oublier une page. Couvre :
 *   - /dashboard (KPIs financiers + Mes tâches)
 *   - /taches (workflow séquentiel)
 *   - 3 fiches détail deal (on ignore la catégorie ici — surcoût négligeable)
 *
 * @param dealId — Si fourni, revalide aussi les 3 fiches détail deal.
 */
export function revalidateAfterDealMutation(dealId?: string): void {
  revalidatePath("/dashboard");
  revalidatePath("/taches");
  if (dealId) {
    revalidatePath(`/deals/booking/${dealId}`);
    revalidatePath(`/deals/prod-executive/${dealId}`);
    revalidatePath(`/deals/cachets/${dealId}`);
  }
}

/** Alias historique (Sprint 6) — pointe vers l'helper unifié. */
export const revalidateAfterTaskMutation = revalidateAfterDealMutation;
