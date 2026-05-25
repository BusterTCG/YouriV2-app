import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, Briefcase, Calendar, MapPin, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  formatEur,
  DEAL_STATUS_LABELS,
  DEAL_STATUS_VARIANT,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_VARIANT,
} from "@/components/deals/deal-helpers";
import { artistInitials } from "@/lib/artists";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Fiche détail d'un deal Booking — Phase 3.4-bis (read-only).
 *
 * Stan 2026-05-26 : "en cliquant sur le deal on arrive sur la fiche du deal
 * où on peut indiquer artiste par artiste, le nom, le montant, le %, le
 * statut paiement et mois de paiement".
 *
 * Édition inline + ajout/suppression d'artistes → Phase 3.5 suivante.
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
      createdBy: { select: { name: true } },
    },
  });
  if (!deal) notFound();

  const totalCachet = deal.dealArtistes.reduce(
    (acc, da) => acc + (da.cachetAmount ? Number(da.cachetAmount) : 0),
    0,
  );
  const totalCommission = deal.dealArtistes.reduce(
    (acc, da) => acc + (da.commissionAmount ? Number(da.commissionAmount) : 0),
    0,
  );

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <Link
          href="/deals/booking"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Retour aux deals Booking
        </Link>
      </div>

      {/* Header : eyebrow + titre + statut */}
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <Briefcase className="h-3.5 w-3.5" />
            Deal Booking · créé par {deal.createdBy?.name ?? "—"}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{deal.title}</h1>
            <Badge variant={DEAL_STATUS_VARIANT[deal.status]} className="shrink-0">
              {DEAL_STATUS_LABELS[deal.status]}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Phase 3.5 ajoutera <DealEditButton /> + <DealDeleteButton /> */}
          <span className="text-xs text-muted-foreground italic">
            Édition (statut deal, méta, artistes) — à venir Phase 3.5
          </span>
        </div>
      </div>

      {/* Méta du deal */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[--yr-gold]" />
              Date & lieu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">
                {format(deal.date, "EEEE d MMMM yyyy", { locale: fr })}
              </span>
            </div>
            {deal.showTime && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Heure</span>
                <span className="font-medium tabular-nums">{deal.showTime}</span>
              </div>
            )}
            {deal.venueName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Lieu
                </span>
                <span className="font-medium text-right">
                  {deal.venueName}
                  {deal.venueCity && (
                    <span className="text-muted-foreground"> · {deal.venueCity}</span>
                  )}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-[--yr-gold]" />
              Organisateur
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {deal.organizerName ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nom</span>
                  <span className="font-medium">{deal.organizerName}</span>
                </div>
                {deal.organizerCompany && deal.organizerCompany !== deal.organizerName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Société</span>
                    <span className="font-medium">{deal.organizerCompany}</span>
                  </div>
                )}
                {deal.organizerCity && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ville</span>
                    <span className="font-medium">{deal.organizerCity}</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground italic">Aucun organisateur renseigné.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tableau artistes — la pièce centrale */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-[--yr-gold]" />
                Artistes du deal ({deal.dealArtistes.length})
              </CardTitle>
              <CardDescription>
                Cachet, commission Pangee et statuts de paiement par artiste.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {deal.dealArtistes.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4">
              Aucun artiste rattaché à ce deal.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[800px] w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium">Artiste</th>
                    <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Cachet</th>
                    <th className="text-right px-2 py-2 font-medium whitespace-nowrap">% com</th>
                    <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Com €</th>
                    <th className="text-left px-2 py-2 font-medium whitespace-nowrap">St. Cachet</th>
                    <th className="text-left px-2 py-2 font-medium whitespace-nowrap">St. Com</th>
                    <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Mois enc.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {deal.dealArtistes.map((da) => {
                    const cachet = da.cachetAmount != null ? Number(da.cachetAmount) : null;
                    const pct = da.commissionPct != null ? Number(da.commissionPct) : null;
                    const com = da.commissionAmount != null ? Number(da.commissionAmount) : null;
                    return (
                      <tr key={da.id}>
                        <td className="px-2 py-2">
                          <Link
                            href={`/artistes/${da.artist.slug}`}
                            className="inline-flex items-center gap-2 hover:underline"
                          >
                            <span
                              className="inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-semibold text-white"
                              style={{ backgroundColor: da.artist.color ?? "#2563eb" }}
                            >
                              {artistInitials(da.artist.name, da.artist.slug).slice(0, 2)}
                            </span>
                            <span className="font-medium">{da.artist.name}</span>
                          </Link>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                          {formatEur(cachet)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                          {pct != null ? `${pct.toLocaleString("fr-FR")} %` : "—"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap text-[--yr-gold] font-medium">
                          {formatEur(com)}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <Badge variant={PAYMENT_STATUS_VARIANT[da.paymentStatus]} className="text-[10px]">
                            {PAYMENT_STATUS_LABELS[da.paymentStatus]}
                          </Badge>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <Badge variant={PAYMENT_STATUS_VARIANT[da.commissionStatus]} className="text-[10px]">
                            {PAYMENT_STATUS_LABELS[da.commissionStatus]}
                          </Badge>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-xs tabular-nums">
                          {da.commissionPaidAt
                            ? format(da.commissionPaidAt, "MMM yyyy", { locale: fr })
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t bg-muted/30 text-xs font-medium">
                  <tr>
                    <td className="px-2 py-2 uppercase tracking-wider text-muted-foreground">Total</td>
                    <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                      {formatEur(totalCachet)}
                    </td>
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap text-[--yr-gold]">
                      {formatEur(totalCommission)}
                    </td>
                    <td className="px-2 py-2" colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {deal.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{deal.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
