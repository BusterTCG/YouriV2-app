"use client";

import { useState } from "react";
import { Copy, Check, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Champ d'affichage d'une info artiste — copie fidèle de KuroNeko-App
 * `components/artists/info-field.tsx`.
 *
 * Avec :
 *   - bouton Copier (avec confirmation visuelle Check 1.5s)
 *   - masquage si sensitive (Sécu, IBAN…) + bouton Eye/EyeOff
 *   - rendu "—" si vide
 *   - format custom (ex. date) via prop `display`
 *   - multi-ligne pour bios (whitespace-pre-wrap)
 *   - actions desktop hover-only, mobile opacity-60 toujours visibles
 */
interface InfoFieldProps {
  label: string;
  value: string | null | undefined;
  /** Champ sensible : masqué par défaut, bouton "afficher". */
  sensitive?: boolean;
  /** Pour les bios : permet le multi-ligne. */
  multiline?: boolean;
  /** Format custom (ex. date). */
  display?: (raw: string) => string;
}

export function InfoField({ label, value, sensitive, multiline, display }: InfoFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const empty = !value;
  const displayed = empty
    ? "—"
    : sensitive && !revealed
      ? maskValue(value!)
      : display
        ? display(value!)
        : value!;

  function copy() {
    if (empty || !value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </div>
      <div className="group flex items-start gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5 min-h-[34px]">
        <div
          className={cn(
            "flex-1 text-sm tabular-nums font-mono",
            empty && "text-muted-foreground/60 italic font-sans",
            multiline && "whitespace-pre-wrap font-sans",
            !sensitive && !multiline && "font-sans tabular-nums",
          )}
        >
          {displayed}
        </div>
        <div className="flex items-center gap-0.5 opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
          {sensitive && !empty && (
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="rounded p-1 hover:bg-accent text-muted-foreground hover:text-foreground"
              aria-label={revealed ? "Masquer" : "Afficher"}
              title={revealed ? "Masquer" : "Afficher"}
            >
              {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            disabled={empty}
            className="rounded p-1 hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Copier"
            title="Copier"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Masque le milieu d'une valeur sensible : "1234567890123" → "1234 ******** 0123". */
function maskValue(v: string): string {
  if (v.length <= 6) return "•".repeat(v.length);
  const start = v.slice(0, 4);
  const end = v.slice(-4);
  const middle = "•".repeat(Math.max(4, v.length - 8));
  return `${start} ${middle} ${end}`;
}
