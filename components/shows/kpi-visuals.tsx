// KPI visuels des spectacles (portage KN, Stan 2026-09-28 : « ticket moyen, remplissage
// sur un camembert de 100 %, des choses visuelles pour les KPI »).
// Anneau = meter circulaire (une valeur sur 100 %) : remplissage dans la
// teinte de marque, piste = pas plus clair de la même teinte ; textes en
// encre (jamais dans la couleur du remplissage). Server-safe : utilisé dans
// l'app (onglet Finances) et dans les PDF (bilan, compte de production).

import { formatEur } from "@/components/deals/deal-helpers";
import type { ShowKpis } from "@/lib/production-report";

type Variant = "app" | "print";

// Or soutenu en clair (#a67c12 : 3,8:1 sur blanc, 3,1:1 sur la piste — le
// yr-gold #d4a93a ne fait que 2,2:1) ; yr-gold en sombre (≥ 4:1 sur le fond).
const COLORS: Record<Variant, { fill: string; track: string }> = {
  app: { fill: "text-[#a67c12] dark:text-yr-gold", track: "text-[#f3e7c4] dark:text-yr-gold/20" },
  print: { fill: "text-[#a67c12]", track: "text-[#f3e7c4]" },
};

/**
 * Couleurs du remplissage (Stan 2026-10-01) : rouge ≤ 25 %, orange de 26 à
 * 74 %, vert à partir de 75 %.
 */
const FILL_TONES: Record<"low" | "mid" | "high", Record<Variant, { fill: string; track: string }>> = {
  low: {
    app: { fill: "text-red-600 dark:text-red-400", track: "text-red-100 dark:text-red-500/20" },
    print: { fill: "text-[#dc2626]", track: "text-[#fee2e2]" },
  },
  mid: {
    app: { fill: "text-amber-600 dark:text-amber-400", track: "text-amber-100 dark:text-amber-500/20" },
    print: { fill: "text-[#d97706]", track: "text-[#fef3c7]" },
  },
  high: {
    app: { fill: "text-emerald-600 dark:text-emerald-400", track: "text-emerald-100 dark:text-emerald-500/20" },
    print: { fill: "text-[#059669]", track: "text-[#d1fae5]" },
  },
};

function fillTone(percent: number | null, variant: Variant) {
  if (percent == null) return COLORS[variant];
  return FILL_TONES[percent <= 25 ? "low" : percent < 75 ? "mid" : "high"][variant];
}

/** Anneau de progression (0-100 %), valeur au centre. `fillColors` : teinte
 *  rouge / orange / vert selon le taux (anneaux de remplissage). */
export function RingMeter({
  percent,
  center,
  variant = "app",
  size = 72,
  fillColors = false,
}: {
  percent: number | null;
  center: string;
  variant?: Variant;
  size?: number;
  fillColors?: boolean;
}) {
  const stroke = Math.max(3, Math.round(size / 9));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  const colors = fillColors ? fillTone(percent, variant) : COLORS[variant];
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={center}
      className="shrink-0"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className={colors.track}
      />
      {p > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(p / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={colors.fill}
        />
      )}
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-current font-semibold"
        style={{ fontSize: size * 0.22 }}
      >
        {center}
      </text>
    </svg>
  );
}

/**
 * Mini-anneau de remplissage pour les lignes de date (Stan 2026-10-01 :
 * « le KPI avec le rond de remplissage sur les lignes de chaque date »).
 * Anneau vide + « — » tant que payants / jauge ne sont pas saisis.
 */
export function FillRing({ percent, title }: { percent: number | null; title?: string }) {
  return (
    <span title={title ?? (percent != null ? `Remplissage ${percent} %` : "Remplissage : payants / jauge à saisir")} className="inline-flex">
      <RingMeter percent={percent} center={percent != null ? `${percent}%` : "—"} size={42} fillColors />
    </span>
  );
}

/**
 * Rangée de KPI : remplissage (anneau), représentations jouées (anneau),
 * ticket moyen, résultat par représentation. `single` = une seule date
 * (compte de production) → pas d'anneau « représentations jouées ».
 */
export function KpiTiles({
  kpis,
  variant = "app",
  single = false,
}: {
  kpis: ShowKpis;
  variant?: Variant;
  single?: boolean;
}) {
  const tile =
    variant === "print"
      ? "rounded border border-slate-200 bg-white px-3 py-2 flex items-center gap-3"
      : "rounded-md border bg-card px-3 py-2.5 flex items-center gap-3";
  const label = "text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-muted-foreground";
  const sub = "text-[11px] text-slate-500 dark:text-muted-foreground";
  const big = "text-2xl font-semibold leading-tight";
  const playedPct = kpis.planned ? Math.round((kpis.played / kpis.planned) * 100) : null;
  const result = kpis.resultPerPerf;

  return (
    <div className={`grid gap-3 ${single ? "grid-cols-3" : "grid-cols-2 lg:grid-cols-4"}`}>
      <div className={tile}>
        <RingMeter
          percent={kpis.fillRate}
          center={kpis.fillRate != null ? `${kpis.fillRate}%` : "—"}
          variant={variant}
          fillColors
        />
        <div className="min-w-0">
          <div className={label}>Remplissage</div>
          <div className={sub}>
            {kpis.capacity
              ? `${kpis.paying.toLocaleString("fr-FR")} payants / ${kpis.capacity.toLocaleString("fr-FR")} places`
              : "Payants / jauge à saisir"}
          </div>
        </div>
      </div>

      {!single && (
        <div className={tile}>
          <RingMeter percent={playedPct} center={`${kpis.played}/${kpis.planned}`} variant={variant} />
          <div className="min-w-0">
            <div className={label}>Représentations</div>
            <div className={sub}>jouées sur la production</div>
          </div>
        </div>
      )}

      <div className={tile}>
        <div className="min-w-0">
          <div className={label}>Ticket moyen</div>
          <div className={big}>{kpis.ticketAvg != null ? formatEur(kpis.ticketAvg) : "—"}</div>
          <div className={sub}>billetterie HT ÷ payants</div>
        </div>
      </div>

      <div className={tile}>
        <div className="min-w-0">
          <div className={label}>Résultat / représentation</div>
          <div
            className={`${big} ${
              result == null || result === 0
                ? ""
                : result > 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-red-700 dark:text-red-400"
            }`}
          >
            {result != null ? formatEur(result) : "—"}
          </div>
          <div className={sub}>moyenne des dates jouées</div>
        </div>
      </div>
    </div>
  );
}
