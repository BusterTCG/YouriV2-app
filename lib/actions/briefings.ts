"use server";

import { BriefingRole, BriefingStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";

/**
 * Server actions FDR (Feuille de route) — copie fidèle KN adaptée Pangee.
 *
 * Sprint 3.7 Lot A : uniquement `ensureBriefingWithPrefill`. Les CRUD
 * inline (travels/contacts/lieu/hôtel/notes/...) arrivent au Lot B avec
 * l'éditeur.
 *
 * Pattern annuaire Pangee : pas de `venue.contacts` locaux comme KN
 * (annuaire vit côté KN distant). On prefill l'unique contact qu'on connaît
 * de façon sûre : l'organisateur du deal (snapshot sur Deal.organizerId
 * + organizerName/Company).
 */

/**
 * Crée la FDR du deal si elle n'existe pas, puis prefill avec les données
 * du deal (venueId/Name/City + showTime + organisateur en BriefingContact).
 *
 * Idempotent : appelable sans risque à chaque ouverture de la page /fdr.
 * Patch sélectif sur l'upsert — on n'écrase JAMAIS un override manuel de
 * l'utilisateur (un champ rempli à la main reste tel quel).
 */
export async function ensureBriefingWithPrefill(
  dealId: string,
): Promise<ActionResult<{ briefingId: string; created: boolean }>> {
  return safeAction("ensureBriefingWithPrefill", async () => {
    await requireUser();
    if (!dealId) throw new Error("dealId manquant");

    // 1. Charge le deal (et vérifie qu'il existe + qu'il est BOOKING + non supprimé).
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, deletedAt: null, category: "BOOKING" },
      select: {
        id: true,
        venueId: true,
        venueName: true,
        venueCity: true,
        venueAddress: true,
        showTime: true,
        organizerId: true,
        organizerName: true,
        organizerCompany: true,
      },
    });
    if (!deal) throw new Error("Deal Booking introuvable");

    // 2. État actuel de la FDR (null si pas encore créée).
    const existing = await prisma.eventBriefing.findUnique({
      where: { dealId },
      select: {
        id: true,
        venueId: true,
        venueName: true,
        venueCity: true,
        venueAddress: true,
        showTime: true,
      },
    });
    const created = !existing;

    // 3. Upsert avec patch sélectif :
    //    - À la création : on copie tout ce qu'on a sur le deal (lieu KN
    //      snapshot + adresse libre BAN — les 2 sources sont reprises).
    //    - À l'update : on ne touche QUE les champs vides côté FDR pour ne
    //      pas écraser un override manuel (Stan 2026-05-26 : "info complète").
    const briefing = await prisma.eventBriefing.upsert({
      where: { dealId },
      update: {
        ...(existing && existing.venueId == null && deal.venueId
          ? {
              venueId: deal.venueId,
              venueName: deal.venueName,
              venueCity: deal.venueCity,
            }
          : {}),
        ...(existing &&
        (!existing.venueAddress || existing.venueAddress.length === 0) &&
        deal.venueAddress
          ? { venueAddress: deal.venueAddress }
          : {}),
        ...(existing && (!existing.showTime || existing.showTime.length === 0) && deal.showTime
          ? { showTime: deal.showTime }
          : {}),
      },
      create: {
        dealId,
        status: BriefingStatus.DRAFT,
        venueId: deal.venueId ?? null,
        venueName: deal.venueName ?? null,
        venueCity: deal.venueCity ?? null,
        venueAddress: deal.venueAddress ?? null,
        showTime: deal.showTime ?? null,
      },
    });

    // 4. Auto-création BriefingContact pour l'organisateur du deal (si on
    //    a au moins son nom). Idempotent : on dédoublonne sur (contactId, role)
    //    avec un fallback sur (lastName/company + role) pour les contacts
    //    inline qui n'ont pas de contactId.
    const organizerName = deal.organizerName ?? deal.organizerCompany ?? null;
    if (organizerName) {
      const existingContacts = await prisma.briefingContact.findMany({
        where: { briefingId: briefing.id, role: BriefingRole.ORGANISATEUR },
        select: { contactId: true, lastName: true, company: true },
      });
      const alreadyPresent = existingContacts.some((c) => {
        if (deal.organizerId && c.contactId === deal.organizerId) return true;
        // Fallback dédup pour contact inline saisi à la main
        if (!deal.organizerId && c.company === deal.organizerCompany) return true;
        return false;
      });
      if (!alreadyPresent) {
        // Split firstName/lastName depuis organizerName (best-effort —
        // l'user pourra ajuster côté éditeur Lot B).
        const parts = organizerName.split(/\s+/);
        const firstName = parts.length > 1 ? parts[0] : null;
        const lastName = parts.length > 1 ? parts.slice(1).join(" ") : parts[0];

        await prisma.briefingContact.create({
          data: {
            briefingId: briefing.id,
            contactId: deal.organizerId ?? null,
            firstName,
            lastName,
            company: deal.organizerCompany ?? null,
            role: BriefingRole.ORGANISATEUR,
          },
        });
      }
    }

    return { briefingId: briefing.id, created };
  });
}

// ──────────────────────── Update champs simples (Lot B1) ────────────────────────
//
// Patch partiel des champs "scalaires" de la FDR : lieu (snapshot), heures,
// hôtel, restaurant, per diem, notes, status. Les CRUD travels/contacts
// vivent dans leurs propres actions (Lot B2/B3).
//
// Pattern KN : chaque champ sauve indépendamment via `autoSave(patch)` au
// blur — l'indicateur "Sauvegarde…/Sauvegardé/Erreur" en haut de l'éditeur
// donne le feedback. Pas de bouton "Enregistrer" global.

const UpdateBriefingSchema = z.object({
  briefingId: z.string().min(1),
  patch: z.object({
    venueId: z.string().nullable().optional(),
    venueName: z.string().max(200).nullable().optional(),
    venueCity: z.string().max(120).nullable().optional(),
    venueAddress: z.string().max(300).nullable().optional(),
    showTime: z.string().max(20).nullable().optional(),
    balanceTime: z.string().max(20).nullable().optional(),
    hotelName: z.string().max(200).nullable().optional(),
    hotelAddress: z.string().max(300).nullable().optional(),
    restaurantName: z.string().max(200).nullable().optional(),
    restaurantAddress: z.string().max(300).nullable().optional(),
    restaurantCovered: z.boolean().optional(),
    perDiemFlag: z.boolean().optional(),
    perDiemAmount: z.union([z.number().nonnegative(), z.literal(null)]).optional(),
    notes: z.string().max(5000).nullable().optional(),
    status: z.nativeEnum(BriefingStatus).optional(),
  }),
});

export async function updateBriefing(
  input: z.infer<typeof UpdateBriefingSchema>,
): Promise<ActionResult> {
  return safeAction("updateBriefing", async () => {
    await requireUser();
    const { briefingId, patch } = UpdateBriefingSchema.parse(input);
    if (!briefingId) throw new Error("briefingId manquant");

    // Construit le data Prisma en n'incluant que les champs explicitement
    // fournis (undefined = on ne touche pas).
    const data: Prisma.EventBriefingUpdateInput = {};
    if (patch.venueId !== undefined) data.venueId = patch.venueId;
    if (patch.venueName !== undefined) data.venueName = patch.venueName;
    if (patch.venueCity !== undefined) data.venueCity = patch.venueCity;
    if (patch.venueAddress !== undefined) data.venueAddress = patch.venueAddress;
    if (patch.showTime !== undefined) data.showTime = patch.showTime;
    if (patch.balanceTime !== undefined) data.balanceTime = patch.balanceTime;
    if (patch.hotelName !== undefined) data.hotelName = patch.hotelName;
    if (patch.hotelAddress !== undefined) data.hotelAddress = patch.hotelAddress;
    if (patch.restaurantName !== undefined) data.restaurantName = patch.restaurantName;
    if (patch.restaurantAddress !== undefined)
      data.restaurantAddress = patch.restaurantAddress;
    if (patch.restaurantCovered !== undefined)
      data.restaurantCovered = patch.restaurantCovered;
    if (patch.perDiemFlag !== undefined) data.perDiemFlag = patch.perDiemFlag;
    if (patch.perDiemAmount !== undefined) data.perDiemAmount = patch.perDiemAmount;
    if (patch.notes !== undefined) data.notes = patch.notes;
    if (patch.status !== undefined) data.status = patch.status;

    const updated = await prisma.eventBriefing.update({
      where: { id: briefingId },
      data,
      select: { dealId: true },
    });
    revalidatePath(`/deals/booking/${updated.dealId}/fdr`);
  });
}
