import "server-only";
import { revalidatePath } from "next/cache";

/**
 * Revalide toutes les routes deals (liste + fiche détail) pour les 3
 * catégories simultanément (Booking + Prod Exé + Cachets).
 *
 * Pourquoi : un même `Deal` peut appartenir à n'importe laquelle des 3
 * catégories, et de nombreuses actions (status, paid status, artiste,
 * charge…) sont partagées. Plutôt que de revalider catégorie par catégorie
 * (et risquer d'en oublier une — cf. audit Sprint 5), on revalide les 3
 * en un appel.
 *
 * Coût : minimal — Next.js no-op si la route n'a pas été générée.
 *
 * @param dealId Si fourni, revalide aussi `/deals/<cat>/<dealId>`
 * @param includeMf Si true, revalide aussi `/deals/management-fees`
 */
export function revalidateAllDealRoutes(
  dealId?: string,
  includeMf: boolean = false,
): void {
  revalidatePath("/deals");
  revalidatePath("/deals/booking");
  revalidatePath("/deals/prod-executive");
  revalidatePath("/deals/cachets");
  if (dealId) {
    revalidatePath(`/deals/booking/${dealId}`);
    revalidatePath(`/deals/prod-executive/${dealId}`);
    revalidatePath(`/deals/cachets/${dealId}`);
  }
  if (includeMf) {
    revalidatePath("/deals/management-fees");
  }
}
