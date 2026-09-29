"use server";

// Résidences (portage KN, étape 2 — Stan 2026-09-29) : création via
// l'assistant (période multi-mois, jours, horaires) ou ajout de séances à une
// résidence existante. Chaque mois calendaire = 1 Deal (unité financière :
// relevé du théâtre, charges, statuts, reporting), rattaché à la Résidence.
//
// Spécificités Youri : salle = annuaire KN (id + snapshot), artiste = 1er
// DealArtiste, pipeline de tâches créé pour chaque nouveau mois (comme
// createDeal), pas de Google Agenda.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma, DealStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { groupPlanByMonth, planResidency } from "@/lib/residency-plan";
import { dayToUtcNoon, syncDealFromPerformances } from "@/lib/performances";
import { syncDealProductionLink } from "@/lib/finance/production-link";
import { residencyContractOf } from "@/lib/finance/production-overhead";
import { autoCreateTasksForDeal } from "@/lib/tasks-autocreate";
import { softDeleteDeal } from "@/lib/actions/deals";
import { syncShowTaskToggle } from "@/lib/actions/sync-show-tasks";
import { revalidateAllDealRoutes } from "@/lib/revalidate-deals";

const DayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");

const PlanSchema = z.object({
  productionId: z.string().min(1),
  /** Résidence existante à compléter (sinon création). */
  residencyId: z.string().min(1).nullable().optional(),
  name: z.string().trim().max(120).nullable().optional(),
  /** Salle KN (annuaire distant) — snapshot. */
  venue: z
    .object({ id: z.string().min(1), name: z.string(), city: z.string().nullable().optional() })
    .nullable()
    .optional(),
  startDay: DayKey,
  endDay: DayKey,
  weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Choisis au moins un jour"),
  times: z.array(z.string().max(20)).max(4),
  excluded: z.array(z.string()).optional(),
  capacity: z.coerce.number().int().nonnegative().nullable().optional(),
  venueDealKind: z.enum(["PROD", "CO_REAL", "CESSION"]).nullable().optional(),
  coRealKnPct: z.coerce.number().min(0).max(100).nullable().optional(),
  status: z.nativeEnum(DealStatus).default("CONFIRME"),
});

function revalidateResidency(artistSlug?: string | null) {
  revalidatePath("/shows", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/taches");
  revalidateAllDealRoutes(undefined, true);
  if (artistSlug) revalidatePath(`/artistes/${artistSlug}`);
}

export async function planResidencyPerformances(
  input: unknown,
): Promise<ActionResult<{ residencyId: string; months: number; performances: number }>> {
  const parsed = PlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation" };
  const d = parsed.data;
  return safeAction("planResidencyPerformances", async () => {
    const user = await requireUser();
    const production = await prisma.production.findUnique({
      where: { id: d.productionId },
      include: { artist: { select: { id: true, name: true, slug: true } } },
    });
    if (!production) throw new Error("Production introuvable");

    const plan = planResidency(d);
    if (plan.length === 0) throw new Error("Aucune séance générée sur cette période");

    // Résidence : existante ou nouvelle (nom = salle par défaut).
    let residency = d.residencyId
      ? await prisma.residency.findUnique({ where: { id: d.residencyId } })
      : null;
    if (d.residencyId && !residency) throw new Error("Résidence introuvable");
    if (residency && residency.productionId !== production.id) {
      throw new Error("Cette résidence appartient à une autre production");
    }
    if (!residency) {
      const name = d.name?.trim() || d.venue?.name?.trim();
      if (!name) throw new Error("Choisis une salle ou donne un nom à la résidence");
      residency = await prisma.residency.create({
        data: {
          productionId: production.id,
          name,
          venueId: d.venue?.id ?? null,
          venueName: d.venue?.name ?? null,
          venueCity: d.venue?.city ?? null,
        },
      });
    }

    // Mois existants de la résidence (clé "YYYY-MM" = mois de la 1re séance).
    const existingDeals = await prisma.deal.findMany({
      where: { residencyId: residency.id, deletedAt: null },
      select: { id: true, date: true, performances: { select: { date: true, time: true } } },
    });
    const byMonth = new Map(existingDeals.map((x) => [x.date.toISOString().slice(0, 7), x]));
    // Réglages hérités d'un mois existant (complément de résidence) quand
    // l'assistant ne les fournit pas : modèle salle, % co-réa, jauge.
    const template = existingDeals.length
      ? await prisma.deal.findUnique({
          where: { id: existingDeals[0].id },
          select: { venueDealKind: true, coRealKnPct: true, capacity: true },
        })
      : null;

    let created = 0;
    for (const { month, perfs } of groupPlanByMonth(plan)) {
      let dealId = byMonth.get(month)?.id;
      const already = new Set(
        (byMonth.get(month)?.performances ?? []).map(
          (p) => `${p.date.toISOString().slice(0, 10)}|${p.time ?? ""}`,
        ),
      );
      const toAdd = perfs.filter((p) => !already.has(`${p.day}|${p.time ?? ""}`));
      if (toAdd.length === 0) continue;

      if (!dealId) {
        const firstDay = dayToUtcNoon(toAdd[0].day);
        const deal = await prisma.deal.create({
          data: {
            category: "PROD_EXE",
            status: d.status,
            productionId: production.id,
            residencyId: residency.id,
            title: `${production.artist.name} - ${production.name} @ ${residency.name}`,
            showName: production.name,
            date: firstDay,
            venueId: residency.venueId,
            venueName: residency.venueName ?? residency.name,
            venueCity: residency.venueCity,
            capacity: d.capacity ?? template?.capacity ?? null,
            isMultiDate: true,
            venueDealKind: d.venueDealKind ?? template?.venueDealKind ?? null,
            coRealKnPct:
              d.coRealKnPct != null
                ? new Prisma.Decimal(d.coRealKnPct)
                : template?.coRealKnPct ?? null,
            // Contrat « Résidences » de la production (= principal s'il n'est
            // pas distinct).
            ...residencyContractOf(production),
            createdById: user.id,
            dealArtistes: {
              create: [{ artistId: production.artistId, paymentStatus: "N_A" }],
            },
          },
        });
        dealId = deal.id;
        await autoCreateTasksForDeal(dealId, "PROD_EXE", firstDay);
      }
      await prisma.performance.createMany({
        data: toAdd.map((p) => ({ dealId: dealId!, date: dayToUtcNoon(p.day), time: p.time })),
      });
      created += toAdd.length;
      await syncDealFromPerformances(dealId);
      await syncDealProductionLink(dealId);
    }

    await logAudit({
      entity: "Residency",
      entityId: residency.id,
      action: d.residencyId ? "update" : "create",
      summary: `Résidence « ${residency.name} » (${production.name}) : ${created} séance(s) ajoutée(s)`,
    });
    revalidateResidency(production.artist.slug);
    return {
      residencyId: residency.id,
      months: groupPlanByMonth(plan).length,
      performances: created,
    };
  });
}

/** Renommer une résidence (les titres des mois suivent). */
export async function renameResidency(id: string, name: string): Promise<ActionResult> {
  return safeAction("renameResidency", async () => {
    await requireUser();
    const n = z.string().trim().min(1, "Nom requis").max(120).parse(name);
    const before = await prisma.residency.findUnique({ where: { id }, select: { name: true } });
    if (!before) throw new Error("Résidence introuvable");
    await prisma.residency.update({ where: { id }, data: { name: n } });
    // Titres des mois « … @ Ancien nom » → « … @ Nouveau nom ».
    const months = await prisma.deal.findMany({
      where: { residencyId: id },
      select: { id: true, title: true },
    });
    const suffix = ` @ ${before.name}`;
    for (const m of months) {
      if (m.title.endsWith(suffix)) {
        await prisma.deal.update({
          where: { id: m.id },
          data: { title: `${m.title.slice(0, -suffix.length)} @ ${n}` },
        });
      }
    }
    await logAudit({
      entity: "Residency",
      entityId: id,
      action: "update",
      summary: `Résidence « ${before.name} » renommée « ${n} »`,
    });
    revalidateResidency();
  });
}

/** Suivi (contrat, MEV, VHR) appliqué à tous les mois de la résidence (+ tâches). */
const ChecklistSchema = z
  .object({
    contractSigned: z.boolean().optional(),
    ticketingReady: z.boolean().optional(),
    vhrBooked: z.boolean().optional(),
  })
  .strict();

export async function setResidencyChecklist(
  id: string,
  input: { contractSigned?: boolean; ticketingReady?: boolean; vhrBooked?: boolean },
): Promise<ActionResult> {
  // Liste blanche : seuls les 3 champs du suivi peuvent être écrits.
  const parsed = ChecklistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check-list invalide" };
  const patch = parsed.data;
  return safeAction("setResidencyChecklist", async () => {
    await requireUser();
    const months = await prisma.deal.findMany({
      where: { residencyId: id, deletedAt: null },
      select: { id: true },
    });
    await prisma.deal.updateMany({
      where: { residencyId: id, deletedAt: null },
      data: patch,
    });
    // Pipeline de tâches de chaque mois synchronisé (comme la fiche date).
    for (const m of months) {
      for (const [key, value] of Object.entries(patch) as Array<
        ["contractSigned" | "ticketingReady" | "vhrBooked", boolean | undefined]
      >) {
        if (value !== undefined) await syncShowTaskToggle(m.id, key, value);
      }
    }
    await logAudit({
      entity: "Residency",
      entityId: id,
      action: "update",
      summary: `Check-list résidence : ${Object.entries(patch)
        .map(([k, v]) => `${k}=${v ? "oui" : "non"}`)
        .join(", ")}`,
    });
    revalidateResidency();
  });
}

/**
 * Supprime une résidence : ses mois passent à la corbeille (soft-delete,
 * quotes-parts recalculées ; restaurables depuis /trash). La fiche résidence
 * est CONSERVÉE (masquée tant qu'elle n'a plus de mois actif) : un mois
 * restauré y revient avec son contrat résidences, au lieu de devenir une date
 * de tournée. Elle est effacée quand son dernier mois est supprimé
 * définitivement. Refusée tant qu'un acompte versé à la salle n'est pas
 * récupéré.
 */
export async function deleteResidency(id: string): Promise<ActionResult<{ productionId: string }>> {
  return safeAction("deleteResidency", async () => {
    await requireUser();
    const residency = await prisma.residency.findUnique({
      where: { id },
      select: { productionId: true, name: true, venueDeposit: true },
    });
    if (!residency) throw new Error("Résidence introuvable");
    // Refusée tant qu'un acompte versé à la salle n'est pas récupéré (la
    // caution disparaîtrait avec la fiche).
    const dep = residency.venueDeposit;
    if (dep && Number(dep.amount) > 0 && !dep.refundedAt) {
      throw new Error(
        `Acompte de ${Number(dep.amount).toLocaleString("fr-FR")} € versé à la salle non récupéré : indique sa récupération (ou supprime-le) avant de supprimer la résidence.`,
      );
    }
    const months = await prisma.deal.findMany({
      where: { residencyId: id, deletedAt: null },
      select: { id: true },
    });
    for (const m of months) {
      const res = await softDeleteDeal(m.id);
      if (!res.ok) throw new Error(res.error);
    }
    await logAudit({
      entity: "Residency",
      entityId: id,
      action: "delete",
      summary: `Résidence « ${residency.name} » supprimée (${months.length} mois à la corbeille)`,
    });
    revalidateResidency();
    return { productionId: residency.productionId };
  });
}
