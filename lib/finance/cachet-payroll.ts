/**
 * Helpers de calcul cachet intermittent (GUSO / Annexe 10) — Sprint 5.
 *
 * Sources (consultées Stan 2026-05-30) :
 *   - bulletin-paie.com — exemple officiel 3000€ brut → 2353€ net → 4308€ coût employeur
 *   - tempoformation.com — guide GUSO/cachet 2026
 *   - outils-malins.fr — simulateur salaire intermittent 2026
 *   - compta-online.com — taux charges sociales intermittents 2026
 *
 * Formule métier :
 *   Enveloppe disponible = Budget HT × (100 − cachetsFeesPct) / 100
 *   Brut artiste         = Enveloppe / (1 + employerChargesRate/100)
 *   Net artiste estimé   = Brut × (1 − employeeChargesRate/100)
 *
 * Le `cachetAmount` stocké sur `DealArtiste` correspond au **brut** (montant
 * déclaré sur la fiche de paie GUSO/CDDU). Le net est calculé à la volée pour
 * l'affichage utilisateur ("ce que l'artiste va toucher").
 *
 * Taux par défaut (annexe 10 — artistes du spectacle vivant 2026) :
 *   - Patronal : 43 % (charges employeur : URSSAF, retraite, AFDAS, congés
 *     spectacles, prévoyance, FNAL…)
 *   - Salarial : 25 % (cotisations salariales + abattement 30 % frais pro
 *     déjà intégré dans le calcul effectif).
 *
 * NB : ces taux sont des moyennes — la vraie paie GUSO inclut des paliers
 * selon la convention collective, le statut (artiste/technicien) et les
 * caisses Audiens. Pour un cas réel, utiliser le simulateur officiel GUSO.
 */

/** Taux moyen charges patronales intermittents annexe 10 (%). */
export const DEFAULT_EMPLOYER_CHARGES_RATE = 43;

/** Taux moyen charges salariales intermittents annexe 10 (%). */
export const DEFAULT_EMPLOYEE_CHARGES_RATE = 25;

export interface CachetBreakdown {
  /** Enveloppe disponible pour payer l'artiste (= budget − marge Pangee). */
  envelope: number;
  /** Cachet brut intermittent (déclaré GUSO/CDDU). */
  brut: number;
  /** Cachet net estimé (= ce que l'artiste touche réellement). */
  net: number;
  /** Charges patronales payées par Pangee (en plus du brut). */
  employerCharges: number;
  /** Charges salariales déduites du brut. */
  employeeCharges: number;
  /** Coefficient global "facture HT → net touché" — utile en pourcentage. */
  netToBudgetRatio: number;
}

interface ComputeOpts {
  /** Taux charges patronales (%, défaut 43). */
  employerChargesRate?: number;
  /** Taux charges salariales (%, défaut 25). */
  employeeChargesRate?: number;
}

/**
 * Calcule le détail brut/net d'un cachet à partir d'une enveloppe disponible.
 *
 * @param envelope Enveloppe en € (= budget × (100 − feesPct) / 100)
 */
export function computeCachetBreakdownFromEnvelope(
  envelope: number,
  opts: ComputeOpts = {},
): CachetBreakdown {
  const employerRate = opts.employerChargesRate ?? DEFAULT_EMPLOYER_CHARGES_RATE;
  const employeeRate = opts.employeeChargesRate ?? DEFAULT_EMPLOYEE_CHARGES_RATE;

  if (envelope <= 0) {
    return {
      envelope: 0,
      brut: 0,
      net: 0,
      employerCharges: 0,
      employeeCharges: 0,
      netToBudgetRatio: 0,
    };
  }

  const brut = Math.round(envelope / (1 + employerRate / 100));
  const net = Math.round(brut * (1 - employeeRate / 100));
  const employerCharges = envelope - brut;
  const employeeCharges = brut - net;

  return {
    envelope: Math.round(envelope),
    brut,
    net,
    employerCharges,
    employeeCharges,
    netToBudgetRatio: envelope > 0 ? net / envelope : 0,
  };
}

/**
 * Marge brute Pangee d'un deal CACHETS (Stan 2026-06-17, nouveau modèle).
 *
 *   marge brute = Σ prestations facturées − Σ cachets bruts artistes
 *
 * 0 si `linkedToOwnProd` (spectacle produit par Pangee : pas de tiers facturé,
 * juste la trace paie GUSO). Peut être négative si le brut dépasse le facturé
 * (affiché en rouge côté UI).
 *
 * "Brute" = AVANT charges patronales (~43 % GUSO) — choix explicite Stan
 * 2026-06-17 (le % de gestion saisi à la main est supprimé, le % du CA devient
 * une donnée dérivée = marge / CA).
 */
export function computeCachetsMargeBrute(
  budget: number,
  cachetBrut: number,
  linkedToOwnProd: boolean,
): number {
  if (linkedToOwnProd) return 0;
  return Math.round(budget - cachetBrut);
}

/**
 * Calcule le détail à partir du budget HT facturé et du % de marge Pangee.
 * Combine `enveloppe = budget × (100 − feesPct)/100` puis applique la formule.
 */
export function computeCachetBreakdownFromBudget(
  budgetHT: number,
  cachetsFeesPct: number,
  opts: ComputeOpts = {},
): CachetBreakdown & { margeBrute: number; budgetHT: number } {
  const margeBrute =
    budgetHT > 0 ? Math.round((budgetHT * cachetsFeesPct) / 100) : 0;
  const envelope = budgetHT - margeBrute;
  const breakdown = computeCachetBreakdownFromEnvelope(envelope, opts);
  return { ...breakdown, margeBrute, budgetHT: Math.round(budgetHT) };
}
