"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";

/**
 * Upsert ArtistProfile — copie fidèle de KuroNeko-App `lib/actions/artist-profile.ts`.
 *
 * Différence Youri V2 :
 *   - `requireUser()` au top (multi-user — cf. project-youri-v2 § Permissions).
 *   - `revalidatePath('/artistes/${slug}')` (route française).
 */

const ProfileInputSchema = z.object({
  // 1 — Identité civile
  firstName: z.string().max(80).optional().nullable(),
  lastName: z.string().max(80).optional().nullable(),
  stageName: z.string().max(80).optional().nullable(),
  birthDate: z.coerce.date().optional().nullable(),
  birthPlace: z.string().max(120).optional().nullable(),
  nationality: z.string().max(80).optional().nullable(),
  socialSecurityNumber: z.string().max(40).optional().nullable(),
  intermittentNumber: z.string().max(40).optional().nullable(),
  sacdNumber: z.string().max(40).optional().nullable(),

  // 2 — Coordonnées personnelles
  personalEmail: z.string().email().optional().or(z.literal("")).nullable(),
  personalPhone: z.string().max(30).optional().nullable(),
  homeAddress: z.string().max(300).optional().nullable(),

  // 3 — Structure
  companyName: z.string().max(120).optional().nullable(),
  companyLegalForm: z.string().max(40).optional().nullable(),
  companySiret: z.string().max(20).optional().nullable(),
  companySiren: z.string().max(15).optional().nullable(),
  companyVatNumber: z.string().max(30).optional().nullable(),
  companyApeCode: z.string().max(10).optional().nullable(),
  companyAddress: z.string().max(300).optional().nullable(),
  spectacleLicense: z.string().max(80).optional().nullable(),
  vatRegime: z.string().max(40).optional().nullable(),

  // 4 — RIB
  bankIban: z.string().max(40).optional().nullable(),
  bankBic: z.string().max(15).optional().nullable(),
  bankName: z.string().max(80).optional().nullable(),
  bankHolder: z.string().max(80).optional().nullable(),

  // 5 — Communication
  bioShort: z.string().max(300).optional().nullable(),
  bioLong: z.string().max(3000).optional().nullable(),
  pressPhotoUrl: z.string().max(500).optional().or(z.literal("")).nullable(),
  websiteUrl: z.string().max(300).optional().or(z.literal("")).nullable(),
  instagramHandle: z.string().max(60).optional().nullable(),
  youtubeHandle: z.string().max(60).optional().nullable(),
  tiktokHandle: z.string().max(60).optional().nullable(),
});

export type ProfileInput = z.infer<typeof ProfileInputSchema>;

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Sauvegarde la fiche infos d'un artiste (upsert sur artistId). Tous les
 * champs sont optionnels — on remplace les valeurs fournies, laisse le
 * reste tel quel. Les chaînes vides sont converties en null (idempotence).
 */
export async function upsertArtistProfile(
  artistId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
  } catch {
    return { ok: false, error: "Non authentifié" };
  }
  if (!artistId) return { ok: false, error: "artistId manquant" };

  const parsed = ProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const data: Prisma.ArtistProfileUncheckedUpdateInput = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    (data as Record<string, unknown>)[k] = v === "" ? null : v;
  }

  try {
    const profile = await prisma.artistProfile.upsert({
      where: { artistId },
      update: data,
      create: { ...(data as Prisma.ArtistProfileUncheckedCreateInput), artistId },
    });
    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
      select: { slug: true },
    });
    if (artist?.slug) {
      revalidatePath(`/artistes/${artist.slug}`);
    }
    return { ok: true, data: { id: profile.id } };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return { ok: false, error: `Erreur base de données (${e.code})` };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}
