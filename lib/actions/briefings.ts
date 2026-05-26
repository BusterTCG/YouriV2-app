"use server";

import {
  BriefingRole,
  BriefingStatus,
  Prisma,
  TravelDirection,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { generateFdrPdf } from "@/lib/fdr-pdf";
import { sendMail } from "@/lib/mailer";

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
    capacity: z.union([z.number().int().nonnegative(), z.literal(null)]).optional(),
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
    if (patch.capacity !== undefined) data.capacity = patch.capacity;
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

// ──────────────────────────── Travels (Lot B2) ────────────────────────────
//
// CRUD trajets (BriefingTravel). Copie fidèle KN avec gestion runs JSON :
//   - `runs` est un tableau optionnel de {location, time} stocké en JSON
//   - Tableau vide ou absent → Prisma.DbNull (préserve la propreté)
//   - Sémantique selon direction : OUTBOUND = pickups après arrivée,
//     RETURN = pickups avant départ, INTER = transferts libres

const TravelRunSchema = z.object({
  location: z.string().min(1).max(200),
  time: z.string().max(10),
});

const TravelInputSchema = z.object({
  briefingId: z.string().min(1),
  direction: z.nativeEnum(TravelDirection),
  date: z.coerce.date(),
  fromStation: z.string().min(1).max(120),
  fromTime: z.string().max(10),
  toStation: z.string().min(1).max(120),
  toTime: z.string().max(10),
  comment: z.string().max(500).nullable().optional(),
  runs: z.array(TravelRunSchema).nullable().optional(),
});

export async function createTravel(
  input: z.infer<typeof TravelInputSchema>,
): Promise<ActionResult<{ id: string }>> {
  return safeAction("createTravel", async () => {
    await requireUser();
    const data = TravelInputSchema.parse(input);
    const travel = await prisma.briefingTravel.create({
      data: {
        briefingId: data.briefingId,
        direction: data.direction,
        date: data.date,
        fromStation: data.fromStation,
        fromTime: data.fromTime,
        toStation: data.toStation,
        toTime: data.toTime,
        comment: data.comment ?? null,
        // Tableau vide ou absent → DbNull (Prisma exige ce sentinel pour
        // distinguer "pas de valeur" de "valeur JSON null").
        runs:
          data.runs && data.runs.length > 0 ? data.runs : Prisma.DbNull,
      },
      select: { id: true, briefing: { select: { dealId: true } } },
    });
    revalidatePath(`/deals/booking/${travel.briefing.dealId}/fdr`);
    return { id: travel.id };
  });
}

const UpdateTravelSchema = z.object({
  id: z.string().min(1),
  patch: TravelInputSchema.omit({ briefingId: true }).partial(),
});

export async function updateTravel(
  input: z.infer<typeof UpdateTravelSchema>,
): Promise<ActionResult> {
  return safeAction("updateTravel", async () => {
    await requireUser();
    const { id, patch } = UpdateTravelSchema.parse(input);
    if (!id) throw new Error("id manquant");

    // `runs` (Json) ne peut pas être typé via cast direct — séparer le traitement.
    const { runs, ...rest } = patch;
    const data: Prisma.BriefingTravelUncheckedUpdateInput = {
      ...(rest as Prisma.BriefingTravelUncheckedUpdateInput),
    };
    if (runs !== undefined) {
      data.runs = runs && runs.length > 0 ? runs : Prisma.DbNull;
    }
    const travel = await prisma.briefingTravel.update({
      where: { id },
      data,
      select: { briefing: { select: { dealId: true } } },
    });
    revalidatePath(`/deals/booking/${travel.briefing.dealId}/fdr`);
  });
}

export async function deleteTravel(id: string): Promise<ActionResult> {
  return safeAction("deleteTravel", async () => {
    await requireUser();
    if (!id) throw new Error("id manquant");
    const travel = await prisma.briefingTravel.delete({
      where: { id },
      select: { briefing: { select: { dealId: true } } },
    });
    revalidatePath(`/deals/booking/${travel.briefing.dealId}/fdr`);
  });
}

// ──────────────────────────── Contacts FDR (Lot B3) ────────────────────────────
//
// 2 modes d'ajout (Stan + copie fidèle KN) :
//   1. "linked" — snapshot d'un contact annuaire KN distant. On stocke
//      `contactId` + coordonnées copiées au moment de la sélection. Refetch
//      possible via kn-client si besoin de rafraîchir.
//   2. "inline" — saisie libre (runner, VTC du jour…). `contactId = null`,
//      coordonnées vivent directement sur BriefingContact. Rôle ponctuel,
//      pas de pollution de l'annuaire KN.
//
// Affichage transparent : la card lit `contactId != null ? "snapshot" : "inline"`
// pour décider d'un éventuel badge "Ponctuel".

const AddBriefingContactSchema = z.object({
  briefingId: z.string().min(1),
  // Snapshot du contact KN (refetch possible via kn-client)
  contactId: z.string().min(1),
  firstName: z.string().max(80).nullable().optional(),
  lastName: z.string().max(80).nullable().optional(),
  company: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().max(120).nullable().optional(),
  role: z.nativeEnum(BriefingRole),
});

export async function addBriefingContact(
  input: z.infer<typeof AddBriefingContactSchema>,
): Promise<ActionResult> {
  return safeAction("addBriefingContact", async () => {
    await requireUser();
    const data = AddBriefingContactSchema.parse(input);
    const bc = await prisma.briefingContact.create({
      data: {
        briefingId: data.briefingId,
        contactId: data.contactId,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        company: data.company ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        role: data.role,
      },
      select: { briefing: { select: { dealId: true } } },
    });
    revalidatePath(`/deals/booking/${bc.briefing.dealId}/fdr`);
  });
}

const AddBriefingInlineContactSchema = z.object({
  briefingId: z.string().min(1),
  role: z.nativeEnum(BriefingRole),
  firstName: z.string().trim().min(1, "Prénom requis").max(80),
  lastName: z.string().max(80).nullable().optional(),
  company: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().max(120).nullable().optional(),
});

/**
 * Ajoute un contact "ponctuel" sans toucher à l'annuaire KN.
 * Cas typique : runner, VTC du jour, technicien externe.
 * `contactId` reste NULL → marqueur "inline" côté affichage.
 */
export async function addBriefingInlineContact(
  input: z.infer<typeof AddBriefingInlineContactSchema>,
): Promise<ActionResult> {
  return safeAction("addBriefingInlineContact", async () => {
    await requireUser();
    const data = AddBriefingInlineContactSchema.parse(input);
    const bc = await prisma.briefingContact.create({
      data: {
        briefingId: data.briefingId,
        role: data.role,
        firstName: data.firstName,
        lastName: data.lastName?.trim() || null,
        company: data.company?.trim() || null,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        // contactId reste null → marqueur "inline"
      },
      select: { briefing: { select: { dealId: true } } },
    });
    revalidatePath(`/deals/booking/${bc.briefing.dealId}/fdr`);
  });
}

// ──────────────────────────── Envoi mail FDR (Lot D) ────────────────────────────
//
// Génère le PDF de la FDR + l'envoie par mail aux artistes choisis via
// Resend. Met à jour briefing.sentAt + briefing.status = SENT.
//
// Dépendances :
//   - lib/fdr-pdf.ts pour générer le PDF (Puppeteer)
//   - lib/mailer.ts pour Resend (avec fallback dev sans clé)
//   - cookies()/headers() de Next pour récupérer la session utilisateur
//     courante (à forwarder à Puppeteer pour bypass le middleware auth)

/**
 * Pièce jointe additionnelle encodée en base64 (le client convertit le File
 * via FileReader.readAsDataURL avant d'envoyer). Le PDF de la FDR lui-même
 * est généré côté server, séparément — pas besoin de l'envoyer ici.
 */
const AdditionalAttachmentSchema = z.object({
  filename: z.string().min(1).max(200),
  contentBase64: z.string().min(1),
  mimeType: z.string().max(120).optional().nullable(),
});

const SendBriefingSchema = z.object({
  briefingId: z.string().min(1),
  /** IDs des dealArtistes destinataires (ceux cochés dans le dialog). */
  dealArtisteIds: z.array(z.string().min(1)).min(1, "Au moins 1 destinataire"),
  subject: z.string().trim().min(1, "Sujet requis").max(200),
  /** Corps du mail — accepté en texte brut, on convertit en HTML basique. */
  body: z.string().trim().min(1, "Corps requis").max(5000),
  /** Pièces jointes additionnelles (billets de train, fiche technique, etc.)
   *  Le PDF de la FDR est ajouté automatiquement par le server. */
  additionalAttachments: z
    .array(AdditionalAttachmentSchema)
    .max(10, "Maximum 10 pièces jointes")
    .optional()
    .default([]),
});

export async function sendBriefingByEmail(
  input: z.infer<typeof SendBriefingSchema>,
): Promise<ActionResult<{ sentTo: string[] }>> {
  return safeAction("sendBriefingByEmail", async () => {
    await requireUser();
    const { briefingId, dealArtisteIds, subject, body, additionalAttachments } =
      SendBriefingSchema.parse(input);

    // 1. Récup briefing + deal + dealArtistes + artist profiles
    const briefing = await prisma.eventBriefing.findUnique({
      where: { id: briefingId },
      select: {
        id: true,
        dealId: true,
        deal: {
          select: {
            id: true,
            title: true,
            date: true,
            venueCity: true,
            venueName: true,
            dealArtistes: {
              where: {
                deletedAt: null,
                id: { in: dealArtisteIds },
              },
              include: {
                artist: {
                  select: {
                    id: true,
                    name: true,
                    profile: { select: { personalEmail: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!briefing) throw new Error("FDR introuvable");

    // 2. Filtre les destinataires qui ont un email valide
    const recipients: Array<{ name: string; email: string }> = [];
    for (const da of briefing.deal.dealArtistes) {
      const email = da.artist.profile?.personalEmail?.trim();
      if (email) {
        recipients.push({ name: da.artist.name, email });
      }
    }
    if (recipients.length === 0) {
      throw new Error(
        "Aucun destinataire n'a d'email renseigné. Complète personalEmail dans la fiche artiste avant l'envoi.",
      );
    }

    // 3. Récupère la session user pour la forwarder à Puppeteer (bypass auth)
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("youri-session")?.value;
    if (!sessionToken) {
      throw new Error(
        "Session expirée — reconnecte-toi avant d'envoyer la FDR.",
      );
    }

    // 4. Construit l'origin absolu depuis les headers de la requête entrante
    const hdrs = await headers();
    const proto = hdrs.get("x-forwarded-proto") ?? "http";
    const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3001";
    const origin = `${proto}://${host}`;

    // 5. Génère le PDF (Puppeteer)
    const { buffer, filename } = await generateFdrPdf(
      briefing.dealId,
      origin,
      sessionToken,
    );

    // 6. Envoie le mail (1 mail multi-destinataires — tous en TO, pas BCC)
    const htmlBody = body
      .split(/\r?\n/)
      .map((line) => `<p style="margin:0 0 0.5em 0;">${escapeHtml(line)}</p>`)
      .join("");
    const dateStr = format(briefing.deal.date, "EEEE d MMMM yyyy", {
      locale: fr,
    });
    const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif; color: #1a2540; max-width: 600px;">
  <div style="background: #1a2540; color: white; padding: 16px 24px; border-radius: 6px 6px 0 0;">
    <div style="color: #d4a93a; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; font-weight: bold;">Pangee Prod</div>
    <h1 style="margin: 4px 0 0 0; font-size: 18px; font-weight: bold;">Feuille de route — ${escapeHtml(briefing.deal.title)}</h1>
    <div style="font-size: 13px; color: rgba(255,255,255,0.85); margin-top: 4px;">
      ${dateStr}${briefing.deal.venueCity ? ` · ${escapeHtml(briefing.deal.venueCity)}` : ""}
    </div>
  </div>
  <div style="padding: 16px 24px; background: #fafafa; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 6px 6px;">
    ${htmlBody}
    <p style="margin-top: 16px; font-size: 12px; color: #666;">
      📎 Feuille de route en pièce jointe (PDF).
    </p>
  </div>
</div>
    `.trim();

    // PJ : PDF FDR auto + documents additionnels (billets, fiche tech, etc.)
    // Stan 2026-05-26 — pattern KN. Décode chaque base64 en Buffer pour
    // Resend (ils acceptent Buffer ou base64 string directement).
    const attachments = [
      {
        filename: `${filename}.pdf`,
        content: Buffer.from(buffer),
      },
      ...additionalAttachments.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.contentBase64, "base64"),
      })),
    ];

    const res = await sendMail({
      to: recipients.map((r) => r.email),
      subject,
      html,
      text: body,
      attachments,
    });
    if (!res.ok) {
      throw new Error(`Envoi mail échoué : ${res.error}`);
    }

    // 7. Update briefing.sentAt + status = SENT
    await prisma.eventBriefing.update({
      where: { id: briefingId },
      data: {
        sentAt: new Date(),
        status: BriefingStatus.SENT,
      },
    });
    revalidatePath(`/deals/booking/${briefing.dealId}/fdr`);

    return { sentTo: recipients.map((r) => r.email) };
  });
}

/** Échappe les caractères HTML dangereux pour l'inlining dans le body mail. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function removeBriefingContact(
  id: string,
): Promise<ActionResult> {
  return safeAction("removeBriefingContact", async () => {
    await requireUser();
    if (!id) throw new Error("id manquant");
    const bc = await prisma.briefingContact.delete({
      where: { id },
      select: { briefing: { select: { dealId: true } } },
    });
    revalidatePath(`/deals/booking/${bc.briefing.dealId}/fdr`);
  });
}
