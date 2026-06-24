"use client";

import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { FileDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ArtistProfile } from "@prisma/client";

/**
 * Export de la fiche ArtistProfile en PDF (via window.print) — copie fidèle
 * de KuroNeko-App `components/artists/artist-info-export.tsx`.
 *
 * UX : dialog avec checkboxes par section (tout coché par défaut), bouton
 * "Tout cocher / Tout décocher" par section, puis "Imprimer / PDF" qui
 * ouvre une fenêtre pop-up avec la fiche formatée + window.print().
 */

export type ExportableProfile = Partial<ArtistProfile> & { artistName: string };

interface ArtistInfoExportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ExportableProfile;
}

type FieldKey =
  | "firstName" | "lastName" | "stageName" | "birthDate" | "birthPlace"
  | "socialSecurityNumber" | "intermittentNumber" | "sacdNumber" | "sncfCardNumber"
  | "personalEmail" | "personalPhone" | "homeAddress"
  | "companyName" | "companyLegalForm" | "companySiret" | "companySiren"
  | "companyVatNumber" | "companyApeCode" | "companyAddress"
  | "spectacleLicense" | "vatRegime"
  | "bankIban" | "bankBic" | "bankName" | "bankHolder"
  | "bioShort" | "bioLong" | "pressPhotoUrl" | "websiteUrl"
  | "instagramHandle" | "youtubeHandle" | "tiktokHandle";

type Section = {
  title: string;
  fields: Array<{ key: FieldKey; label: string }>;
};

const SECTIONS: Section[] = [
  {
    title: "Identité civile",
    fields: [
      { key: "firstName", label: "Prénom" },
      { key: "lastName", label: "Nom" },
      { key: "stageName", label: "Nom de scène" },
      { key: "birthDate", label: "Date de naissance" },
      { key: "birthPlace", label: "Lieu de naissance" },
      { key: "socialSecurityNumber", label: "N° Sécurité sociale" },
      { key: "intermittentNumber", label: "N° Intermittent" },
      { key: "sacdNumber", label: "N° SACD" },
      { key: "sncfCardNumber", label: "N° Carte SNCF" },
    ],
  },
  {
    title: "Coordonnées personnelles",
    fields: [
      { key: "personalEmail", label: "Email perso" },
      { key: "personalPhone", label: "Téléphone" },
      { key: "homeAddress", label: "Adresse résidence" },
    ],
  },
  {
    title: "Structure de facturation",
    fields: [
      { key: "companyName", label: "Raison sociale" },
      { key: "companyLegalForm", label: "Forme juridique" },
      { key: "companySiret", label: "SIRET" },
      { key: "companySiren", label: "SIREN" },
      { key: "companyVatNumber", label: "N° TVA intra" },
      { key: "companyApeCode", label: "Code APE / NAF" },
      { key: "companyAddress", label: "Adresse siège" },
      { key: "spectacleLicense", label: "N° Licence spectacles" },
      { key: "vatRegime", label: "Régime TVA" },
    ],
  },
  {
    title: "Coordonnées bancaires",
    fields: [
      { key: "bankIban", label: "IBAN" },
      { key: "bankBic", label: "BIC" },
      { key: "bankName", label: "Banque" },
      { key: "bankHolder", label: "Titulaire" },
    ],
  },
  {
    title: "Communication",
    fields: [
      { key: "bioShort", label: "Bio courte" },
      { key: "bioLong", label: "Bio longue" },
      { key: "pressPhotoUrl", label: "Photo presse" },
      { key: "websiteUrl", label: "Site web" },
      { key: "instagramHandle", label: "Instagram" },
      { key: "youtubeHandle", label: "YouTube" },
      { key: "tiktokHandle", label: "TikTok" },
    ],
  },
];

export function ArtistInfoExport({ open, onOpenChange, profile }: ArtistInfoExportProps) {
  const [selected, setSelected] = useState<Set<FieldKey>>(() => {
    const s = new Set<FieldKey>();
    for (const sec of SECTIONS) for (const f of sec.fields) s.add(f.key);
    return s;
  });

  function toggle(key: FieldKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSection(section: Section, allOn: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const f of section.fields) {
        if (allOn) next.delete(f.key);
        else next.add(f.key);
      }
      return next;
    });
  }

  function exportNow() {
    const win = window.open("", "_blank");
    if (!win) {
      alert("Le pop-up a été bloqué. Autorise les pop-ups pour exporter.");
      return;
    }
    const html = renderHtml(profile, selected);
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 300);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-4 w-4 text-yr-gold" />
            Exporter la fiche
          </DialogTitle>
          <DialogDescription>
            Tout est sélectionné par défaut. Décoche ce que tu ne veux pas inclure.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {SECTIONS.map((sec) => {
            const allChecked = sec.fields.every((f) => selected.has(f.key));
            const someChecked = sec.fields.some((f) => selected.has(f.key));
            return (
              <div key={sec.title} className="rounded-md border bg-muted/20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    {sec.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleSection(sec, allChecked)}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  >
                    {allChecked ? "Tout décocher" : someChecked ? "Tout cocher" : "Tout cocher"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {sec.fields.map((f) => {
                    const value = profile[f.key];
                    const isEmpty = value == null || value === "";
                    return (
                      <label
                        key={f.key}
                        className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent/30 rounded px-1 py-0.5"
                      >
                        <Checkbox
                          checked={selected.has(f.key)}
                          onCheckedChange={() => toggle(f.key)}
                        />
                        <span className={isEmpty ? "text-muted-foreground/50 italic" : ""}>
                          {f.label}
                          {isEmpty && " (vide)"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="border-t pt-4 mt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" onClick={exportNow} disabled={selected.size === 0}>
            <FileDown className="mr-2 h-4 w-4" />
            Imprimer / PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function renderHtml(profile: ExportableProfile, selected: Set<FieldKey>): string {
  const sections = SECTIONS.map((sec) => {
    const fields = sec.fields.filter((f) => selected.has(f.key));
    if (fields.length === 0) return "";
    const rows = fields
      .map((f) => {
        const raw = profile[f.key];
        const value = formatField(f.key, raw);
        return `<tr><td class="lbl">${escapeHtml(f.label)}</td><td>${escapeHtml(value)}</td></tr>`;
      })
      .join("");
    return `<section><h2>${escapeHtml(sec.title)}</h2><table>${rows}</table></section>`;
  })
    .filter(Boolean)
    .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Fiche ${escapeHtml(profile.artistName)}</title>
<style>
  @page { margin: 18mm; }
  body { font-family: -apple-system, system-ui, "Segoe UI", Helvetica, sans-serif; color: #111; font-size: 12px; line-height: 1.5; }
  section { margin-bottom: 18px; page-break-inside: avoid; }
  h1 { font-size: 22px; margin: 0 0 18px 0; color: #1a2540; }
  h2 { color: #1a2540; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 6px 0; padding-bottom: 4px; border-bottom: 1px solid #d4a93a40; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 4px 0; vertical-align: top; }
  td.lbl { width: 180px; color: #555; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; padding-right: 12px; }
</style>
</head>
<body>
<h1>${escapeHtml(profile.artistName)}</h1>
${sections}
<script>window.addEventListener("afterprint", () => window.close());</script>
</body>
</html>`;
}

function formatField(key: FieldKey, raw: unknown): string {
  if (raw == null || raw === "") return "—";
  if (key === "birthDate" && raw instanceof Date) {
    return format(raw, "d MMMM yyyy", { locale: fr });
  }
  if (key === "birthDate" && typeof raw === "string") {
    return format(new Date(raw), "d MMMM yyyy", { locale: fr });
  }
  return String(raw);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
