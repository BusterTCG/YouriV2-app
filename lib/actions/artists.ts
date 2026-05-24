"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { uniqueSlug } from "@/lib/slug";

/**
 * Server actions CRUD pour les artistes Youri (local).
 *
 * Permissions (cf. docs/architecture-decisions.md § Users) :
 *   - MEMBER fait TOUT — pas de check rôle ici.
 *   - L'audit log tracera qui a fait quoi (intégré au Sprint 10 — pour
 *     l'instant on stocke juste createdAt/updatedAt).
 */

// ─────────── Validation ───────────

const HEX_COLOR_RE = /^#([0-9a-fA-F]{6})$/;

const ArtistBaseSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(120),
  color: z.string().regex(HEX_COLOR_RE, "Couleur HEX attendue (#RRGGBB)").default("#6366f1"),
  notes: z.string().max(2000).optional().nullable(),
  active: z.boolean().default(true),
});

const CreateArtistSchema = ArtistBaseSchema;
const UpdateArtistSchema = ArtistBaseSchema.partial();

export type CreateArtistInput = z.infer<typeof CreateArtistSchema>;
export type UpdateArtistInput = z.infer<typeof UpdateArtistSchema>;

// ─────────── Create ───────────

export async function createArtist(input: unknown): Promise<ActionResult<{ slug: string }>> {
  return safeAction("createArtist", async () => {
    await requireUser();
    const data = CreateArtistSchema.parse(input);

    // Slug auto depuis name + suffixe -2/-3 si collision
    const existing = await prisma.artist.findMany({
      where: { deletedAt: null },
      select: { slug: true },
    });
    const slug = uniqueSlug(data.name, existing.map((a) => a.slug));

    const created = await prisma.artist.create({
      data: {
        name: data.name,
        slug,
        color: data.color,
        notes: data.notes ?? null,
        active: data.active,
      },
      select: { slug: true },
    });

    revalidatePath("/artistes");
    return { slug: created.slug };
  });
}

// ─────────── Update ───────────

const UpdateArtistByIdSchema = z.object({
  id: z.string().min(1),
  patch: UpdateArtistSchema,
});

export async function updateArtist(
  input: z.infer<typeof UpdateArtistByIdSchema>,
): Promise<ActionResult<{ slug: string }>> {
  return safeAction("updateArtist", async () => {
    await requireUser();
    const { id, patch } = UpdateArtistByIdSchema.parse(input);

    // Si le nom change, recalculer le slug (sauf si l'user a manuellement
    // un slug — pour V2 on n'expose pas l'édition manuelle du slug).
    let nextSlug: string | undefined;
    if (patch.name !== undefined) {
      const current = await prisma.artist.findUnique({
        where: { id },
        select: { slug: true, name: true },
      });
      if (current && patch.name !== current.name) {
        const others = await prisma.artist.findMany({
          where: { deletedAt: null, NOT: { id } },
          select: { slug: true },
        });
        nextSlug = uniqueSlug(patch.name, others.map((a) => a.slug));
      }
    }

    const updated = await prisma.artist.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(nextSlug !== undefined ? { slug: nextSlug } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes ?? null } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
      select: { slug: true },
    });

    revalidatePath("/artistes");
    revalidatePath(`/artistes/${updated.slug}`);
    return { slug: updated.slug };
  });
}

// ─────────── Soft-delete ───────────

const DeleteArtistSchema = z.object({ id: z.string().min(1) });

export async function softDeleteArtist(
  input: z.infer<typeof DeleteArtistSchema>,
): Promise<ActionResult> {
  return safeAction("softDeleteArtist", async () => {
    await requireUser();
    const { id } = DeleteArtistSchema.parse(input);

    // Sprint 3 : on bloquera si des DealArtiste référencent l'artiste.
    // Pour Sprint 2, pas encore de DealArtiste — soft-delete inconditionnel.
    // TODO Sprint 3 : ajouter check sur prisma.dealArtiste.count({ where: {
    //   artistId: id, deal: { deletedAt: null } } })

    await prisma.artist.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });

    revalidatePath("/artistes");
  });
}
