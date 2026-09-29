import { redirect } from "next/navigation";

/** Ancienne liste Prod Exé → Productions, onglet « Toutes les dates » (2026-09-29). */
export default function ProdExecutiveRedirect() {
  redirect("/shows?view=dates");
}
