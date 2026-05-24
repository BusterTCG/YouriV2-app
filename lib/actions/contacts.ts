"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import {
  createContact as knCreateContact,
  updateContact as knUpdateContact,
  type CreateContactInput,
  type KnContact,
  KnApiUnavailableError,
  KnValidationError,
} from "@/lib/kn-client";

/**
 * Server actions /contacts — wrappers HTTP autour de l'API externe KN.
 *
 * Youri n'écrit JAMAIS dans une table Contact locale (elle n'existe pas).
 * Toutes les opérations passent par lib/kn-client.ts qui call KN
 * (single writer authoritatif).
 *
 * Si KN est down → ActionResult { ok: false, error: "Annuaire indisponible…" }
 * pour que l'UI puisse afficher un message clair.
 */

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
  type: z
    .enum(["ORGANIZER", "AGENCY", "ARTIST", "PRODUCTION", "TECHNICAL", "PRESS", "BRAND", "OTHER"])
    .default("OTHER"),
});

// ─────────── Create ───────────

export async function createContact(input: unknown): Promise<ActionResult<KnContact>> {
  return safeAction("createContact", async () => {
    await requireUser();
    const data = ContactInputSchema.parse(input) as CreateContactInput;
    try {
      const contact = await knCreateContact(data);
      revalidatePath("/contacts");
      return contact;
    } catch (e) {
      if (e instanceof KnApiUnavailableError || e instanceof KnValidationError) throw e;
      throw e;
    }
  });
}

// ─────────── Update ───────────

const UpdateContactSchema = z.object({
  id: z.string().min(1),
  patch: ContactInputSchema.partial(),
});

export async function updateContact(
  input: z.infer<typeof UpdateContactSchema>,
): Promise<ActionResult<KnContact>> {
  return safeAction("updateContact", async () => {
    await requireUser();
    const { id, patch } = UpdateContactSchema.parse(input);
    const contact = await knUpdateContact(id, patch);
    revalidatePath("/contacts");
    return contact;
  });
}
