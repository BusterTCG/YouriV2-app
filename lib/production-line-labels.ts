import type {
  ProductionLineKind,
  ProductionLineLabel,
  VenueDealKind,
} from "@prisma/client";

/**
 * Libellés FR des lignes de production. Copie fidèle KN — Stan veut le même
 * wording dans les Selects + tableaux fiche détail.
 *
 * Alias `PRODUCTION_LINE_LABEL_FR` pour cohérence avec le naming Youri ; la
 * constante principale exposée s'appelle `PRODUCTION_LINE_LABELS` (matche KN).
 */
export const PRODUCTION_LINE_LABELS: Record<ProductionLineLabel, string> = {
  // Recettes
  RECETTE_HT: "Recette HT",
  DL_PROD: "Deal Live (DL/Prod)",
  // Charges
  CNM: "CNM",
  SACD: "SACD",
  LOCATION: "Location salle",
  VHR: "VHR (voyage / hôtel / repas)",
  COM: "Communication",
  TECH: "Technique",
  CAPTA: "Captation",
  AUTRE: "Autre",
};

/**
 * Hints statiques par label — petit texte explicatif sous le label dans
 * l'éditeur. Indépendant du modèle salle (la nuance RECETTE_HT selon
 * PROD/CO_REAL/CESSION est rendue inline dans le composant via
 * `productionLineHint(label, venueDealKind)`).
 */
export const PRODUCTION_LINE_HINTS: Record<ProductionLineLabel, string | null> = {
  RECETTE_HT: "Billetterie HT (Pangee)",
  DL_PROD: "Montant additionnel par billet vendu",
  CNM: null,
  SACD: null,
  LOCATION: "Loyer salle (mode PROD principalement)",
  VHR: "Voyage / Hôtel / Repas équipe + artistes",
  COM: null,
  TECH: null,
  CAPTA: null,
  AUTRE: "Sous-libellé obligatoire",
};

/** Sous-titre / aide contextuelle par label, varie selon le modèle salle. */
export function productionLineHint(
  label: ProductionLineLabel,
  venueDealKind: VenueDealKind | null,
): string | null {
  if (label === "RECETTE_HT") {
    if (venueDealKind === "PROD") return "Billetterie HT (100% Pangee)";
    if (venueDealKind === "CO_REAL") return "Part Pangee nette";
    if (venueDealKind === "CESSION") return "Prix de cession";
    return "Billetterie HT";
  }
  return PRODUCTION_LINE_HINTS[label];
}

/**
 * Mapping label → kind par défaut (recette ou charge).
 * Alias historique : `PRODUCTION_LINE_DEFAULT_KIND`. Pour matcher l'API KN
 * on expose aussi `PRODUCTION_LINE_KIND_OF`.
 */
export const PRODUCTION_LINE_KIND_OF: Record<
  ProductionLineLabel,
  ProductionLineKind
> = {
  RECETTE_HT: "REVENUE",
  DL_PROD: "REVENUE",
  CNM: "COST",
  SACD: "COST",
  LOCATION: "COST",
  VHR: "COST",
  COM: "COST",
  TECH: "COST",
  CAPTA: "COST",
  AUTRE: "COST",
};

/** Labels recettes / charges (pour les sections du tableau de production). */
export const REVENUE_LABELS: ProductionLineLabel[] = ["RECETTE_HT", "DL_PROD"];

export const COST_LABELS: ProductionLineLabel[] = [
  "CNM",
  "SACD",
  "LOCATION",
  "VHR",
  "COM",
  "TECH",
  "CAPTA",
  "AUTRE",
];

/** Tous les labels visibles dans le tableau de prod (template fixe). */
export const ALL_LABELS_ORDERED: ProductionLineLabel[] = [
  ...REVENUE_LABELS,
  ...COST_LABELS,
];

/**
 * Labels charges visibles selon le modèle salle :
 *   - PROD : toutes visibles
 *   - CO_REAL / CESSION : LOCATION masquée (pas de loyer à charge Pangee).
 * Cf. comportement KN `visibleCostLabels`.
 */
export function visibleCostLabels(
  venueDealKind: VenueDealKind | null,
): ProductionLineLabel[] {
  if (venueDealKind === "CO_REAL" || venueDealKind === "CESSION") {
    return COST_LABELS.filter((l) => l !== "LOCATION");
  }
  return COST_LABELS;
}

// Alias de compatibilité avec l'ancien naming local
export const PRODUCTION_LINE_LABEL_FR = PRODUCTION_LINE_LABELS;
export const PRODUCTION_LINE_DEFAULT_KIND = PRODUCTION_LINE_KIND_OF;

/** Libellés des modèles salle (Stan / Select). */
export const VENUE_DEAL_KIND_FR: Record<VenueDealKind, string> = {
  PROD: "Production (Location)",
  CO_REAL: "Co-réalisation",
  CESSION: "Cession",
};

/**
 * % par défaut prélevé par Pangee sur le CA en mode PROD_EXE.
 *
 * Stan 2026-05-26 : 15% peu importe le modèle salle (vs KN qui met 20% en
 * CESSION par défaut). Configurable par deal via `Deal.prodExePct`.
 */
export const DEFAULT_PROD_EXE_PCT = 15;
