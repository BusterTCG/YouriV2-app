"use client";

import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Pencil, FileDown, ChevronDown, ChevronRight } from "lucide-react";
import type { ArtistProfile } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InfoField } from "./info-field";
import { formatPhone } from "@/lib/format-phone";
import { ArtistInfoForm, type ArtistInfoFormDefaults } from "./artist-info-form";
import { ArtistInfoExport } from "./artist-info-export";

/**
 * Affichage de la fiche ArtistProfile en 5 sections collapsibles — copie
 * fidèle de KuroNeko-App `components/artists/artist-info-section.tsx`.
 *
 * Sections (Identité civile dépliée par défaut, les autres repliées) :
 *   1. Identité civile (firstName, lastName, stageName, birthDate, etc.)
 *   2. Coordonnées personnelles (email, phone, address)
 *   3. Structure de facturation (raison sociale, SIRET, TVA, etc.)
 *   4. Coordonnées bancaires (IBAN sensible, BIC, banque, titulaire)
 *   5. Communication (bios, photo presse, social)
 *
 * Boutons "Exporter" (PDF via print) + "Modifier" (ouvre ArtistInfoForm).
 */
interface ArtistInfoSectionProps {
  artistId: string;
  artistName: string;
  profile: ArtistProfile | null;
}

export function ArtistInfoSection({ artistId, artistName, profile }: ArtistInfoSectionProps) {
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const defaults = profileToDefaults(profile, artistName);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Fiche infos artiste</CardTitle>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setExporting(true)}>
              <FileDown className="mr-1.5 h-4 w-4" /> Exporter
            </Button>
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-1.5 h-4 w-4" /> Modifier
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Section title="Identité civile" defaultOpen>
            <Grid>
              <InfoField label="Prénom" value={profile?.firstName} />
              <InfoField label="Nom" value={profile?.lastName} />
              <InfoField label="Nom de scène" value={profile?.stageName} />
              <InfoField
                label="Date de naissance"
                value={profile?.birthDate ? profile.birthDate.toISOString() : null}
                display={(d) => format(new Date(d), "d MMMM yyyy", { locale: fr })}
              />
              <InfoField label="Lieu de naissance" value={profile?.birthPlace} />
              <InfoField label="N° Sécurité sociale" value={profile?.socialSecurityNumber} sensitive />
              <InfoField label="N° Intermittent" value={profile?.intermittentNumber} />
              <InfoField label="N° SACD" value={profile?.sacdNumber} />
              <InfoField label="N° Carte SNCF" value={profile?.sncfCardNumber} />
            </Grid>
          </Section>

          <Section title="Coordonnées personnelles">
            <Grid>
              <InfoField label="Email perso" value={profile?.personalEmail} />
              <InfoField
                label="Téléphone"
                value={formatPhone(profile?.personalPhone)}
              />
              <InfoField label="Adresse résidence" value={profile?.homeAddress} />
            </Grid>
          </Section>

          <Section title="Structure de facturation">
            <Grid>
              <InfoField label="Raison sociale" value={profile?.companyName} />
              <InfoField label="Forme juridique" value={profile?.companyLegalForm} />
              <InfoField label="SIRET" value={profile?.companySiret} />
              <InfoField label="SIREN" value={profile?.companySiren} />
              <InfoField label="N° TVA intra" value={profile?.companyVatNumber} />
              <InfoField label="Code APE / NAF" value={profile?.companyApeCode} />
              <InfoField label="Adresse siège" value={profile?.companyAddress} />
              <InfoField label="N° Licence spectacles" value={profile?.spectacleLicense} />
            </Grid>
          </Section>

          <Section title="Coordonnées bancaires">
            <Grid>
              <InfoField label="IBAN" value={profile?.bankIban} sensitive />
              <InfoField label="BIC" value={profile?.bankBic} />
              <InfoField label="Banque" value={profile?.bankName} />
              <InfoField label="Titulaire" value={profile?.bankHolder} />
            </Grid>
          </Section>

          <Section title="Communication">
            <Grid>
              <InfoField label="Bio courte" value={profile?.bioShort} multiline />
              <InfoField label="Bio longue" value={profile?.bioLong} multiline />
              <InfoField label="Photo presse" value={profile?.pressPhotoUrl} />
              <InfoField label="Site web" value={profile?.websiteUrl} />
              <InfoField label="Instagram" value={profile?.instagramHandle} />
              <InfoField label="YouTube" value={profile?.youtubeHandle} />
              <InfoField label="TikTok" value={profile?.tiktokHandle} />
            </Grid>
          </Section>
        </CardContent>
      </Card>

      <ArtistInfoForm
        open={editing}
        onOpenChange={setEditing}
        artistId={artistId}
        defaults={defaults}
      />

      <ArtistInfoExport
        open={exporting}
        onOpenChange={setExporting}
        profile={{ ...(profile ?? {}), artistName }}
      />
    </div>
  );
}

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm font-semibold uppercase tracking-wider hover:bg-accent/30 transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span>{title}</span>
      </button>
      <div className={cn("border-t bg-muted/10 px-3 py-3", !open && "hidden")}>
        {children}
      </div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>;
}

function profileToDefaults(
  p: ArtistProfile | null,
  artistName?: string,
): ArtistInfoFormDefaults | undefined {
  // Pas de profile en BDD (artistes seedés avant la règle ou créés via
  // un chemin qui n'aurait pas créé le profile) → on pré-remplit
  // au minimum le stageName avec le nom de l'artiste. Stan customisera
  // le reste lors du premier save (cf. règle Pangee créée 2026-05-26).
  if (!p) {
    return artistName ? { stageName: artistName } : undefined;
  }
  return {
    firstName: p.firstName ?? "",
    lastName: p.lastName ?? "",
    stageName: p.stageName ?? "",
    birthDate: p.birthDate,
    birthPlace: p.birthPlace ?? "",
    socialSecurityNumber: p.socialSecurityNumber ?? "",
    intermittentNumber: p.intermittentNumber ?? "",
    sacdNumber: p.sacdNumber ?? "",
    sncfCardNumber: p.sncfCardNumber ?? "",
    personalEmail: p.personalEmail ?? "",
    personalPhone: p.personalPhone ?? "",
    homeAddress: p.homeAddress ?? "",
    companyName: p.companyName ?? "",
    companyLegalForm: p.companyLegalForm ?? "",
    companySiret: p.companySiret ?? "",
    companySiren: p.companySiren ?? "",
    companyVatNumber: p.companyVatNumber ?? "",
    companyApeCode: p.companyApeCode ?? "",
    companyAddress: p.companyAddress ?? "",
    spectacleLicense: p.spectacleLicense ?? "",
    bankIban: p.bankIban ?? "",
    bankBic: p.bankBic ?? "",
    bankName: p.bankName ?? "",
    bankHolder: p.bankHolder ?? "",
    bioShort: p.bioShort ?? "",
    bioLong: p.bioLong ?? "",
    pressPhotoUrl: p.pressPhotoUrl ?? "",
    websiteUrl: p.websiteUrl ?? "",
    instagramHandle: p.instagramHandle ?? "",
    youtubeHandle: p.youtubeHandle ?? "",
    tiktokHandle: p.tiktokHandle ?? "",
  };
}
