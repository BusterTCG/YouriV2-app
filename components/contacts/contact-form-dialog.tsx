"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Trash2, Building2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  createContact,
  updateContact,
  deleteContact,
  type ActionResult,
} from "@/lib/actions/contacts";
import { CONTACT_TYPE_OPTIONS, type VenueOption } from "@/lib/contacts-types";
import type { ContactType } from "@/lib/kn-client";

/**
 * Form contact — COPIE FIDÈLE de KuroNeko-App ContactFormDialog
 * (cf. AGENTS.md règle "copie fidèle de KN").
 *
 * Différences avec KN :
 *   - ContactType n'est pas un enum Prisma (Youri n'a pas de table Contact)
 *     → on importe le type depuis @/lib/kn-client
 *   - Les actions wrap l'API KN (lib/actions/contacts.ts) — signature
 *     identique à celle de KN pour rester compatible
 *   - Couleur accent : var(--yr-gold) au lieu de --kn-gold
 */

// ── Form schema (côté client — mêmes règles que le serveur) ──
const FormSchema = z.object({
  firstName: z.string().min(1, "Le prénom est requis").max(80),
  lastName: z.string().max(80).optional().or(z.literal("")),
  company: z.string().max(120).optional().or(z.literal("")),
  city: z.string().max(80).optional().or(z.literal("")),
  profession: z.string().max(120).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  email: z
    .string()
    .max(120)
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Email invalide",
    ),
  notes: z.string().max(2000).optional().or(z.literal("")),
  type: z.enum([
    "AGENCY",
    "ARTIST",
    "BRAND",
    "ORGANIZER",
    "PRESS",
    "PRODUCTION",
    "TECHNICAL",
    "OTHER",
  ]),
  /**
   * Salle rattachée (optionnel). On utilise `"none"` plutôt que "" / undefined
   * pour bien différencier "pas de lien" du select non touché (le Select shadcn
   * n'aime pas la valeur "" comme option).
   */
  venueId: z.string().optional(),
});

type FormValues = z.infer<typeof FormSchema>;

export type ContactFormDefaults = {
  id?: string;
  firstName?: string;
  lastName?: string | null;
  company?: string | null;
  city?: string | null;
  profession?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  type?: ContactType;
  venueId?: string | null;
};

interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: ContactFormDefaults;
  /** Liste des salles disponibles pour le select. Si vide → option cachée. */
  venues?: VenueOption[];
}

/**
 * Dialog création / édition d'un contact.
 * - Si `defaults.id` existe → mode édition (bouton Supprimer visible).
 * - Sinon → mode création.
 */
export function ContactFormDialog({
  open,
  onOpenChange,
  defaults,
  venues = [],
}: ContactFormDialogProps) {
  const isEdit = !!defaults?.id;
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      firstName: defaults?.firstName ?? "",
      lastName: defaults?.lastName ?? "",
      company: defaults?.company ?? "",
      city: defaults?.city ?? "",
      profession: defaults?.profession ?? "",
      phone: defaults?.phone ?? "",
      email: defaults?.email ?? "",
      notes: defaults?.notes ?? "",
      type: (defaults?.type as ContactType | undefined) ?? "OTHER",
      venueId: defaults?.venueId ?? "none",
    },
  });

  function onSubmit(values: FormValues) {
    setServerError(null);
    startTransition(async () => {
      const payload = {
        firstName: values.firstName,
        lastName: values.lastName || null,
        company: values.company || null,
        city: values.city || null,
        profession: values.profession || null,
        phone: values.phone || null,
        email: values.email || null,
        notes: values.notes || null,
        type: values.type,
        venueId: values.venueId && values.venueId !== "none" ? values.venueId : null,
      };
      const res: ActionResult<{ id: string }> = isEdit
        ? await updateContact(defaults!.id!, payload)
        : await createContact(payload);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [field, errors] of Object.entries(res.fieldErrors)) {
            if (errors[0]) {
              form.setError(field as keyof FormValues, { message: errors[0] });
            }
          }
        }
        return;
      }
      onOpenChange(false);
      form.reset();
    });
  }

  function onDelete() {
    if (!defaults?.id) return;
    if (!confirm("Supprimer ce contact ? (il sera dans la corbeille KN)")) return;
    setDeleting(true);
    startTransition(async () => {
      const res = await deleteContact(defaults.id!);
      setDeleting(false);
      if (!res.ok) {
        setServerError(res.error);
        return;
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le contact" : "Nouveau contact"}</DialogTitle>
          <DialogDescription>
            Prénom obligatoire. Tous les autres champs sont optionnels.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Identité */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prénom *</FormLabel>
                    <FormControl>
                      <Input autoFocus={!isEdit} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Type — catégorie haute (orga / production / presse…). En premier
                car il oriente la lecture du reste. */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CONTACT_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          <span className="inline-flex items-center gap-2">
                            <span>{o.emoji}</span>
                            <span>{o.label}</span>
                            <span className="text-xs text-muted-foreground">— {o.hint}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Société + Ville côte à côte */}
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Société / lieu</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex. Comedy Club, Quick, Le Monde…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ville</FormLabel>
                    <FormControl>
                      <Input placeholder="Paris" className="w-32" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Profession — rôle libre (ex : Programmateur, Tour Manager…) */}
            <FormField
              control={form.control}
              name="profession"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profession</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex. Programmateur, Tour Manager, Pigiste…"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Salle rattachée (optionnel) — pour les programmateurs / régie /
                personnels rattachés à un théâtre, festival, etc. */}
            {venues.length > 0 && (
              <FormField
                control={form.control}
                name="venueId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-[--yr-gold]" />
                      Salle rattachée
                    </FormLabel>
                    <Select
                      value={field.value || "none"}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Aucune" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">
                          <span className="text-muted-foreground">— Aucune —</span>
                        </SelectItem>
                        {venues.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                            <span className="text-muted-foreground"> · {v.city}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Coordonnées */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Téléphone</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="06 xx xx xx xx" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="nom@domaine.fr" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Infos libres : préférences, rôle dans une orga, anecdotes…"
                      className="min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {serverError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {serverError}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              {isEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onDelete}
                  disabled={pending || deleting}
                  className="mr-auto text-destructive hover:text-destructive"
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-1" />
                  )}
                  Supprimer
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Annuler
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {isEdit ? "Enregistrer" : "Créer"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
