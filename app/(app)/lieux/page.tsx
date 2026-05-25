import { Building2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { KnApiUnavailableError } from "@/lib/kn-client";
import { getVenuesList } from "@/lib/venues-local";
import { VenuesList } from "@/components/venues/venues-list";
import { VenuesSearch } from "@/components/venues/venues-search";
import { NewVenueButton } from "@/components/venues/new-venue-button";
import { VenuesExportButton } from "@/components/venues/venues-export-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lieux — Pangee Prod",
};

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function VenuesPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const search = q ?? "";

  // Capture l'erreur "annuaire KN down" pour basculer en mode dégradé,
  // mais on construit le header avant pour qu'il reste visible.
  let data: Awaited<ReturnType<typeof getVenuesList>> | null = null;
  let knError: KnApiUnavailableError | null = null;
  try {
    data = await getVenuesList({ search });
  } catch (e) {
    if (e instanceof KnApiUnavailableError) knError = e;
    else throw e;
  }

  const count = data?.venues.length ?? 0;
  const parsed = data?.parsedQuery;
  const capacityHint =
    parsed?.capacityMin != null && parsed?.capacityMax != null
      ? ` jauge ${parsed.capacityMin}-${parsed.capacityMax}`
      : parsed?.capacityMin != null
        ? ` jauge ≥ ${parsed.capacityMin}`
        : parsed?.capacityMax != null
          ? ` jauge ≤ ${parsed.capacityMax}`
          : "";

  return (
    <div className="max-w-6xl space-y-5">
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <Building2 className="h-3.5 w-3.5" />
            Lieux · {count} salle{count > 1 ? "s" : ""}
            {capacityHint && (
              <span className="text-[--yr-gold]">· filtre{capacityHint}</span>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Lieux</h1>
          <p className="text-muted-foreground text-sm">
            Théâtres, salles, festivals : ton annuaire des lieux où tu
            programmes. Partagé avec KuroNeko (single writer authoritatif),
            lié aux deals Pangee et aux contacts (programmateur, régie…).
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {data && (
            <VenuesExportButton venues={data.venues} search={search} />
          )}
          <NewVenueButton />
        </div>
      </div>

      <VenuesSearch defaultValue={search} />

      {knError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-start gap-3 py-6">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">
                Annuaire indisponible
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                L&apos;API KuroNeko ne répond pas. Vérifie que l&apos;app KN
                tourne ({process.env.KN_API_BASE_URL ?? "—"}) et réessaie dans
                quelques secondes.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        data && <VenuesList venues={data.venues} />
      )}
    </div>
  );
}
