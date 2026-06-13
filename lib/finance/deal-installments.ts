import "server-only";

import { PaymentStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Logique financière de l'échéancier de paiement (BOOKING) — Stan 2026-06-13.
 *
 * Quand un deal Booking a des échéances (DealInstallment), ses champs
 * `budgetPaymentStatus` / `budgetPaidAt` ne sont plus pilotés par le toggle
 * "Encaissé" global mais DÉRIVÉS de l'état des tranches :
 *   - budgetPaymentStatus = agrégat des statuts des tranches
 *   - budgetPaidAt        = date la plus récente parmi les tranches encaissées
 *
 * Ainsi le deal s'intègre au dashboard/reporting comme une encaisse normale
 * (le filtre `budgetPaymentStatus = PAID` reste valable). La ventilation
 * mensuelle fine (chaque tranche à son mois) est gérée séparément côté
 * dashboard via les tranches PAID directement (cf. lib/dashboard.ts).
 *
 * Inspiré de KN `lib/finance/deal-installments.ts`, simplifié à UN axe de
 * statut (Youri Booking n'a que l'encaissement budget, pas le double flux
 * artiste+commission de KN — la part artiste vit dans DealArtiste).
 */

/**
 * Agrège les statuts des tranches en un statut budget unique pour le deal.
 * Priorité : DISPUTE > tout PAID > tout PAID/facturé > sinon TO_INVOICE.
 * Vide → N_A (pas d'échéancier).
 */
function aggregateStatus(statuses: PaymentStatus[]): PaymentStatus {
  if (statuses.length === 0) return PaymentStatus.N_A;
  if (statuses.some((s) => s === PaymentStatus.DISPUTE))
    return PaymentStatus.DISPUTE;
  if (statuses.every((s) => s === PaymentStatus.PAID)) return PaymentStatus.PAID;
  if (
    statuses.every(
      (s) =>
        s === PaymentStatus.PAID ||
        s === PaymentStatus.INVOICED ||
        s === PaymentStatus.VALIDATED,
    )
  )
    return PaymentStatus.INVOICED;
  return PaymentStatus.TO_INVOICE;
}

/**
 * Recalcule `budgetPaymentStatus` + `budgetPaidAt` du deal depuis ses
 * échéances. NO-OP si le deal n'a aucune échéance (le budget reste piloté
 * manuellement par le toggle "Encaissé"). À appeler après toute mutation
 * d'échéance (create / update / delete / toggle statut).
 */
export async function recomputeBudgetFromInstallments(
  dealId: string,
): Promise<void> {
  if (!dealId) return;
  const installments = await prisma.dealInstallment.findMany({
    where: { dealId },
    select: { paymentStatus: true, paidAt: true },
  });
  if (installments.length === 0) return;

  const budgetPaymentStatus = aggregateStatus(
    installments.map((i) => i.paymentStatus),
  );
  const paidDates = installments
    .filter((i) => i.paymentStatus === PaymentStatus.PAID && i.paidAt)
    .map((i) => i.paidAt!.getTime());
  const budgetPaidAt =
    paidDates.length > 0 ? new Date(Math.max(...paidDates)) : null;

  await prisma.deal.update({
    where: { id: dealId },
    data: { budgetPaymentStatus, budgetPaidAt },
  });
}

/**
 * Unité d'encaissement issue d'une tranche d'échéancier PAID — Stan 2026-06-14.
 *
 * Permet la ventilation mensuelle (chaque tranche compte à SON mois de
 * paiement, pas au mois global du deal). Les montants marge/MF sont calculés
 * AU PRORATA de la part de la tranche dans le budget total du deal (les coûts
 * artistes/charges/MF ne sont pas découpés par tranche → on les répartit
 * proportionnellement au CA encaissé).
 */
export interface InstallmentEncaissementUnit {
  /** Deal d'origine — sert à dédupliquer le comptage des deals (top-artistes)
   *  quand un même deal a plusieurs tranches dans la fenêtre. */
  dealId: string;
  /** Mois réel d'encaissement (= mois de la date d'échéance de la tranche). */
  paidAt: Date;
  /** CA HT de la tranche (= son montant). */
  caHt: number;
  /** Part artiste de la tranche au prorata (Σ cachets deal × tranche/budget). */
  totalArtistes: number;
  /** Marge brute au prorata (margeBrute deal × tranche / budget). */
  margeBrute: number;
  /** Management fees au prorata. */
  totalMf: number;
  /** Attribution du CA de la tranche par artiste (prorata count-based, comme
   *  le top-artistes du reporting : CA tranche ÷ nb artistes du deal). */
  artists: Array<{
    id: string;
    name: string;
    slug: string;
    color: string | null;
    caShare: number;
  }>;
}

/**
 * Retourne les unités d'encaissement des tranches BOOKING PAID dans une
 * fenêtre [start, end[. Vide si `applies` est faux (le filtre catégorie cible
 * PROD_EXE/CACHETS, qui n'ont pas d'échéancier).
 *
 * Utilisé par le dashboard ET le reporting pour ventiler les encaissements
 * échelonnés au bon mois, sans double-comptage (les deals BOOKING avec
 * échéancier sont exclus de la requête deal-level via `installments: {none:{}}`).
 */
export async function getBookingInstallmentUnits(
  range: { start: Date; end: Date },
  opts: { applies: boolean; artistWhere: Prisma.DealWhereInput },
): Promise<InstallmentEncaissementUnit[]> {
  if (!opts.applies) return [];

  const rows = await prisma.dealInstallment.findMany({
    where: {
      paymentStatus: PaymentStatus.PAID,
      paidAt: { gte: range.start, lt: range.end },
      deal: {
        ...opts.artistWhere,
        category: "BOOKING",
        deletedAt: null,
        status: { not: "ANNULE" },
      },
    },
    select: {
      dealId: true,
      amount: true,
      paidAt: true,
      deal: {
        select: {
          budgetAmount: true,
          dealArtistes: {
            where: { deletedAt: null },
            select: {
              cachetAmount: true,
              artist: {
                select: { id: true, name: true, slug: true, color: true },
              },
            },
          },
          dealCharges: {
            where: { deletedAt: null },
            select: { amount: true },
          },
          managementFees: {
            where: { deletedAt: null },
            select: { amount: true },
          },
        },
      },
    },
  });

  const units: InstallmentEncaissementUnit[] = [];
  for (const r of rows) {
    if (!r.paidAt) continue;
    const amount = r.amount != null ? Number(r.amount) : 0;
    const budget =
      r.deal.budgetAmount != null ? Number(r.deal.budgetAmount) : 0;
    if (amount <= 0 || budget <= 0) continue;
    const ratio = amount / budget;
    const artistes = r.deal.dealArtistes.reduce(
      (acc, a) => acc + (a.cachetAmount != null ? Number(a.cachetAmount) : 0),
      0,
    );
    const charges = r.deal.dealCharges.reduce(
      (acc, c) => acc + (c.amount != null ? Number(c.amount) : 0),
      0,
    );
    const dealMargeBrute = budget - artistes - charges;
    const dealMf = r.deal.managementFees.reduce(
      (acc, mf) => acc + (mf.amount != null ? Number(mf.amount) : 0),
      0,
    );
    // Attribution du CA de la tranche par artiste — prorata count-based
    // (identique au top-artistes du reporting : CA du deal ÷ nb d'artistes).
    const namedArtists = r.deal.dealArtistes.filter((a) => a.artist != null);
    const perArtistCa =
      namedArtists.length > 0 ? amount / namedArtists.length : 0;
    units.push({
      dealId: r.dealId,
      paidAt: r.paidAt,
      caHt: amount,
      totalArtistes: artistes * ratio,
      margeBrute: dealMargeBrute * ratio,
      totalMf: dealMf * ratio,
      artists: namedArtists.map((a) => ({
        id: a.artist!.id,
        name: a.artist!.name,
        slug: a.artist!.slug,
        color: a.artist!.color,
        caShare: perArtistCa,
      })),
    });
  }
  return units;
}
