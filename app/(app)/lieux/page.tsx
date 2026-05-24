import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { listVenues, KnApiUnavailableError } from "@/lib/kn-client";
import { parseVenueQuery } from "@/lib/venue-search";
import { VenuesList } from "@/components/venues/venues-list";
import { VenuesSearch } from "@/components/venues/venues-search";
import { NewVenueButton } from "@/components/venues/new-venue-button";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function VenuesPage({ searchParams }: PageProps) {
  const { q } = await searchParams;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lieux</h1>
          <p className="text-sm text-muted-foreground">
            Annuaire partagé avec KuroNeko (single writer authoritatif).
          </p>
        </div>
        <NewVenueButton />
      </div>

      <VenuesSearch />

      <Suspense fallback={<VenuesLoading />}>
        <VenuesFetcher q={q ?? ""} />
      </Suspense>
    </div>
  );
}

async function VenuesFetcher({ q }: { q: string }) {
  // Parse multi-token query : "paris +250" → { freeText: "paris", capacityMin: 250 }
  // Le parseur est COPIE FIDÈLE de KN (cf. lib/venue-search.ts).
  const parsed = parseVenueQuery(q);
  const params = {
    q: parsed.freeText || undefined,
    capacityMin: parsed.capacityMin,
    capacityMax: parsed.capacityMax,
    limit: 100,
  };

  try {
    const result = await listVenues(params);
    const capacityHint =
      parsed.capacityMin != null && parsed.capacityMax != null
        ? ` jauge ${parsed.capacityMin}-${parsed.capacityMax}`
        : parsed.capacityMin != null
          ? ` jauge ≥ ${parsed.capacityMin}`
          : parsed.capacityMax != null
            ? ` jauge ≤ ${parsed.capacityMax}`
            : "";
    return (
      <>
        <p className="text-xs text-muted-foreground">
          {result.total} lieu{result.total > 1 ? "x" : ""}
          {q && ` pour "${q}"`}
          {capacityHint && (
            <span className="text-[--yr-gold]"> · filtre{capacityHint}</span>
          )}
        </p>
        <VenuesList venues={result.items} />
      </>
    );
  } catch (e) {
    if (e instanceof KnApiUnavailableError) {
      return (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-start gap-3 py-6">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Annuaire indisponible</p>
              <p className="mt-1 text-sm text-muted-foreground">
                L&apos;API KuroNeko ne répond pas. Vérifie que l&apos;app KN tourne
                ({process.env.KN_API_BASE_URL ?? "—"}) et réessaie dans quelques
                secondes.
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }
    throw e;
  }
}

function VenuesLoading() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="py-6">
            <div className="h-12 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
