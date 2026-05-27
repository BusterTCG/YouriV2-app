"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { DealCategory, DealStatus, VenueDealKind } from "@prisma/client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { cn } from "@/lib/utils";
import {
  createDeal,
  updateDealMeta,
  setDealStatus,
  setDealPrimaryArtist,
} from "@/lib/actions/deals";
import { updateShowDetails } from "@/lib/actions/prod-executive";
import { DEAL_STATUS_DISPLAY } from "./deal-helpers";
import { ContactPicker, type ContactSnapshot } from "./contact-picker";
import { VenuePicker, type VenueSnapshot } from "./venue-picker";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";
import { VenueFormDialog } from "@/components/venues/venue-form-dialog";
import { ArtistSelect } from "./artist-select";
import { VENUE_DEAL_KIND_FR } from "@/lib/production-line-labels";

/**
 * Dialog Nouveau deal / Modifier deal — Sprint 4 v2 (Stan 2026-05-26).
 *
 * Layout en sections inspiré du dialog KN (PJ Stan) :
 *   - TYPE DE DEAL : Catégorie (read-only si passée en prop)
 *   - CONTEXTE     : Artiste (Prod Exé), Date / Heure(s), Mois complet
 *                    (Prod Exé), Nom du spectacle (Prod Exé), Salle, Adresse
 *   - IDENTITÉ     : Titre (auto-suggéré) + Statut
 *   - FINANCIER    : Modèle salle + % commission (Prod Exé only)
 *   - Notes
 *
 * Adaptations Pangee vs KN :
 *   - Pas de modèle artiste (toujours PROD_EXE implicite)
 *   - Pas de Google Calendar
 *   - Pas d'auto-création artiste (l'user doit créer en amont sur /artistes)
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
  // ── Champs Prod Exé (optionnels — utilisés en mode edit pour pré-remplir
  //     les sections spécifiques Prod Exécutive du dialog) ──
  category?: DealCategory;
  status?: DealStatus;
  showName?: string | null;
  isMultiDate?: boolean;
  venueDealKind?: VenueDealKind | null;
  prodExePct?: number | null;
  /** Artiste principal du deal (1er DealArtiste actif). Permet d'éditer le
   *  lien artiste depuis le dialog de modification (Stan 2026-05-27). */
  artistId?: string | null;
  /** Nom de l'artiste — pré-remplit l'auto-titre en mode edit pour éviter de
   *  devoir re-fetch la liste avant que le nom soit dispo. */
  artistName?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: DealFormDeal;
  /** Catégorie du deal à créer (BOOKING par défaut). Inutile en mode édition. */
  category?: DealCategory;
}

const CATEGORY_LABEL: Record<DealCategory, string> = {
  BOOKING: "Booking",
  PROD_EXE: "Prod Exécutive",
  CACHETS: "Cachets",
};
const CATEGORY_PATH: Record<DealCategory, string> = {
  BOOKING: "/deals/booking",
  PROD_EXE: "/deals/prod-executive",
  CACHETS: "/deals/cachets",
};

export function DealFormDialog({
  open,
  onOpenChange,
  deal,
  category = DealCategory.BOOKING,
}: Props) {
  const router = useRouter();
  const isEdit = !!deal;
  // En mode edit, on dérive la catégorie du deal existant (sinon le prop
  // `category` reste valide pour la création).
  const effectiveCategory = deal?.category ?? category;
  const isProdExe = effectiveCategory === DealCategory.PROD_EXE;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Sous-dialogs (création rapide contact/lieu)
  const [openContactDialog, setOpenContactDialog] = useState(false);
  const [openVenueDialog, setOpenVenueDialog] = useState(false);

  // State global (les champs Prod Exé restent silencieux côté Booking)
  const [title, setTitle] = useState(deal?.title ?? "");
  const [date, setDate] = useState<string>(
    deal?.date ? toDateInput(deal.date) : "",
  );
  const [showTime, setShowTime] = useState(deal?.showTime ?? "");
  const [status, setStatus] = useState<DealStatus>(deal?.status ?? DealStatus.LEAD);
  const [artistId, setArtistId] = useState<string | null>(deal?.artistId ?? null);
  const [artistName, setArtistName] = useState<string | null>(
    deal?.artistName ?? null,
  );
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

  // Champs spécifiques Prod Exé — pré-remplis en mode edit depuis le deal
  const [showName, setShowName] = useState(deal?.showName ?? "");
  const [isMultiDate, setIsMultiDate] = useState(deal?.isMultiDate ?? false);
  const [venueDealKind, setVenueDealKind] = useState<VenueDealKind | "">(
    deal?.venueDealKind ?? "",
  );
  const [prodExePct, setProdExePct] = useState(
    deal?.prodExePct != null ? String(deal.prodExePct) : "15",
  );

  /**
   * Auto-suggestion du titre pour Prod Exé — Stan 2026-05-27 : inclut le
   * nom de l'artiste contrairement à KN. Format progressif :
   *
   *   artiste + show + salle → "{artiste} - {show} @ {salle}"
   *   artiste + show         → "{artiste} - {show}"
   *   artiste + salle        → "{artiste} @ {salle}"
   *   show + salle           → "{show} @ {salle}"
   *   artiste seul           → "{artiste}"
   *   show seul              → "{show}"
   *   salle seule            → "{salle}"
   *
   * N'écrase QUE si :
   *   - le titre est vide, OU
   *   - le titre correspond à la dernière suggestion auto (= l'user n'a pas
   *     tapé manuellement par-dessus depuis).
   */
  const lastSuggestionRef = useRef<string>(deal?.title ?? "");
  useEffect(() => {
    if (!isProdExe || isEdit) return;
    const artist = (artistName ?? "").trim();
    const show = showName.trim();
    const venueName = venue?.name.trim() ?? "";
    let suggestion = "";
    if (artist && show && venueName) suggestion = `${artist} - ${show} @ ${venueName}`;
    else if (artist && show) suggestion = `${artist} - ${show}`;
    else if (artist && venueName) suggestion = `${artist} @ ${venueName}`;
    else if (show && venueName) suggestion = `${show} @ ${venueName}`;
    else if (artist) suggestion = artist;
    else if (show) suggestion = show;
    else if (venueName) suggestion = venueName;
    if (!suggestion) return;
    if (!title.trim() || title === lastSuggestionRef.current) {
      lastSuggestionRef.current = suggestion;
      setTitle(suggestion);
    }
  }, [isProdExe, isEdit, artistName, showName, venue, title]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !date) {
      setError("Titre et date requis.");
      return;
    }
    if (isProdExe && !isEdit && !artistId) {
      setError("Artiste requis pour un deal Prod Exécutive.");
      return;
    }
    startTransition(async () => {
      const baseMeta = {
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
        const res = await updateDealMeta({ id: deal.id, ...baseMeta });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        // Update statut deal si changé
        if (status !== deal.status) {
          await setDealStatus({ dealId: deal.id, status });
        }
        // Update champs Prod Exé si applicable
        if (isProdExe) {
          await updateShowDetails({
            id: deal.id,
            showName: showName.trim() || null,
            isMultiDate,
            venueDealKind: venueDealKind || null,
            prodExePct: prodExePct === "" ? null : Number(prodExePct),
          });
          // Update artiste principal si changé
          if (artistId !== (deal.artistId ?? null)) {
            await setDealPrimaryArtist({ dealId: deal.id, artistId });
          }
        }
        onOpenChange(false);
        router.refresh();
      } else {
        const res = await createDeal({
          ...baseMeta,
          category,
          status,
          initialArtistId: artistId,
          // Prod Exé only
          ...(isProdExe
            ? {
                showName: showName.trim() || null,
                isMultiDate,
                venueDealKind: venueDealKind || null,
                prodExePct: Number(prodExePct) || null,
              }
            : {}),
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onOpenChange(false);
        router.push(`${CATEGORY_PATH[category]}/${res.data!.id}`);
      }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {isEdit
                  ? "Modifier le deal"
                  : `Nouveau deal ${CATEGORY_LABEL[category]}`}
              </DialogTitle>
              <DialogDescription>
                {isEdit
                  ? "Met à jour le titre, la date, le lieu, l'organisateur ou les notes."
                  : `Crée un nouveau deal ${CATEGORY_LABEL[category]}. Tu pourras ajouter les détails après création.`}
              </DialogDescription>
            </DialogHeader>

            {/* ───────────────── SECTION TYPE DE DEAL ───────────────── */}
            {!isEdit && (
              <Section eyebrow="Type de deal">
                <FieldLabel required>Catégorie</FieldLabel>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {CATEGORY_LABEL[category]}
                  <span className="text-[10px] text-muted-foreground ml-2 italic">
                    (déterminée par la page d&apos;arrivée)
                  </span>
                </div>
              </Section>
            )}

            {/* IDENTITÉ rendue EN PREMIER pour Booking (Stan 2026-05-27).
                Pour Prod Exé elle reste après CONTEXTE car le titre est
                auto-suggéré depuis showName + venue. */}
            {!isProdExe && (
              <IdentitySection
                title={title}
                setTitle={setTitle}
                status={status}
                setStatus={setStatus}
                pending={pending}
                isProdExe={isProdExe}
              />
            )}

            {/* ───────────────── SECTION CONTEXTE ───────────────── */}
            <Section eyebrow="Contexte">
              {/* Artiste — obligatoire pour Prod Exé (création ET édition) */}
              {isProdExe && (
                <div className="space-y-1.5">
                  <FieldLabel required>Artiste</FieldLabel>
                  <ArtistSelect
                    value={artistId}
                    onChange={(id, name) => {
                      setArtistId(id);
                      setArtistName(name ?? null);
                    }}
                    disabled={pending}
                  />
                </div>
              )}

              {/* Date + heure début + Mois complet (Prod Exé) sur 1 ligne
                  optimisée. Stan 2026-05-27 : largeur Date réduite, on
                  groupe l'info temporelle pour densifier le formulaire. */}
              <div
                className={cn(
                  "grid gap-2",
                  isProdExe
                    ? "grid-cols-[200px_140px_1fr]"
                    : "grid-cols-[200px_140px]",
                )}
              >
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="date" required>
                    Date
                  </FieldLabel>
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
                  <FieldLabel htmlFor="showTime">Heure début</FieldLabel>
                  <Input
                    id="showTime"
                    type="time"
                    value={showTime}
                    onChange={(e) => setShowTime(e.target.value)}
                    disabled={pending}
                  />
                </div>
                {/* Mois complet (Prod Exé) inline avec date/heure pour densifier */}
                {isProdExe && (
                  <div className="space-y-1.5">
                    <FieldLabel>Série multi-dates</FieldLabel>
                    <label className="flex items-center gap-2 cursor-pointer rounded-md border bg-muted/20 px-3 h-9">
                      <input
                        type="checkbox"
                        checked={isMultiDate}
                        onChange={(e) => setIsMultiDate(e.target.checked)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className="text-sm font-medium">📅 Mois complet</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Nom du spectacle + Salle (Prod Exé) — 2 colonnes pour densifier */}
              {isProdExe ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="showName">Nom du spectacle</FieldLabel>
                    <Input
                      id="showName"
                      value={showName}
                      onChange={(e) => setShowName(e.target.value)}
                      placeholder=""
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel>Salle</FieldLabel>
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
                </div>
              ) : (
                <>
                  {/* Organisateur + Lieu sur 2 colonnes (Booking) */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <FieldLabel>Organisateur</FieldLabel>
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
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <FieldLabel>Lieu</FieldLabel>
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
                  </div>

                  {/* Adresse libre — surtout utile pour Booking entreprise */}
                  <div className="space-y-1.5">
                    <FieldLabel>
                      Adresse libre{" "}
                      {venue && (
                        <span className="text-muted-foreground/60 normal-case">
                          (optionnelle si lieu choisi)
                        </span>
                      )}
                    </FieldLabel>
                    <AddressAutocomplete
                      value={venueAddress}
                      onChange={setVenueAddress}
                      placeholder="N° et rue (autocomplete BAN data.gouv.fr)…"
                    />
                  </div>
                </>
              )}
            </Section>

            {/* SECTION IDENTITÉ rendue après CONTEXTE uniquement pour Prod Exé
                (titre auto-suggéré depuis showName + venue). Booking l'a déjà
                en haut, donc on ne re-rend pas ici. */}
            {isProdExe && (
              <IdentitySection
                title={title}
                setTitle={setTitle}
                status={status}
                setStatus={setStatus}
                pending={pending}
                isProdExe={isProdExe}
              />
            )}

            {/* ───────────────── SECTION FINANCIER (Prod Exé) ───────────────── */}
            {isProdExe && (
              <Section eyebrow="Financier">
                <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                  💡 Pour un deal Prod Exé, les montants sont calculés
                  automatiquement depuis les lignes de production (recettes /
                  charges) après création.
                </p>
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <div className="space-y-1.5">
                    <FieldLabel>Modèle salle</FieldLabel>
                    <Select
                      value={venueDealKind || "_none"}
                      onValueChange={(v) =>
                        setVenueDealKind(
                          v === "_none" ? "" : (v as VenueDealKind),
                        )
                      }
                      disabled={pending}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— Non défini —</SelectItem>
                        <SelectItem value="PROD">
                          {VENUE_DEAL_KIND_FR.PROD}
                        </SelectItem>
                        <SelectItem value="CO_REAL">
                          {VENUE_DEAL_KIND_FR.CO_REAL}
                        </SelectItem>
                        <SelectItem value="CESSION">
                          {VENUE_DEAL_KIND_FR.CESSION}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Commission %</FieldLabel>
                    <Input
                      type="number"
                      value={prodExePct}
                      onChange={(e) => setProdExePct(e.target.value)}
                      min={0}
                      max={100}
                      className="h-9 text-sm text-right tabular-nums"
                      disabled={pending}
                    />
                  </div>
                </div>
              </Section>
            )}

            {/* ───────────────── Notes ───────────────── */}
            <div className="space-y-1.5">
              <FieldLabel htmlFor="notes">Notes</FieldLabel>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder=""
                rows={3}
                disabled={pending}
              />
            </div>

            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

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
                {isEdit ? "Enregistrer" : "Créer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sous-dialogs création rapide */}
      <ContactFormDialog
        open={openContactDialog}
        onOpenChange={setOpenContactDialog}
        onCreated={(c) => {
          const fullName =
            [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
            c.company ||
            "—";
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

// ──────────────────────────── Sous-composants ────────────────────────────

function Section({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border bg-card p-3 space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {eyebrow}
      </div>
      {children}
    </section>
  );
}

function FieldLabel({
  children,
  htmlFor,
  required,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-xs uppercase tracking-wider">
      {children}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
  );
}

/**
 * Section IDENTITÉ : Titre + Statut. Rendue avant CONTEXTE pour Booking
 * (Stan 2026-05-27) et après CONTEXTE pour Prod Exé (titre auto-suggéré
 * depuis showName + venue).
 */
function IdentitySection({
  title,
  setTitle,
  status,
  setStatus,
  pending,
  isProdExe,
}: {
  title: string;
  setTitle: (s: string) => void;
  status: DealStatus;
  setStatus: (s: DealStatus) => void;
  pending: boolean;
  isProdExe: boolean;
}) {
  void isProdExe;
  return (
    <Section eyebrow="Identité">
      <div className="grid grid-cols-[1fr_160px] gap-2">
        <div className="space-y-1.5">
          <FieldLabel htmlFor="title" required>
            Titre
          </FieldLabel>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder=""
            required
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Statut</FieldLabel>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as DealStatus)}
            disabled={pending}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DealStatus.LEAD}>
                {DEAL_STATUS_DISPLAY.LEAD}
              </SelectItem>
              <SelectItem value={DealStatus.EN_COURS}>
                {DEAL_STATUS_DISPLAY.EN_COURS}
              </SelectItem>
              <SelectItem value={DealStatus.CONFIRME}>
                {DEAL_STATUS_DISPLAY.CONFIRME}
              </SelectItem>
              <SelectItem value={DealStatus.ANNULE}>
                {DEAL_STATUS_DISPLAY.ANNULE}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </Section>
  );
}

function toDateInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
