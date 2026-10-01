import { redirect } from "next/navigation";
import { ProductionsView } from "@/components/shows/productions-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Productions — Youri Prod",
};

interface ShowsPageProps {
  searchParams: Promise<{ view?: string; tab?: string }>;
}

/**
 * Accueil Productions (portage KN). L'ancienne vue « Toutes les dates »
 * (?view=dates) est supprimée (Stan 2026-10-01 : doublon des productions ;
 * l'export Excel de toutes les dates est sur l'accueil) → les anciens liens
 * retombent ici.
 */
export default async function ShowsPage({ searchParams }: ShowsPageProps) {
  const sp = await searchParams;
  if (sp.view) redirect("/shows");
  return <ProductionsView tab={sp.tab} />;
}
