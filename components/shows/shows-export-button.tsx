"use client";

// Portage KN (components/shows/shows-export-button.tsx) — Stan 2026-10-01 :
// export Excel de toutes les dates, sur l'accueil Productions.

import { useState } from "react";
import { computeShowScalars, contractSummary } from "@/lib/finance/production-overhead";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import type {
  ProductionLineKind,
  ProductionLineLabel,
  VenueDealKind,
  ArtistShareKind,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  exportToExcel,
  filenameDate,
  slugifyForFilename,
  type ExcelColumn,
  type ExcelColumnGroup,
} from "@/lib/excel-export";

/** Ligne de production aggregée — utilisée pour calculer recettes / charges. */
interface ExportProductionLine {
  kind: ProductionLineKind;
  label: ProductionLineLabel;
  amount: number;
  coveredByVenue: boolean;
}

interface ShowRow {
  date: Date;
  title: string;
  city: string | null;
  showName: string | null;
  status: string;
  capacity: number | null;
  paying: number | null;
  invited: number | null;
  grossAmount: number | null;
  commissionPct: number | null;
  commissionAmount: number | null;
  notes: string | null;
  artist: { name: string };
  briefing: { status: string } | null;
  // Champs financiers enrichis
  venueName: string | null;
  venueDealKind: VenueDealKind | null;
  artistShareKind: ArtistShareKind | null;
  coprodKnPct: number | null;
  prodExePct: number | null;
  /** CA billetterie total (Co-Réa) — utilisé pour le ticket moyen "réel". */
  coRealGrossCa: number | null;
  productionLines: ExportProductionLine[];
}

export type { ShowRow as ShowsExportRow };

interface Props {
  /** Lignes déjà chargées… */
  shows?: ShowRow[];
  /** …ou chargées au clic (accueil Production : export de toutes les dates). */
  load?: () => Promise<ShowRow[]>;
  artistName?: string | null;
}

// ───────────────────────── Labels ─────────────────────────

const STATUS_LABELS: Record<string, string> = {
  LEAD: "Lead",
  EN_COURS: "En cours",
  CONFIRME: "Confirmé",
  ANNULE: "Annulé",
};

const VENUE_DEAL_LABELS: Record<VenueDealKind, string> = {
  PROD: "Production",
  CO_REAL: "Co-réalisation",
  CESSION: "Cession",
};

// ───────────────────────── Calculs financiers ─────────────────────────

/**
 * Catégorisation des charges (Stan 2026-06-08, version finale) :
 *   - Taxes : CNM + SACD
 *   - Location : LOCATION (colonne propre)
 *   - Déplacements : VHR
 *   - Technique : TECH + CAPTA
 *   - Divers : COM + AUTRE
 */
const CHARGE_CATEGORIES: Record<
  "taxes" | "location" | "deplacements" | "technique" | "divers",
  ProductionLineLabel[]
> = {
  taxes: ["CNM", "SACD"],
  location: ["LOCATION"],
  deplacements: ["VHR"],
  technique: ["TECH", "CAPTA"],
  divers: ["COM", "AUTRE"],
};

interface ShowFinancials {
  billetterieHt: number;
  dl: number;
  totalRevenues: number;
  chargesTaxes: number;
  chargesLocation: number;
  chargesDeplacements: number;
  chargesTechnique: number;
  chargesDivers: number;
  totalCharges: number;
  margin: number;
  partArtiste: number | null;
  partKn: number | null;
  fillRate: number | null;
  ticketMoyen: number | null;
}

/**
 * Calcule tous les indicateurs financiers d'un show à partir de ses lignes
 * de production, du modèle de répartition artiste et — pour le Co-Réa — du
 * CA billetterie global (Stan 2026-06-08 : le ticket moyen sur Co-Réa se
 * base sur le CA global, pas sur la seule part Pangee).
 *
 * Renvoie `null` pour Part Artiste / Part Pangee si le `artistShareKind` n'est
 * pas défini (pas d'erreur, juste cellule vide à l'export).
 */
function computeFinancials(show: ShowRow): ShowFinancials {
  // Recettes par poste
  let billetterieHt = 0;
  let dl = 0;
  for (const line of show.productionLines) {
    if (line.kind !== "REVENUE") continue;
    if (line.coveredByVenue) continue;
    if (line.label === "RECETTE_HT") billetterieHt += line.amount;
    if (line.label === "DL_PROD") dl += line.amount;
  }
  const totalRevenues = billetterieHt + dl;

  // Charges par catégorie (lignes "coveredByVenue" exclues)
  let chargesTaxes = 0;
  let chargesLocation = 0;
  let chargesDeplacements = 0;
  let chargesTechnique = 0;
  let chargesDivers = 0;
  for (const line of show.productionLines) {
    if (line.kind !== "COST") continue;
    if (line.coveredByVenue) continue;
    if (CHARGE_CATEGORIES.taxes.includes(line.label))
      chargesTaxes += line.amount;
    else if (CHARGE_CATEGORIES.location.includes(line.label))
      chargesLocation += line.amount;
    else if (CHARGE_CATEGORIES.deplacements.includes(line.label))
      chargesDeplacements += line.amount;
    else if (CHARGE_CATEGORIES.technique.includes(line.label))
      chargesTechnique += line.amount;
    else if (CHARGE_CATEGORIES.divers.includes(line.label))
      chargesDivers += line.amount;
  }
  const totalCharges =
    chargesTaxes +
    chargesLocation +
    chargesDeplacements +
    chargesTechnique +
    chargesDivers;
  const margin = totalRevenues - totalCharges;

  // Part artiste / Part Pangee selon le modèle
  // Prod-exé % du CA puis co-prod % du bénéfice restant (calcul commun).
  const scalars = computeShowScalars(totalRevenues, totalCharges, show);
  const partKn: number | null = scalars?.knAmount ?? null;
  const partArtiste: number | null = scalars?.artistAmount ?? null;

  // KPIs billetterie
  const cap = show.capacity ?? 0;
  const pay = show.paying ?? 0;
  const inv = show.invited ?? 0;
  const fillRate = cap > 0 ? (pay + inv) / cap : null;

  // Ticket moyen : aligné sur la fiche show.
  //   - Co-Réa : CA global billetterie / payants (coRealGrossCa = CA total,
  //     pas la part Pangee). Stan 2026-06-08 : "le ticket moyen est en réalité
  //     à 21€ et pas 9€" — exemple Spotlight (1658,15 / 80).
  //   - Sinon (PROD / autre) : billetterieHt / payants comme avant.
  let ticketMoyen: number | null = null;
  if (pay > 0) {
    if (show.venueDealKind === "CO_REAL" && show.coRealGrossCa != null) {
      ticketMoyen = show.coRealGrossCa / pay;
    } else if (billetterieHt > 0) {
      ticketMoyen = billetterieHt / pay;
    }
  }

  return {
    billetterieHt,
    dl,
    totalRevenues,
    chargesTaxes,
    chargesLocation,
    chargesDeplacements,
    chargesTechnique,
    chargesDivers,
    totalCharges,
    margin,
    partArtiste,
    partKn,
    fillRate,
    ticketMoyen,
  };
}

function buildArtistModelLabel(s: ShowRow): string {
  return s.artistShareKind ? contractSummary(s) : "—";
}

// ───────────────────────── Composant ─────────────────────────

/**
 * Bouton "Exporter Excel" pour la page /shows. Génère un tableau financier
 * complet : 1 ligne par show, avec billetterie + recettes + charges en 5
 * catégories + synthèse + ligne TOTAL.
 *
 * Mise en page : groupes de colonnes colorés (Identité / Billetterie /
 * Recettes / Charges / Synthèse) + zebra léger + Marge, Part artiste et
 * Part Pangee en gras. Les charges sont affichées en négatif (-1 234 €) pour
 * être visuellement cohérent avec un compte de production classique.
 */
export function ShowsExportButton({ shows: preloaded, load, artistName }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const shows = preloaded ?? (load ? await load() : []);
      if (shows.length === 0) return;
      const ExcelJS = (await import("exceljs")).default;

      const enriched = shows.map((s) => ({ s, fin: computeFinancials(s) }));

      // Helper : retourne null si zero, sinon la valeur (positive ou négative).
      // Permet d'avoir des cellules VIDES quand un poste n'est pas saisi
      // (Stan 2026-06-08 : "Si un montant est à zéro ne pas remplir la
      // cellule"). Plus lisible qu'un tableau saturé de "0 €".
      const zeroAsNull = (n: number | null): number | null =>
        n == null || n === 0 ? null : n;

      const columns: ExcelColumn<{ s: ShowRow; fin: ShowFinancials }>[] = [
        // ─── 0–7 IDENTITÉ ───
        { header: "Date", width: 11, format: "DATE", value: (r) => r.s.date },
        { header: "Artiste", width: 18, value: (r) => r.s.artist.name },
        {
          header: "Spectacle",
          width: 24,
          value: (r) => r.s.showName ?? r.s.title,
        },
        { header: "Ville", width: 14, value: (r) => r.s.city ?? "" },
        { header: "Salle", width: 22, value: (r) => r.s.venueName ?? "" },
        {
          header: "Statut",
          width: 12,
          value: (r) => STATUS_LABELS[r.s.status] ?? r.s.status,
        },
        {
          header: "Modèle salle",
          width: 14,
          value: (r) =>
            r.s.venueDealKind ? VENUE_DEAL_LABELS[r.s.venueDealKind] : "—",
        },
        {
          header: "Modèle artiste",
          width: 14,
          value: (r) => buildArtistModelLabel(r.s),
        },

        // ─── 8–12 BILLETTERIE ───
        { header: "Jauge", width: 8, value: (r) => zeroAsNull(r.s.capacity) },
        { header: "Payants", width: 9, value: (r) => zeroAsNull(r.s.paying) },
        { header: "Invités", width: 9, value: (r) => zeroAsNull(r.s.invited) },
        {
          header: "Remplissage",
          width: 12,
          format: "PCT",
          value: (r) => zeroAsNull(r.fin.fillRate),
        },
        {
          header: "Ticket moyen",
          width: 13,
          format: "EUR",
          value: (r) => zeroAsNull(r.fin.ticketMoyen),
        },

        // ─── 13–15 RECETTES ───
        {
          header: "Billetterie HT",
          width: 14,
          format: "EUR",
          value: (r) => zeroAsNull(r.fin.billetterieHt),
        },
        {
          header: "DL",
          width: 10,
          format: "EUR",
          value: (r) => zeroAsNull(r.fin.dl),
        },
        {
          header: "TOTAL Recettes",
          width: 14,
          format: "EUR",
          value: (r) => zeroAsNull(r.fin.totalRevenues),
        },

        // ─── 16–21 CHARGES (en négatif, vides si 0) ───
        {
          header: "Taxes",
          width: 11,
          format: "EUR",
          value: (r) =>
            r.fin.chargesTaxes === 0 ? null : -r.fin.chargesTaxes,
        },
        {
          header: "Location",
          width: 11,
          format: "EUR",
          value: (r) =>
            r.fin.chargesLocation === 0 ? null : -r.fin.chargesLocation,
        },
        {
          header: "VHR",
          width: 11,
          format: "EUR",
          value: (r) =>
            r.fin.chargesDeplacements === 0
              ? null
              : -r.fin.chargesDeplacements,
        },
        {
          header: "Technique",
          width: 11,
          format: "EUR",
          value: (r) =>
            r.fin.chargesTechnique === 0 ? null : -r.fin.chargesTechnique,
        },
        {
          header: "Divers",
          width: 11,
          format: "EUR",
          value: (r) =>
            r.fin.chargesDivers === 0 ? null : -r.fin.chargesDivers,
        },
        {
          header: "TOTAL Charges",
          width: 14,
          format: "EUR",
          value: (r) =>
            r.fin.totalCharges === 0 ? null : -r.fin.totalCharges,
        },

        // ─── 22–24 SYNTHÈSE ───
        {
          header: "Marge",
          width: 14,
          format: "EUR",
          // La marge peut volontairement valoir 0 (recettes = charges) — on
          // l'affiche quand même pour ne pas la confondre avec "vide".
          value: (r) => r.fin.margin,
        },
        {
          header: "Part artiste",
          width: 13,
          format: "EUR",
          value: (r) => zeroAsNull(r.fin.partArtiste),
        },
        {
          header: "Part Pangee",
          width: 11,
          format: "EUR",
          value: (r) => zeroAsNull(r.fin.partKn),
        },
      ];

      // Groupes pour le bandeau au-dessus du header (couleurs douces +
      // affichage pédagogique des sections).
      const columnGroups: ExcelColumnGroup[] = [
        {
          label: "IDENTITÉ",
          startIdx: 0,
          endIdx: 7,
          bgColor: "FFE9ECF2", // gris-bleu pâle
        },
        {
          label: "BILLETTERIE",
          startIdx: 8,
          endIdx: 12,
          bgColor: "FFE4F2EA", // vert pâle
        },
        {
          label: "RECETTES",
          startIdx: 13,
          endIdx: 15,
          bgColor: "FFD9F0E0", // vert un peu plus marqué
        },
        {
          label: "CHARGES",
          startIdx: 16,
          endIdx: 21,
          bgColor: "FFF7DDDB", // rose pâle
        },
        {
          label: "SYNTHÈSE",
          startIdx: 22,
          endIdx: 24,
          bgColor: "FFF7EBC8", // doré pâle
        },
      ];

      // Marge, Part artiste, Part Pangee en gras pour ressortir dans le tableau.
      // + TOTAL Recettes (15) et TOTAL Charges (21) en gras aussi
      // (Stan 2026-06-08 : "Mettre en gras les totaux recette et total charges").
      const boldColumns = [15, 21, 22, 23, 24];

      // Couleurs de police personnalisées :
      //   - TOTAL Recettes (col 15) → vert (positif)
      //   - TOTAL Charges (col 21) → rouge (négatif)
      // Appliquées sur TOUTES les lignes data + ligne TOTAL.
      const colorColumns: Record<number, string> = {
        15: "FF108536", // vert positif
        21: "FFCC2C2C", // rouge négatif
      };

      // ── Totaux ──
      const sum = (pick: (f: ShowFinancials) => number) =>
        enriched.reduce((acc, r) => acc + pick(r.fin), 0);
      const totalCapacity = enriched.reduce(
        (a, r) => a + (r.s.capacity ?? 0),
        0,
      );
      const totalPaying = enriched.reduce(
        (a, r) => a + (r.s.paying ?? 0),
        0,
      );
      const totalInvited = enriched.reduce(
        (a, r) => a + (r.s.invited ?? 0),
        0,
      );
      const totalBilletterieHt = sum((f) => f.billetterieHt);
      // Pour le ticket moyen pondéré, on additionne d'abord les CA "réels"
      // (CA global Co-Réa ou billetterieHt sinon) et on divise par les
      // payants totaux. Cohérent avec le calcul par ligne.
      let totalCaForTicket = 0;
      for (const r of enriched) {
        if (
          r.s.venueDealKind === "CO_REAL" &&
          r.s.coRealGrossCa != null
        ) {
          totalCaForTicket += r.s.coRealGrossCa;
        } else {
          totalCaForTicket += r.fin.billetterieHt;
        }
      }
      const totalFillRate =
        totalCapacity > 0
          ? (totalPaying + totalInvited) / totalCapacity
          : null;
      const totalTicketMoyen =
        totalPaying > 0 ? totalCaForTicket / totalPaying : null;

      const totalsMap: Record<number, number> = {
        8: totalCapacity,
        9: totalPaying,
        10: totalInvited,
        13: totalBilletterieHt,
        14: sum((f) => f.dl),
        15: sum((f) => f.totalRevenues),
        // Charges en négatif (idem cellules data)
        16: -sum((f) => f.chargesTaxes),
        17: -sum((f) => f.chargesLocation),
        18: -sum((f) => f.chargesDeplacements),
        19: -sum((f) => f.chargesTechnique),
        20: -sum((f) => f.chargesDivers),
        21: -sum((f) => f.totalCharges),
        22: sum((f) => f.margin),
        23: sum((f) => f.partArtiste ?? 0),
        24: sum((f) => f.partKn ?? 0),
      };
      if (totalFillRate != null) totalsMap[11] = totalFillRate;
      if (totalTicketMoyen != null) totalsMap[12] = totalTicketMoyen;

      await exportToExcel(ExcelJS, {
        title: "Productions & tournées · Pangee Prod",
        subtitle: artistName
          ? `Artiste : ${artistName} — État détaillé recettes / charges / parts`
          : "Tous artistes — État détaillé recettes / charges / parts",
        sheetName: "Shows",
        columns,
        rows: enriched,
        filename: `dates-${slugifyForFilename(artistName ?? "toutes")}-${filenameDate()}`,
        totals: totalsMap,
        totalsLabel: `TOTAL · ${shows.length} date${shows.length > 1 ? "s" : ""}`,
        columnGroups,
        boldColumns,
        colorColumns,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleExport}
      disabled={(!load && (preloaded?.length ?? 0) === 0) || busy}
      className="gap-1.5"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
      )}
      <span className="hidden sm:inline">Exporter</span>
      <Download className="h-4 w-4 sm:hidden" />
    </Button>
  );
}
