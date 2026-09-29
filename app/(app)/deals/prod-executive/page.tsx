import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Ancienne liste Prod Exé → Productions, onglet « Toutes les dates »
 * (2026-09-29). Les filtres (période, statut, artiste) sont conservés.
 */
export default async function ProdExecutiveRedirect({ searchParams }: PageProps) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ view: "dates" });
  for (const k of ["period", "status", "artist"]) {
    const v = sp[k];
    if (typeof v === "string" && v) qs.set(k, v);
  }
  redirect(`/shows?${qs.toString()}`);
}
