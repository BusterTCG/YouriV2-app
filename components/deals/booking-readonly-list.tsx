import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { dealStatusLabel, formatEur } from "./deal-helpers";
import type { RestrictedBookingRow } from "@/lib/deals-list-restricted";

/**
 * Liste Booking du profil Production (Nour, Stan 2026-10-16) : Date, Projet,
 * Statut, St. Artiste, St. Marge et ses management fees. Statuts en lecture
 * seule ; clic → fiche du deal (infos + FDR + charges).
 */
export function BookingReadonlyList({ rows }: { rows: RestrictedBookingRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Aucun deal booking pour ces filtres.
      </div>
    );
  }

  return (
    <>
      {/* Mobile : cards */}
      <div className="md:hidden space-y-2">
        {rows.map((r) => {
          const s = dealStatusLabel(r.status);
          return (
            <Link
              key={r.id}
              href={`/deals/booking/${r.id}`}
              className={cn(
                "block rounded-md border bg-card p-3 hover:bg-accent/30 transition-colors",
                r.status === "ANNULE" && "opacity-50",
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3 shrink-0" />
                  <span className="tabular-nums">{format(r.date, "dd MMM yyyy", { locale: fr })}</span>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                  {s.emoji} {s.label}
                </span>
              </div>
              <div className="font-medium text-sm leading-tight">{r.title}</div>
              <Artists artists={r.artists} place={r.place} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Pill paid={r.artistsPaid} prefix="Artiste" paidLabel="Payé" />
                <Pill paid={r.marginPaid} prefix="Marge" />
                {r.mf && <Pill paid={r.mf.paid} prefix={`Mgmt fees ${formatEur(r.mf.amount)}`} paidLabel="Payé" />}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Desktop : tableau serré (largeur au contenu, Stan 2026-10-16). */}
      <div className="hidden md:block max-w-full overflow-x-auto">
        <table className="text-sm border">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:font-medium [&>th]:text-left [&>th]:whitespace-nowrap">
              <th>Date</th>
              <th>Projet</th>
              <th>Statut</th>
              <th>St. Artiste</th>
              <th>St. Marge</th>
              <th title="Tes management fees">Mgmt fees</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = dealStatusLabel(r.status);
              return (
                <tr
                  key={r.id}
                  className={cn(
                    "border-t hover:bg-accent/30 transition-colors relative [&>td]:px-2 [&>td]:py-1.5 [&>td]:whitespace-nowrap",
                    r.status === "ANNULE" && "opacity-50",
                  )}
                >
                  <td className="text-xs tabular-nums">{format(r.date, "dd/MM/yy", { locale: fr })}</td>
                  {/* Projet : place pour le nom en entier (Stan 2026-10-16). */}
                  <td className="min-w-[300px] max-w-[480px] !whitespace-normal">
                    {/* Lien étiré : toute la ligne ouvre la fiche. */}
                    <Link
                      href={`/deals/booking/${r.id}`}
                      className="block font-medium leading-snug after:absolute after:inset-0"
                    >
                      {r.title}
                    </Link>
                    <Artists artists={r.artists} place={r.place} />
                  </td>
                  <td className="text-xs font-medium">
                    {s.emoji} {s.label}
                  </td>
                  <td>
                    <Pill paid={r.artistsPaid} paidLabel="Payé" />
                  </td>
                  <td>
                    <Pill paid={r.marginPaid} />
                  </td>
                  <td className="tabular-nums">
                    {r.mf ? (
                      <span className="inline-flex items-center gap-1.5">
                        {formatEur(r.mf.amount)}
                        <Pill paid={r.mf.paid} paidLabel="Payé" />
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Artists({ artists, place }: { artists: RestrictedBookingRow["artists"]; place: string | null }) {
  if (artists.length === 0 && !place) return null;
  return (
    <div className="text-xs text-muted-foreground truncate">
      {artists.map((a, i) => (
        <span key={i}>
          {i > 0 && ", "}
          <span style={{ color: a.color ?? undefined }}>{a.name}</span>
        </span>
      ))}
      {artists.length > 0 && place && " · "}
      {place}
    </div>
  );
}

/** Même pastille binaire que le tableau des associés (Encaissé / En cours). */
function Pill({ paid, paidLabel = "Encaissé", prefix }: { paid: boolean; paidLabel?: string; prefix?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-px text-xs whitespace-nowrap",
        paid
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
          : "bg-muted/40 text-muted-foreground border-border",
      )}
    >
      {prefix && <span className="opacity-70">{prefix} ·</span>}
      <span>{paid ? "✅" : "⏳"}</span>
      <span>{paid ? paidLabel : "En cours"}</span>
    </span>
  );
}
