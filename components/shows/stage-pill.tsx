// Pastille d'étape d'une date (cycle de vie unique, lib/date-lifecycle.ts —
// Stan 2026-10-01). Server-safe.

import { DATE_STAGE_META, STAGE_PILL_CLASS, type DateStage } from "@/lib/date-lifecycle";
import { cn } from "@/lib/utils";

export function StagePill({ stage, detail, className }: { stage: DateStage; detail?: string | null; className?: string }) {
  const meta = DATE_STAGE_META[stage];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        STAGE_PILL_CLASS[meta.tone],
        className,
      )}
    >
      {meta.label}
      {detail ? ` · ${detail}` : ""}
    </span>
  );
}
