import "server-only";

import {
  DealCategory,
  DealStatus,
  ManagementFeeRole,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPeriodRange, type PeriodPreset } from "@/lib/period-presets";

/**
 * Data fetcher pour la page /deals/management-fees.
 *
 * Stan 2026-05-26 :
 *   - Pré-filtré sur l'associé connecté (pangeeKey du user en session)
 *   - Switcher "Mes MF / Tous" pour voir l'équipe
 *   - Filtres : période / statut / catégorie deal / associé
 *   - KPI top par associé (Dû / Payé / En cours)
 *
 * On filtre déjà côté Prisma sur le statut deal (≠ ANNULE) + soft-delete
 * (deletedAt null) pour exclure les MF orphelins.
 */

export type MfStatusFilter = "all" | "pending" | "paid";

export interface ManagementFeesListFilters {
  /** Clé associé pour filtrer ; null = tous les associés (mode équipe). */
  associateKey: string | null;
  status: MfStatusFilter;
  period: PeriodPreset;
  /** Catégorie de deal ; null = toutes (BOOKING / PROD_EXE / CACHETS). */
  category: DealCategory | null;
}

export interface ManagementFeeRow {
  id: string;
  associateKey: string;
  role: ManagementFeeRole;
  sharePct: number;
  amount: number;
  paymentStatus: PaymentStatus;
  paidAt: Date | null;
  // Deal info
  dealId: string;
  dealDate: Date;
  dealTitle: string;
  dealCategory: DealCategory;
  /** true si TOUT l'amont du deal est OK (budget encaissé, tous artistes
   *  payés, toutes charges payées). Signale au visualisateur qu'il peut
   *  procéder au paiement de cette ligne MF sans risque cash-flow. */
  dealReadyToPay: boolean;
}

export interface MonthlyPaidEntry {
  /** Clé "YYYY-MM" pour le tri stable. */
  key: string;
  /** Label affichage "Mai 26" / "Avr 26". */
  label: string;
  /** Montant cumulé payé ce mois-ci. */
  amount: number;
}

export interface AssociateKpi {
  associateKey: string;
  /** Total dû (toutes lignes confondues, hors annulées). */
  total: number;
  /** Total déjà payé (PAID). */
  paid: number;
  /** Total en cours (tous statuts sauf PAID). */
  pending: number;
  /** Nombre de lignes en cours (badge alerte). */
  pendingCount: number;
  /** Total "dispo pour paiement" : lignes non payées dont tout l'amont du
   *  deal est OK (dealReadyToPay). = cash que Pangee peut verser dès maintenant
   *  sans risque cash-flow (Stan 2026-06-17). */
  dispo: number;
  /** Décomposition du payé par mois de paidAt (tri desc, max 6 derniers).
   *  Stan 2026-05-26 : "KPI montant touché mois par mois". */
  monthlyPaid: MonthlyPaidEntry[];
}

export interface ManagementFeesListData {
  rows: ManagementFeeRow[];
  kpiByAssociate: AssociateKpi[];
  filters: ManagementFeesListFilters;
  rangeLabel: string;
}

export async function getManagementFeesList(
  filters: ManagementFeesListFilters,
): Promise<ManagementFeesListData> {
  const range = getPeriodRange(filters.period);

  // Build Prisma where clause — on N'applique PAS le filtre status ici pour
  // que le KPI puisse compter TOUT le périmètre (Stan 2026-05-26 : sinon le
  // KPI ✅ Encaissé reste à 0 quand le filtre courant est "En cours"). Le
  // filtre status est appliqué ensuite en mémoire, uniquement pour les rows
  // du tableau.
  const where: Prisma.DealManagementFeeWhereInput = {
    deletedAt: null,
    deal: {
      deletedAt: null,
      status: { not: DealStatus.ANNULE },
      ...(filters.category ? { category: filters.category } : {}),
      ...(range.start || range.end
        ? {
            date: {
              ...(range.start ? { gte: range.start } : {}),
              ...(range.end ? { lt: range.end } : {}),
            },
          }
        : {}),
    },
    ...(filters.associateKey ? { associateKey: filters.associateKey } : {}),
  };

  const fees = await prisma.dealManagementFee.findMany({
    where,
    select: {
      id: true,
      associateKey: true,
      role: true,
      sharePct: true,
      amount: true,
      paymentStatus: true,
      paidAt: true,
      deal: {
        select: {
          id: true,
          date: true,
          title: true,
          category: true,
          // Booking driver
          budgetPaymentStatus: true,
          // Prod Exé driver consolidé (Part Artiste indépendante des cachets)
          artistStatus: true,
          // Cachets : pas de tiers facturé si linkedToOwnProd
          linkedToOwnProd: true,
          dealArtistes: {
            where: { deletedAt: null },
            select: { paymentStatus: true, cachetAmount: true },
          },
          dealCharges: {
            where: { deletedAt: null },
            select: { paymentStatus: true, amount: true },
          },
          // Prod Exé : recettes (REVENUE) + coûts (COST)
          productionLines: {
            where: { deletedAt: null },
            select: { kind: true, amount: true, paymentStatus: true, coveredByVenue: true },
          },
          // Cachets : prestations facturées aux sociétés
          cachetPrestations: {
            where: { deletedAt: null },
            select: { paymentStatus: true, amount: true },
          },
        },
      },
    },
    orderBy: { deal: { date: "desc" } },
  });

  const allRows: ManagementFeeRow[] = fees.map((f) => {
    // "Dispo pour paiement" : tout l'amont du deal est OK. Signal vert pour
    // Stan : il peut maintenant verser le MF sans risque cash-flow.
    //
    // Stan 2026-05-27 v2 — Règle discriminée par catégorie :
    //   - BOOKING  : budgetPaymentStatus=PAID + artistes (montant > 0) PAID
    //                + charges (montant > 0) PAID
    //   - PROD_EXE : recettes REVENUE (montant > 0, non coveredByVenue) PAID
    //                + coûts COST (montant > 0, non coveredByVenue) PAID
    //                + (deal.artistStatus=PAID OU tous artistes individuels PAID)
    //   - CACHETS  : (linkedToOwnProd ? true : toutes prestations PAID)
    //                + tous artistes individuels PAID
    //                (Stan 2026-05-30 audit Sprint 5 — v2 multi-prestations
    //                ne touche plus `budgetPaymentStatus`, on lit directement
    //                `cachetPrestations`).
    //
    // Les lignes à montant null/0 sont IGNORÉES (un artiste créé sans cachet
    // ne doit pas bloquer la dispo). Idem charges/recettes à 0.
    const hasAmount = (n: number | null | undefined | { toString(): string }) => {
      if (n == null) return false;
      const v = typeof n === "number" ? n : Number(n);
      return v > 0;
    };

    let dealReadyToPay = false;
    if (f.deal.category === DealCategory.PROD_EXE) {
      const revLines = f.deal.productionLines.filter(
        (l) => l.kind === "REVENUE" && !l.coveredByVenue && hasAmount(l.amount as unknown as number),
      );
      const costLines = f.deal.productionLines.filter(
        (l) => l.kind === "COST" && !l.coveredByVenue && hasAmount(l.amount as unknown as number),
      );
      const recettesOk =
        revLines.length === 0 ||
        revLines.every((l) => l.paymentStatus === PaymentStatus.PAID);
      const coutsOk =
        costLines.length === 0 ||
        costLines.every((l) => l.paymentStatus === PaymentStatus.PAID);
      const artistesIndivOk =
        f.deal.dealArtistes.filter((a) => hasAmount(a.cachetAmount as unknown as number)).length === 0 ||
        f.deal.dealArtistes
          .filter((a) => hasAmount(a.cachetAmount as unknown as number))
          .every((a) => a.paymentStatus === PaymentStatus.PAID);
      const artistesOk =
        f.deal.artistStatus === PaymentStatus.PAID || artistesIndivOk;
      dealReadyToPay = recettesOk && coutsOk && artistesOk;
    } else if (f.deal.category === DealCategory.CACHETS) {
      // CACHETS (Stan 2026-05-30 v2) : on lit les prestations directement.
      // budgetPaymentStatus n'est plus pertinent depuis le passage multi-prestations.
      const significantPrestations = f.deal.cachetPrestations.filter((p) =>
        hasAmount(p.amount as unknown as number),
      );
      const prestationsOk = f.deal.linkedToOwnProd
        ? true
        : significantPrestations.length > 0 &&
          significantPrestations.every(
            (p) => p.paymentStatus === PaymentStatus.PAID,
          );
      const significantArtistes = f.deal.dealArtistes.filter((a) =>
        hasAmount(a.cachetAmount as unknown as number),
      );
      const artistesOk =
        significantArtistes.length === 0 ||
        significantArtistes.every((a) => a.paymentStatus === PaymentStatus.PAID);
      dealReadyToPay = prestationsOk && artistesOk;
    } else {
      // BOOKING : budget + artistes + charges
      const budgetOk = f.deal.budgetPaymentStatus === PaymentStatus.PAID;
      const significantArtistes = f.deal.dealArtistes.filter((a) =>
        hasAmount(a.cachetAmount as unknown as number),
      );
      const artistesOk =
        significantArtistes.length === 0 ||
        significantArtistes.every((a) => a.paymentStatus === PaymentStatus.PAID);
      const significantCharges = f.deal.dealCharges.filter((c) =>
        hasAmount(c.amount as unknown as number),
      );
      const chargesOk =
        significantCharges.length === 0 ||
        significantCharges.every((c) => c.paymentStatus === PaymentStatus.PAID);
      dealReadyToPay = budgetOk && artistesOk && chargesOk;
    }

    return {
      id: f.id,
      associateKey: f.associateKey,
      role: f.role,
      sharePct: Number(f.sharePct),
      amount: f.amount != null ? Number(f.amount) : 0,
      paymentStatus: f.paymentStatus,
      paidAt: f.paidAt,
      dealId: f.deal.id,
      dealDate: f.deal.date,
      dealTitle: f.deal.title,
      dealCategory: f.deal.category,
      dealReadyToPay,
    };
  });

  // Filtre status appliqué uniquement aux rows du tableau (le KPI reste sur
  // allRows pour montrer la vraie répartition Encaissé / En cours).
  const rows: ManagementFeeRow[] = allRows.filter((r) => {
    if (filters.status === "paid") return r.paymentStatus === PaymentStatus.PAID;
    if (filters.status === "pending")
      return r.paymentStatus !== PaymentStatus.PAID;
    return true; // "all"
  });

  // KPI par associé — on agrège sur allRows (avant filtre status) pour que
  // les chiffres Encaissé / En cours reflètent l'ensemble du périmètre,
  // indépendamment du filtre courant.
  const kpiMap = new Map<string, AssociateKpi>();
  // Accumulateur des paiements par mois (associateKey → "YYYY-MM" → montant)
  const monthlyByAssociate = new Map<string, Map<string, number>>();

  const MONTHS_FR = [
    "Jan", "Fév", "Mars", "Avr", "Mai", "Juin",
    "Juil", "Août", "Sept", "Oct", "Nov", "Déc",
  ];

  for (const r of allRows) {
    let kpi = kpiMap.get(r.associateKey);
    if (!kpi) {
      kpi = {
        associateKey: r.associateKey,
        total: 0,
        paid: 0,
        pending: 0,
        pendingCount: 0,
        dispo: 0,
        monthlyPaid: [],
      };
      kpiMap.set(r.associateKey, kpi);
    }
    kpi.total += r.amount;
    if (r.paymentStatus === PaymentStatus.PAID) {
      kpi.paid += r.amount;
      // Cumul mensuel basé sur paidAt MF (= mois où Stan a coché Encaissé)
      if (r.paidAt) {
        const y = r.paidAt.getUTCFullYear();
        const m = r.paidAt.getUTCMonth();
        const key = `${y}-${String(m + 1).padStart(2, "0")}`;
        let monthMap = monthlyByAssociate.get(r.associateKey);
        if (!monthMap) {
          monthMap = new Map<string, number>();
          monthlyByAssociate.set(r.associateKey, monthMap);
        }
        monthMap.set(key, (monthMap.get(key) ?? 0) + r.amount);
      }
    } else {
      kpi.pending += r.amount;
      kpi.pendingCount += 1;
      // Dispo = en cours MAIS tout l'amont du deal est payé → versable maintenant.
      if (r.dealReadyToPay) kpi.dispo += r.amount;
    }
  }

  // Construit monthlyPaid INDÉPENDAMMENT du filtre période — toujours
  // 12 derniers mois glissants (M-11 → mois courant) pour avoir une vue
  // d'activité constante (Stan 2026-05-26 : "filler les mois vides à 0").
  // Bucket mensuel = paidAt MF (mois où Stan a coché Encaissé sur le MF).
  const now = new Date();
  const twelveMonthsAgo = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1, 0, 0, 0),
  );

  const monthlyFees = await prisma.dealManagementFee.findMany({
    where: {
      deletedAt: null,
      paymentStatus: PaymentStatus.PAID,
      paidAt: { gte: twelveMonthsAgo },
      ...(filters.associateKey ? { associateKey: filters.associateKey } : {}),
      deal: { deletedAt: null, status: { not: DealStatus.ANNULE } },
    },
    select: {
      associateKey: true,
      amount: true,
      paidAt: true,
    },
  });

  // Génère la liste des 12 mois glissants (ASC : ancien → récent → chart).
  // Clés YYYY-MM pour matching avec les paidAt agrégés.
  const monthsList: Array<{ key: string; label: string }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    const label = `${MONTHS_FR[m]} ${String(y).slice(2)}`;
    monthsList.push({ key, label });
  }

  // Agrège les paiements par (associateKey × YYYY-MM)
  const monthlyAggregated = new Map<string, Map<string, number>>();
  for (const f of monthlyFees) {
    if (!f.paidAt || !f.amount) continue;
    const y = f.paidAt.getUTCFullYear();
    const m = f.paidAt.getUTCMonth();
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    let monthMap = monthlyAggregated.get(f.associateKey);
    if (!monthMap) {
      monthMap = new Map<string, number>();
      monthlyAggregated.set(f.associateKey, monthMap);
    }
    monthMap.set(key, (monthMap.get(key) ?? 0) + Number(f.amount));
  }

  // Pour chaque KPI déjà construit, attache la série 12 mois glissants
  // (avec 0 sur les mois sans paiement). On peut aussi avoir des associés
  // qui ont des paiements RÉCENTS (dans les 12 mois) mais aucune row sur
  // la période filtrée → on les ajoute aussi pour qu'ils apparaissent dans
  // le chart même si filtre période strict.
  for (const [associateKey, monthMap] of monthlyAggregated) {
    let kpi = kpiMap.get(associateKey);
    if (!kpi) {
      // Cas marginal : associé avec paiement récent mais aucune row sur le
      // filtre courant — créer un KPI vide pour qu'il apparaisse quand même.
      kpi = {
        associateKey,
        total: 0,
        paid: 0,
        pending: 0,
        pendingCount: 0,
        dispo: 0,
        monthlyPaid: [],
      };
      kpiMap.set(associateKey, kpi);
    }
    kpi.monthlyPaid = monthsList.map(({ key, label }) => ({
      key,
      label,
      amount: monthMap.get(key) ?? 0,
    }));
  }

  // Pour les KPI sans paiement récent — fill quand même les 12 mois à 0
  // pour avoir un chart constant (Stan : "12 mois glissants même si vides").
  for (const kpi of kpiMap.values()) {
    if (kpi.monthlyPaid.length === 0) {
      kpi.monthlyPaid = monthsList.map(({ key, label }) => ({
        key,
        label,
        amount: 0,
      }));
    }
  }

  // Tri alphabétique par associateKey (Angath/Certe/Stan)
  const kpiByAssociate = Array.from(kpiMap.values()).sort((a, b) =>
    a.associateKey.localeCompare(b.associateKey),
  );

  return {
    rows,
    kpiByAssociate,
    filters,
    rangeLabel: range.start
      ? new Intl.DateTimeFormat("fr-FR", {
          month: "long",
          year: "numeric",
        }).format(range.start)
      : "Tout l'historique",
  };
}
