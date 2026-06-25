"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { createContact, updateContact } from "@/lib/kn-client";
import { splitArtistName } from "@/lib/artists";

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
  socialSecurityNumber: z.string().max(40).optional().nullable(),
  intermittentNumber: z.string().max(40).optional().nullable(),
  sacdNumber: z.string().max(40).optional().nullable(),
  sncfCardNumber: z.string().max(40).optional().nullable(),
  dietaryRequirements: z.string().max(200).optional().nullable(),

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
    // Synchro fiche contact liée (tél + mail uniquement) — sens artiste →
    // contact (Stan 2026-06-25). Non bloquant : si KN est indispo, la fiche
    // artiste est quand même sauvegardée.
    if (profile.contactId) {
      try {
        await updateContact(profile.contactId, {
          phone: profile.personalPhone,
          email: profile.personalEmail,
        });
      } catch (e) {
        console.error("[upsertArtistProfile] sync contact KN échouée", e);
      }
    }
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

/**
 * Crée une fiche contact KN (type ARTIST) à partir d'une fiche artiste
 * (Stan 2026-06-25). Prénom/nom dérivés du nom d'artiste (1er mot = prénom,
 * reste = nom), tél + mail repris du profil. Stocke l'id du contact sur le
 * profil (`contactId`) pour le lien + la synchro ultérieure.
 *
 * No-op si un contact est déjà lié.
 */
export async function createContactForArtist(
  artistId: string,
): Promise<ActionResult<{ contactId: string }>> {
  try {
    await requireUser();
  } catch {
    return { ok: false, error: "Non authentifié" };
  }
  if (!artistId) return { ok: false, error: "artistId manquant" };

  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    select: {
      name: true,
      slug: true,
      profile: {
        select: { contactId: true, personalEmail: true, personalPhone: true },
      },
    },
  });
  if (!artist) return { ok: false, error: "Artiste introuvable" };
  if (artist.profile?.contactId) {
    return { ok: true, data: { contactId: artist.profile.contactId } };
  }

  const { firstName, lastName } = splitArtistName(artist.name);

  try {
    const contact = await createContact({
      firstName: firstName || artist.name,
      lastName,
      type: "ARTIST",
      phone: artist.profile?.personalPhone ?? null,
      email: artist.profile?.personalEmail ?? null,
    });
    await prisma.artistProfile.upsert({
      where: { artistId },
      update: { contactId: contact.id },
      create: { artistId, contactId: contact.id, stageName: artist.name },
    });
    revalidatePath(`/artistes/${artist.slug}`);
    revalidatePath("/contacts");
    return { ok: true, data: { contactId: contact.id } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Création du contact échouée",
    };
  }
}

/**
 * Lie une fiche artiste à un contact KN EXISTANT (Stan 2026-06-25) — sert au
 * rattachement des fiches déjà créées + évite les doublons quand un contact
 * existe déjà. On ne touche pas aux données du contact (juste le lien) ; les
 * éditions ultérieures du tél/mail de l'artiste seront synchronisées.
 */
export async function linkArtistToContact(
  artistId: string,
  contactId: string,
): Promise<ActionResult> {
  try {
    await requireUser();
  } catch {
    return { ok: false, error: "Non authentifié" };
  }
  if (!artistId || !contactId) return { ok: false, error: "Paramètres manquants" };
  try {
    await prisma.artistProfile.upsert({
      where: { artistId },
      update: { contactId },
      create: { artistId, contactId },
    });
    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
      select: { slug: true },
    });
    if (artist?.slug) revalidatePath(`/artistes/${artist.slug}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return { ok: false, error: `Erreur base de données (${e.code})` };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}

/** Détache le contact lié d'une fiche artiste (ne supprime pas le contact KN). */
export async function unlinkArtistContact(
  artistId: string,
): Promise<ActionResult> {
  try {
    await requireUser();
  } catch {
    return { ok: false, error: "Non authentifié" };
  }
  if (!artistId) return { ok: false, error: "artistId manquant" };
  try {
    await prisma.artistProfile.updateMany({
      where: { artistId },
      data: { contactId: null },
    });
    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
      select: { slug: true },
    });
    if (artist?.slug) revalidatePath(`/artistes/${artist.slug}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}
