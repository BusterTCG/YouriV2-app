import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { listContacts, KnApiUnavailableError } from "@/lib/kn-client";
import { ContactsList } from "@/components/contacts/contacts-list";
import { ContactsSearch } from "@/components/contacts/contacts-search";
import { NewContactButton } from "@/components/contacts/new-contact-button";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

/**
 * Page /contacts — wrapper UI sur l'API externe KuroNeko (annuaire partagé).
 *
 * Toutes les lectures passent par lib/kn-client → KN /api/external/contacts.
 * Si KN est down, on affiche un message d'erreur explicite ("Annuaire
 * indisponible") au lieu de planter en 500.
 */
export default async function ContactsPage({ searchParams }: PageProps) {
  const { q } = await searchParams;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            Annuaire partagé avec KuroNeko (single writer authoritatif).
          </p>
        </div>
        <NewContactButton />
      </div>

      <ContactsSearch />

      <Suspense fallback={<ContactsLoading />}>
        <ContactsFetcher q={q ?? ""} />
      </Suspense>
    </div>
  );
}

async function ContactsFetcher({ q }: { q: string }) {
  try {
    const result = await listContacts({ q: q || undefined, limit: 100 });
    return (
      <>
        <p className="text-xs text-muted-foreground">
          {result.total} contact{result.total > 1 ? "s" : ""}
          {q && ` pour "${q}"`}
        </p>
        <ContactsList contacts={result.items} />
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
    throw e; // laisse l'error boundary segment gérer
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
