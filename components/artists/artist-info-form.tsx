"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import {
  upsertArtistProfile,
  createContactForArtist,
} from "@/lib/actions/artist-profile";
import { splitArtistName } from "@/lib/artists";
import { formatPhone, phoneHref } from "@/lib/format-phone";
import {
  formatNir,
  formatSiret,
  formatSiren,
  formatIban,
  normalizeDigits,
  normalizeIban,
} from "@/lib/id-format";

/**
 * Form modal pour éditer la fiche ArtistProfile — copie fidèle de
 * KuroNeko-App `components/artists/artist-info-form.tsx`.
 *
 * 5 sections (Identité civile, Coordonnées perso, Structure facturation,
 * RIB, Communication). 30 champs tous optionnels. Validation Zod côté
 * client + côté serveur dans upsertArtistProfile.
 */

/** Date (UTC midi) → "jj/mm/aaaa" pour l'affichage dans l'input. */
function birthDateToText(d: Date | null | undefined): string {
  if (!d) return "";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

/**
 * "jj/mm/aaaa" → Date (UTC midi) | null (vide) | undefined (invalide).
 * Aucune borne d'année (≠ calendrier) → toute date de naissance OK. Rejette
 * les dates incohérentes (ex. 31/02). Copie fidèle KN (Stan 2026-06-25).
 */
function textToBirthDate(s: string): Date | null | undefined {
  const t = s.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const dt = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    dt.getUTCDate() !== day ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCFullYear() !== year
  ) {
    return undefined; // jour inexistant (date "roulée")
  }
  return dt;
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold border-b pb-1.5 pt-2">
    {children}
  </div>
);

const FormSchema = z.object({
  firstName: z.string().optional().or(z.literal("")),
  lastName: z.string().optional().or(z.literal("")),
  stageName: z.string().optional().or(z.literal("")),
  birthDate: z.date().nullable().optional(),
  birthPlace: z.string().optional().or(z.literal("")),
  socialSecurityNumber: z.string().optional().or(z.literal("")),
  intermittentNumber: z.string().optional().or(z.literal("")),
  sacdNumber: z.string().optional().or(z.literal("")),
  sncfCardNumber: z.string().optional().or(z.literal("")),
  dietaryRequirements: z.string().optional().or(z.literal("")),
  personalEmail: z.string().optional().or(z.literal("")),
  personalPhone: z.string().optional().or(z.literal("")),
  homeAddress: z.string().optional().or(z.literal("")),
  companyName: z.string().optional().or(z.literal("")),
  companyLegalForm: z.string().optional().or(z.literal("")),
  companySiret: z.string().optional().or(z.literal("")),
  companySiren: z.string().optional().or(z.literal("")),
  companyVatNumber: z.string().optional().or(z.literal("")),
  companyApeCode: z.string().optional().or(z.literal("")),
  companyAddress: z.string().optional().or(z.literal("")),
  spectacleLicense: z.string().optional().or(z.literal("")),
  bankIban: z.string().optional().or(z.literal("")),
  bankBic: z.string().optional().or(z.literal("")),
  bankName: z.string().optional().or(z.literal("")),
  bankHolder: z.string().optional().or(z.literal("")),
  bioShort: z.string().optional().or(z.literal("")),
  bioLong: z.string().optional().or(z.literal("")),
  pressPhotoUrl: z.string().optional().or(z.literal("")),
  websiteUrl: z.string().optional().or(z.literal("")),
  instagramHandle: z.string().optional().or(z.literal("")),
  youtubeHandle: z.string().optional().or(z.literal("")),
  tiktokHandle: z.string().optional().or(z.literal("")),
});

export type FormValues = z.infer<typeof FormSchema>;
export type ArtistInfoFormDefaults = Partial<FormValues>;

interface ArtistInfoFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artistId: string;
  /** Nom d'artiste (= Artist.name) — sert au prompt de création de contact. */
  artistName: string;
  /** true si une fiche contact est déjà liée → pas de prompt de création. */
  hasLinkedContact: boolean;
  defaults?: ArtistInfoFormDefaults;
}

export function ArtistInfoForm({
  open,
  onOpenChange,
  artistId,
  artistName,
  hasLinkedContact,
  defaults,
}: ArtistInfoFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  // Étape "contact" : proposée après une sauvegarde réussie quand un tél ou un
  // mail est renseigné et qu'aucun contact n'est encore lié (Stan 2026-06-25).
  const [step, setStep] = useState<"form" | "contact">("form");

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    values: { ...emptyValues(), ...(defaults ?? {}) },
  });

  // Date de naissance : saisie texte jj/mm/aaaa (pas de calendrier borné).
  // State texte local synchronisé sur les defaults ; la Date parsée est
  // poussée dans le form (Stan 2026-06-25, copie fidèle KN).
  const [birthText, setBirthText] = useState<string>(
    birthDateToText(defaults?.birthDate ?? null),
  );
  const [birthError, setBirthError] = useState<string | null>(null);
  useEffect(() => {
    setBirthText(birthDateToText(defaults?.birthDate ?? null));
    setBirthError(null);
  }, [defaults?.birthDate]);

  function close(next: boolean) {
    if (!next) setStep("form");
    onOpenChange(next);
  }

  function onSubmit(values: FormValues) {
    setServerError(null);
    if (birthText.trim() && textToBirthDate(birthText) === undefined) {
      setBirthError("Date de naissance invalide — format attendu jj/mm/aaaa.");
      return;
    }
    // Stockage normalisé (chiffres seuls / IBAN sans espaces) — l'affichage et
    // la saisie reformatent à la volée. Cf. lib/id-format & lib/format-phone.
    const normalized: FormValues = {
      ...values,
      socialSecurityNumber: normalizeDigits(values.socialSecurityNumber),
      personalPhone: phoneHref(values.personalPhone),
      companySiret: normalizeDigits(values.companySiret),
      companySiren: normalizeDigits(values.companySiren),
      bankIban: normalizeIban(values.bankIban),
    };
    startTransition(async () => {
      const res = await upsertArtistProfile(artistId, normalized);
      if (!res.ok) {
        setServerError(res.error);
        return;
      }
      router.refresh();
      // Propose la création d'une fiche contact si on a de quoi (tél/mail) et
      // qu'aucun contact n'est déjà lié.
      const hasReach = Boolean(normalized.personalPhone || normalized.personalEmail);
      if (!hasLinkedContact && hasReach) {
        setStep("contact");
      } else {
        close(false);
      }
    });
  }

  function handleCreateContact() {
    setServerError(null);
    startTransition(async () => {
      const res = await createContactForArtist(artistId);
      if (!res.ok) {
        setServerError(res.error);
        return;
      }
      router.refresh();
      close(false);
    });
  }

  // ── Étape 2 : proposition de création de fiche contact ──────────────────
  if (step === "contact") {
    const { firstName, lastName } = splitArtistName(artistName);
    return (
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Créer une fiche contact ?</DialogTitle>
            <DialogDescription>
              Fiche infos enregistrée. Tu as renseigné un téléphone et/ou un
              email — créer la fiche contact correspondante dans l&apos;annuaire ?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/20 px-3 py-2.5 text-sm space-y-1">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium">🌟 Artiste</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Prénom / Nom</span>
              <span className="font-medium">
                {firstName}
                {lastName ? ` ${lastName}` : ""}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground pt-1">
              Téléphone + email repris de la fiche. Toute modification du tél/mail
              ici sera répercutée sur ce contact.
            </div>
          </div>
          {serverError && (
            <p className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md p-2">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={pending}>
              Non merci
            </Button>
            <Button type="button" onClick={handleCreateContact} disabled={pending} className="gap-1.5">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Créer la fiche contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier la fiche infos</DialogTitle>
          <DialogDescription>
            Toutes les informations sont optionnelles. Utilise « Tab » pour
            passer rapidement entre les champs.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* 1 — Identité civile */}
            <SectionTitle>Identité civile</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <T name="firstName" label="Prénom" form={form} />
              <T name="lastName" label="Nom" form={form} />
              <T name="stageName" label="Nom de scène" form={form} />
              <FormField
                control={form.control}
                name="birthDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date de naissance</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="jj/mm/aaaa"
                        value={birthText}
                        onChange={(e) => {
                          const v = e.target.value;
                          setBirthText(v);
                          const parsed = textToBirthDate(v);
                          if (parsed === undefined) {
                            setBirthError("Format attendu : jj/mm/aaaa");
                          } else {
                            setBirthError(null);
                            field.onChange(parsed);
                          }
                        }}
                      />
                    </FormControl>
                    {birthError && (
                      <p className="text-xs text-destructive">{birthError}</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <T name="birthPlace" label="Lieu de naissance" form={form} />
              <T name="socialSecurityNumber" label="N° Sécurité sociale" form={form} format={formatNir} />
              {/* Coordonnées personnelles fusionnées dans Identité civile
                  (Stan 2026-06-24) : insérées entre N° Sécurité sociale et N°
                  Congés Spectacles. `name="personalEmail"` INCHANGÉ → les liens
                  qui lisent ArtistProfile.personalEmail (FDR, invitation Google)
                  ne sont pas impactés (lecture par clé en base, pas par position). */}
              <T name="personalEmail" label="Email perso" form={form} />
              <T name="personalPhone" label="Téléphone" form={form} format={formatPhone} />
              <FormField
                control={form.control}
                name="homeAddress"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Adresse résidence</FormLabel>
                    <FormControl>
                      <AddressAutocomplete
                        value={typeof field.value === "string" ? field.value : ""}
                        onChange={field.onChange}
                        placeholder="Commence à taper l'adresse réelle…"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <T name="intermittentNumber" label="N° Congés Spectacles" form={form} />
              <T name="sacdNumber" label="N° SACD" form={form} />
              <T name="sncfCardNumber" label="N° Carte SNCF" form={form} />
              <T name="dietaryRequirements" label="Régime Alimentaire" form={form} className="col-span-2" />
            </div>

            {/* 3 — Structure */}
            <SectionTitle>Structure de facturation</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <T name="companyName" label="Raison sociale" form={form} />
              <T name="companyLegalForm" label="Forme juridique" form={form} placeholder="SAS / SASU / SARL / EI…" />
              <T name="companySiret" label="SIRET" form={form} format={formatSiret} />
              <T name="companySiren" label="SIREN" form={form} format={formatSiren} />
              <T name="companyVatNumber" label="N° TVA intra" form={form} />
              <T name="companyApeCode" label="Code APE / NAF" form={form} />
              <FormField
                control={form.control}
                name="companyAddress"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Adresse siège</FormLabel>
                    <FormControl>
                      <AddressAutocomplete
                        value={typeof field.value === "string" ? field.value : ""}
                        onChange={field.onChange}
                        placeholder="Commence à taper l'adresse réelle…"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <T name="spectacleLicense" label="N° Licence spectacles" form={form} placeholder="2-XXXXXX, 3-XXXXXX…" />
            </div>

            {/* 4 — RIB */}
            <SectionTitle>Coordonnées bancaires</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <T name="bankIban" label="IBAN" form={form} className="col-span-2" format={formatIban} />
              <T name="bankBic" label="BIC" form={form} />
              <T name="bankName" label="Banque" form={form} />
              <T name="bankHolder" label="Titulaire" form={form} className="col-span-2" />
            </div>

            {/* 5 — Communication */}
            <SectionTitle>Communication</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="bioShort"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Bio courte (≤ 300 car.)</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bioLong"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Bio longue</FormLabel>
                    <FormControl>
                      <Textarea rows={5} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <T name="pressPhotoUrl" label="Photo presse (URL)" form={form} className="col-span-2" />
              <T name="websiteUrl" label="Site web" form={form} className="col-span-2" />
              <T name="instagramHandle" label="Instagram" form={form} placeholder="@compte" />
              <T name="youtubeHandle" label="YouTube" form={form} />
              <T name="tiktokHandle" label="TikTok" form={form} placeholder="@compte" />
            </div>

            {serverError && (
              <p className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md p-2">
                {serverError}
              </p>
            )}

            <DialogFooter className="border-t pt-4">
              <Button type="button" variant="outline" onClick={() => close(false)} disabled={pending}>
                Annuler
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** Helper pour réduire la verbosité des champs Input simples. */
function T({
  name,
  label,
  form,
  placeholder,
  className,
  format,
}: {
  name: keyof FormValues;
  label: string;
  form: ReturnType<typeof useForm<FormValues>>;
  placeholder?: string;
  className?: string;
  /**
   * Règle d'édition optionnelle : reformate la valeur à chaque frappe (et à
   * l'affichage) — ex. groupes de chiffres pour Sécu/SIRET/IBAN. Idempotente.
   */
  format?: (raw: string) => string;
}) {
  return (
    <FormField
      control={form.control}
      name={name as never}
      render={({ field }) => {
        const str = typeof field.value === "string" ? field.value : "";
        return (
          <FormItem className={className}>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <Input
                placeholder={placeholder}
                {...field}
                value={format ? format(str) : str}
                onChange={
                  format
                    ? (e) => field.onChange(format(e.target.value))
                    : field.onChange
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

function emptyValues(): FormValues {
  return {
    firstName: "", lastName: "", stageName: "",
    birthDate: null, birthPlace: "",
    socialSecurityNumber: "", intermittentNumber: "", sacdNumber: "", sncfCardNumber: "", dietaryRequirements: "",
    personalEmail: "", personalPhone: "", homeAddress: "",
    companyName: "", companyLegalForm: "", companySiret: "", companySiren: "",
    companyVatNumber: "", companyApeCode: "", companyAddress: "", spectacleLicense: "",
    bankIban: "", bankBic: "", bankName: "", bankHolder: "",
    bioShort: "", bioLong: "", pressPhotoUrl: "", websiteUrl: "",
    instagramHandle: "", youtubeHandle: "", tiktokHandle: "",
  };
}
