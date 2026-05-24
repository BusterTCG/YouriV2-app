import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { listContacts, listVenues, KnApiUnavailableError } from "@/lib/kn-client";
import { ContactsList } from "@/components/contacts/contacts-list";
import { ContactsSearch } from "@/components/contacts/contacts-search";
import { NewContactButton } from "@/components/contacts/new-contact-button";
import type { VenueOption } from "@/lib/contacts-types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

/**
 * Page /contacts — wrapper UI sur l'API externe KuroNeko (annuaire partagé).
 *
 * Lit DEUX flux KN en parallèle :
 *   - listContacts() : la liste filtrée + paginée
 *   - listVenues() : pour le dropdown "Salle rattachée" du form contact
 *
 * Si KN est down → message "Annuaire indisponible" au lieu de 500.
 */
export default async function ContactsPage({ searchParams }: PageProps) {
  const { q } = await searchParams;

  // Fetch venues (pour le dropdown form) en parallèle de la liste contacts.
  // Si KN est down, on garde quand même la page → l'erreur sera affichée
  // dans le Suspense child.
  const venues = await listVenuesSafe();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            Annuaire partagé avec KuroNeko (single writer authoritatif).
          </p>
        </div>
        <NewContactButton venues={venues} />
      </div>

      <ContactsSearch />

      <Suspense fallback={<ContactsLoading />}>
        <ContactsFetcher q={q ?? ""} venues={venues} />
      </Suspense>
    </div>
  );
}

async function listVenuesSafe(): Promise<VenueOption[]> {
  try {
    const result = await listVenues({ limit: 200 });
    return result.items.map((v) => ({ id: v.id, name: v.name, city: v.city }));
  } catch {
    // KN down : on retourne une liste vide → le dropdown "Salle rattachée"
    // sera caché (cf. ContactFormDialog `{venues.length > 0 && ...}`).
    return [];
  }
}

async function ContactsFetcher({ q, venues }: { q: string; venues: VenueOption[] }) {
  try {
    const result = await listContacts({ q: q || undefined, limit: 100 });
    return (
      <>
        <p className="text-xs text-muted-foreground">
          {result.total} contact{result.total > 1 ? "s" : ""}
          {q && ` pour "${q}"`}
        </p>
        <ContactsList contacts={result.items} venues={venues} />
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

function ContactsLoading() {
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
