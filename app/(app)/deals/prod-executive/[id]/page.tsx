import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Ancienne fiche Prod Exé → fiche date de production /shows/[id] (2026-09-29). */
export default async function ProdExecutiveDetailRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/shows/${id}`);
}
