import { Users, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { listContacts, listVenues, KnApiUnavailableError } from "@/lib/kn-client";
import { parseTypeFilter, type ContactsListType } from "@/lib/contacts-types";
import { ContactsFilters } from "@/components/contacts/contacts-filters";
import { ContactsList } from "@/components/contacts/contacts-list";
import { NewContactButton } from "@/components/contacts/new-contact-button";
import { ContactsExportButton } from "@/components/contacts/contacts-export-button";
import type { VenueOption } from "@/lib/contacts-types";

export const dynamic = "force-dynamic";

interface ContactsPageProps {
  searchParams: Promise<{ type?: string; q?: string }>;
}

export const metadata = {
  title: "Contacts — Youri",
};

/**
 * Page /contacts — COPIE FIDÈLE de KuroNeko-App (cf. AGENTS.md règle copie
 * fidèle).
 *
 * Layout :
 *   - Header : "CONTACTS · N FICHE(S)" + titre + description + actions
 *     (Exporter + Nouveau contact)
 *   - ContactsFilters : recherche + segmented control par type avec compteurs
 *   - ContactsList : cards des contacts filtrés
 *
 * Différence KN : Youri ne stocke pas Contact en local — toutes les données
 * viennent de l'API KN /api/external/contacts (incluant countsByType pour les
 * badges et `venue: { name, city }` pour la salle rattachée).
 */
export default async function ContactsPage({ searchParams }: ContactsPageProps) {
  const sp = await searchParams;
  const type = parseTypeFilter(sp.type);
  const search = sp.q ?? "";

  // Si KN est down, on affiche la page avec un état d'erreur clair plutôt
  // que de crasher en 500. Fallback : compteurs à 0, liste vide, dropdown
  // venues vide (form caché).
  let data: {
    items: Awaited<ReturnType<typeof listContacts>>["items"];
    countsByType: Awaited<ReturnType<typeof listContacts>>["countsByType"];
  } | null = null;
  let venues: VenueOption[] = [];
  let apiDown = false;

  try {
    const [contactsRes, venuesRes] = await Promise.all([
      listContacts({
        q: search || undefined,
        type: type === "all" ? undefined : type,
        limit: 200,
      }),
      listVenues({ limit: 200 }),
    ]);
    data = { items: contactsRes.items, countsByType: contactsRes.countsByType };
    venues = venuesRes.items.map((v) => ({ id: v.id, name: v.name, city: v.city }));
  } catch (e) {
    if (e instanceof KnApiUnavailableError) {
      apiDown = true;
    } else {
      throw e;
    }
  }

  const totalAll = data?.countsByType.all ?? 0;

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <Users className="h-3.5 w-3.5" />
            Contacts · {totalAll} fiche{totalAll > 1 ? "s" : ""}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground text-sm">
            Annuaire centralisé : organisateurs, équipe production, presse,
            marques. Recherche full-text et filtre par type. Partagé avec
            KuroNeko (single writer authoritatif).
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-start sm:justify-end sm:shrink-0">
          {data && (
            <ContactsExportButton
              contacts={data.items}
              typeFilter={type}
            />
          )}
          <NewContactButton venues={venues} />
        </div>
      </div>

      {apiDown ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-start gap-3 py-6">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Annuaire indisponible</p>
              <p className="mt-1 text-sm text-muted-foreground">
                L&apos;API KuroNeko ne répond pas. Vérifie que l&apos;app KN
                tourne ({process.env.KN_API_BASE_URL ?? "—"}) et réessaie dans
                quelques secondes.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        data && (
          <>
            <ContactsFilters
              currentType={type as ContactsListType}
              currentSearch={search}
              countsByType={data.countsByType}
            />
            <ContactsList contacts={data.items} venues={venues} />
          </>
        )
      )}
    </div>
  );
}
