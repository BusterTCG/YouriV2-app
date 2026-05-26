import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ChevronLeft,
  FileText,
  Calendar,
  MapPin,
  Sparkles,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { ensureBriefingWithPrefill } from "@/lib/actions/briefings";
import { artistInitials } from "@/lib/artists";
import { formatShowTime } from "@/components/deals/deal-helpers";
import { BriefingEditor } from "@/components/briefings/briefing-editor";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Page FDR (Feuille de route) d'un deal Booking — Sprint 3.7 Lot A.
 *
 * Lot A = page placeholder qui valide l'archi (ensureBriefingWithPrefill
 * marche, la nav fonctionne, le breadcrumb est correct). L'éditeur complet
 * (lieu/hôtel/resto/per diem/trajets/contacts) arrive au Lot B.
 *
 * Pré-création FDR : `ensureBriefingWithPrefill` est appelée avant le
 * rendu — crée la FDR si absente avec prefill venue + showTime +
 * organisateur en BriefingContact rôle ORGANISATEUR. Opération idempotente.
 */
export default async function FdrPage({ params }: PageProps) {
  const { id } = await params;

  // Idempotent : crée la FDR si absente + prefill depuis le deal.
  await ensureBriefingWithPrefill(id);

  const deal = await prisma.deal.findFirst({
    where: { id, deletedAt: null, category: "BOOKING" },
    include: {
      dealArtistes: {
        where: { deletedAt: null },
        include: {
          artist: { select: { id: true, name: true, slug: true, color: true } },
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

  if (!deal || !deal.briefing) notFound();
  const briefing = deal.briefing;

  return (
    <div className="max-w-5xl space-y-5">
      {/* Breadcrumb — préserve la nav retour */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link
          href="/deals/booking"
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3 w-3" />
          Deals Booking
        </Link>
        <span>/</span>
        <Link
          href={`/deals/booking/${id}`}
          className="hover:text-foreground transition-colors truncate max-w-xs"
        >
          {deal.title}
        </Link>
        <span>/</span>
        <span className="text-foreground">FDR</span>
      </div>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          <FileText className="h-3.5 w-3.5" />
          Feuille de route
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{deal.title}</h1>

        {/* Meta inline — date / lieu / artistes */}
        <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {format(deal.date, "EEEE d MMMM yyyy", { locale: fr })}
          </span>
          {(briefing.venueName || briefing.venueCity || deal.venueName) && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {briefing.venueName
                ? `${briefing.venueName}${briefing.venueCity ? ` · ${briefing.venueCity}` : ""}`
                : `${deal.venueName ?? ""}${deal.venueCity ? ` · ${deal.venueCity}` : ""}`}
            </span>
          )}
          {deal.dealArtistes.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              {deal.dealArtistes.length} artiste
              {deal.dealArtistes.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Liste des artistes destinataires (affichage seul, pas d'édition).
          Sert de rappel visuel : la FDR sera envoyée à ces personnes. */}
      {deal.dealArtistes.length > 0 && (
        <div className="rounded-md border bg-muted/10 p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            Destinataires (artistes du deal)
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {deal.dealArtistes.map((da) => (
              <Link
                key={da.id}
                href={`/artistes/${da.artist.slug}`}
                className="inline-flex items-center gap-2 hover:underline"
              >
                <span
                  className="inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-semibold text-white shrink-0"
                  style={{ backgroundColor: da.artist.color ?? "#2563eb" }}
                >
                  {artistInitials(da.artist.name, da.artist.slug).slice(0, 2)}
                </span>
                <span className="text-sm font-medium">{da.artist.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Éditeur FDR — Lots B1 (spectacle/héberg/notes) + B2 (trajets)
          + B3 (contacts). Reste à venir : Lot C (génération PDF) et
          Lot D (envoi mail aux artistes). */}
      <BriefingEditor
        dealId={id}
        briefing={{
          id: briefing.id,
          showTime: briefing.showTime,
          balanceTime: briefing.balanceTime,
          venueId: briefing.venueId,
          venueName: briefing.venueName,
          venueCity: briefing.venueCity,
          venueAddress: briefing.venueAddress,
          capacity: briefing.capacity,
          hotelName: briefing.hotelName,
          hotelAddress: briefing.hotelAddress,
          restaurantName: briefing.restaurantName,
          restaurantAddress: briefing.restaurantAddress,
          restaurantCovered: briefing.restaurantCovered,
          perDiemFlag: briefing.perDiemFlag,
          perDiemAmount: briefing.perDiemAmount
            ? Number(briefing.perDiemAmount)
            : null,
          notes: briefing.notes,
          status: briefing.status,
        }}
        showTimeFromDeal={formatShowTime(deal.showTime)}
        artistName={
          deal.dealArtistes.length === 1
            ? deal.dealArtistes[0].artist.name
            : `les artistes du deal`
        }
        travels={briefing.travels.map((t) => ({
          id: t.id,
          direction: t.direction,
          date: t.date,
          fromStation: t.fromStation,
          fromTime: t.fromTime,
          toStation: t.toStation,
          toTime: t.toTime,
          comment: t.comment,
          // runs : JSON → array {location, time} filtré (sécurité côté lecture).
          runs: Array.isArray(t.runs)
            ? (t.runs as unknown[]).filter(
                (r): r is { location: string; time: string } =>
                  typeof r === "object" &&
                  r !== null &&
                  typeof (r as Record<string, unknown>).location === "string" &&
                  typeof (r as Record<string, unknown>).time === "string",
              )
            : [],
        }))}
        eventDate={deal.date}
        showCity={briefing.venueCity ?? deal.venueCity ?? ""}
        contacts={briefing.contacts.map((c) => ({
          id: c.id,
          contactId: c.contactId,
          firstName: c.firstName,
          lastName: c.lastName,
          company: c.company,
          phone: c.phone,
          email: c.email,
          role: c.role,
        }))}
      />
    </div>
  );
}
