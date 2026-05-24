"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  exportToExcel,
  filenameDate,
  slugifyForFilename,
  type ExcelColumn,
} from "@/lib/excel-export";
import type { KnContact } from "@/lib/kn-client";
import {
  CONTACT_TYPE_OPTIONS,
  contactTypeLabel,
} from "@/lib/contacts-types";

interface Props {
  contacts: KnContact[];
  /** Type filtré ou "all" — sert au filename. */
  typeFilter: string;
}

/**
 * Bouton "Exporter Excel" pour /contacts. COPIE FIDÈLE de KuroNeko-App.
 * Annuaire complet avec type, profession, coordonnées, salle rattachée et notes.
 */
export function ContactsExportButton({ contacts, typeFilter }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const columns: ExcelColumn<KnContact>[] = [
        { header: "Nom", width: 18, value: (c) => c.lastName ?? "" },
        { header: "Prénom", width: 16, value: (c) => c.firstName },
        {
          header: "Type",
          width: 14,
          value: (c) => contactTypeLabel(c.type),
        },
        { header: "Société", width: 22, value: (c) => c.company ?? "" },
        { header: "Profession", width: 22, value: (c) => c.profession ?? "" },
        { header: "Email", width: 28, value: (c) => c.email ?? "" },
        { header: "Téléphone", width: 18, value: (c) => c.phone ?? "" },
        { header: "Ville", width: 16, value: (c) => c.city ?? "" },
        {
          header: "Salle rattachée",
          width: 22,
          value: (c) =>
            c.venue
              ? c.venue.city
                ? `${c.venue.name} (${c.venue.city})`
                : c.venue.name
              : "",
        },
        { header: "Notes", width: 40, value: (c) => c.notes ?? "" },
      ];

      const typeSlug =
        typeFilter === "all"
          ? "tous"
          : CONTACT_TYPE_OPTIONS.find((o) => o.value === typeFilter)?.label.toLowerCase() ??
            typeFilter.toLowerCase();

      await exportToExcel(ExcelJS, {
        title: "Contacts · Pangee Prod",
        subtitle:
          typeFilter === "all"
            ? "Tous types"
            : `Type : ${CONTACT_TYPE_OPTIONS.find((o) => o.value === typeFilter)?.label ?? typeFilter}`,
        sheetName: "Contacts",
        columns,
        rows: contacts,
        filename: `contacts-${slugifyForFilename(typeSlug)}-${filenameDate()}`,
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
      disabled={contacts.length === 0 || busy}
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
