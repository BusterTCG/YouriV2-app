"use server";

// Compte artiste (portage KN, Stan 2026-09-28) : quote-parts versées à
// l'artiste et remboursements de l'artiste, par production. Chaque mouvement
// resynchronise les statuts artiste dérivés des dates (Deal.artistStatus).

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { ArtistMovementKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { syncArtistStatuses } from "@/lib/finance/artist-account-server";
import { revalidateAllDealRoutes } from "@/lib/revalidate-deals";

async function after(productionId: string) {
  await syncArtistStatuses(productionId);
  const p = await prisma.production.findUnique({
    where: { id: productionId },
    select: { artist: { select: { slug: true } } },
  });
  revalidatePath("/shows", "layout");
  revalidatePath("/dashboard");
  revalidateAllDealRoutes(undefined, true);
  if (p) revalidatePath(`/artistes/${p.artist.slug}`);
}

const Schema = z.object({
  productionId: z.string().min(1),
  kind: z.nativeEnum(ArtistMovementKind),
  amount: z.coerce.number().positive("Montant requis"),
  date: z.coerce.date(),
  note: z.string().max(300).nullable().optional(),
});

export async function addArtistMovement(input: unknown): Promise<ActionResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation" };
  const d = parsed.data;
  return safeAction("addArtistMovement", async () => {
    await requireUser();
    const m = await prisma.artistMovement.create({
      data: {
        productionId: d.productionId,
        kind: d.kind,
        amount: new Prisma.Decimal(d.amount),
        date: d.date,
        note: d.note || null,
      },
    });
    await logAudit({
      entity: "ArtistMovement",
      entityId: m.id,
      action: "create",
      summary: `${d.kind === "PAYMENT" ? "Quote-part versée à l'artiste" : "Remboursement de l'artiste"} ${d.amount} €`,
    });
    await after(d.productionId);
  });
}

export async function deleteArtistMovement(id: string): Promise<ActionResult> {
  return safeAction("deleteArtistMovement", async () => {
    await requireUser();
    const before = await prisma.artistMovement.findUnique({ where: { id } });
    if (!before) throw new Error("Mouvement introuvable");
    await prisma.artistMovement.delete({ where: { id } });
    await logAudit({
      entity: "ArtistMovement",
      entityId: id,
      action: "delete",
      before,
      summary: `Mouvement du compte artiste supprimé (${Number(before.amount)} €)`,
    });
    await after(before.productionId);
  });
}
