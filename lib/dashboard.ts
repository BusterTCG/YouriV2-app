import "server-only";
import { prisma } from "@/lib/db";
import type { DealCategory, Prisma } from "@prisma/client";
import { sortArtistsDiversLast } from "@/lib/artists";
import { getUpcomingTasksForAssignee } from "@/lib/queries/tasks";

/**
 * Server data fetcher pour la page /dashboard (Sprint 7 — Stan 2026-06-02).
 *
 * Pattern repris fidèlement de KN `lib/dashboard.ts` (cf. AGENTS.md règle copie
 * fidèle KN), adapté au modèle Pangee :
 *   - 3 catégories de Deal (BOOKING / PROD_EXE / CACHETS) au lieu de SPECTACLE
 *   - Pas d'Appointment local (Pangee ne fait que de la production)
 *   - Marge Pangee dérivée de Deal.budgetAmount − Σ artistes − Σ charges
 *     (sauf PROD_EXE qui a son scalar `commissionAmount` recalculé)
 *   - Marge Nette = Marge Pangee − Σ Management Fees reversés
 *   - Pas de "shows" séparés : tous les deals sont vus comme des projets
 *
 * Filtres top-bar :
 *   - period   : "month" | "year" (par défaut month)
 *   - category : "all" | "BOOKING" | "PROD_EXE" | "CACHETS"
 *   - artist   : slug ou null
 */

export type DashboardPeriod = "month" | "year";
export type DashboardCategoryFilter = "all" | DealCategory;

export interface DashboardKpis {
  /** Σ budgets encaissés sur la période (cash-flow réel). */
  caHtEncaisse: number;
  /** Σ Management Fees PAID reversés à l'user connecté sur la période.
   *  null si l'user n'a pas de pangeeKey (= pas d'associé Pangee). */
  mfEncaisseUser: number | null;
  /** Marge Pangee NETTE (= Marge Brute − MF) sur les deals encaissés période. */
  margeNette: number;
  /** % Marge Nette = margeNette / caHtEncaisse × 100. Null si CA = 0. */
  margeNettePct: number | null;
  /** Valeurs N-1 (période précédente : mois d'avant ou année d'avant) —
   *  utilisées pour afficher l'évolution % sur chaque card. Stan 2026-06-02. */
  prev: {
    caHtEncaisse: number;
    mfEncaisseUser: number | null;
    margeNette: number;
    margeNettePct: number | null;
  };
}

export type AlertItem = {
  id: string;
  title: string;
  subtitle?: string;
  amount?: number;
  date?: Date;
  href: string;
};

export interface DashboardData {
  kpis: DashboardKpis;
  /** Mes tâches courantes (réutilise Sprint 6 — 1re TODO par deal assignée à moi). */
  myTasks: MyTaskItem[];
  /** Mes tâches à venir (= bloquées par un autre user, viennent juste après). */
  myUpcomingTasks: UpcomingTaskItem[];
  /** Total tâches de l'équipe en cours (mes + autres) — affiché en sub des KPIs. */
  teamTasksCount: number;
  /** Alertes actionnables — Stan 2026-06-02. */
  alerts: {
    /** Deals confirmés > 30j sans paiement budget — argent à aller chercher. */
    aFacturerOld: AlertItem[];
    /** Deals où Pangee a encaissé MAIS l'artiste n'a pas été reversé. */
    aPayerArtiste: AlertItem[];
  };
  /** Cette semaine : deals dans les 7 prochains jours, tous filtres confondus. */
  thisWeek: WeekItem[];
  /** Série mensuelle Marge Nette 12 derniers mois (cash-flow). */
  monthlyMargeNette: Array<{ month: string; margeNette: number; key: string }>;
  /** Catalogue artistes pour le sélecteur de filtre (Divers en dernier). */
  artists: Array<{ id: string; name: string; slug: string; color: string | null }>;
}

export type UpcomingTaskItem = MyTaskItem & {
  blockedBy: {
    label: string;
    assigneeKey: string | null;
  };
};

export type MyTaskItem = {
  id: string;
  label: string;
  dealId: string;
  dealTitle: string;
  dealCategory: DealCategory;
  dealDate: Date;
  href: string;
};

export type WeekItem = {
  id: string;
  date: Date;
  title: string;
  subtitle?: string;
  category: DealCategory;
  venueName: string | null;
  venueCity: string | null;
  primaryArtistName: string | null;
  href: string;
};

const MONTHS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];

function periodRange(period: DashboardPeriod): { start: Date; end: Date } {
  const now = new Date();
  if (period === "year") {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear() + 1, 0, 1),
    };
  }
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
}

/** Période précédente (N-1) — pour calculer l'évolution % vs période d'avant.
 *  month → mois d'avant ; year → année d'avant. Stan 2026-06-02. */
function previousPeriodRange(period: DashboardPeriod): { start: Date; end: Date } {
  const now = new Date();
  if (period === "year") {
    return {
      start: new Date(now.getFullYear() - 1, 0, 1),
      end: new Date(now.getFullYear(), 0, 1),
    };
  }
  return {
    start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    end: new Date(now.getFullYear(), now.getMonth(), 1),
  };
}

/** Catégorie filter → Prisma where clause. */
function categoryWhere(cat: DashboardCategoryFilter): Prisma.DealWhereInput {
  return cat === "all" ? {} : { category: cat };
}

/** Artiste filter (slug) → Prisma where via DealArtiste. */
function artistDealWhere(artistSlug: string | null): Prisma.DealWhereInput {
  if (!artistSlug || artistSlug === "all") return {};
  return { dealArtistes: { some: { artist: { slug: artistSlug } } } };
}

/**
 * URL fiche détail deal par catégorie (utilisé partout dans le dashboard).
 */
function dealHref(category: DealCategory, id: string): string {
  switch (category) {
    case "BOOKING":
      return `/deals/booking/${id}`;
    case "PROD_EXE":
      return `/deals/prod-executive/${id}`;
    case "CACHETS":
      return `/deals/cachets/${id}`;
  }
}

/**
 * Calcule la marge Pangee BRUTE d'un deal donné (= budget − artistes − charges).
 * Sur PROD_EXE on utilise le scalar `commissionAmount` recompute (15% × CA).
 *
 * Sur BOOKING / CACHETS : on lit DealArtiste + DealCharge actifs.
 */
type DealWithFinancials = {
  category: DealCategory;
  budgetAmount: Prisma.Decimal | null;
  commissionAmount: Prisma.Decimal | null;
  cachetsFeesPct: Prisma.Decimal | null;
  linkedToOwnProd: boolean;
  dealArtistes: Array<{ cachetAmount: Prisma.Decimal | null }>;
  dealCharges: Array<{ amount: Prisma.Decimal | null }>;
  managementFees: Array<{ amount: Prisma.Decimal | null }>;
};

/**
 * Marge BRUTE Pangee par catégorie — formules canoniques alignées sur les
 * listes (Stan 2026-06-11 audit : avant ce fix, CACHETS utilisait
 * `budget − artistes − charges` ce qui surévaluait la marge ~37% au lieu
 * de 10%).
 *   - PROD_EXE : commissionAmount scalar (= 15% × CA recompute)
 *   - CACHETS  : budget × cachetsFeesPct% (0 si linkedToOwnProd) — cf.
 *                cachets-list.ts:277
 *   - BOOKING  : budget − Σ artistes − Σ charges
 */
function computeMargeBrute(d: DealWithFinancials): number {
  if (d.category === "PROD_EXE") {
    return d.commissionAmount != null ? Number(d.commissionAmount) : 0;
  }
  const budget = d.budgetAmount != null ? Number(d.budgetAmount) : 0;
  if (d.category === "CACHETS") {
    if (d.linkedToOwnProd || budget <= 0) return 0;
    const pct = d.cachetsFeesPct != null ? Number(d.cachetsFeesPct) : 10;
    return Math.round((budget * pct) / 100);
  }
  const artistes = d.dealArtistes.reduce(
    (acc, a) => acc + (a.cachetAmount != null ? Number(a.cachetAmount) : 0),
    0,
  );
  const charges = d.dealCharges.reduce(
    (acc, c) => acc + (c.amount != null ? Number(c.amount) : 0),
    0,
  );
  return budget - artistes - charges;
}

function computeTotalMf(d: DealWithFinancials): number {
  return d.managementFees.reduce(
    (acc, mf) => acc + (mf.amount != null ? Number(mf.amount) : 0),
    0,
  );
}

/**
 * Charge toutes les données du dashboard en une passe parallèle.
 * Cf. KN `getDashboardData` pour le pattern d'origine.
 */
export async function getDashboardData(opts: {
  period: DashboardPeriod;
  category: DashboardCategoryFilter;
  artistSlug: string | null;
  /** PangeeKey de l'user connecté (pour "Mes tâches"). null = pas de filtre user. */
  myPangeeKey: string | null;
}): Promise<DashboardData> {
  const { period, category, artistSlug, myPangeeKey } = opts;
  const { start: periodStart, end: periodEnd } = periodRange(period);
  const { start: prevPeriodStart, end: prevPeriodEnd } = previousPeriodRange(period);
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);
  // Seuil 30 jours pour l'alerte "À facturer > 30j".
  const threshold30dAgo = new Date(today);
  threshold30dAgo.setDate(threshold30dAgo.getDate() - 30);
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const yearEnd = new Date(today.getFullYear() + 1, 0, 1);
  // Stan 2026-06-02 : la fenêtre du chart dépend de la période sélectionnée
  // pour que le total du chart soit cohérent avec le KPI Marge Nette.
  //   - month : 12 mois glissants finissant le mois courant (contexte historique)
  //   - year  : 12 mois calendaires de l'année courante (jan → déc), total = KPI
  const chartStart =
    period === "year"
      ? yearStart
      : new Date(today.getFullYear(), today.getMonth() - 11, 1);
  const chartEnd =
    period === "year"
      ? yearEnd
      : new Date(today.getFullYear(), today.getMonth() + 1, 1);

  const catWhere = categoryWhere(category);
  const artistWhere = artistDealWhere(artistSlug);

  // Inclusion commune pour les calculs de marge.
  const FINANCIAL_INCLUDE = {
    // Scalars nécessaires au calcul de marge CACHETS (Stan 2026-06-11 audit).
    cachetsFeesPct: true,
    linkedToOwnProd: true,
    dealArtistes: {
      where: { deletedAt: null },
      select: { cachetAmount: true },
    },
    dealCharges: {
      where: { deletedAt: null },
      select: { amount: true },
    },
    managementFees: {
      where: { deletedAt: null },
      select: { amount: true },
    },
  } as const;

  const [
    encaissesDeals,
    encaissesDealsPrev,
    weekDealsRaw,
    chartDealsRaw,
    myTasksRaw,
    teamTasksCount,
    mfEncaisseUserAgg,
    mfEncaisseUserAggPrev,
    aFacturerOldRaw,
    aPayerArtisteRaw,
    artistsRaw,
  ] = await Promise.all([
    // KPIs financiers : tous les deals encaissés sur la période (budgetPaidAt
    // dans la fenêtre). On lit les finances pour calculer Marge Brute + MF.
    prisma.deal.findMany({
      where: {
        ...catWhere,
        ...artistWhere,
        deletedAt: null,
        status: { not: "ANNULE" },
        budgetPaymentStatus: "PAID",
        budgetPaidAt: { gte: periodStart, lt: periodEnd },
      },
      select: {
        category: true,
        budgetAmount: true,
        commissionAmount: true,
        ...FINANCIAL_INCLUDE,
      },
    }),
    // KPIs N-1 : mêmes calculs sur la période précédente (mois d'avant ou
    // année d'avant) pour afficher l'évolution % vs N-1. Stan 2026-06-02.
    prisma.deal.findMany({
      where: {
        ...catWhere,
        ...artistWhere,
        deletedAt: null,
        status: { not: "ANNULE" },
        budgetPaymentStatus: "PAID",
        budgetPaidAt: { gte: prevPeriodStart, lt: prevPeriodEnd },
      },
      select: {
        category: true,
        budgetAmount: true,
        commissionAmount: true,
        ...FINANCIAL_INCLUDE,
      },
    }),
    // Cette semaine : tous les deals dans les 7 prochains jours (toutes cat).
    prisma.deal.findMany({
      where: {
        ...catWhere,
        ...artistWhere,
        deletedAt: null,
        status: { not: "ANNULE" },
        date: { gte: today, lt: in7 },
      },
      orderBy: { date: "asc" },
      take: 20,
      select: {
        id: true,
        category: true,
        title: true,
        showName: true,
        date: true,
        venueName: true,
        venueCity: true,
        dealArtistes: {
          where: { deletedAt: null },
          select: { artist: { select: { name: true } } },
          take: 1,
        },
      },
    }),
    // Chart 12 mois — tous les deals encaissés dans la fenêtre glissante.
    prisma.deal.findMany({
      where: {
        ...catWhere,
        ...artistWhere,
        deletedAt: null,
        status: { not: "ANNULE" },
        budgetPaymentStatus: "PAID",
        budgetPaidAt: { gte: chartStart, lt: chartEnd },
      },
      select: {
        category: true,
        budgetAmount: true,
        commissionAmount: true,
        budgetPaidAt: true,
        ...FINANCIAL_INCLUDE,
      },
    }),
    // Mes tâches courantes — Sprint 6 : 1re TODO par deal assignée à moi.
    // Si pas de pangeeKey → liste vide.
    myPangeeKey
      ? prisma.task.findMany({
          where: {
            assigneeKey: myPangeeKey,
            status: "TODO",
            deletedAt: null,
            deal: {
              deletedAt: null,
              status: { not: "ANNULE" },
              ...catWhere,
              ...artistWhere,
            },
          },
          orderBy: [{ dealId: "asc" }, { order: "asc" }],
          select: {
            id: true,
            label: true,
            dealId: true,
            deal: {
              select: {
                id: true,
                title: true,
                category: true,
                date: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    // Tâches en cours équipe : total des 1re TODO par deal (vue d'ensemble).
    prisma.task.count({
      where: {
        status: "TODO",
        deletedAt: null,
        deal: {
          deletedAt: null,
          status: { not: "ANNULE" },
          ...catWhere,
          ...artistWhere,
        },
      },
    }),
    // KPI MF encaissés par l'user connecté sur la période. Stan 2026-06-02 :
    // somme des DealManagementFee où associateKey = pangeeKey + PAID + paidAt
    // dans la fenêtre. Si l'user n'a pas de pangeeKey → on retourne null
    // (KPI affichera "—" côté UI).
    myPangeeKey
      ? prisma.dealManagementFee.aggregate({
          _sum: { amount: true },
          where: {
            associateKey: myPangeeKey,
            paymentStatus: "PAID",
            paidAt: { gte: periodStart, lt: periodEnd },
            deletedAt: null,
            deal: {
              deletedAt: null,
              status: { not: "ANNULE" },
              ...catWhere,
              ...artistWhere,
            },
          },
        })
      : Promise.resolve(null),
    // KPI MF encaissés N-1 (idem mais sur la période précédente).
    myPangeeKey
      ? prisma.dealManagementFee.aggregate({
          _sum: { amount: true },
          where: {
            associateKey: myPangeeKey,
            paymentStatus: "PAID",
            paidAt: { gte: prevPeriodStart, lt: prevPeriodEnd },
            deletedAt: null,
            deal: {
              deletedAt: null,
              status: { not: "ANNULE" },
              ...catWhere,
              ...artistWhere,
            },
          },
        })
      : Promise.resolve(null),
    // Alerte "À facturer > 30j" : deals dont la date show est passée depuis
    // plus de 30 jours mais dont le budget n'est toujours pas PAID. Stan
    // 2026-06-02 : argent à aller chercher en priorité.
    prisma.deal.findMany({
      where: {
        ...catWhere,
        ...artistWhere,
        deletedAt: null,
        status: { not: "ANNULE" },
        date: { lt: threshold30dAgo },
        budgetPaymentStatus: { in: ["TO_INVOICE", "INVOICED", "DISPUTE"] },
      },
      orderBy: { date: "asc" },
      take: 10,
      select: {
        id: true,
        category: true,
        title: true,
        date: true,
        budgetAmount: true,
        budgetPaymentStatus: true,
      },
    }),
    // Alerte "Encaissé mais artiste pas payé" : Pangee a encaissé le budget
    // mais au moins un DealArtiste a paymentStatus != PAID. Cash-flow à
    // reverser. Stan 2026-06-02.
    prisma.deal.findMany({
      where: {
        ...catWhere,
        ...artistWhere,
        deletedAt: null,
        status: { not: "ANNULE" },
        budgetPaymentStatus: "PAID",
        dealArtistes: {
          some: {
            deletedAt: null,
            paymentStatus: { in: ["TO_INVOICE", "INVOICED", "DISPUTE"] },
            cachetAmount: { gt: 0 },
          },
        },
      },
      orderBy: { date: "desc" },
      take: 10,
      select: {
        id: true,
        category: true,
        title: true,
        date: true,
        dealArtistes: {
          where: {
            deletedAt: null,
            paymentStatus: { in: ["TO_INVOICE", "INVOICED", "DISPUTE"] },
            cachetAmount: { gt: 0 },
          },
          select: {
            cachetAmount: true,
            artist: { select: { name: true } },
          },
        },
      },
    }),
    // Catalogue artistes (pour le filtre)
    prisma.artist.findMany({
      where: { deletedAt: null, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, color: true },
    }),
  ]);

  // ── KPIs ──────────────────────────────────────────────────────────────
  /** Agrégateur KPI factorisé — utilisé pour la période courante ET N-1. */
  function aggregateKpis(deals: DealWithFinancials[]): {
    caHt: number;
    margeBrute: number;
    totalMf: number;
  } {
    let caHt = 0;
    let margeBrute = 0;
    let mf = 0;
    for (const d of deals) {
      caHt += d.budgetAmount != null ? Number(d.budgetAmount) : 0;
      margeBrute += computeMargeBrute(d);
      mf += computeTotalMf(d);
    }
    return { caHt, margeBrute, totalMf: mf };
  }

  const current = aggregateKpis(encaissesDeals);
  const prev = aggregateKpis(encaissesDealsPrev);
  const caHtEncaisse = current.caHt;
  const margeNette = current.margeBrute - current.totalMf;
  const margeNettePct =
    caHtEncaisse > 0 ? (margeNette / caHtEncaisse) * 100 : null;
  // MF encaissés par l'user — null si pas de pangeeKey, sinon 0 ou montant.
  const mfEncaisseUser: number | null = mfEncaisseUserAgg
    ? Number(mfEncaisseUserAgg._sum.amount ?? 0)
    : null;
  // KPIs N-1 (période précédente) — pour calculer l'évolution % côté UI.
  const prevCaHtEncaisse = prev.caHt;
  const prevMargeNette = prev.margeBrute - prev.totalMf;
  const prevMargeNettePct =
    prevCaHtEncaisse > 0 ? (prevMargeNette / prevCaHtEncaisse) * 100 : null;
  const prevMfEncaisseUser: number | null = mfEncaisseUserAggPrev
    ? Number(mfEncaisseUserAggPrev._sum.amount ?? 0)
    : null;

  // ── Mes tâches (snapshot avec href) ────────────────────────────────────
  // Workflow séquentiel : on garde la 1re TODO par deal seulement.
  const seenDeals = new Set<string>();
  const myTasks: MyTaskItem[] = [];
  for (const t of myTasksRaw) {
    if (seenDeals.has(t.dealId)) continue;
    seenDeals.add(t.dealId);
    myTasks.push({
      id: t.id,
      label: t.label,
      dealId: t.dealId,
      dealTitle: t.deal.title,
      dealCategory: t.deal.category,
      dealDate: t.deal.date,
      href: dealHref(t.deal.category, t.deal.id),
    });
  }

  // ── Mes tâches "À venir" (bloquées par autre user — Stan 2026-06-02) ───
  // Si l'user n'a pas de pangeeKey, liste vide. Sinon on réutilise le helper
  // Sprint 6 et on transforme en UpcomingTaskItem (snake_to_camel pour href).
  const upcomingRaw = myPangeeKey
    ? await getUpcomingTasksForAssignee(myPangeeKey)
    : [];
  const myUpcomingTasks: UpcomingTaskItem[] = upcomingRaw.map((t) => ({
    id: t.id,
    label: t.label,
    dealId: t.dealId,
    dealTitle: t.deal.title,
    dealCategory: t.deal.category,
    dealDate: t.deal.date,
    href: dealHref(t.deal.category, t.deal.id),
    blockedBy: t.blockedBy,
  }));

  // ── Alertes actionnables ───────────────────────────────────────────────
  const aFacturerOld: AlertItem[] = aFacturerOldRaw.map((d) => ({
    id: d.id,
    title: d.title,
    subtitle: d.budgetPaymentStatus === "DISPUTE" ? "En litige" : "À facturer",
    amount: d.budgetAmount != null ? Number(d.budgetAmount) : undefined,
    date: d.date,
    href: dealHref(d.category, d.id),
  }));
  const aPayerArtiste: AlertItem[] = aPayerArtisteRaw.map((d) => {
    const totalOwed = d.dealArtistes.reduce(
      (acc, a) => acc + (a.cachetAmount != null ? Number(a.cachetAmount) : 0),
      0,
    );
    const artistNames = d.dealArtistes
      .map((a) => a.artist.name)
      .join(", ");
    return {
      id: d.id,
      title: d.title,
      subtitle: artistNames || "Artiste à reverser",
      amount: totalOwed,
      date: d.date,
      href: dealHref(d.category, d.id),
    };
  });

  // ── Cette semaine ──────────────────────────────────────────────────────
  const thisWeek: WeekItem[] = weekDealsRaw.map((d) => ({
    id: d.id,
    date: d.date,
    title: d.showName ?? d.title,
    subtitle: d.title !== d.showName ? d.title : undefined,
    category: d.category,
    venueName: d.venueName,
    venueCity: d.venueCity,
    primaryArtistName: d.dealArtistes[0]?.artist.name ?? null,
    href: dealHref(d.category, d.id),
  }));

  // ── Chart Marge Nette mensuelle ────────────────────────────────────────
  // On agrège les deals par mois calendaire de `budgetPaidAt`.
  const monthlyMap = new Map<string, number>();
  for (const d of chartDealsRaw) {
    if (!d.budgetPaidAt) continue;
    const key = `${d.budgetPaidAt.getFullYear()}-${String(d.budgetPaidAt.getMonth()).padStart(2, "0")}`;
    const marge =
      computeMargeBrute(d) - computeTotalMf(d);
    monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + marge);
  }
  const monthlyMargeNette: DashboardData["monthlyMargeNette"] = [];
  for (let i = 0; i < 12; i++) {
    const m = new Date(chartStart.getFullYear(), chartStart.getMonth() + i, 1);
    const key = `${m.getFullYear()}-${String(m.getMonth()).padStart(2, "0")}`;
    monthlyMargeNette.push({
      month: `${MONTHS_FR[m.getMonth()]} ${String(m.getFullYear()).slice(2)}`,
      margeNette: Math.round(monthlyMap.get(key) ?? 0),
      key,
    });
  }
  return {
    kpis: {
      caHtEncaisse,
      mfEncaisseUser,
      margeNette,
      margeNettePct,
      prev: {
        caHtEncaisse: prevCaHtEncaisse,
        mfEncaisseUser: prevMfEncaisseUser,
        margeNette: prevMargeNette,
        margeNettePct: prevMargeNettePct,
      },
    },
    myTasks,
    myUpcomingTasks,
    teamTasksCount,
    alerts: { aFacturerOld, aPayerArtiste },
    thisWeek,
    monthlyMargeNette,
    artists: sortArtistsDiversLast(artistsRaw),
  };
}
