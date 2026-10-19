import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { DealBudgetSection } from "@/components/deals/deal-budget-section";
import { DealPipelineBar } from "@/components/tasks/deal-pipeline-bar";
import { getTasksForDeal } from "@/lib/queries/tasks";
import { DealArtistsSection } from "@/components/deals/deal-artists-section";
import { DealChargesSection } from "@/components/deals/deal-charges-section";
import { DealResultSection } from "@/components/deals/deal-result-section";
import type { DealInstallmentRow } from "@/lib/actions/deal-installments";
import { DealActions } from "@/components/deals/deal-actions";
import { DealStatusInline } from "@/components/deals/deal-status-inline";
import {
  DealManagementFeesSection,
  type DealManagementFeeRow,
} from "@/components/deals/deal-management-fees-section";
import type { BookingDealArtistRow, BookingDealChargeRow } from "@/lib/deals-list-types";
import { requireUser } from "@/lib/auth/users";
import { isRestrictedRole } from "@/lib/auth/roles";
import { BookingReadonlyCard } from "@/components/deals/booking-readonly-card";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Fiche détail Booking — style KN show (Stan 2026-05-26).
 *
 * Layout :
 *   1. Back link + eyebrow ("BOOKING · {organisateur}")
 *   2. Titre + étapes, puis carte d'infos générales (Stan 2026-10-19)
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
          cashAdvance: { select: { date: true, production: { select: { id: true, name: true } } } },
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
      installments: {
        orderBy: { sortOrder: "asc" },
      },
      createdBy: { select: { name: true } },
    },
  });
  if (!deal) notFound();

  // Profil Production (Nour, Stan 2026-10-16) : infos du deal sans le CA ni
  // la marge ; FDR, artistes (sans %, Stan 2026-10-19) et charges en accès
  // complet.
  const user = await requireUser();

  // Formulaire « Modifier » (infos générales) et carte d'infos : communs à
  // tous les comptes (Stan 2026-10-19).
  const formDeal = {
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
    endTime: deal.endTime,
    brand: deal.brand,
    notes: deal.notes,
    category: deal.category,
    status: deal.status,
  };
  const info = {
    status: deal.status,
    date: deal.date,
    showTime: deal.showTime,
    endTime: deal.endTime,
    venue: [deal.venueName, deal.venueCity].filter(Boolean).join(" · ") || null,
    organizer: [deal.organizerName, deal.organizerCompany].filter(Boolean).join(" · ") || null,
    brand: deal.brand,
    address: deal.venueAddress,
    notes: deal.notes,
  };

  if (isRestrictedRole(user.role)) {
    const myFees = deal.managementFees.filter((mf) => mf.associateKey === user.pangeeKey);
    return (
      <div className="max-w-5xl space-y-5">
        <div>
          <Link
            href="/deals/booking"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Deals Booking
          </Link>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            <span>Booking</span>
            <span className="text-muted-foreground/40">·</span>
            <span>{deal.organizerName ?? "Sans organisateur"}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{deal.title}</h1>
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Button asChild type="button" variant="outline" size="sm">
              <Link href={`/deals/booking/${deal.id}/fdr`}>
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Ouvrir la FDR
              </Link>
            </Button>
            <DealActions deal={formDeal} restricted />
          </div>
        </div>
        <BookingReadonlyCard
          deal={{
            ...info,
            marginPaid: deal.budgetPaymentStatus === "PAID",
            mf:
              myFees.length > 0
                ? {
                    amount: myFees.reduce((acc, mf) => acc + (mf.amount != null ? Number(mf.amount) : 0), 0),
                    paid: myFees.every((mf) => mf.paymentStatus === "PAID"),
                  }
                : null,
          }}
        />
        {/* Pas de budget ni de % transmis au navigateur : ils donneraient le CA. */}
        <DealArtistsSection
          dealId={deal.id}
          budgetAmount={null}
          hidePct
          artistes={deal.dealArtistes.map((da) => ({
            id: da.id,
            amount: da.cachetAmount != null ? Number(da.cachetAmount) : null,
            sharePct: null,
            paymentStatus: da.paymentStatus,
            paidAt: da.paidAt,
            notes: da.notes,
            artist: da.artist,
            cashAdvance: da.cashAdvance
              ? {
                  productionId: da.cashAdvance.production.id,
                  productionName: da.cashAdvance.production.name,
                  date: da.cashAdvance.date,
                }
              : null,
          }))}
        />
        <DealChargesSection
          dealId={deal.id}
          charges={deal.dealCharges.map((c) => ({
            id: c.id,
            label: c.label,
            amount: c.amount != null ? Number(c.amount) : null,
            paymentStatus: c.paymentStatus,
            paidAt: c.paidAt,
            notes: c.notes,
          }))}
        />
      </div>
    );
  }

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
    cashAdvance: da.cashAdvance
      ? {
          productionId: da.cashAdvance.production.id,
          productionName: da.cashAdvance.production.name,
          date: da.cashAdvance.date,
        }
      : null,
  }));
  const charges: BookingDealChargeRow[] = deal.dealCharges.map((c) => ({
    id: c.id,
    label: c.label,
    amount: c.amount != null ? Number(c.amount) : null,
    paymentStatus: c.paymentStatus,
    paidAt: c.paidAt,
    notes: c.notes,
  }));

  const installments: DealInstallmentRow[] = deal.installments.map((i) => ({
    id: i.id,
    label: i.label,
    amount: i.amount != null ? Number(i.amount) : null,
    dueDate: i.dueDate,
    paymentStatus: i.paymentStatus,
    paidAt: i.paidAt,
    sortOrder: i.sortOrder,
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

        {/* Étapes du deal (date, lieu, statut : carte d'infos ci-dessous) */}
        <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
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
          <DealActions deal={formDeal} />
        </div>
      </div>

      <BookingReadonlyCard
        statusSlot={<DealStatusInline dealId={deal.id} value={deal.status} />}
        deal={info}
      />

      {/* Section CA (ex-Budget) — inclut l'échéancier de paiement intégré
          (Stan 2026-06-13). Quand des tranches existent, elles pilotent
          l'encaissement du CA. */}
      <DealBudgetSection
        dealId={deal.id}
        budgetAmount={budgetAmount}
        isEncaisse={isEncaisse}
        paidAt={deal.budgetPaidAt}
        installments={installments}
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

    </div>
  );
}
