import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { listVenues, KnApiUnavailableError } from "@/lib/kn-client";
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
  try {
    const result = await listVenues({ q: q || undefined, limit: 100 });
    return (
      <>
        <p className="text-xs text-muted-foreground">
          {result.total} lieu{result.total > 1 ? "x" : ""}
          {q && ` pour "${q}"`}
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
