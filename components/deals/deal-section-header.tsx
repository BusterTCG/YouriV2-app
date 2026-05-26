import { cn } from "@/lib/utils";
import { formatEur } from "./deal-helpers";

/**
 * Header de section deal — copie fidèle KN production-lines-editor.tsx § Section.
 *
 * Pattern :
 *   <h2 className="text-sm font-semibold uppercase tracking-wider">{icon}{title}</h2>
 *   <span className="text-[11px] text-muted-foreground">{subtitle}</span>
 *   <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total</span>
 *   <span className="text-base font-bold tabular-nums text-emerald-600/red-600">{total €}</span>
 */
interface Props {
  /** Icon coloré à gauche du titre. */
  icon?: React.ReactNode;
  /** Titre uppercase. */
  title: string;
  /** Indicateur de statut à droite du titre (badge "✅ Tout payé" / "⏳ N en cours").
   *  Stan 2026-05-26 : remplace les anciens textes d'aide qui polluaient l'UI. */
  subtitle?: React.ReactNode;
  /** Total numérique de la section. */
  total: number;
  /** "positive" → vert, "negative" → rouge, undefined → neutre. */
  totalAccent?: "positive" | "negative";
}

export function DealSectionHeader({ icon, title, subtitle, total, totalAccent }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-baseline gap-2 min-w-0">
        <h2 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-1.5">
          {icon}
          {title}
        </h2>
        {subtitle && <>{subtitle}</>}
      </div>
      <div className="text-right">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-2">
          Total
        </span>
        <span
          className={cn(
            "text-base font-bold tabular-nums",
            totalAccent === "positive" && "text-emerald-600 dark:text-emerald-400",
            totalAccent === "negative" && "text-red-600 dark:text-red-400",
          )}
        >
          {formatEur(total)}
        </span>
      </div>
    </div>
  );
}
