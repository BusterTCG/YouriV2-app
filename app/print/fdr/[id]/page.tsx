import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { prisma } from "@/lib/db";
import { BriefingPrintView } from "@/components/briefings/briefing-print-view";

interface PageProps {
  params: Promise<{ id: string }>;
  /** `?preview=1` → on n'ouvre PAS automatiquement le dialog d'impression
   *  (mode visualisation pure depuis la FDR). Sans ce param, l'impression
   *  se déclenche à 800 ms du chargement (UX historique "Imprimer / PDF"). */
  searchParams: Promise<{ preview?: string }>;
}

/**
 * Page d'impression FDR — Sprint 3.7 Lot C1.
 *
 * Copie fidèle KN `/print/fdr/[showId]` adaptée Pangee multi-artiste :
 *   - Header liste tous les artistes du deal (KN solo → Pangee N artistes)
 *   - Adresse du lieu utilise briefing.venueAddress (snapshot BAN)
 *   - Lien retour vers /deals/booking/[id]/fdr (vs /shows/[id]/briefing KN)
 *
 * Format métier du title (= nom de fichier PDF suggéré par le navigateur) :
 *   "FDR {Artistes} - {Lieu} {DDMMYY}"
 *   ex. "FDR Boriss, Nordine Ganso - Comedy Club 050926"
 */

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const deal = await prisma.deal.findFirst({
    where: { id, deletedAt: null, category: "BOOKING" },
    select: {
      date: true,
      venueCity: true,
      venueName: true,
      briefing: { select: { venueName: true, venueCity: true } },
      dealArtistes: {
        where: { deletedAt: null },
        select: { artist: { select: { name: true } } },
      },
    },
  });
  if (!deal) return { title: "FDR" };
  const lieu =
    deal.briefing?.venueName ?? deal.venueName ?? deal.venueCity ?? "Lieu";
  const dateStr = format(deal.date, "ddMMyy", { locale: fr });
  const artistesStr = deal.dealArtistes
    .map((da) => da.artist.name)
    .join(", ");
  return {
    title: `FDR ${artistesStr || "—"} - ${lieu} ${dateStr}`,
  };
}

export default async function BriefingPrintPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { preview } = await searchParams;
  const previewMode = preview === "1";

  const deal = await prisma.deal.findFirst({
    where: { id, deletedAt: null, category: "BOOKING" },
    include: {
      dealArtistes: {
        where: { deletedAt: null },
        include: {
          artist: { select: { id: true, name: true, color: true } },
        },
      },
      briefing: {
        include: {
          travels: { orderBy: [{ date: "asc" }, { fromTime: "asc" }] },
          contacts: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (!deal) notFound();

  return (
    <BriefingPrintView
      dealId={id}
      previewMode={previewMode}
      deal={{
        title: deal.title,
        date: deal.date,
        venueCity: deal.venueCity,
        artists: deal.dealArtistes.map((da) => ({
          name: da.artist.name,
          color: da.artist.color,
        })),
      }}
      briefing={
        deal.briefing
          ? {
              showTime: deal.briefing.showTime,
              balanceTime: deal.briefing.balanceTime,
              venueName: deal.briefing.venueName,
              venueCity: deal.briefing.venueCity,
              venueAddress: deal.briefing.venueAddress,
              capacity: deal.briefing.capacity,
              hotelName: deal.briefing.hotelName,
              hotelAddress: deal.briefing.hotelAddress,
              restaurantName: deal.briefing.restaurantName,
              restaurantAddress: deal.briefing.restaurantAddress,
              restaurantCovered: deal.briefing.restaurantCovered,
              perDiemFlag: deal.briefing.perDiemFlag,
              perDiemAmount: deal.briefing.perDiemAmount
                ? Number(deal.briefing.perDiemAmount)
                : null,
              notes: deal.briefing.notes,
              travels: deal.briefing.travels.map((t) => ({
                direction: t.direction,
                date: t.date,
                fromStation: t.fromStation,
                fromTime: t.fromTime,
                toStation: t.toStation,
                toTime: t.toTime,
                comment: t.comment,
                runs: Array.isArray(t.runs)
                  ? (t.runs as unknown[]).filter(
                      (r): r is { location: string; time: string } =>
                        typeof r === "object" &&
                        r !== null &&
                        typeof (r as Record<string, unknown>).location ===
                          "string" &&
                        typeof (r as Record<string, unknown>).time === "string",
                    )
                  : [],
              })),
              // Email retiré (Stan 2026-05-26 : "Enlever le mail de la FDR")
              contacts: deal.briefing.contacts.map((c) => ({
                role: c.role,
                firstName: c.firstName,
                lastName: c.lastName,
                company: c.company,
                phone: c.phone,
              })),
            }
          : null
      }
    />
  );
}
