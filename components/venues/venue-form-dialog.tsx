"use client";

import { useState, useTransition } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2,
  Trash2,
  Building2,
  Plus,
  MapPin,
  Users,
} from "lucide-react";
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
import { createVenue, updateVenue, deleteVenue } from "@/lib/actions/venues";
import type { KnVenue } from "@/lib/kn-client";

/**
 * Form modal pour créer/éditer/supprimer un lieu — copie fidèle de
 * KuroNeko-App `components/venues/venue-form-dialog.tsx`.
 *
 * Différences inévitables côté Youri :
 *   - Server actions : `@/lib/actions/venues` (wrappers HTTP autour de
 *     l'API externe KN) au lieu d'accès Prisma direct.
 *   - Couleur icon : `--yr-gold` au lieu de `--kn-gold` (alias identiques).
 *   - `revalidatePath` géré côté actions Youri, pas besoin de router.refresh.
 *
 * UX (identique KN) :
 *   - Nom du lieu : saisie manuelle texte libre.
 *   - Adresse : autocomplete BAN data.gouv.fr (cascade Photon pour intl) → ville
 *     auto-extraite à la sélection.
 *   - Ville : remplie automatiquement, modifiable manuellement.
 *   - Jauge par défaut (mono-salle) avec hint italic + onWheel blur.
 *   - Section "Salles internes" : 0/N sous-salles ajoutables/supprimables en
 *     inline (useFieldArray), avec leur propre jauge.
 *   - Bouton Supprimer (mode edit uniquement), avec confirm natif.
 */

const RoomSchema = z.object({
  /** id présent en édition (room existante côté KN), absent en création. */
  id: z.string().optional(),
  name: z.string().min(1, "Nom de salle requis").max(120),
  capacity: z.string().optional().or(z.literal("")),
  notes: z.string().max(300).optional().or(z.literal("")),
});

const FormSchema = z.object({
  name: z.string().min(1, "Nom requis").max(120),
  /**
   * La ville n'est plus saisie principalement à la main : elle est extraite
   * automatiquement de l'autocomplete BAN/Photon. On la garde dans le schéma
   * pour le payload — vide → on tente d'extraire de l'adresse côté client.
   */
  city: z.string().max(120).optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
  capacity: z.string().optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
  rooms: z.array(RoomSchema),
});

type FormValues = z.infer<typeof FormSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lieu existant pour le mode édition. Absent = création. */
  venue?: KnVenue;
  /** Appelé après tout save (create OU update). Utile pour rafraîchir une liste. */
  onSaved?: () => void;
  /**
   * Appelé UNIQUEMENT après une création réussie. Permet aux consumers
   * (formulaire deal à venir) d'auto-sélectionner le lieu fraîchement créé.
   */
  onCreated?: (venue: { id: string; name: string; city: string }) => void;
}

/**
 * Extrait la ville depuis un label BAN si le code postal y figure :
 * "10 Rue de Rivoli 75004 Paris" → "Paris".
 * Fallback quand l'autocomplete BAN n'a pas renvoyé `city` directement.
 */
function extractCityFromAddress(address: string | null | undefined): string {
  if (!address) return "";
  const m = address.match(/\d{5}\s+([^,]+?)\s*$/);
  return m ? m[1].trim() : "";
}

export function VenueFormDialog({
  open,
  onOpenChange,
  venue,
  onSaved,
  onCreated,
}: Props) {
  const isEdit = Boolean(venue?.id);
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    values: {
      name: venue?.name ?? "",
      city: venue?.city ?? "",
      address: venue?.address ?? "",
      capacity: venue?.capacity != null ? String(venue.capacity) : "",
      notes: venue?.notes ?? "",
      rooms:
        venue?.rooms.map((r) => ({
          id: r.id,
          name: r.name,
          capacity: r.capacity != null ? String(r.capacity) : "",
          notes: r.notes ?? "",
        })) ?? [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "rooms",
  });

  function onSubmit(values: FormValues) {
    setServerError(null);
    startTransition(async () => {
      const city =
        values.city?.trim() ||
        extractCityFromAddress(values.address) ||
        "";

      const rooms = values.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        capacity: r.capacity ? Number(r.capacity) : null,
        notes: r.notes || null,
      }));

      const payload = {
        name: values.name,
        city,
        address: values.address || null,
        capacity: values.capacity ? Number(values.capacity) : null,
        notes: values.notes || null,
        rooms,
      };

      const res = isEdit
        ? await updateVenue({ id: venue!.id, patch: payload })
        : await createVenue(payload);

      if (!res.ok) {
        setServerError(res.error);
        return;
      }
      onOpenChange(false);
      if (!isEdit && res.data) {
        onCreated?.({
          id: res.data.id,
          name: res.data.name,
          city: res.data.city,
        });
      }
      onSaved?.();
      form.reset();
    });
  }

  function onDelete() {
    if (!venue?.id) return;
    if (
      !confirm(
        `Supprimer la salle "${venue.name}" ? Les deals et contacts liés conservent leur historique mais ne pointent plus vers cette salle.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteVenue(venue.id);
      if (!res.ok) {
        setServerError(res.error);
        return;
      }
      onOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-yr-gold" />
            {isEdit ? "Modifier le lieu" : "Nouveau lieu"}
          </DialogTitle>
          <DialogDescription>
            Saisis le nom du lieu, puis l&apos;adresse via l&apos;autocomplete BAN
            (data.gouv.fr) — la ville sera extraite automatiquement. Si le
            lieu a plusieurs salles, ajoute-les en bas.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom du lieu *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Le Bikini, La Cigale, Théâtre du Châtelet…"
                      autoFocus={!isEdit}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adresse</FormLabel>
                  <FormControl>
                    <AddressAutocomplete
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      onPick={(pick) => {
                        if (pick.city) {
                          form.setValue("city", pick.city, {
                            shouldDirty: true,
                          });
                        }
                      }}
                      placeholder="N° et rue (autocomplete BAN data.gouv.fr)…"
                    />
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
                  <FormLabel className="flex items-center gap-1.5 text-xs">
                    <MapPin className="h-3 w-3" />
                    Ville
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Auto-rempli depuis l'adresse — modifiable si besoin"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Jauge par défaut (mono-salle)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={100000}
                      placeholder="800"
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      {...field}
                    />
                  </FormControl>
                  <p className="text-[11px] text-muted-foreground italic">
                    Utilisée si le lieu n&apos;a qu&apos;une seule salle. Pour
                    les théâtres multi-salles, ajoute des salles ci-dessous
                    (chacune a sa propre jauge).
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-md border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Salles internes
                  <span className="text-muted-foreground/70 normal-case font-normal">
                    ({fields.length})
                  </span>
                </h4>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    append({ name: "", capacity: "", notes: "" })
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Ajouter une salle
                </Button>
              </div>
              {fields.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">
                  Aucune sous-salle. Si le lieu est mono-salle, laisse vide
                  et utilise la &quot;jauge par défaut&quot; ci-dessus.
                </p>
              ) : (
                <div className="space-y-2">
                  {fields.map((row, idx) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-[1fr_90px_auto] gap-2 items-start bg-background border rounded-md p-2"
                    >
                      <FormField
                        control={form.control}
                        name={`rooms.${idx}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                placeholder="Grande Salle, Studio…"
                                className="h-8 text-sm"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`rooms.${idx}.capacity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                max={100000}
                                placeholder="Jauge"
                                className="h-8 text-sm tabular-nums text-center"
                                onWheel={(e) =>
                                  (e.target as HTMLInputElement).blur()
                                }
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(idx)}
                        className="h-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Contacts régie, accès, parking, particularités…"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {serverError && (
              <p className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md p-2">
                {serverError}
              </p>
            )}

            <DialogFooter className="gap-2 sm:justify-between">
              <div>
                {isEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onDelete}
                    disabled={pending}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Supprimer
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
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
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
