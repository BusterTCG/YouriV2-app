// Dates soldées (Stan 2026-10-01, lot 3) — règles pures, sans Prisma.
//
// Une date est « soldée » quand ses comptes sont clos, en général via un
// appel de quote-part (versement à l'artiste qui la couvre). Une date soldée :
//   - sort des listes « à solder » ;
//   - garde sa quote-part de frais généraux figée (settledOverheadShare) ;
//   - compte comme appelable et réglée dans le compte artiste.

type SettledSource = {
  settledAt: Date | null;
  settledOverheadShare: { toString(): string } | number | null;
};

/** Quote-part de frais généraux figée, ou null (date non soldée / pas encore figée). */
export function frozenShareOf(d: SettledSource): number | null {
  if (!d.settledAt || d.settledOverheadShare == null) return null;
  return Number(d.settledOverheadShare);
}
