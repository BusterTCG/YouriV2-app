import type { ReactNode } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { DealStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { dealStatusLabel, formatEur, formatShowTime } from "./deal-helpers";

/**
 * Infos générales d'un deal Booking, pour TOUS les comptes (Stan 2026-10-19 :
 * « plus complet », d'abord fait pour Nour le 2026-10-16). Modification via
 * le bouton « Modifier ». Profil Production : sans le financier — statut de
 * la marge seulement, et le montant de SES management fees. Les artistes ont
 * leur propre bloc.
 */
export function BookingReadonlyCard({
  statusSlot,
  deal,
}: {
  /** Statut modifiable sur place (associés) ; texte seul sinon. */
  statusSlot?: ReactNode;
  deal: {
    status: DealStatus;
    date: Date;
    showTime: string | null;
    endTime: string | null;
    venue: string | null;
    organizer: string | null;
    brand: string | null;
    address: string | null;
    /** Absent pour les associés : la marge a sa propre section. */
    marginPaid?: boolean;
    mf?: { amount: number; paid: boolean } | null;
    notes: string | null;
  };
}) {
  const s = dealStatusLabel(deal.status);
  const hours = [deal.showTime && formatShowTime(deal.showTime), deal.endTime].filter(Boolean).join(" → ");

  return (
    <div className="rounded-md border bg-card p-4 space-y-2.5 text-sm">
      <Row label="Statut">
        {statusSlot ?? (
          <>
            {s.emoji} {s.label}
          </>
        )}
      </Row>
      <Row label="Date">
        <span className="capitalize">{format(deal.date, "EEEE d MMMM yyyy", { locale: fr })}</span>
        {hours && <span className="text-muted-foreground"> · {hours}</span>}
      </Row>
      <Row label="Salle">{deal.venue}</Row>
      <Row label="Organisateur">{deal.organizer}</Row>
      <Row label="Marque / Client">{deal.brand}</Row>
      <Row label="Lieu">{deal.address}</Row>
      {deal.marginPaid !== undefined && (
        <Row label="Marge">
          <Pill paid={deal.marginPaid} />
        </Row>
      )}
      {deal.mf && (
        <Row label="Tes mgmt fees">
          <Pill paid={deal.mf.paid} paidLabel="Payé">
            <span className="tabular-nums">{formatEur(deal.mf.amount)}</span>
          </Pill>
        </Row>
      )}
      {deal.notes && (
        <Row label="Notes">
          <span className="whitespace-pre-wrap">{deal.notes}</span>
        </Row>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] sm:grid-cols-[140px_1fr] gap-3 items-baseline">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words">{children || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

/** Pastille binaire Encaissé / En cours (même style que le tableau Booking). */
function Pill({ paid, paidLabel = "Encaissé", children }: { paid: boolean; paidLabel?: string; children?: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs whitespace-nowrap",
        paid
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
          : "bg-muted/40 text-muted-foreground border-border",
      )}
    >
      {children && <span className="mr-0.5">{children}</span>}
      <span>{paid ? "✅" : "⏳"}</span>
      <span>{paid ? paidLabel : "En cours"}</span>
    </span>
  );
}
