"use client";

import { useState } from "react";
import { Mail, Phone, Briefcase, MapPin, ChevronRight, Building2 } from "lucide-react";
import {
  ContactFormDialog,
  type ContactFormDefaults,
} from "./contact-form-dialog";
import {
  contactDisplayName,
  contactInitials,
  contactTypeEmoji,
  contactTypeLabel,
  type VenueOption,
} from "@/lib/contacts-types";
import type { KnContact } from "@/lib/kn-client";

interface Props {
  contacts: KnContact[];
  /** Liste pré-chargée des salles pour le select du dialog d'édition. */
  venues?: VenueOption[];
}

/**
 * Liste verticale des contacts — COPIE FIDÈLE de KuroNeko-App
 * (cf. AGENTS.md règle copie fidèle de KN).
 *
 * Différences avec KN :
 *   - Pas de badge `dealsCount` (Deal Youri arrive Sprint 3)
 *   - venue = { name, city } nested (KN expose venueName/venueCity séparés)
 *   - Couleur accent : --yr-gold au lieu de --yr-gold
 *
 * - Clic sur une carte → dialog d'édition.
 * - Clic sur l'email/tel → action native (mailto:, tel:) sans déclencher l'édition.
 */
export function ContactsList({ contacts, venues = [] }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (contacts.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
        Aucun contact pour ce filtre.
      </div>
    );
  }

  const editing = editingId ? contacts.find((c) => c.id === editingId) : null;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {contacts.map((c) => (
          <ContactCard key={c.id} contact={c} onEdit={() => setEditingId(c.id)} />
        ))}
      </div>

      {editing && (
        <ContactFormDialog
          open
          onOpenChange={(o) => !o && setEditingId(null)}
          defaults={rowToDefaults(editing)}
          venues={venues}
        />
      )}
    </>
  );
}

function rowToDefaults(c: KnContact): ContactFormDefaults {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    company: c.company,
    city: c.city,
    profession: c.profession,
    phone: c.phone,
    email: c.email,
    notes: c.notes,
    type: c.type,
    venueId: c.venueId,
  };
}

function ContactCard({
  contact,
  onEdit,
}: {
  contact: KnContact;
  onEdit: () => void;
}) {
  const name = contactDisplayName(contact);
  const initials = contactInitials(contact);

  return (
    <div
      onClick={onEdit}
      className="rounded-md border bg-card hover:bg-accent/30 transition-colors cursor-pointer group/contact-card"
    >
      <div className="px-3 py-3 flex items-start gap-3">
        {/* Avatar initiales */}
        <div className="shrink-0 h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
          {initials}
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Nom + type badge */}
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium leading-tight truncate" title={name}>
              {name}
            </div>
            <span
              className="shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground"
              title={contactTypeLabel(contact.type)}
            >
              <span>{contactTypeEmoji(contact.type)}</span>
              {contactTypeLabel(contact.type)}
            </span>
          </div>

          {/* Profession (rôle libre, italique discret) */}
          {contact.profession && (
            <div
              className="text-xs italic text-muted-foreground/90 truncate"
              title={contact.profession}
            >
              {contact.profession}
            </div>
          )}

          {/* Société + Ville sur la même ligne (séparés par "·") */}
          {(contact.company || contact.city) && (
            <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap min-w-0">
              {contact.company && (
                <span
                  className="inline-flex items-center gap-1 truncate min-w-0"
                  title={contact.company}
                >
                  <Briefcase className="h-3 w-3 shrink-0" />
                  <span className="truncate">{contact.company}</span>
                </span>
              )}
              {contact.city && (
                <span
                  className="inline-flex items-center gap-1 truncate min-w-0"
                  title={contact.city}
                >
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{contact.city}</span>
                </span>
              )}
            </div>
          )}

          {/* Salle rattachée — affichée uniquement si le contact est lié à un Venue. */}
          {contact.venue && (
            <div
              className="text-xs text-[--yr-gold]/90 inline-flex items-center gap-1 truncate min-w-0"
              title={`Salle : ${contact.venue.name}${contact.venue.city ? " · " + contact.venue.city : ""}`}
            >
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {contact.venue.name}
                {contact.venue.city && (
                  <span className="text-muted-foreground"> · {contact.venue.city}</span>
                )}
              </span>
            </div>
          )}

          {/* Phone + email (cliquables sans propager au card) */}
          {(contact.phone || contact.email) && (
            <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
              {contact.phone && (
                <a
                  href={`tel:${contact.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors tabular-nums"
                >
                  <Phone className="h-3 w-3" />
                  {contact.phone}
                </a>
              )}
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors truncate"
                  title={contact.email}
                >
                  <Mail className="h-3 w-3 shrink-0" />
                  {contact.email}
                </a>
              )}
            </div>
          )}

          {/* Notes (truncate) */}
          {contact.notes && (
            <div
              className="text-xs text-muted-foreground/80 line-clamp-2"
              title={contact.notes}
            >
              {contact.notes}
            </div>
          )}
        </div>

        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover/contact-card:text-muted-foreground transition-colors shrink-0 mt-1" />
      </div>
    </div>
  );
}
