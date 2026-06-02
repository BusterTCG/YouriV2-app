"use client";

import { usePrivacy } from "@/lib/privacy-context";
import { formatEur } from "@/components/deals/deal-helpers";

interface Props {
  value: number | null | undefined;
  /** Si fourni, override le formatage (par ex. `formatEur` avec decimals). */
  format?: (n: number) => string;
  /** Glyph quand value=null. Défaut "—". */
  emptyText?: string;
  /** Nombre de "•" à afficher en mode privé. Défaut 5. */
  maskLength?: number;
}

/**
 * Affiche un montant en € avec masquage façon appli bancaire.
 *
 * Stan 2026-06-02 : le bouton PrivacyToggle dans le header bascule l'état.
 * Quand isPrivate=true, on affiche `•••••` à la place du montant (pas un
 * blur CSS — vraiment masqué, le DOM ne contient pas la valeur).
 */
export function SensitiveAmount({
  value,
  format,
  emptyText = "—",
  maskLength = 5,
}: Props) {
  const { isPrivate } = usePrivacy();
  if (isPrivate) {
    return (
      <span className="select-none tracking-widest" aria-label="Montant masqué">
        {"•".repeat(maskLength)}
      </span>
    );
  }
  if (value == null) return <>{emptyText}</>;
  return <>{format ? format(value) : formatEur(value)}</>;
}
