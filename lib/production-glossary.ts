// Glossaire des termes métier de la Production (Stan 2026-10-01, analyse
// architecture point 5 : « un outil friendly user pas que pour moi »).
// Affiché dans les bulles « ? » (components/shows/glossary-hint.tsx).
// Identique dans KuroNeko-App et YouriV2-app (« nous » = la société de prod).

export const GLOSSARY = {
  prodExe: {
    title: "Prod-exé (production exécutive)",
    text: "Notre rémunération : un % du chiffre d'affaires de la date, compté dans les charges avant le partage du bénéfice.",
  },
  coprod: {
    title: "Co-prod (coproduction)",
    text: "Partage du bénéfice restant (recettes − charges − frais généraux − prod-exé) entre nous et l'artiste, selon le % fixé.",
  },
  venueDeal: {
    title: "Accord avec le lieu",
    text: "Location : on loue la salle, la billetterie est à nous (Recette HT = billetterie). Co-réalisation : la salle partage la billetterie, on saisit notre part nette (le relevé). Cession : la salle nous paie un prix fixe.",
  },
  coReal: {
    title: "Co-réalisation (%)",
    text: "Notre part de la billetterie totale ; le reste revient à la salle. Indicatif : la Recette HT se saisit avec le relevé réel de la salle.",
  },
  suivi: {
    title: "Suivi de la date",
    text: "Contrat : contrat de la date signé. MEV : billetterie mise en vente (lien à partager). VHR : voyage, hôtel, repas réservés. La date est « Prête » quand les trois sont faits.",
  },
  CNM: {
    title: "CNM",
    text: "Taxe du Centre national de la musique sur la billetterie (≈ 3,5 % du CA).",
  },
  SACD: {
    title: "SACD",
    text: "Droits d'auteur versés à la Société des auteurs et compositeurs dramatiques (≈ 15 % du CA, à vérifier sur la déclaration).",
  },
  DL_PROD: {
    title: "DL Prod",
    text: "Deal Live : montant additionnel par billet vendu, saisi à la main.",
  },
  VHR: {
    title: "VHR",
    text: "Voyage, hôtel, repas de l'équipe et des artistes.",
  },
  overhead: {
    title: "Frais généraux",
    text: "Charges communes à toute la production (affiches, carte de train…), réparties au prorata des représentations. Une date soldée garde sa part figée.",
  },
  quotePart: {
    title: "Quote-part artiste",
    text: "Part acquise = part artiste des dates jouées. Appelable = celle des dates dont la billetterie est encaissée (ou soldées). On verse la quote-part sur appel de l'artiste, en cochant les dates qu'elle solde.",
  },
  stage: {
    title: "Étapes d'une date",
    text: "À confirmer → En préparation (contrat, billetterie, VHR à faire) → Prête → À solder (jouée, comptes à clore) → Soldée (quote-part versée, comptes clos).",
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
