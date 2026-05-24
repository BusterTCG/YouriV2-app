"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import {
  createContact as knCreateContact,
  updateContact as knUpdateContact,
  deleteContact as knDeleteContact,
  type CreateContactInput,
  type KnContact,
} from "@/lib/kn-client";

/**
 * Server actions /contacts — wrappers HTTP autour de l'API externe KN.
 *
 * Youri n'écrit JAMAIS dans une table Contact locale (elle n'existe pas).
 * Toutes les opérations passent par lib/kn-client.ts qui call KN
 * (single writer authoritatif).
 *
 * Signature compatible KuroNeko-App ContactFormDialog (copie fidèle) :
 *   - `createContact(payload)` → ActionResult<{ id }>
 *   - `updateContact(id, payload)` → ActionResult<{ id }>
 *   - `deleteContact(id)` → ActionResult
 *
 * Re-export du type ActionResult pour faciliter l'import depuis les composants
 * client (le form KN importe `ActionResult` depuis `lib/actions/contacts`).
 */

export type { ActionResult } from "@/lib/errors";

// ─────────── Schema ───────────

const CONTACT_TYPES = [
  "ORGANIZER",
  "AGENCY",
  "ARTIST",
  "PRODUCTION",
  "TECHNICAL",
  "PRESS",
  "BRAND",
  "OTHER",
] as const;

const ContactInputSchema = z.object({
  firstName: z.string().trim().min(1, "Prénom requis").max(80),
  lastName: z.string().trim().max(80).optional().nullable(),
  company: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  profession: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Email invalide",
    ),
  notes: z.string().max(2000).optional().nullable(),
  type: z.enum(CONTACT_TYPES).default("OTHER"),
  venueId: z.string().optional().nullable(),
});

// ─────────── Create ───────────

export async function createContact(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return safeAction("createContact", async () => {
    await requireUser();
    const data = ContactInputSchema.parse(input) as CreateContactInput;
    const contact = await knCreateContact(data);
    revalidatePath("/contacts");
    return { id: contact.id };
  });
}

// ─────────── Update ───────────

export async function updateContact(
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return safeAction("updateContact", async () => {
    await requireUser();
    const data = ContactInputSchema.partial().parse(input);
    const contact = await knUpdateContact(id, data);
    revalidatePath("/contacts");
    return { id: contact.id };
  });
}

// ─────────── Delete (soft-delete côté KN) ───────────

export async function deleteContact(id: string): Promise<ActionResult> {
  return safeAction("deleteContact", async () => {
    await requireUser();
    await knDeleteContact(id);
    revalidatePath("/contacts");
  });
}
