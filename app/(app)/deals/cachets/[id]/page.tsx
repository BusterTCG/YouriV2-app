import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, Calendar, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { DealActions } from "@/components/deals/deal-actions";
import {
  DealManagementFeesSection,
  type DealManagementFeeRow,
} from "@/components/deals/deal-management-fees-section";
import { DealStatusInline } from "@/components/deals/deal-status-inline";
import { CachetArtisteSection } from "@/components/deals/cachet-artiste-section";
import { CachetMargeSection } from "@/components/deals/cachet-marge-section";
import {
  CachetPrestationsEditor,
  type CachetPrestationRow,
} from "@/components/deals/cachet-prestations-editor";
import type { BookingDealArtistRow } from "@/lib/deals-list-types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Fiche détail Cachets — Sprint 5, Stan 2026-05-28.
 *
 * Layout :
 *   1. Back link + eyebrow ("CACHETS · {prestataires si N≤2}")
 *   2. Titre + meta (mois, statut deal)
 *   3. DealActions (Modifier / Supprimer → /deals/cachets)
 *   4. Section Prestations (CachetPrestationsEditor — multi-lignes inline)
 *   5. Section Artiste (DealArtistsSection réutilisé Booking) — 1 ligne
 *   6. Section Management Fees (sauf si linkedToOwnProd)
 *   7. Notes
 */
export default async function CachetDetailPage({ params }: PageProps) {
  const { id } = await params;

  const deal = await prisma.deal.findFirst({
    where: { id, deletedAt: null, category: "CACHETS" },
    include: {
      dealArtistes: {
        where: { deletedAt: null },
        include: {
          artist: { select: { id: true, name: true, slug: true, color: true } },
        },
      },
      cachetPrestations: {
        where: { deletedAt: null },
        orderBy: { order: "asc" },
      },
      managementFees: {
        where: { deletedAt: null },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      },
      createdBy: { select: { name: true } },
    },
  });
  if (!deal) notFound();

  // Projection artistes (1 par deal Cachets)
  const artistes: BookingDealArtistRow[] = deal.dealArtistes.map((da) => ({
    id: da.id,
    amount: da.cachetAmount != null ? Number(da.cachetAmount) : null,
    sharePct: da.sharePct != null ? Number(da.sharePct) : null,
    paymentStatus: da.paymentStatus,
    paidAt: da.paidAt,
    notes: da.notes,
    artist: da.artist,
  }));

  // Projection prestations
  const prestations: CachetPrestationRow[] = deal.cachetPrestations.map((p) => ({
    id: p.id,
    prestataire: p.prestataire,
    amount: p.amount != null ? Number(p.amount) : null,
    paymentStatus: p.paymentStatus,
    paidAt: p.paidAt,
    notes: p.notes,
    order: p.order,
  }));

  const cachetsFeesPct =
    deal.cachetsFeesPct != null ? Number(deal.cachetsFeesPct) : 10;
  const linkedToOwnProd = deal.linkedToOwnProd;

  // Σ prestations actives (= budget total facturé)
  const totalBudget = prestations.reduce(
    (acc, p) => acc + (p.amount ?? 0),
    0,
  );
  // Marge Brute Pangee = totalBudget × cachetsFeesPct%. 0 si linkedToOwnProd.
  const margeBrute = linkedToOwnProd
    ? 0
    : Math.round((totalBudget * cachetsFeesPct) / 100);

  // Statut prestations (allPrestationsPaid)
  const significantPrestations = prestations.filter((p) => (p.amount ?? 0) > 0);
  const allPrestationsPaid =
    significantPrestations.length > 0 &&
    significantPrestations.every((p) => p.paymentStatus === "PAID");

  const managementFees: DealManagementFeeRow[] = deal.managementFees.map((mf) => ({
    id: mf.id,
    role: mf.role,
    associateKey: mf.associateKey,
    sharePct: Number(mf.sharePct),
    amount: mf.amount != null ? Number(mf.amount) : null,
    paymentStatus: mf.paymentStatus,
    paidAt: mf.paidAt,
    notes: mf.notes,
  }));

  // Eyebrow : nom du 1er prestataire (court) ou compte si N>2
  const prestaLabel =
    prestations.length === 0
      ? "Sans prestataire"
      : prestations.length === 1
        ? prestations[0].prestataire || "Prestataire à compléter"
        : prestations.length === 2
          ? `${prestations[0].prestataire} · ${prestations[1].prestataire}`
          : `${prestations.length} prestataires`;

  return (
    <div className="max-w-5xl space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link
          href="/deals/cachets"
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Cachets
        </Link>
      </div>

      {/* Header — style KN show */}
      <div className="space-y-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <Wallet className="h-3.5 w-3.5" />
            Cachets
            {prestaLabel !== "Sans prestataire" && (
              <>
                {" "}·{" "}<span className="normal-case">{prestaLabel}</span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {deal.title}
          </h1>
          <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1 capitalize">
              <Calendar className="h-3.5 w-3.5" />
              {format(deal.date, "MMMM yyyy", { locale: fr })}
            </span>
            <DealStatusInline dealId={deal.id} value={deal.status} />
            {linkedToOwnProd && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs whitespace-nowrap text-amber-700 dark:text-amber-400">
                🎭 Spectacle interne (pas de marge / MF)
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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
              category: deal.category,
              status: deal.status,
              artistId: artistes[0]?.artist.id ?? null,
              artistName: artistes[0]?.artist.name ?? null,
              cachetsFeesPct,
              linkedToOwnProd,
            }}
          />
        </div>
      </div>

      {/* Section Prestations — uniquement si pas linkedToOwnProd */}
      {!linkedToOwnProd && (
        <CachetPrestationsEditor
          dealId={deal.id}
          prestations={prestations}
          cachetsFeesPct={cachetsFeesPct}
        />
      )}

      {/* Section Artiste — cachet brut auto-calculé + net estimé + case Payé */}
      <CachetArtisteSection
        dealId={deal.id}
        artiste={artistes[0] ?? null}
        totalBudget={totalBudget}
        cachetsFeesPct={cachetsFeesPct}
        linkedToOwnProd={linkedToOwnProd}
      />

      {/* Box Marge Brute — placée AVANT les MF pour cohérence Booking/Prod Exé. */}
      {!linkedToOwnProd && totalBudget > 0 && (
        <CachetMargeSection
          totalBudget={totalBudget}
          cachetsFeesPct={cachetsFeesPct}
          allPrestationsPaid={allPrestationsPaid}
        />
      )}

      {/* Section Management Fees — masquée si linkedToOwnProd (0 marge).
          Cachets : pas de "charges" donc allChargesPaid forcé true. */}
      {!linkedToOwnProd && (
        <DealManagementFeesSection
          dealId={deal.id}
          budgetAmount={totalBudget}
          margeYouri={margeBrute}
          fees={managementFees}
          isEncaisse={allPrestationsPaid}
          allArtistesPaid={
            artistes.length === 0 ||
            artistes
              .filter((a) => (a.amount ?? 0) > 0)
              .every((a) => a.paymentStatus === "PAID")
          }
          allChargesPaid={true}
        />
      )}

      {/* Bandeau "linkedToOwnProd" : explication + total cachet à verser */}
      {linkedToOwnProd && totalBudget === 0 && (
        <div className="rounded-md border border-dashed bg-amber-500/5 border-amber-500/30 px-3 py-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">
            🎭 Ce cachet est lié à un spectacle produit par Pangee.
          </p>
          <p>
            Saisis directement le montant du cachet brut versé à l&apos;artiste
            dans la section ci-dessus. Pas de prestation à facturer, pas de
            marge ni MF — juste la trace administrative pour la paie GUSO.
          </p>
        </div>
      )}

      {/* Notes */}
      {deal.notes && (
        <div className="rounded-md border bg-card px-3 py-2 text-sm">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Notes
          </div>
          <div className="whitespace-pre-wrap">{deal.notes}</div>
        </div>
      )}
    </div>
  );
}
