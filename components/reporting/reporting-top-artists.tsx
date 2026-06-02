import Link from "next/link";
import { Award, ArrowRight } from "lucide-react";
import { formatPct } from "@/components/deals/deal-helpers";
import { artistInitials } from "@/lib/artists";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import type { TopArtistRow } from "@/lib/reporting-types";

interface Props {
  rows: TopArtistRow[];
  rangeLabel: string;
}

/**
 * Top 10 artistes par CA HT encaissé sur la période — copie fidèle KN
 * `reporting-top-artists.tsx` adapté Pangee (CA au lieu de commission).
 */
export function ReportingTopArtists({ rows, rangeLabel }: Props) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Award className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wider">
          Top artistes
        </h2>
        <span className="text-[11px] text-muted-foreground">
          · {rangeLabel}
        </span>
      </div>
      <div className="rounded-md border overflow-hidden bg-card">
        {rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground italic">
            Aucun deal encaissé sur cette période.
          </div>
        ) : (
          <div className="divide-y">
            {rows.map((r, i) => (
              <Link
                key={r.id}
                href={`/artistes/${r.slug}`}
                className="flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors text-sm"
              >
                <div className="shrink-0 w-5 text-center text-xs text-muted-foreground tabular-nums">
                  {i + 1}
                </div>
                <span
                  className="inline-flex items-center justify-center h-7 w-7 rounded-full text-[10px] font-semibold text-white shrink-0"
                  style={{ backgroundColor: r.color ?? "#2563eb" }}
                >
                  {artistInitials(r.name, r.slug).slice(0, 2)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium leading-tight truncate">
                    {r.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.count} deal{r.count > 1 ? "s" : ""} ·{" "}
                    {formatPct(r.pct, { integer: true })} du CA
                  </div>
                </div>
                <div className="text-sm font-semibold tabular-nums shrink-0">
                  <SensitiveAmount value={r.caHt} />
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
