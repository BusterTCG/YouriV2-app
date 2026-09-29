// Clé du jour LOCAL (TZ serveur = Europe/Paris), même référence que le
// « début de journée » du compte artiste (isPast). Module pur (testable).
export function localDayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
