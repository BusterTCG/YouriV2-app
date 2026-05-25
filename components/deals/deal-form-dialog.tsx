"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { DealCategory } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { createDeal, updateDealMeta } from "@/lib/actions/deals";
import { ContactPicker, type ContactSnapshot } from "./contact-picker";
import { VenuePicker, type VenueSnapshot } from "./venue-picker";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";
import { VenueFormDialog } from "@/components/venues/venue-form-dialog";

/**
 * Dialog Nouveau deal / Modifier deal — Phase 3.5c.
 *
 * Champs :
 *   - Titre / Date / Heure
 *   - Organisateur (ContactPicker depuis KN) + bouton "+" création rapide
 *   - Lieu (VenuePicker depuis KN) + bouton "+" création rapide
 *   - Adresse libre BAN (si pas de lieu KN — booking entreprise par ex.)
 *   - Notes
 *
 * Si pas de venueId mais adresse libre : la ville du tableau récap est
 * extraite automatiquement du code postal BAN (côté server action).
 */
export interface DealFormDeal {
  id: string;
  title: string;
  date: Date;
  showTime: string | null;
  organizerId: string | null;
  organizerName: string | null;
  organizerCompany: string | null;
  organizerCity: string | null;
  venueId: string | null;
  venueName: string | null;
  venueCity: string | null;
  venueAddress?: string | null;
  notes: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: DealFormDeal;
}

export function DealFormDialog({ open, onOpenChange, deal }: Props) {
  const router = useRouter();
  const isEdit = !!deal;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Sous-dialogs (création rapide contact/lieu)
  const [openContactDialog, setOpenContactDialog] = useState(false);
  const [openVenueDialog, setOpenVenueDialog] = useState(false);

  const [title, setTitle] = useState(deal?.title ?? "");
  const [date, setDate] = useState<string>(
    deal?.date ? toDateInput(deal.date) : "",
  );
  const [showTime, setShowTime] = useState(deal?.showTime ?? "");
  const [organizer, setOrganizer] = useState<ContactSnapshot | null>(
    deal?.organizerId
      ? {
          id: deal.organizerId,
          name: deal.organizerName ?? "",
          company: deal.organizerCompany,
          city: deal.organizerCity,
        }
      : null,
  );
  const [venue, setVenue] = useState<VenueSnapshot | null>(
    deal?.venueId
      ? {
          id: deal.venueId,
          name: deal.venueName ?? "",
          city: deal.venueCity ?? "",
        }
      : null,
  );
  const [venueAddress, setVenueAddress] = useState(deal?.venueAddress ?? "");
  const [notes, setNotes] = useState(deal?.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !date) {
      setError("Titre et date requis.");
      return;
    }
    startTransition(async () => {
      const payload = {
        title: title.trim(),
        date: new Date(date),
        showTime: showTime.trim() || null,
        organizerId: organizer?.id ?? null,
        organizerName: organizer?.name ?? null,
        organizerCompany: organizer?.company ?? null,
        organizerCity: organizer?.city ?? null,
        venueId: venue?.id ?? null,
        venueName: venue?.name ?? null,
        venueCity: venue?.city ?? null,
        venueAddress: venueAddress.trim() || null,
        notes: notes.trim() || null,
      };
      if (isEdit && deal) {
        const res = await updateDealMeta({ id: deal.id, ...payload });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onOpenChange(false);
        router.refresh();
      } else {
        const res = await createDeal({ ...payload, category: DealCategory.BOOKING });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onOpenChange(false);
        router.push(`/deals/booking/${res.data!.id}`);
      }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {isEdit ? "Modifier le deal" : "Nouveau deal Booking"}
              </DialogTitle>
              <DialogDescription>
                {isEdit
                  ? "Met à jour le titre, la date, le lieu, l'organisateur ou les notes."
                  : "Crée un nouveau deal Booking. Tu pourras ajouter le budget, les artistes et les charges après création."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="title" className="text-xs uppercase tracking-wider">
                  Titre *
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex. Nordine Ganso @ Comedy Club Paris"
                  required
                  disabled={pending}
                />
              </div>

              <div className="grid grid-cols-[1fr_120px] gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="date" className="text-xs uppercase tracking-wider">
                    Date *
                  </Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    disabled={pending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="showTime" className="text-xs uppercase tracking-wider">
                    Heure
                  </Label>
                  <Input
                    id="showTime"
                    value={showTime}
                    onChange={(e) => setShowTime(e.target.value)}
                    placeholder="20h30"
                    disabled={pending}
                  />
                </div>
              </div>

              {/* Organisateur : picker + bouton "+" création rapide */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs uppercase tracking-wider">
                    Organisateur
                  </Label>
                  <button
                    type="button"
                    onClick={() => setOpenContactDialog(true)}
                    title="Créer un nouveau contact"
                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Nouveau
                  </button>
                </div>
                <ContactPicker value={organizer} onChange={setOrganizer} />
              </div>

              {/* Lieu : picker + bouton "+" création rapide */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs uppercase tracking-wider">Lieu</Label>
                  <button
                    type="button"
                    onClick={() => setOpenVenueDialog(true)}
                    title="Créer un nouveau lieu"
                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Nouveau
                  </button>
                </div>
                <VenuePicker value={venue} onChange={setVenue} />
              </div>

              {/* Adresse libre — visible toujours, surtout utile si pas de lieu KN
                  (booking entreprise par ex.). La ville pour le tableau récap
                  sera extraite du code postal BAN si pas de Venue KN. */}
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider">
                  Adresse libre {venue && <span className="text-muted-foreground/60 normal-case">(optionnelle si lieu choisi)</span>}
                </Label>
                <AddressAutocomplete
                  value={venueAddress}
                  onChange={setVenueAddress}
                  placeholder="N° et rue (autocomplete BAN data.gouv.fr)…"
                />
                {!venue && venueAddress && (
                  <p className="text-[10px] text-muted-foreground italic">
                    La ville sera extraite automatiquement du code postal pour
                    le tableau récap.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs uppercase tracking-wider">
                  Notes
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes commerciales, conditions négociées…"
                  rows={3}
                  disabled={pending}
                />
              </div>

              {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? "Enregistrer" : "Créer le deal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sous-dialogs création rapide : auto-sélectionne après création */}
      <ContactFormDialog
        open={openContactDialog}
        onOpenChange={setOpenContactDialog}
        onCreated={(c) => {
          const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.company || "—";
          setOrganizer({
            id: c.id,
            name: fullName,
            company: c.company,
            city: c.city,
          });
        }}
      />
      <VenueFormDialog
        open={openVenueDialog}
        onOpenChange={setOpenVenueDialog}
        onCreated={(v) => {
          setVenue({ id: v.id, name: v.name, city: v.city });
        }}
      />
    </>
  );
}

function toDateInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
