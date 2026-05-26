import { CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Badge d'état affiché dans le header des sections deal (Budget / Artistes /
 * Charges / Management fees). Remplace les anciens textes d'aide
 * (Stan 2026-05-26 : "à la place des commentaires de titre de bloc mettre
 * une indication si tout est encaissé/payé ou si des lignes sont en cours").
 *
 * 2 états :
 *   - `done`    : tout est payé/encaissé → vert ✅
 *   - `pending` : au moins 1 ligne en cours → ambre ⏳
 */
interface Props {
  /** true = tout est OK, false = au moins une ligne reste à payer. */
  done: boolean;
  /** Texte du badge (ex. "Encaissé", "2/3 payés"). */
  label: string;
}

export function SectionStatusBadge({ done, label }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        done
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      )}
    >
      {done ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <Clock className="h-3 w-3" />
      )}
      {label}
    </span>
  );
}
