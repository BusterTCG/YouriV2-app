// Titre de section coloré des écrans production (KN, Stan 2026-09-27 : « ajouter
// de la couleur sur les titres, il y a plein d'informations »). Une teinte par
// type de section pour se repérer d'un coup d'œil :
//   gold    → la production / ses résidences (cœur de l'écran)
//   blue    → le calendrier (prochaines dates, séances)
//   violet  → l'argent (contrat, frais généraux, par mois)
//   amber   → ce qui demande une action (dates à rattacher)
//   slate   → l'historique (dates passées, terminées)

import { cn } from "@/lib/utils";

export type SectionTone = "gold" | "blue" | "violet" | "amber" | "slate";

const TONES: Record<SectionTone, { bar: string; text: string }> = {
  gold: { bar: "bg-yr-gold", text: "text-[#9a7415] dark:text-yr-gold" },
  blue: { bar: "bg-sky-500", text: "text-sky-700 dark:text-sky-400" },
  violet: { bar: "bg-violet-500", text: "text-violet-700 dark:text-violet-400" },
  amber: { bar: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  slate: { bar: "bg-slate-400", text: "text-slate-600 dark:text-slate-400" },
};

export function SectionTitle({
  tone,
  icon,
  children,
  as: Tag = "h2",
  className,
}: {
  tone: SectionTone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <Tag
      className={cn(
        "inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider",
        t.text,
        className,
      )}
    >
      <span className={cn("h-4 w-1 rounded-full shrink-0", t.bar)} aria-hidden />
      {icon}
      {children}
    </Tag>
  );
}
