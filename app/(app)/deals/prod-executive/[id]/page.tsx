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
  TrendingUp,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getVenue } from "@/lib/kn-client";
import { computeProdExeBrute } from "@/lib/finance/show-financials";
import { getTasksForDeal } from "@/lib/queries/tasks";
import { formatShowTime } from "@/components/deals/deal-helpers";
import { DealActions } from "@/components/deals/deal-actions";
import { DealPipelineBar } from "@/components/tasks/deal-pipeline-bar";
import {
  DealManagementFeesSection,
  type DealManagementFeeRow,
} from "@/components/deals/deal-management-fees-section";
import { DealStatusInline } from "@/components/deals/deal-status-inline";
import {
  ProductionLinesEditor,
  type ProductionLineRow,
  type ArtisteLineRow,
} from "@/components/deals/production-lines-editor";
import { ShowSummaryCard } from "@/components/deals/show-summary-card";
import type { BookingDealArtistRow } from "@/lib/deals-list-types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Fiche détail Prod Exécutive (Sprint 4) — style KN show.
 *
 * Layout :
 *   1. Back link + eyebrow ("PROD EXÉ · {organisateur}")
 *   2. Titre + meta inline (date / heure / lieu / statut)
 *   3. Boutons "Ouvrir la FDR" + DealActions (Modifier / Supprimer)
 *   4. ShowSummaryCard — modèles salle/artiste, jauge, multi-date, suivi op (B4)
 *   5. MultiDatesPicker — liste dates de la tournée (B4)
 *   6. DealArtistsSection — artistes (réutilisé Booking)
 *   7. ProductionLinesEditor — le tableau de prod (B3)
 *   8. (Marge Brute / Part Artiste affichés inline via ProductionLinesEditor)
 *   9. DealManagementFeesSection — MF (réutilisé)
 *   10. Notes
 */
export default async function ProdExecutiveDetailPage({ params }: PageProps) {
  const { id } = await params;

  const deal = await prisma.deal.findFirst({
    where: { id, deletedAt: null, category: "PROD_EXE" },
    include: {
      dealArtistes: {
        where: { deletedAt: null },
        include: {
          artist: { select: { id: true, name: true, slug: true, color: true } },
        },
      },
      productionLines: {
        where: { deletedAt: null },
        orderBy: [{ kind: "asc" }, { order: "asc" }],
      },
      managementFees: {
        where: { deletedAt: null },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      },
      createdBy: { select: { name: true } },
    },
  });
  if (!deal) notFound();

  const tasks = await getTasksForDeal(deal.id);

  // Lieu KN lié (pour le menu déroulant jauge : capacité + sous-salles).
  // Best-effort : si l'API KN est indisponible ou le venue introuvable, on
  // retombe sur l'input libre (venue = null) sans casser la page.
  let venue: {
    id: string;
    name: string;
    capacity: number | null;
    rooms: Array<{ id: string; name: string; capacity: number | null }>;
  } | null = null;
  if (deal.venueId) {
    try {
      const v = await getVenue(deal.venueId);
      venue = {
        id: v.id,
        name: v.name,
        capacity: v.capacity,
        rooms: v.rooms.map((r) => ({
          id: r.id,
          name: r.name,
          capacity: r.capacity,
        })),
      };
    } catch {
      venue = null;
    }
  }

  // Projection artistes (multi-artiste)
  const artistes: BookingDealArtistRow[] = deal.dealArtistes.map((da) => ({
    id: da.id,
    amount: da.cachetAmount != null ? Number(da.cachetAmount) : null,
    sharePct: da.sharePct != null ? Number(da.sharePct) : null,
    paymentStatus: da.paymentStatus,
    paidAt: da.paidAt,
    notes: da.notes,
    artist: da.artist,
  }));

  // Agrégats lignes prod (pour la marge + section MF).
  // Stan 2026-05-27 audit : aligné EXACTEMENT sur la logique de `lib/prod-
  // executive-list.ts` — `allRevenuePaid` compte UNIQUEMENT les recettes
  // significatives (amount > 0), sinon une ligne RECETTE_HT à 0 non-PAID
  // (créée puis vidée) bloque le statut alors que la liste l'ignore.
  let totalRevenue = 0;
  let totalCost = 0;
  let revenueLineCount = 0;
  let revenuePaidCount = 0;
  let allCostPaid = true;
  for (const l of deal.productionLines) {
    if (l.coveredByVenue) continue;
    const amt = l.amount != null ? Number(l.amount) : 0;
    if (l.kind === "REVENUE") {
      totalRevenue += amt;
      if (amt > 0) {
        revenueLineCount += 1;
        if (l.paymentStatus === "PAID") revenuePaidCount += 1;
      }
    } else {
      totalCost += amt;
      if (amt > 0 && l.paymentStatus !== "PAID") allCostPaid = false;
    }
  }
  const allRevenuePaid =
    revenueLineCount > 0 && revenuePaidCount === revenueLineCount;

  // Marge Pangee (avant MF) = commission € (scalar recalculé) ou fallback live calc.
  const commissionAmount =
    deal.commissionAmount != null
      ? Number(deal.commissionAmount)
      : computeProdExeBrute(
          totalRevenue,
          deal.prodExePct != null ? Number(deal.prodExePct) : 15,
        );
  const margePangee = commissionAmount; // base MF = ce que Pangee retient sur le CA

  // Pour la section MF : isEncaisse = au moins 1 RECETTE_HT PAID
  // (cf. règle Stan : MF "Dispo paiement" quand budget+artistes+charges OK).
  const allArtistesPaid =
    artistes.length === 0 || artistes.every((a) => a.paymentStatus === "PAID");

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

  const organizerLabel = deal.organizerName ?? "Sans organisateur";

  return (
    <div className="max-w-5xl space-y-5">
      {/* Breadcrumb + back — pattern fidèle KN show (text-xs simple) */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link
          href="/deals/prod-executive"
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Productions
        </Link>
      </div>

      {/* Header style KN show — titre text-2xl, meta inline + boutons sur
          ligne dédiée. Tailles alignées sur KuroNeko-App. */}
      <div className="space-y-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <TrendingUp className="h-3.5 w-3.5" />
            Prod Exécutive
            {organizerLabel !== "Sans organisateur" && (
              <>
                {" "}·{" "}<span>{organizerLabel}</span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {deal.title}
          </h1>
          <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1 capitalize">
              <Calendar className="h-3.5 w-3.5" />
              {deal.isMultiDate
                ? format(deal.date, "MMMM yyyy", { locale: fr })
                : format(deal.date, "EEEE d MMMM yyyy", { locale: fr })}
              {deal.isMultiDate && deal.performanceCount && (
                <span className="text-muted-foreground/70 normal-case">
                  · {deal.performanceCount} repr.
                </span>
              )}
            </span>
            {deal.showTime && (
              <span className="inline-flex items-center gap-1 normal-case">
                <Clock className="h-3.5 w-3.5" />
                {formatShowTime(deal.showTime)}
                {deal.endTime && (
                  <>
                    <span className="text-muted-foreground/40 mx-0.5">→</span>
                    {formatShowTime(deal.endTime)}
                  </>
                )}
              </span>
            )}
            {deal.venueCity && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {deal.venueName ? `${deal.venueName} · ` : ""}
                {deal.venueCity}
              </span>
            )}
            <DealStatusInline dealId={deal.id} value={deal.status} />
            <DealPipelineBar dealId={deal.id} tasks={tasks} />
          </div>
        </div>
        {/* Boutons d'action : FDR en or doré (CTA principal KN-style)
            + Modifier/Supprimer en outline discret */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/deals/booking/${deal.id}/fdr`}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors shadow-sm bg-yr-gold text-[#1a2540] hover:bg-yr-gold/90"
          >
            <FileText className="h-4 w-4" />
            Ouvrir la FDR
          </Link>
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
              // Champs Prod Exé pour pré-remplir le dialog d'édition
              category: deal.category,
              status: deal.status,
              showName: deal.showName,
              isMultiDate: deal.isMultiDate,
              venueDealKind: deal.venueDealKind,
              prodExePct: deal.prodExePct != null ? Number(deal.prodExePct) : null,
              // Artiste principal (1er DealArtiste actif) — éditable depuis le dialog
              artistId: deal.dealArtistes[0]?.artist.id ?? null,
              artistName: deal.dealArtistes[0]?.artist.name ?? null,
            }}
          />
        </div>
      </div>

      {/* ShowSummaryCard — copie fidèle KN (modèle salle, suivi op, mois
          complet, jauge/payants/% remplissage/ticket moyen) */}
      <ShowSummaryCard
        dealId={deal.id}
        dealDate={deal.date}
        capacity={deal.capacity}
        paying={deal.paying}
        venue={venue}
        venueRoomId={deal.venueRoomId}
        venueDealKind={deal.venueDealKind}
        prodExePct={deal.prodExePct != null ? Number(deal.prodExePct) : null}
        coRealKnPct={deal.coRealKnPct != null ? Number(deal.coRealKnPct) : null}
        coRealGrossCa={
          deal.coRealGrossCa != null ? Number(deal.coRealGrossCa) : null
        }
        isMultiDate={deal.isMultiDate}
        performanceCount={deal.performanceCount}
        multiDateDates={
          Array.isArray(deal.multiDateDates)
            ? (deal.multiDateDates as string[]).filter(
                (d): d is string => typeof d === "string",
              )
            : []
        }
        contractSigned={deal.contractSigned}
        ticketingReady={deal.ticketingReady}
        vhrBooked={deal.vhrBooked}
        ticketingUrl={deal.ticketingUrl}
        totalRevenue={totalRevenue}
      />

      {/* Tableau de production — recettes + charges + Cachet Art. inline */}
      <ProductionLinesEditor
        dealId={deal.id}
        initialLines={deal.productionLines.map<ProductionLineRow>((l) => ({
          id: l.id,
          kind: l.kind,
          label: l.label,
          customLabel: l.customLabel,
          amount: l.amount != null ? Number(l.amount) : 0,
          status: l.paymentStatus,
          paidAt: l.paidAt,
          comment: l.comment,
          coveredByVenue: l.coveredByVenue,
        }))}
        venueDealKind={deal.venueDealKind}
        prodExePct={deal.prodExePct != null ? Number(deal.prodExePct) : null}
        artistes={deal.dealArtistes.map<ArtisteLineRow>((da) => ({
          id: da.id,
          artistName: da.artist.name,
          artistColor: da.artist.color,
          cachetAmount: da.cachetAmount != null ? Number(da.cachetAmount) : null,
          paymentStatus: da.paymentStatus,
        }))}
        artistStatus={deal.artistStatus}
      />

      {/* Box "Marge Brute Pangee" — style identique au footer Booking,
          sert de base au calcul des Management Fees ci-dessous (Stan 2026-05-27). */}
      <div className="rounded-md border bg-card overflow-hidden">
        <div className="px-4 py-3 flex justify-between items-baseline">
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-emerald-700 dark:text-emerald-400">
              = Marge Brute
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {allRevenuePaid && totalRevenue > 0
                ? "✓ Marge réalisée (recettes encaissées)"
                : "⏳ En attente (recettes non encaissées)"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {commissionAmount.toLocaleString("fr-FR", {
                style: "currency",
                currency: "EUR",
                maximumFractionDigits: 0,
              })}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {deal.prodExePct != null ? Number(deal.prodExePct) : 15}% du CA
            </div>
          </div>
        </div>
      </div>

      {/* Management fees — base MF = commission Pangee (avant MF) */}
      <DealManagementFeesSection
        dealId={deal.id}
        budgetAmount={totalRevenue || 0}
        margeYouri={margePangee}
        fees={managementFees}
        isEncaisse={allRevenuePaid}
        allArtistesPaid={allArtistesPaid}
        allChargesPaid={allCostPaid}
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
