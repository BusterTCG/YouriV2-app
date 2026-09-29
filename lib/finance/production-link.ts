import "server-only";

// Rattachement d'une date PROD_EXE à sa Production (portage de la refonte
// « Production » KN, Stan 2026-09-29).
//
// Règle : une date appartient à la production du même artiste dont le nom =
// `Deal.showName` (insensible à la casse / aux espaces). Si aucune production
// n'existe encore pour ce nom, on la crée avec le contrat artiste de la date.
//
// Spécificité Youri : le Deal n'a pas d'`artistId` — l'artiste d'une date de
// production est son artiste principal (1er DealArtiste actif, même règle que
// `setDealPrimaryArtist`). Une production = le spectacle d'UN artiste.

import { prisma } from "@/lib/db";
import { recomputeProductionFinancials, recomputeShowFinancials } from "./show-financials";

/** Artiste principal d'un deal (1er DealArtiste actif), ou null. */
export async function primaryArtistIdOf(dealId: string): Promise<string | null> {
  const da = await prisma.dealArtiste.findFirst({
    where: { dealId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { artistId: true },
  });
  return da?.artistId ?? null;
}

/**
 * Aligne `Deal.productionId` sur (artiste principal, showName) puis recalcule
 * les productions impactées (ancienne + nouvelle). À appeler après création,
 * édition, changement d'artiste, changement de statut, suppression ou
 * restauration d'un deal.
 */
export async function syncDealProductionLink(dealId: string): Promise<void> {
  // Lecture brute (inclut les deals en corbeille) : une date supprimée doit
  // quand même déclencher le recalcul de sa production (quote-parts).
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      category: true,
      showName: true,
      productionId: true,
      deletedAt: true,
      residency: { select: { id: true, productionId: true } },
    },
  });
  if (!deal) return;

  // Date en corbeille : ses DealArtiste y sont aussi (cascade soft-delete) →
  // on NE touche PAS aux rattachements (production, résidence), pour qu'une
  // restauration la remette exactement à sa place. On recalcule seulement sa
  // production (la date sort de la répartition des frais généraux).
  if (deal.deletedAt) {
    if (deal.productionId) await recomputeProductionFinancials(deal.productionId);
    return;
  }

  const artistId = await primaryArtistIdOf(dealId);
  const previousProductionId = deal.productionId;
  let nextProductionId: string | null = previousProductionId;

  if (deal.category !== "PROD_EXE" || !artistId) {
    nextProductionId = null;
  } else {
    const name = deal.showName?.trim();
    if (name) {
      nextProductionId = await findOrCreateProduction(artistId, name, dealId);
    } else if (previousProductionId) {
      // Pas de nom de spectacle : on garde le rattachement existant uniquement
      // si la production appartient bien au même artiste.
      const prod = await prisma.production.findUnique({
        where: { id: previousProductionId },
        select: { artistId: true },
      });
      if (prod?.artistId !== artistId) nextProductionId = null;
    }
  }

  // Mois de résidence déplacé vers une autre production (nom / artiste
  // changé) → il quitte la résidence (qui appartient à l'ancienne).
  const leavesResidency = !!deal.residency && deal.residency.productionId !== nextProductionId;
  if (nextProductionId !== previousProductionId || leavesResidency) {
    await prisma.deal.update({
      where: { id: dealId },
      data: {
        productionId: nextProductionId,
        ...(leavesResidency ? { residencyId: null } : {}),
      },
    });
  }

  if (previousProductionId && previousProductionId !== nextProductionId) {
    await recomputeProductionFinancials(previousProductionId);
  }
  if (nextProductionId) {
    await recomputeProductionFinancials(nextProductionId);
  } else if (deal.category === "PROD_EXE" && !deal.deletedAt) {
    await recomputeShowFinancials(dealId);
  }
}

async function findOrCreateProduction(
  artistId: string,
  name: string,
  sourceDealId: string,
): Promise<string> {
  const productions = await prisma.production.findMany({
    where: { artistId },
    select: { id: true, name: true },
  });
  const key = normalizeProductionName(name);
  const match = productions.find((p) => normalizeProductionName(p.name) === key);
  if (match) return match.id;

  const source = await prisma.deal.findUnique({
    where: { id: sourceDealId },
    select: { artistShareKind: true, coprodKnPct: true, prodExePct: true },
  });
  const created = await prisma.production.create({
    data: {
      artistId,
      name,
      artistShareKind: source?.artistShareKind ?? null,
      coprodKnPct: source?.coprodKnPct ?? null,
      prodExePct: source?.prodExePct ?? null,
    },
  });
  return created.id;
}

/** toLocaleLowerCase : « Élan » et « élan » = même production. */
export function normalizeProductionName(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr-FR");
}
