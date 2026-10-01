// Compte d'exploitation compact de l'onglet Résultats (Stan 2026-09-28 :
// remplace les 6 tuiles de montants). Même structure que le bilan :
// recettes, charges (postes vides masqués, frais généraux, prod-exé Pangee), puis
// bénéfice partagé (co-prod) ou net artiste. Colonnes : une par périmètre (Réalisé à date / Total).
// Server-safe.

import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import {
  COST_ROWS,
  REPORT_LINE_LABELS,
  REVENUE_LABELS,
  costRowLabel,
  costRowValue,
  resultLabels,
  type FinanceBlock,
  type ReportRates,
} from "@/lib/production-report";
import { cn } from "@/lib/utils";

export function FinanceSummary({
  columns,
  rates,
}: {
  columns: Array<{ label: string; f: FinanceBlock }>;
  rates: ReportRates;
}) {
  const L = resultLabels(rates);
  const row = (
    label: string,
    get: (f: FinanceBlock) => number,
    o: { indent?: boolean; strong?: boolean; signed?: boolean; gold?: boolean; hideZero?: boolean } = {},
  ) => {
    const vals = columns.map((c) => get(c.f));
    if (o.hideZero && vals.every((v) => Math.round(v) === 0)) return null;
    return (
      <tr
        key={label}
        className={cn(
          "border-b last:border-0",
          o.strong && "font-semibold bg-muted/40",
          o.gold && "bg-yr-gold/10 font-semibold",
        )}
      >
        <td className={cn("py-1.5 px-3", o.indent && "pl-6 text-muted-foreground")}>{label}</td>
        {vals.map((v, i) => (
          <td
            key={i}
            className={cn(
              "py-1.5 px-3 text-right tabular-nums whitespace-nowrap",
              o.signed && v > 0 && "text-emerald-700 dark:text-emerald-400",
              o.signed && v < 0 && "text-red-700 dark:text-red-400",
            )}
          >
            {Math.round(v) === 0 ? "—" : <SensitiveAmount value={v} />}
          </td>
        ))}
      </tr>
    );
  };
  const group = (label: string) => (
    <tr key={`g-${label}`}>
      <td colSpan={columns.length + 1} className="pt-3 pb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </td>
    </tr>
  );
  return (
    <div className="rounded-md border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40">
          <tr>
            <th className="text-left font-semibold px-3 py-2">Compte d&apos;exploitation</th>
            {columns.map((c) => (
              <th key={c.label} className="text-right font-semibold px-3 py-2 w-32">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group("Recettes")}
          {REVENUE_LABELS.map((l) => row(REPORT_LINE_LABELS[l], (f) => f.byLabel[l], { indent: true, hideZero: true }))}
          {row("Chiffre d'affaires", (f) => f.revenue, { strong: true })}
          {group("Charges")}
          {COST_ROWS.map((c) => row(costRowLabel(c), (f) => costRowValue(f, c), { indent: true, hideZero: true }))}
          {L.showFee && row(L.knFee, (f) => f.knFee, { indent: true })}
          {row("Total charges", (f) => f.totalCost, { strong: true })}
          {row(L.result, (f) => f.result, { strong: true, signed: true })}
          {L.showSplit && row(L.kn, (f) => f.knShare, { gold: true })}
          {L.showSplit && row(L.artist, (f) => f.artist, { strong: true, signed: true })}
          {row("Total Pangee", (f) => f.kn, { gold: true })}
        </tbody>
      </table>
    </div>
  );
}
