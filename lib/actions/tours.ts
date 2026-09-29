"use server";

// Assistant « Ajouter une tournée » (portage KN, Stan 2026-09-28) : plusieurs
// dates / villes d'un coup pour une production. Chaque ligne passe par
// createDeal (même comportement que le formulaire : séances — doublé
// « 19:00 / 21:30 » = 2 séances —, rattachement à la production, contrat,
// jauge de la salle, pipeline de tâches). Pas de Google Agenda chez Youri.

import { z } from "zod";
import { DealStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { createDeal } from "@/lib/actions/deals";

const RowSchema = z
  .object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date manquante"),
    showTime: z.string().max(20).nullable().optional(),
    /** Salle de l'annuaire KN (snapshot). */
    venue: z
      .object({
        id: z.string().min(1),
        name: z.string(),
        city: z.string().nullable().optional(),
        capacity: z.number().int().nullable().optional(),
      })
      .nullable()
      .optional(),
    city: z.string().max(120).nullable().optional(),
    venueDealKind: z.enum(["PROD", "CO_REAL", "CESSION"]).nullable().optional(),
  })
  .refine((r) => !!r.venue || !!r.city?.trim(), "Salle ou ville requise");

const TourSchema = z.object({
  productionId: z.string().min(1),
  status: z.nativeEnum(DealStatus).default("CONFIRME"),
  rows: z.array(RowSchema).min(1, "Ajoute au moins une date").max(60),
});

export async function createTourDates(
  input: unknown,
): Promise<ActionResult<{ created: number; errors: string[]; createdRows: number[] }>> {
  const parsed = TourSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const line = typeof issue?.path[1] === "number" ? ` (ligne ${issue.path[1] + 1})` : "";
    return { ok: false, error: `${issue?.message ?? "Validation"}${line}` };
  }
  const d = parsed.data;
  return safeAction("createTourDates", async () => {
    await requireUser();
    const production = await prisma.production.findUnique({
      where: { id: d.productionId },
      include: { artist: { select: { name: true } } },
    });
    if (!production) throw new Error("Production introuvable");

    let created = 0;
    const errors: string[] = [];
    // Index des lignes créées : l'assistant les retire pour qu'un 2e clic
    // après une erreur partielle ne recrée pas les dates déjà faites.
    const createdRows: number[] = [];
    for (const [i, r] of d.rows.entries()) {
      const city = r.city?.trim() || r.venue?.city || null;
      const place = r.venue?.name ?? city;
      const res = await createDeal({
        category: "PROD_EXE",
        title: `${production.artist.name} - ${production.name} @ ${place}`,
        date: new Date(`${r.day}T12:00:00.000Z`),
        showTime: r.showTime?.trim() || null,
        status: d.status,
        venueId: r.venue?.id ?? null,
        venueName: r.venue?.name ?? null,
        venueCity: city,
        initialArtistId: production.artistId,
        showName: production.name,
        venueDealKind: r.venueDealKind ?? null,
        prodExePct: production.prodExePct != null ? Number(production.prodExePct) : null,
        coprodKnPct: production.coprodKnPct != null ? Number(production.coprodKnPct) : null,
        capacity: r.venue?.capacity ?? null,
      });
      if (res.ok) {
        created++;
        createdRows.push(i);
      } else {
        errors.push(`Ligne ${i + 1} (${r.day} ${place ?? ""}) : ${res.error}`);
      }
    }
    return { created, errors, createdRows };
  });
}
