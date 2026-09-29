// Génération des séances d'une résidence (portage KN, Stan 2026-09-27, étape 2) :
// période du … au …, jours de la semaine, horaire(s) (plusieurs horaires =
// doublé / triplé), jours exclus. Pur : partagé entre l'aperçu (client) et
// l'action serveur.

export type PlannedPerformance = { day: string; time: string | null };

export type ResidencyPlanInput = {
  /** "YYYY-MM-DD" inclus */
  startDay: string;
  /** "YYYY-MM-DD" inclus */
  endDay: string;
  /** Jours de la semaine : 0 = dimanche … 6 = samedi (Date.getUTCDay). */
  weekdays: number[];
  /** Horaires ("19:30", "21:30") — vide = une séance sans horaire. */
  times: string[];
  /** Séances décochées dans l'aperçu : "YYYY-MM-DD|19:30". */
  excluded?: string[];
};

export const MAX_PLAN_PERFORMANCES = 400;

export function planKey(p: PlannedPerformance): string {
  return `${p.day}|${p.time ?? ""}`;
}

/** Séances générées, triées par jour puis horaire. */
export function planResidency(input: ResidencyPlanInput): PlannedPerformance[] {
  const start = parseDay(input.startDay);
  const end = parseDay(input.endDay);
  if (!start || !end || end < start || input.weekdays.length === 0) return [];
  const times = input.times.map((t) => t.trim()).filter(Boolean);
  const slots: Array<string | null> = times.length ? times : [null];
  const excluded = new Set(input.excluded ?? []);
  const out: PlannedPerformance[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    const d = new Date(t);
    if (!input.weekdays.includes(d.getUTCDay())) continue;
    const day = d.toISOString().slice(0, 10);
    for (const time of slots) {
      const p = { day, time };
      if (!excluded.has(planKey(p))) out.push(p);
      if (out.length >= MAX_PLAN_PERFORMANCES) return out;
    }
  }
  return out;
}

/** Regroupe par mois "YYYY-MM" (ordre chronologique). */
export function groupPlanByMonth(perfs: PlannedPerformance[]): Array<{ month: string; perfs: PlannedPerformance[] }> {
  const map = new Map<string, PlannedPerformance[]>();
  for (const p of perfs) {
    const m = p.day.slice(0, 7);
    map.set(m, [...(map.get(m) ?? []), p]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, perfs]) => ({ month, perfs }));
}

function parseDay(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
