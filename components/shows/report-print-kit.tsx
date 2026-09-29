// Kit d'impression commun aux documents financiers (portage KN, Stan 2026-09-27) :
// bilan d'exploitation (production) et compte de production (date) partagent
// le même en-tête bleu nuit + or, les mêmes sections et le même compte
// d'exploitation. Toute évolution de mise en page se fait ICI.
// Server components (pas d'interactivité) — montants toujours visibles.

import { formatEur } from "@/components/deals/deal-helpers";
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

export const NAVY = "#1a2540";
export const GOLD = "#d4a93a";
export const GOLD_BG = "#fbf5e4";

/** Page A4 paysage : bandeau bleu nuit, encart contrat, contenu, notes. */
export function ReportShell({
  kicker,
  title,
  subtitle,
  rightLabel,
  rightMain,
  rightSub,
  contract,
  notes,
  children,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  rightLabel: string;
  rightMain: string;
  rightSub: string;
  contract: string;
  notes: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="report-doc mx-auto bg-white">
      <header className="text-white px-10 py-6 flex items-start justify-between" style={{ background: NAVY }}>
        <div>
          <div className="uppercase text-[11px] tracking-[0.2em] font-bold mb-1" style={{ color: GOLD }}>
            Pangee Prod · {kicker}
          </div>
          <h1 className="text-2xl font-bold leading-tight">{title}</h1>
          <div className="text-white/80 text-sm mt-1">{subtitle}</div>
        </div>
        <div className="text-right text-sm">
          <div className="uppercase text-[11px] tracking-[0.2em] font-bold mb-1" style={{ color: GOLD }}>
            {rightLabel}
          </div>
          <div className="font-semibold">{rightMain}</div>
          <div className="text-white/70 text-xs mt-1">{rightSub}</div>
        </div>
      </header>

      <div className="px-8 py-6 space-y-6">
        <div className="text-xs rounded border px-3 py-2" style={{ borderColor: GOLD }}>
          <span className="font-semibold">Contrat : </span>
          {contract}
        </div>
        {children}
        <div className="text-[10px] italic text-slate-500 space-y-0.5 pt-2 border-t">
          {notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
@page { size: A4 landscape; margin: 0; }
@media print {
  html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
  .report-doc { max-width: 100% !important; }
  .report-section { break-inside: avoid; }
}
.report-doc {
  max-width: 297mm;
  color: ${NAVY};
  font-family: var(--font-sans), system-ui, sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.report-doc tr { break-inside: avoid; }
`,
        }}
      />
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="report-section">
      <h2 className="text-sm font-bold uppercase tracking-wider pb-1 mb-2 border-b-2" style={{ color: NAVY, borderColor: GOLD }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

const LEFT_COLS = new Set(["Lieu", "Libellé", "Détail", "Statut", "Commentaire", "Poste"]);

export function HeadRow({ cols, small }: { cols: string[]; small?: boolean }) {
  return (
    <tr className={`${small ? "text-[9px]" : "text-[10px]"} uppercase tracking-wide`} style={{ background: "#f7f0dc" }}>
      {cols.map((c, i) => (
        <th
          key={c + i}
          className={`py-1 px-1 font-semibold align-bottom ${i === 0 || LEFT_COLS.has(c) ? "text-left" : "text-right"}`}
          style={c === "Prod-exé Pangee" || c === "Part Pangee" ? { color: "#9a7415" } : undefined}
        >
          {c}
        </th>
      ))}
    </tr>
  );
}

export function signedStyle(v: number): React.CSSProperties | undefined {
  if (v > 0) return { color: "#108536" };
  if (v < 0) return { color: "#cc2c2c" };
  return undefined;
}

export function Eur({ v, sign, gold }: { v: number; sign?: boolean; gold?: boolean }) {
  return (
    <td
      className="py-1 px-1 text-right whitespace-nowrap"
      style={{ ...(sign ? signedStyle(v) : {}), ...(gold ? { background: GOLD_BG } : {}) }}
    >
      {Math.round(v) === 0 ? "—" : formatEur(v)}
    </td>
  );
}

export function Num({ v }: { v: number | null }) {
  return <td className="py-1 px-1 text-right">{v ? v.toLocaleString("fr-FR") : "—"}</td>;
}

/** Tableau de chiffres simples (public, billetterie…). */
export function StatTable({
  header,
  rows,
}: {
  header: string[];
  rows: Array<{ label: string; values: string[] }>;
}) {
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <HeadRow cols={header} />
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-slate-200">
            <td className="py-1 px-1">{r.label}</td>
            {r.values.map((v, i) => (
              <td key={i} className="py-1 px-1 text-right">
                {v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Compte d'exploitation (même structure partout) : recettes, CA, charges
 * (postes vides masqués, frais généraux après la SACD), puis selon le modèle :
 *   prod-exé → rémunération Pangee dans les charges, fin sur « Net artiste » ;
 *   co-prod  → résultat, puis partage Part Pangee / Part artiste.
 */
export function FinanceTable({
  columns,
  rates,
}: {
  columns: Array<{ label: string; f: FinanceBlock }>;
  /** Contrat : prod-exé % du CA, co-prod % du bénéfice. */
  rates: ReportRates;
}) {
  const L = resultLabels(rates);
  const span = columns.length + 1;
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
        className={`border-b border-slate-100 ${o.strong ? "font-semibold bg-slate-50" : ""}`}
        style={o.gold ? { background: GOLD_BG, fontWeight: 600 } : undefined}
      >
        <td className={`py-0.5 px-1 ${o.indent ? "pl-4" : ""}`}>{label}</td>
        {vals.map((v, i) => (
          <td key={i} className="py-0.5 px-1 text-right whitespace-nowrap" style={o.signed ? signedStyle(v) : undefined}>
            {Math.round(v) === 0 ? "—" : formatEur(v)}
          </td>
        ))}
      </tr>
    );
  };
  const group = (label: string) => (
    <tr key={`g-${label}`}>
      <td colSpan={span} className="pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </td>
    </tr>
  );
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <HeadRow cols={["Compte d'exploitation", ...columns.map((c) => c.label)]} />
      </thead>
      <tbody>
        {group("Recettes")}
        {REVENUE_LABELS.map((l) => row(REPORT_LINE_LABELS[l], (f) => f.byLabel[l], { indent: true, hideZero: true }))}
        {row("Chiffre d'affaires", (f) => f.revenue, { strong: true })}
        {group("Charges")}
        {COST_ROWS.map((c) => row(costRowLabel(c), (f) => costRowValue(f, c), { indent: true, hideZero: true }))}
        {L.showFee && row(L.knFee, (f) => f.knFee, { indent: true, gold: true })}
        {row("Total charges", (f) => f.totalCost, { strong: true })}
        {row(L.result, (f) => f.result, { strong: true, signed: true })}
        {L.showSplit && row(L.kn, (f) => f.knShare, { gold: true })}
        {L.showSplit && row(L.artist, (f) => f.artist, { strong: true, signed: true })}
      </tbody>
    </table>
  );
}
