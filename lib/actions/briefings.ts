"use server";

import { BriefingRole, BriefingStatus } from "@prisma/client";
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
        showTime: true,
      },
    });
    const created = !existing;

    // 3. Upsert avec patch sélectif :
    //    - À la création : on copie tout ce qu'on a sur le deal.
    //    - À l'update : on ne touche QUE les champs vides côté FDR pour ne
    //      pas écraser un override manuel.
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
