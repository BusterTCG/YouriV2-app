import "server-only";

import type { DealStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { BookingDealRow } from "@/lib/deals-list-types";

// Liste Booking du profil Production (Nour, Stan 2026-10-16) : aucun montant
// du deal n'est envoyé au navigateur, seulement les statuts et SES management
// fees (montant + statut).

export type RestrictedBookingRow = {
  id: string;
  date: Date;
  title: string;
  place: string | null;
  artists: Array<{ name: string; color: string | null }>;
  status: DealStatus;
  /** Tous les artistes payés (même règle que le tableau des associés). */
  artistsPaid: boolean;
  /** Budget encaissé (= « St. Marge »). */
  marginPaid: boolean;
  /** Ses management fees sur le deal — null s'il n'en a pas. */
  mf: { amount: number; paid: boolean } | null;
};

export async function toRestrictedBookingRows(
  deals: BookingDealRow[],
  pangeeKey: string | null,
): Promise<RestrictedBookingRow[]> {
  const fees = pangeeKey
    ? await prisma.dealManagementFee.findMany({
        where: { deletedAt: null, associateKey: pangeeKey, dealId: { in: deals.map((d) => d.id) } },
        select: { dealId: true, amount: true, paymentStatus: true },
      })
    : [];
  const byDeal = new Map<string, { amount: number; statuses: PaymentStatus[] }>();
  for (const f of fees) {
    const cur = byDeal.get(f.dealId) ?? { amount: 0, statuses: [] };
    cur.amount += f.amount != null ? Number(f.amount) : 0;
    cur.statuses.push(f.paymentStatus);
    byDeal.set(f.dealId, cur);
  }

  return deals.map((d) => {
    const mf = byDeal.get(d.id);
    return {
      id: d.id,
      date: d.date,
      title: d.title,
      place: d.venueCity ?? d.venueName,
      artists: d.dealArtistes.map((a) => ({ name: a.artist.name, color: a.artist.color })),
      status: d.status,
      artistsPaid: d.dealArtistes.length > 0 && d.dealArtistes.every((a) => a.paymentStatus === "PAID"),
      marginPaid: d.budgetPaymentStatus === "PAID",
      mf: mf ? { amount: mf.amount, paid: mf.statuses.every((s) => s === "PAID") } : null,
    };
  });
}
