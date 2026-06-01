import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  FileText,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { formatShowTime } from "@/components/deals/deal-helpers";
import { DealBudgetSection } from "@/components/deals/deal-budget-section";
import { DealPipelineBar } from "@/components/tasks/deal-pipeline-bar";
import { getTasksForDeal } from "@/lib/queries/tasks";
import { DealArtistsSection } from "@/components/deals/deal-artists-section";
import { DealChargesSection } from "@/components/deals/deal-charges-section";
import { DealResultSection } from "@/components/deals/deal-result-section";
import { DealActions } from "@/components/deals/deal-actions";
import { DealStatusInline } from "@/components/deals/deal-status-inline";
import {
  DealManagementFeesSection,
  type DealManagementFeeRow,
} from "@/components/deals/deal-management-fees-section";
import type { BookingDealArtistRow, BookingDealChargeRow } from "@/lib/deals-list-types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Fiche détail Booking — style KN show (Stan 2026-05-26).
 *
 * Layout :
 *   1. Back link + eyebrow ("BOOKING · {organisateur}")
 *   2. Titre + meta inline (date / heure / lieu / statut)
 *   3. Boutons "Ouvrir la FDR" (placeholder Phase 3.7) + "Modifier" (placeholder)
 *   4. Section Budget (vert recettes)
 *   5. Section Artistes (rouge charges)
 *   6. Section Charges diverses (rouge charges + bouton +)
 *   7. Section Résultat — Marge Youri (card or doré, style RÉPARTITION KN)
 */
export default async function DealBookingDetailPage({ params }: PageProps) {
  const { id } = await params;

  const deal = await prisma.deal.findFirst({
    where: { id, deletedAt: null, category: "BOOKING" },
    include: {
      dealArtistes: {
        where: { deletedAt: null },
        include: {
          artist: { select: { id: true, name: true, slug: true, color: true } },
        },
      },
      dealCharges: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
      },
      managementFees: {
        where: { deletedAt: null },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      },
      createdBy: { select: { name: true } },
    },
  });
  if (!deal) notFound();

  // Pipeline de tâches (Sprint 6 — section "Tâches" inline en haut)
  const tasks = await getTasksForDeal(deal.id);

  // Adapter Prisma → types projection
  const artistes: BookingDealArtistRow[] = deal.dealArtistes.map((da) => ({
    id: da.id,
    amount: da.cachetAmount != null ? Number(da.cachetAmount) : null,
    sharePct: da.sharePct != null ? Number(da.sharePct) : null,
    paymentStatus: da.paymentStatus,
    paidAt: da.paidAt,
    notes: da.notes,
    artist: da.artist,
  }));
  const charges: BookingDealChargeRow[] = deal.dealCharges.map((c) => ({
    id: c.id,
    label: c.label,
    amount: c.amount != null ? Number(c.amount) : null,
    paymentStatus: c.paymentStatus,
    paidAt: c.paidAt,
    notes: c.notes,
  }));

  const budgetAmount = deal.budgetAmount != null ? Number(deal.budgetAmount) : null;
  const totalArtistes = artistes.reduce((acc, a) => acc + (a.amount ?? 0), 0);
  const totalCharges = charges.reduce((acc, c) => acc + (c.amount ?? 0), 0);
  const isEncaisse = deal.budgetPaymentStatus === "PAID";
  // Prérequis amont pour le tag "Dispo pour paiement" sur la section MF
  const allArtistesPaid =
    artistes.length === 0 ||
    artistes.every((a) => a.paymentStatus === "PAID");
  const allChargesPaid =
    charges.length === 0 ||
    charges.every((c) => c.paymentStatus === "PAID");

  // Marge Youri brute (base de calcul des management fees) :
  // Budget − Artistes − Charges. La marge nette Pangee (après MF) est
  // calculée et affichée dans DealResultSection.
  const margeYouriBrute =
    (budgetAmount ?? 0) - totalArtistes - totalCharges;
  const managementFees: DealManagementFeeRow[] = deal.managementFees.map(
    (mf) => ({
      id: mf.id,
      role: mf.role,
      associateKey: mf.associateKey,
      sharePct: Number(mf.sharePct),
      amount: mf.amount != null ? Number(mf.amount) : null,
      paymentStatus: mf.paymentStatus,
      paidAt: mf.paidAt,
      notes: mf.notes,
    }),
  );

  const organizerLabel = deal.organizerName ?? "Sans organisateur";

  return (
    <div className="max-w-5xl space-y-5">
      {/* Back link */}
      <div>
        <Link
          href="/deals/booking"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Deals Booking
        </Link>
      </div>

      {/* Header style KN show */}
      <div className="space-y-3">
        {/* Eyebrow : BOOKING · {organisateur} */}
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          <span>Booking</span>
          <span className="text-muted-foreground/40">·</span>
          <span>{organizerLabel}</span>
        </div>

        {/* Titre */}
        <h1 className="text-3xl font-bold tracking-tight">{deal.title}</h1>

        {/* Meta inline : date / heure / lieu / statut */}
        <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {format(deal.date, "EEEE d MMMM yyyy", { locale: fr })}
          </span>
          {deal.showTime && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {formatShowTime(deal.showTime)}
            </span>
          )}
          {deal.venueCity && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {deal.venueName ? `${deal.venueName} · ` : ""}
              {deal.venueCity}
            </span>
          )}
          <DealStatusInline dealId={deal.id} value={deal.status} />
          <DealPipelineBar dealId={deal.id} tasks={tasks} />
        </div>

        {/* Boutons d'action — pattern KN */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Button asChild type="button" variant="outline" size="sm">
            <Link href={`/deals/booking/${deal.id}/fdr`}>
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Ouvrir la FDR
            </Link>
          </Button>
          <DealActions
            deal={{
              id: deal.id,
              title: deal.title,
              date: deal.date,
              showTime: deal.showTime,
              organizerId: deal.organizerId,
              organizerName: deal.organizerName,
              organizerCompany: deal.organizerCompany,
              organizerCity: deal.organizerCity,
              venueId: deal.venueId,
              venueName: deal.venueName,
              venueCity: deal.venueCity,
              venueAddress: deal.venueAddress,
              notes: deal.notes,
            }}
          />
        </div>
      </div>

      {/* Sections */}
      <DealBudgetSection
        dealId={deal.id}
        budgetAmount={budgetAmount}
        isEncaisse={isEncaisse}
        paidAt={deal.budgetPaidAt}
      />

      <DealArtistsSection
        dealId={deal.id}
        budgetAmount={budgetAmount}
        artistes={artistes}
      />

      <DealChargesSection dealId={deal.id} charges={charges} />

      <DealResultSection
        budgetAmount={budgetAmount}
        totalArtistes={totalArtistes}
        totalCharges={totalCharges}
        isEncaisse={isEncaisse}
      />

      {/* Management fees — reversement Pangee aux associés (Stan 2026-05-26).
          Section APRÈS la marge Youri pour clarté visuelle + footer
          "Marge nette Pangee" qui montre ce qui reste vraiment après MF. */}
      <DealManagementFeesSection
        dealId={deal.id}
        budgetAmount={budgetAmount ?? 0}
        margeYouri={margeYouriBrute}
        fees={managementFees}
        isEncaisse={isEncaisse}
        allArtistesPaid={allArtistesPaid}
        allChargesPaid={allChargesPaid}
      />

      {/* Notes deal globales */}
      {deal.notes && (
        <div className="rounded-md border bg-muted/20 px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Notes
          </div>
          <p className="text-sm whitespace-pre-wrap">{deal.notes}</p>
        </div>
      )}
    </div>
  );
}
