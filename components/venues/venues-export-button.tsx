"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  exportToExcel,
  filenameDate,
  type ExcelColumn,
} from "@/lib/excel-export";
import type { VenueListItem } from "@/lib/venues-local";

interface Props {
  venues: VenueListItem[];
  /** Texte de recherche actif — sert au sous-titre + filename si non vide. */
  search?: string;
}

/**
 * Bouton "Exporter Excel" pour la page /lieux. Copie fidèle de
 * KuroNeko-App `components/venues/venues-export-button.tsx`.
 *
 * Colonnes : nom, ville, adresse, jauge, sous-salles concaténées
 * (ex. "Grande Salle 850 · Studio 100"), deals (Pangee), contacts (KN).
 */
export function VenuesExportButton({ venues, search }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const columns: ExcelColumn<VenueListItem>[] = [
        { header: "Nom", width: 28, value: (v) => v.name },
        { header: "Ville", width: 18, value: (v) => v.city },
        { header: "Adresse", width: 32, value: (v) => v.address ?? "" },
        { header: "Jauge", width: 10, value: (v) => v.capacity },
        {
          header: "Sous-salles",
          width: 36,
          value: (v) =>
            v.rooms.length === 0
              ? ""
              : v.rooms
                  .map((r) =>
                    r.capacity != null ? `${r.name} (${r.capacity})` : r.name,
                  )
                  .join(" · "),
        },
        { header: "Deals", width: 8, value: (v) => v.dealsCount },
        { header: "Contacts", width: 10, value: (v) => v.contactsCount },
        { header: "Notes", width: 40, value: (v) => v.notes ?? "" },
      ];

      const searchSlug = (search ?? "").trim().replace(/\s+/g, "-").toLowerCase();
      const filename = searchSlug
        ? `lieux-${searchSlug}-${filenameDate()}`
        : `lieux-${filenameDate()}`;

      await exportToExcel(ExcelJS, {
        title: "Lieux · Pangee Prod",
        subtitle: search?.trim()
          ? `Recherche : « ${search.trim()} »`
          : "Tous les lieux",
        sheetName: "Lieux",
        columns,
        rows: venues,
        filename,
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
      disabled={venues.length === 0 || busy}
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
