"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { uniqueSlug } from "@/lib/slug";
import { PANGEE_ARTIST_COLOR } from "@/lib/artists-constants";

/**
 * Server actions CRUD pour les artistes Youri (local).
 *
 * Permissions (cf. docs/architecture-decisions.md § Users) :
 *   - MEMBER fait TOUT — pas de check rôle ici.
 *   - L'audit log tracera qui a fait quoi (intégré au Sprint 10 — pour
 *     l'instant on stocke juste createdAt/updatedAt).
 *
 * Règle Pangee 2026-05-26 : couleur d'artiste forcée à PANGEE_ARTIST_COLOR
 * (Stan gère 50+ artistes, pas de couleur distincte par artiste). On accepte
 * le champ `color` dans le schéma Zod pour rétro-compat mais on ignore la
 * valeur reçue à la création/modif.
 */

// ─────────── Validation ───────────

const ArtistBaseSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(120),
  notes: z.string().max(2000).optional().nullable(),
  active: z.boolean().default(true),
});

const CreateArtistSchema = ArtistBaseSchema;
const UpdateArtistSchema = ArtistBaseSchema.partial();

export type CreateArtistInput = z.infer<typeof CreateArtistSchema>;
export type UpdateArtistInput = z.infer<typeof UpdateArtistSchema>;

// ─────────── Create ───────────

export async function createArtist(input: unknown): Promise<ActionResult<{ slug: string; id: string }>> {
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
        color: PANGEE_ARTIST_COLOR,
        notes: data.notes ?? null,
        active: data.active,
        // Règle métier Pangee (validée par Stan 2026-05-26) : le nom de
        // l'artiste sert AUSSI de "Nom de scène" par défaut. On crée
        // l'ArtistProfile vide avec stageName pré-rempli, l'user peut
        // ensuite le customiser depuis l'onglet Infos (ex. nom civil
        // "Sophie Mercier" → nom de scène "Soso"). Modifier le name
        // Artist après ne resynchronise PAS le stageName — c'est un
        // champ indépendant une fois créé.
        profile: {
          create: {
            stageName: data.name,
          },
        },
      },
      select: { slug: true, id: true },
    });

    revalidatePath("/artistes");
    return { slug: created.slug, id: created.id };
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
        // `color` n'est plus modifiable depuis l'UI (règle Pangee 2026-05-26).
        // On ignore patch.color s'il arrive (rétro-compat client cache).
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

// ─────────── Avatar : upload / remove / position ───────────
//
// Copie fidèle de KuroNeko-App `lib/actions/artists.ts` avec adaptations Youri :
//   - `requireUser()` au top (multi-user)
//   - Filter `deletedAt: null` sur les checks d'existence
//   - `revalidatePath('/artistes/...')` (route française)
//   - Stockage local `public/uploads/avatars/<artistId>-<ts>.<ext>` (idem KN)

const UPLOAD_DIR = "public/uploads/avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB (= Next.js serverActions.bodySizeLimit)
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Upload une photo d'avatar pour un artiste. Stocke le fichier dans
 * `public/uploads/avatars/<artistId>-<ts>.<ext>` et met à jour Artist.avatarUrl.
 * Le timestamp casse le cache navigateur quand on remplace une photo.
 */
export async function uploadArtistAvatar(
  formData: FormData,
): Promise<ActionResult<{ avatarUrl: string }>> {
  return safeAction("uploadArtistAvatar", async () => {
    await requireUser();
    const artistId = formData.get("artistId");
    const file = formData.get("file");

    if (typeof artistId !== "string" || !artistId) {
      throw new Error("ID artiste manquant");
    }
    if (!(file instanceof File)) {
      throw new Error("Aucun fichier reçu");
    }
    if (file.size === 0) {
      throw new Error("Fichier vide");
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new Error(
        `Fichier trop lourd (max ${Math.round(MAX_AVATAR_BYTES / 1024 / 1024)} Mo)`,
      );
    }
    if (!ALLOWED_MIME.has(file.type)) {
      throw new Error("Format non supporté (JPEG, PNG ou WebP uniquement)");
    }

    const artist = await prisma.artist.findFirst({
      where: { id: artistId, deletedAt: null },
      select: { id: true, slug: true },
    });
    if (!artist) throw new Error("Artiste introuvable");

    // Import dynamique Node — server action uniquement
    const { writeFile, mkdir } = await import("node:fs/promises");
    const path = await import("node:path");
    const { cwd } = await import("node:process");

    const extByMime: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const ext = extByMime[file.type] ?? "jpg";
    const timestamp = Date.now();
    const fileName = `${artistId}-${timestamp}.${ext}`;

    const absDir = path.join(cwd(), UPLOAD_DIR);
    const absPath = path.join(absDir, fileName);

    await mkdir(absDir, { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(absPath, buf);

    const avatarUrl = `/uploads/avatars/${fileName}`;

    await prisma.artist.update({
      where: { id: artistId },
      data: { avatarUrl },
    });
    revalidatePath("/artistes");
    revalidatePath(`/artistes/${artist.slug}`);
    return { avatarUrl };
  });
}

const PositionSchema = z.object({
  artistId: z.string().min(1),
  x: z.number(),
  y: z.number(),
});

/**
 * Met à jour la position du recadrage avatar (object-position %). Valeurs
 * clampées 0-100 côté serveur pour éviter qu'une UI buggée n'écrive des
 * valeurs aberrantes.
 */
export async function updateArtistAvatarPosition(
  input: z.infer<typeof PositionSchema>,
): Promise<ActionResult> {
  return safeAction("updateArtistAvatarPosition", async () => {
    await requireUser();
    const parsed = PositionSchema.parse(input);
    const x = Math.max(0, Math.min(100, parsed.x));
    const y = Math.max(0, Math.min(100, parsed.y));

    const artist = await prisma.artist.findFirst({
      where: { id: parsed.artistId, deletedAt: null },
      select: { slug: true },
    });
    if (!artist) throw new Error("Artiste introuvable");

    await prisma.artist.update({
      where: { id: parsed.artistId },
      data: { avatarPositionX: x, avatarPositionY: y },
    });
    revalidatePath("/artistes");
    revalidatePath(`/artistes/${artist.slug}`);
  });
}

/**
 * Supprime la photo d'avatar (DB seulement — on laisse le fichier orphelin
 * sur disque le temps que le navigateur libère son cache).
 */
export async function removeArtistAvatar(
  artistId: string,
): Promise<ActionResult> {
  return safeAction("removeArtistAvatar", async () => {
    await requireUser();
    if (!artistId) throw new Error("ID artiste manquant");
    const artist = await prisma.artist.findFirst({
      where: { id: artistId, deletedAt: null },
      select: { slug: true },
    });
    if (!artist) throw new Error("Artiste introuvable");

    await prisma.artist.update({
      where: { id: artistId },
      data: { avatarUrl: null },
    });
    revalidatePath("/artistes");
    revalidatePath(`/artistes/${artist.slug}`);
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

    const artist = await prisma.artist.findUnique({
      where: { id },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!artist || artist.deletedAt) throw new Error("Artiste introuvable");

    await prisma.artist.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
    await logAudit({
      entity: "Artist",
      entityId: id,
      action: "delete",
      summary: `Artiste supprimé : « ${artist.name} »`,
    });

    revalidatePath("/artistes");
    revalidatePath("/trash");
  });
}

/**
 * Restaure un artiste soft-deleté depuis la corbeille (réactive aussi
 * `active`, mis à false lors de la suppression).
 */
export async function restoreArtist(id: string): Promise<ActionResult> {
  return safeAction("restoreArtist", async () => {
    await requireUser();
    if (!id) throw new Error("ID artiste manquant");
    const artist = await prisma.artist.findUnique({
      where: { id },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!artist) throw new Error("Artiste introuvable");
    if (!artist.deletedAt) throw new Error("Cet artiste n'est pas supprimé");

    await prisma.artist.update({
      where: { id },
      data: { deletedAt: null, active: true },
    });
    await logAudit({
      entity: "Artist",
      entityId: id,
      action: "restore",
      summary: `Artiste restauré : « ${artist.name} »`,
    });

    revalidatePath("/artistes");
    revalidatePath("/trash");
  });
}

/**
 * Suppression DÉFINITIVE (irréversible) d'un artiste depuis la corbeille.
 * Bloquée si des DealArtiste le référencent (FK `onDelete: Restrict`) : on
 * ne veut pas casser l'historique financier des deals. On vérifie en amont
 * pour renvoyer un message clair plutôt qu'une erreur Prisma P2003.
 */
export async function permanentlyDeleteArtist(id: string): Promise<ActionResult> {
  return safeAction("permanentlyDeleteArtist", async () => {
    await requireUser();
    if (!id) throw new Error("ID artiste manquant");
    const artist = await prisma.artist.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true },
    });
    if (!artist) throw new Error("Artiste introuvable");

    // Garde : tout DealArtiste (même soft-deleté) bloque la suppression
    // définitive via la FK Restrict. On compte large (l'extension est no-op).
    const linked = await prisma.dealArtiste.count({ where: { artistId: id } });
    if (linked > 0) {
      throw new Error(
        `Impossible : « ${artist.name} » est lié à ${linked} deal(s). Supprimez d'abord ces deals définitivement.`,
      );
    }

    await prisma.artist.delete({ where: { id } });
    await logAudit({
      entity: "Artist",
      entityId: id,
      action: "permanently_delete",
      before: artist,
      summary: `Artiste supprimé définitivement : « ${artist.name} »`,
    });

    revalidatePath("/artistes");
    revalidatePath("/trash");
  });
}
