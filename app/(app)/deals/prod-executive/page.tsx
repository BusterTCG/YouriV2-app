import { redirect } from "next/navigation";

/**
 * Ancienne liste Prod Exé → accueil Productions (la vue « Toutes les dates »
 * est supprimée — Stan 2026-10-01).
 */
export default function ProdExecutiveRedirect() {
  redirect("/shows");
}
