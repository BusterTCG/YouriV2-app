"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
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
import { DatePickerField } from "@/components/tasks/date-picker-field";
import { upsertArtistProfile } from "@/lib/actions/artist-profile";

/**
 * Form modal pour éditer la fiche ArtistProfile — copie fidèle de
 * KuroNeko-App `components/artists/artist-info-form.tsx`.
 *
 * 5 sections (Identité civile, Coordonnées perso, Structure facturation,
 * RIB, Communication). 30 champs tous optionnels. Validation Zod côté
 * client + côté serveur dans upsertArtistProfile.
 */

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
  nationality: z.string().optional().or(z.literal("")),
  socialSecurityNumber: z.string().optional().or(z.literal("")),
  intermittentNumber: z.string().optional().or(z.literal("")),
  sacdNumber: z.string().optional().or(z.literal("")),
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
  vatRegime: z.string().optional().or(z.literal("")),
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
  defaults?: ArtistInfoFormDefaults;
}

export function ArtistInfoForm({
  open,
  onOpenChange,
  artistId,
  defaults,
}: ArtistInfoFormProps) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    values: { ...emptyValues(), ...(defaults ?? {}) },
  });

  function onSubmit(values: FormValues) {
    setServerError(null);
    startTransition(async () => {
      const res = await upsertArtistProfile(artistId, values);
      if (!res.ok) {
        setServerError(res.error);
        return;
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                    <DatePickerField value={field.value ?? null} onChange={field.onChange} placeholder="Choisir" />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <T name="birthPlace" label="Lieu de naissance" form={form} />
              <T name="nationality" label="Nationalité" form={form} />
              <T name="socialSecurityNumber" label="N° Sécurité sociale" form={form} />
              <T name="intermittentNumber" label="N° Intermittent" form={form} />
              <T name="sacdNumber" label="N° SACD" form={form} />
            </div>

            {/* 2 — Coordonnées personnelles */}
            <SectionTitle>Coordonnées personnelles</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <T name="personalEmail" label="Email perso" form={form} />
              <T name="personalPhone" label="Téléphone" form={form} />
              <T name="homeAddress" label="Adresse résidence" form={form} className="col-span-2" />
            </div>

            {/* 3 — Structure */}
            <SectionTitle>Structure de facturation</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <T name="companyName" label="Raison sociale" form={form} />
              <T name="companyLegalForm" label="Forme juridique" form={form} placeholder="SAS / SASU / SARL / EI…" />
              <T name="companySiret" label="SIRET" form={form} />
              <T name="companySiren" label="SIREN" form={form} />
              <T name="companyVatNumber" label="N° TVA intra" form={form} />
              <T name="companyApeCode" label="Code APE / NAF" form={form} />
              <T name="companyAddress" label="Adresse siège" form={form} className="col-span-2" />
              <T name="spectacleLicense" label="N° Licence spectacles" form={form} placeholder="2-XXXXXX, 3-XXXXXX…" />
              <T name="vatRegime" label="Régime TVA" form={form} placeholder="Assujetti / Franchise…" />
            </div>

            {/* 4 — RIB */}
            <SectionTitle>Coordonnées bancaires</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <T name="bankIban" label="IBAN" form={form} className="col-span-2" />
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
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
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
}: {
  name: keyof FormValues;
  label: string;
  form: ReturnType<typeof useForm<FormValues>>;
  placeholder?: string;
  className?: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name as never}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              placeholder={placeholder}
              {...field}
              value={typeof field.value === "string" ? field.value : ""}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function emptyValues(): FormValues {
  return {
    firstName: "", lastName: "", stageName: "",
    birthDate: null, birthPlace: "", nationality: "",
    socialSecurityNumber: "", intermittentNumber: "", sacdNumber: "",
    personalEmail: "", personalPhone: "", homeAddress: "",
    companyName: "", companyLegalForm: "", companySiret: "", companySiren: "",
    companyVatNumber: "", companyApeCode: "", companyAddress: "", spectacleLicense: "", vatRegime: "",
    bankIban: "", bankBic: "", bankName: "", bankHolder: "",
    bioShort: "", bioLong: "", pressPhotoUrl: "", websiteUrl: "",
    instagramHandle: "", youtubeHandle: "", tiktokHandle: "",
  };
}
