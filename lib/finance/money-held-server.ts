// Argent « à reverser » — lecture Prisma (Stan 2026-10-16). Règles :
// money-held.ts.
//
// Server-only (Prisma).

import "server-only";
import { prisma } from "@/lib/db";
import type { DealCategory, PaymentStatus, Prisma } from "@prisma/client";
import { getArtistAccount } from "@/lib/finance/artist-account-server";
import { heldOnDeal, owedTotal, receivedRatio } from "@/lib/finance/money-held";

export type MoneyHeldItem = {
  id: string;
  title: string;
  subtitle?: string;
  date?: Date;
  href: string;
  amount: number;
};

export type MoneyHeld = {
  total: number;
  /** Dû aux artistes (cachets + comptes artiste des productions). */
  artists: number;
  /** Dû aux fournisseurs (charges non payées). */
  charges: number;
  /** Dû aux associés (management fees non payées). */
  fees: number;
  /** Détail : 1 ligne par deal / production, plus gros montant d'abord. */
  items: MoneyHeldItem[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: Prisma.Decimal | null) => (v != null ? Number(v) : 0);
const sumPaid = (lines: Array<{ amount: Prisma.Decimal | null; paymentStatus: PaymentStatus }>) =>
  lines.reduce((s, l) => (l.paymentStatus === "PAID" ? s + num(l.amount) : s), 0);
const sumAll = (lines: Array<{ amount: Prisma.Decimal | null }>) =>
  lines.reduce((s, l) => s + num(l.amount), 0);
const owed = (lines: Array<{ amount: Prisma.Decimal | null; paymentStatus: PaymentStatus }>) =>
  lines.map((l) => ({ amount: l.amount != null ? Number(l.amount) : null, status: l.paymentStatus }));

function dealHref(category: DealCategory, id: string): string {
  if (category === "BOOKING") return `/deals/booking/${id}`;
  if (category === "CACHETS") return `/deals/cachets/${id}`;
  return `/shows/${id}`;
}

export async function getMoneyHeld(opts: {
  category: "all" | DealCategory;
  artistSlug: string | null;
  now?: Date;
}): Promise<MoneyHeld> {
  const { category, artistSlug } = opts;
  const now = opts.now ?? new Date();
  const artistFilter = artistSlug && artistSlug !== "all" ? artistSlug : null;
  const live = { deletedAt: null };

  const [deals, productions] = await Promise.all([
    prisma.deal.findMany({
      where: {
        deletedAt: null,
        status: { not: "ANNULE" },
        ...(category === "all" ? {} : { category }),
        ...(artistFilter
          ? { dealArtistes: { some: { deletedAt: null, artist: { slug: artistFilter } } } }
          : {}),
        // Rien n'est sur le compte tant qu'aucune somme n'est encaissée.
        OR: [
          { budgetPaymentStatus: "PAID" },
          { installments: { some: { paymentStatus: "PAID" } } },
          { cachetPrestations: { some: { deletedAt: null, paymentStatus: "PAID" } } },
          { productionLines: { some: { deletedAt: null, kind: "REVENUE", paymentStatus: "PAID" } } },
        ],
      },
      select: {
        id: true,
        title: true,
        date: true,
        category: true,
        productionId: true,
        budgetAmount: true,
        budgetPaymentStatus: true,
        artistAmount: true,
        artistStatus: true,
        installments: { select: { amount: true, paymentStatus: true } },
        cachetPrestations: { where: live, select: { amount: true, paymentStatus: true } },
        productionLines: {
          where: { deletedAt: null, coveredByVenue: false },
          select: { kind: true, amount: true, paymentStatus: true, paidByArtist: true },
        },
        // Cachet utilisé comme avance de trésorerie : compté via le compte
        // artiste de la production (pas deux fois).
        dealArtistes: {
          where: { deletedAt: null, cashAdvanceId: null },
          select: { cachetAmount: true, paymentStatus: true },
        },
        dealCharges: { where: live, select: { amount: true, paymentStatus: true } },
        managementFees: { where: live, select: { amount: true, paymentStatus: true } },
      },
    }),
    category === "all" || category === "PROD_EXE"
      ? prisma.production.findMany({
          where: artistFilter ? { artist: { slug: artistFilter } } : {},
          select: {
            id: true,
            name: true,
            artist: { select: { name: true } },
            overheads: {
              where: { paidByArtist: false },
              select: { amount: true, status: true },
            },
            deals: {
              where: { deletedAt: null, status: { not: "ANNULE" }, category: "PROD_EXE" },
              select: {
                productionLines: {
                  where: { deletedAt: null, coveredByVenue: false, kind: "REVENUE" },
                  select: { amount: true, paymentStatus: true },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  let artists = 0;
  let charges = 0;
  let fees = 0;
  const items: MoneyHeldItem[] = [];

  for (const d of deals) {
    let expected: number;
    let received: number;
    let artistLines = owed(d.dealArtistes.map((a) => ({ amount: a.cachetAmount, paymentStatus: a.paymentStatus })));
    let chargeLines = owed(d.dealCharges);

    if (d.category === "PROD_EXE") {
      const revenue = d.productionLines.filter((l) => l.kind === "REVENUE");
      expected = sumAll(revenue);
      received = sumPaid(revenue);
      // Frais avancés par l'artiste : dus à l'artiste via son compte.
      chargeLines = owed(d.productionLines.filter((l) => l.kind === "COST" && !l.paidByArtist));
      // Part artiste : compte artiste de la production (plus bas) ; date
      // hors production → part artiste du deal.
      artistLines = d.productionId
        ? []
        : [{ amount: d.artistAmount != null ? Number(d.artistAmount) : null, status: d.artistStatus }];
    } else if (d.category === "CACHETS" && d.cachetPrestations.length > 0) {
      expected = sumAll(d.cachetPrestations);
      received = sumPaid(d.cachetPrestations);
    } else if (d.installments.length > 0) {
      expected = num(d.budgetAmount);
      received = sumPaid(d.installments);
    } else {
      expected = num(d.budgetAmount);
      received = d.budgetPaymentStatus === "PAID" ? expected : 0;
    }

    const held = heldOnDeal({ expected, received, artists: artistLines, charges: chargeLines, fees: owed(d.managementFees) });
    const amount = round2(held.artists + held.charges + held.fees);
    if (amount <= 0) continue;
    artists += held.artists;
    charges += held.charges;
    fees += held.fees;
    const parts = [
      held.artists > 0 ? "artistes" : null,
      held.charges > 0 ? "charges" : null,
      held.fees > 0 ? "management fees" : null,
    ].filter(Boolean);
    const ratio = receivedRatio(expected, received);
    items.push({
      id: d.id,
      title: d.title,
      subtitle: `${parts.join(" + ")}${ratio < 1 ? ` · ${Math.round(ratio * 100)} % reçu` : ""}`,
      date: d.date,
      href: dealHref(d.category, d.id),
      amount,
    });
  }

  // Productions : solde > 0 du compte artiste (billetterie encaissée des
  // dates jouées − quote-parts versées + frais / avances à rendre) et frais
  // généraux non payés, au prorata des recettes encaissées. Un solde négatif
  // (l'artiste doit à Pangee) n'est pas sur le compte : il ne réduit rien.
  const accounts = await Promise.all(productions.map((p) => getArtistAccount(p.id, now.getTime())));
  productions.forEach((p, i) => {
    const balance = Math.max(0, round2(accounts[i].balance));
    const revenue = p.deals.flatMap((d) => d.productionLines);
    const overheads = round2(
      owedTotal(p.overheads.map((o) => ({ amount: Number(o.amount), status: o.status }))) *
        receivedRatio(sumAll(revenue), sumPaid(revenue)),
    );
    if (balance + overheads <= 0) return;
    artists += balance;
    charges += overheads;
    items.push({
      id: `prod-${p.id}`,
      title: p.name,
      subtitle: [
        balance > 0 ? `compte artiste ${p.artist.name}` : null,
        overheads > 0 ? "frais généraux" : null,
      ]
        .filter(Boolean)
        .join(" + "),
      href: `/shows/production/${p.id}${balance > 0 ? "?tab=artiste" : ""}`,
      amount: round2(balance + overheads),
    });
  });

  items.sort((a, b) => b.amount - a.amount);
  artists = round2(artists);
  charges = round2(charges);
  fees = round2(fees);
  return { total: round2(artists + charges + fees), artists, charges, fees, items };
}
