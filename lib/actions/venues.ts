"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import {
  createVenue as knCreateVenue,
  updateVenue as knUpdateVenue,
  createVenueRoom as knCreateVenueRoom,
  type KnVenue,
  type KnVenueRoom,
} from "@/lib/kn-client";

/**
 * Server actions /lieux — wrappers HTTP autour de l'API externe KN.
 * Cf. lib/actions/contacts.ts pour la pattern (single writer = KN).
 */

const VenueInputSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(120),
  city: z.string().trim().min(1, "Ville requise").max(80),
  address: z.string().trim().max(240).optional().nullable(),
  capacity: z
    .union([z.number().int().positive().max(100000), z.literal(null), z.undefined()])
    .optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createVenue(input: unknown): Promise<ActionResult<KnVenue>> {
  return safeAction("createVenue", async () => {
    await requireUser();
    const data = VenueInputSchema.parse(input);
    const venue = await knCreateVenue({
      name: data.name,
      city: data.city,
      address: data.address ?? null,
      capacity: data.capacity ?? null,
      notes: data.notes ?? null,
    });
    revalidatePath("/lieux");
    return venue;
  });
}

const UpdateVenueSchema = z.object({
  id: z.string().min(1),
  patch: VenueInputSchema.partial(),
});

export async function updateVenue(
  input: z.infer<typeof UpdateVenueSchema>,
): Promise<ActionResult<KnVenue>> {
  return safeAction("updateVenue", async () => {
    await requireUser();
    const { id, patch } = UpdateVenueSchema.parse(input);
    const venue = await knUpdateVenue(id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.city !== undefined ? { city: patch.city } : {}),
      ...(patch.address !== undefined ? { address: patch.address ?? null } : {}),
      ...(patch.capacity !== undefined ? { capacity: patch.capacity ?? null } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes ?? null } : {}),
    });
    revalidatePath("/lieux");
    return venue;
  });
}

// ─────────── Venue rooms (sous-salles) ───────────

const CreateRoomSchema = z.object({
  venueId: z.string().min(1),
  name: z.string().trim().min(1, "Nom de salle requis").max(120),
  capacity: z
    .union([z.number().int().positive().max(100000), z.literal(null), z.undefined()])
    .optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createVenueRoom(
  input: z.infer<typeof CreateRoomSchema>,
): Promise<ActionResult<KnVenueRoom>> {
  return safeAction("createVenueRoom", async () => {
    await requireUser();
    const { venueId, name, capacity, notes } = CreateRoomSchema.parse(input);
    const room = await knCreateVenueRoom(venueId, {
      name,
      capacity: capacity ?? null,
      notes: notes ?? null,
    });
    revalidatePath("/lieux");
    return room;
  });
}
