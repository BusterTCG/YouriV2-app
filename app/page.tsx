import { redirect } from "next/navigation";

/**
 * Racine → redirect vers /dashboard (page principale une fois loggué) ou /login.
 * Au Sprint 0, /dashboard n'existe pas encore — on redirige vers une page
 * placeholder qui sera remplacée au Sprint 1+.
 */
export default function HomePage() {
  redirect("/dashboard");
}
