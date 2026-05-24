"use client";

import { useState } from "react";
import { Pencil, Building2, MapPin, Phone, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";
import type { KnContact, ContactType } from "@/lib/kn-client";
import type { VenueOption } from "@/lib/contacts-types";

const TYPE_LABELS: Record<ContactType, string> = {
  ORGANIZER: "Organisateur",
  AGENCY: "Agence",
  ARTIST: "Artiste",
  PRODUCTION: "Production",
  TECHNICAL: "Technique",
  PRESS: "Presse",
  BRAND: "Marque",
  OTHER: "Autre",
};

export function ContactsList({
  contacts,
  venues = [],
}: {
  contacts: KnContact[];
  venues?: VenueOption[];
}) {
  const [editing, setEditing] = useState<KnContact | null>(null);

  if (contacts.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">Aucun contact pour cette recherche.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {contacts.map((contact) => (
          <Card key={contact.id} className="transition-shadow hover:shadow-sm">
            <CardContent className="flex items-start justify-between gap-4 py-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {contact.firstName} {contact.lastName ?? ""}
                  </p>
                  <Badge variant="muted">{TYPE_LABELS[contact.type]}</Badge>
                  {contact.profession && (
                    <span className="text-xs text-muted-foreground">
                      · {contact.profession}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {contact.company && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {contact.company}
                    </span>
                  )}
                  {contact.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {contact.city}
                    </span>
                  )}
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} className="flex items-center gap-1 hover:text-foreground">
                      <Phone className="h-3 w-3" />
                      {contact.phone}
                    </a>
                  )}
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="flex items-center gap-1 hover:text-foreground">
                      <Mail className="h-3 w-3" />
                      {contact.email}
                    </a>
                  )}
                </div>
                {contact.notes && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{contact.notes}</p>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEditing(contact)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {editing && (
        <ContactFormDialog
          open={true}
          onOpenChange={(o) => !o && setEditing(null)}
          defaults={{
            id: editing.id,
            firstName: editing.firstName,
            lastName: editing.lastName,
            company: editing.company,
            city: editing.city,
            profession: editing.profession,
            phone: editing.phone,
            email: editing.email,
            notes: editing.notes,
            type: editing.type,
            venueId: editing.venueId,
          }}
          venues={venues}
        />
      )}
    </>
  );
}
