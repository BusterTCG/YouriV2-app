"use server";

// Actions Production (portage de la refonte « Production » KN, Stan
// 2026-09-29) : contrat artiste, renommage, clôture, frais généraux,
// rattachement manuel d'une date.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma, ArtistShareKind, PaymentStatus, ProductionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { requireDealCategoryAccess } from "@/lib/auth/access";
import { safeAction, type ActionResult } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { recomputeProductionFinancials } from "@/lib/finance/show-financials";
import { shareKindFor } from "@/lib/finance/production-overhead";
import {
  normalizeProductionName,
  primaryArtistIdOf,
  syncDealProductionLink,
} from "@/lib/finance/production-link";
import { revalidateAllDealRoutes } from "@/lib/revalidate-deals";

function revalidateProduction(artistSlug?: string | null) {
  revalidatePath("/shows", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/reporting");
  revalidateAllDealRoutes(undefined, true);
  if (artistSlug) revalidatePath(`/artistes/${artistSlug}`);
}

async function artistSlugOfProduction(productionId: string) {
  const p = await prisma.production.findUnique({
    where: { id: productionId },
    select: { artist: { select: { slug: true } } },
  });
  return p?.artist.slug ?? null;
}

/** Erreur métier : son message est affiché tel quel (humanizeError). */
class UserError extends Error {}

function fieldErrorsOf(e: z.ZodError): ActionResult<never> {
  return {
    ok: false,
    error: "Validation",
    fieldErrors: z.flattenError(e).fieldErrors as Record<string, string[]>,
  };
}

// ────────── Création (Stan 2026-10-01, portage KN) ──────────

const ProductionCreateSchema = z.object({
  artistId: z.string().min(1, "Artiste requis"),
  name: z.string().trim().min(1, "Nom du spectacle requis").max(200),
  prodExePct: z.coerce.number().min(0).max(100).nullable().optional(),
  coprodKnPct: z.coerce.number().min(0).max(100).nullable().optional(),
});

/**
 * Crée un spectacle (production) sans date : l'accueil crée d'abord le
 * spectacle, puis on y ajoute dates, tournées, résidences. Nom unique par
 * artiste (rattachement automatique des dates sur le nom).
 */
export async function createProduction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = ProductionCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Validation",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }
  const d = parsed.data;
  return safeAction("createProduction", async () => {
    await requireDealCategoryAccess("PROD_EXE");
    const existing = await prisma.production.findMany({
      where: { artistId: d.artistId },
      select: { name: true },
    });
    if (existing.some((p) => normalizeProductionName(p.name) === normalizeProductionName(d.name))) {
      throw new UserError(`Cet artiste a déjà une production « ${d.name} ».`);
    }
    const pe = d.prodExePct ?? null;
    const cp = d.coprodKnPct ?? null;
    const created = await prisma.production.create({
      data: {
        artistId: d.artistId,
        name: d.name.replace(/\s+/g, " "),
        prodExePct: pe != null ? new Prisma.Decimal(pe) : null,
        coprodKnPct: cp != null ? new Prisma.Decimal(cp) : null,
        artistShareKind: pe != null || cp != null ? shareKindFor(pe, cp) : null,
      },
      include: { artist: { select: { slug: true } } },
    });
    await logAudit({
      entity: "Production",
      entityId: created.id,
      action: "create",
      summary: `Production « ${created.name} » créée`,
    });
    revalidateProduction(created.artist.slug);
    return { id: created.id };
  });
}

// ────────── Lecture (formulaire deal) ──────────

/** Productions (tous artistes) pour les suggestions du champ « Spectacle ». */
export async function listProductionsForForm() {
  await requireUser();
  const rows = await prisma.production.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      artistId: true,
      name: true,
      status: true,
      artistShareKind: true,
      coprodKnPct: true,
      prodExePct: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    coprodKnPct: r.coprodKnPct != null ? Number(r.coprodKnPct) : null,
    prodExePct: r.prodExePct != null ? Number(r.prodExePct) : null,
  }));
}

// ────────── Production ──────────

const ProductionUpdateSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(200).optional(),
  artistShareKind: z.nativeEnum(ArtistShareKind).nullable().optional(),
  coprodKnPct: z.coerce.number().min(0).max(100).nullable().optional(),
  prodExePct: z.coerce.number().min(0).max(100).nullable().optional(),
  /** Contrat distinct pour les résidences. */
  residencyContractSeparate: z.boolean().optional(),
  residencyCoprodKnPct: z.coerce.number().min(0).max(100).nullable().optional(),
  residencyProdExePct: z.coerce.number().min(0).max(100).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export async function updateProduction(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = ProductionUpdateSchema.safeParse(input);
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  return safeAction("updateProduction", async () => {
    await requireUser();
    const before = await prisma.production.findUnique({ where: { id } });
    if (!before) throw new UserError("Production introuvable");
    const d = parsed.data;
    // Nom unique par artiste : le rattachement automatique des dates se fait
    // sur (artiste, nom) — deux productions homonymes le rendraient ambigu.
    if (
      d.name !== undefined &&
      normalizeProductionName(d.name) !== normalizeProductionName(before.name)
    ) {
      const others = await prisma.production.findMany({
        where: { artistId: before.artistId, id: { not: id } },
        select: { name: true },
      });
      if (others.some((o) => normalizeProductionName(o.name) === normalizeProductionName(d.name!))) {
        throw new UserError(`Une autre production de cet artiste s'appelle déjà « ${d.name} ».`);
      }
    }
    // Taux modifiés → marqueur de contrat déduit (prod-exé / co-prod cumulables).
    const num = (v: Prisma.Decimal | null) => (v != null ? Number(v) : null);
    const ratesTouched = d.coprodKnPct !== undefined || d.prodExePct !== undefined;
    const nextPe = d.prodExePct !== undefined ? d.prodExePct : num(before.prodExePct);
    const nextCp = d.coprodKnPct !== undefined ? d.coprodKnPct : num(before.coprodKnPct);
    // Contrat résidences : à l'activation, on part des taux principaux (Stan
    // n'a qu'à changer celui qui diffère).
    const resTouched =
      d.residencyContractSeparate !== undefined ||
      d.residencyCoprodKnPct !== undefined ||
      d.residencyProdExePct !== undefined;
    const enabling = d.residencyContractSeparate === true && !before.residencyContractSeparate;
    const nextResPe =
      d.residencyProdExePct !== undefined
        ? d.residencyProdExePct
        : enabling ? nextPe : num(before.residencyProdExePct);
    const nextResCp =
      d.residencyCoprodKnPct !== undefined
        ? d.residencyCoprodKnPct
        : enabling ? nextCp : num(before.residencyCoprodKnPct);
    const dec = (v: number | null) => (v == null ? null : new Prisma.Decimal(v));
    await prisma.production.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(ratesTouched
          ? { artistShareKind: shareKindFor(nextPe, nextCp) }
          : d.artistShareKind !== undefined
            ? { artistShareKind: d.artistShareKind }
            : {}),
        ...(d.coprodKnPct !== undefined ? { coprodKnPct: dec(d.coprodKnPct) } : {}),
        ...(d.prodExePct !== undefined ? { prodExePct: dec(d.prodExePct) } : {}),
        ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
        ...(resTouched
          ? {
              ...(d.residencyContractSeparate !== undefined
                ? { residencyContractSeparate: d.residencyContractSeparate }
                : {}),
              residencyProdExePct: dec(nextResPe),
              residencyCoprodKnPct: dec(nextResCp),
              residencyArtistShareKind: shareKindFor(nextResPe, nextResCp),
            }
          : {}),
      },
    });
    // Taux modifiés → toutes les dates héritent du nouveau contrat (+ MF).
    if (ratesTouched || resTouched) await recomputeProductionFinancials(id);
    // Renommage → le nom du spectacle des dates suit (sert au rattachement
    // auto et aux titres / FDR).
    if (d.name !== undefined && d.name !== before.name) {
      await prisma.deal.updateMany({
        where: { productionId: id },
        data: { showName: d.name },
      });
      // Titres Youri « Artiste - Ancien nom … » → « Artiste - Nouveau nom … ».
      const dated = await prisma.deal.findMany({
        where: { productionId: id },
        select: { id: true, title: true },
      });
      for (const dl of dated) {
        const next = renameInTitle(dl.title, before.name, d.name);
        if (next !== dl.title) {
          await prisma.deal.update({ where: { id: dl.id }, data: { title: next } });
        }
      }
    }
    await logAudit({
      entity: "Production",
      entityId: id,
      action: "update",
      before,
      summary: `Production « ${d.name ?? before.name} » modifiée`,
    });
    revalidateProduction(await artistSlugOfProduction(id));
  });
}

/**
 * Remplace le nom du spectacle dans un titre de date. Formats Youri :
 * « Artiste - Show @ Salle », « Artiste - Show » ; KN : « Show - Salle ».
 */
function renameInTitle(title: string, from: string, to: string): string {
  const variants: Array<[string, string]> = [
    [` - ${from} @ `, ` - ${to} @ `],
    [`${from} - `, `${to} - `],
  ];
  for (const [a, b] of variants) {
    if (title.includes(a)) return title.replace(a, b);
  }
  if (title.endsWith(` - ${from}`)) return `${title.slice(0, -from.length)}${to}`;
  return title;
}

export async function setProductionStatus(
  id: string,
  status: ProductionStatus,
): Promise<ActionResult> {
  if (!z.nativeEnum(ProductionStatus).safeParse(status).success) {
    return { ok: false, error: "Statut invalide" };
  }
  return safeAction("setProductionStatus", async () => {
    await requireUser();
    await prisma.production.update({
      where: { id },
      data: { status, closedAt: status === "CLOSED" ? new Date() : null },
    });
    await logAudit({
      entity: "Production",
      entityId: id,
      action: "update",
      summary: status === "CLOSED" ? "Production clôturée" : "Production réouverte",
    });
    revalidateProduction(await artistSlugOfProduction(id));
  });
}

/** Rattache manuellement une date à une production (aligne son showName). */
export async function attachDealToProduction(
  dealId: string,
  productionId: string,
): Promise<ActionResult> {
  return safeAction("attachDealToProduction", async () => {
    await requireUser();
    const [deal, prod, artistId] = await Promise.all([
      prisma.deal.findFirst({
        where: { id: dealId, deletedAt: null },
        select: { category: true },
      }),
      prisma.production.findUnique({
        where: { id: productionId },
        select: { artistId: true, name: true },
      }),
      primaryArtistIdOf(dealId),
    ]);
    if (!deal || !prod) throw new UserError("Date ou production introuvable");
    if (deal.category !== "PROD_EXE") {
      throw new UserError("Seules les dates de production se rattachent à une production");
    }
    if (artistId !== prod.artistId) {
      throw new UserError("La production appartient à un autre artiste");
    }
    await prisma.deal.update({
      where: { id: dealId },
      data: { showName: prod.name },
    });
    await syncDealProductionLink(dealId);
    revalidateProduction(await artistSlugOfProduction(productionId));
  });
}

// ────────── Frais généraux ──────────

const OverheadSchema = z.object({
  label: z.string().trim().min(1, "Libellé requis").max(200),
  amount: z.coerce.number(),
  date: z.coerce.date().nullable().optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
  comment: z.string().max(500).nullable().optional(),
});

async function afterOverheadMutation(productionId: string) {
  await recomputeProductionFinancials(productionId);
  revalidateProduction(await artistSlugOfProduction(productionId));
}

export async function createOverhead(
  productionId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = OverheadSchema.safeParse(input);
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  return safeAction("createOverhead", async () => {
    await requireUser();
    const row = await prisma.productionOverhead.create({
      data: {
        productionId,
        label: parsed.data.label,
        amount: new Prisma.Decimal(parsed.data.amount),
        date: parsed.data.date ?? null,
        status: parsed.data.status ?? "TO_INVOICE",
        paidAt: parsed.data.status === "PAID" ? new Date() : null,
        comment: parsed.data.comment || null,
      },
    });
    await afterOverheadMutation(productionId);
    return { id: row.id };
  });
}

export async function updateOverhead(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = OverheadSchema.partial().safeParse(input);
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  return safeAction("updateOverhead", async () => {
    await requireUser();
    const d = parsed.data;
    const before = await prisma.productionOverhead.findUnique({
      where: { id },
      select: { status: true, paidAt: true },
    });
    if (!before) throw new UserError("Frais introuvable");
    const row = await prisma.productionOverhead.update({
      where: { id },
      data: {
        ...(d.label !== undefined ? { label: d.label } : {}),
        ...(d.amount !== undefined ? { amount: new Prisma.Decimal(d.amount) } : {}),
        ...(d.date !== undefined ? { date: d.date } : {}),
        ...(d.comment !== undefined ? { comment: d.comment || null } : {}),
        // Date de paiement posée au passage à « Payé » seulement (un 2e envoi
        // PAID ne la déplace pas).
        ...(d.status !== undefined
          ? {
              status: d.status,
              paidAt: d.status === "PAID" ? (before.status === "PAID" ? before.paidAt : new Date()) : null,
            }
          : {}),
      },
    });
    await afterOverheadMutation(row.productionId);
  });
}

export async function deleteOverhead(id: string): Promise<ActionResult> {
  return safeAction("deleteOverhead", async () => {
    await requireUser();
    const before = await prisma.productionOverhead.findUnique({ where: { id } });
    if (!before) throw new UserError("Frais introuvable");
    await prisma.productionOverhead.delete({ where: { id } });
    await logAudit({
      entity: "ProductionOverhead",
      entityId: id,
      action: "delete",
      before,
      summary: `Frais général « ${before.label} » (${Number(before.amount)} €) supprimé`,
    });
    await afterOverheadMutation(before.productionId);
  });
}
