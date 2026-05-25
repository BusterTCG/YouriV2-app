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
          <span className="text-muted-foreground/40">·</span>
          <span className="inline-flex items-center gap-1 rounded-md border bg-muted/20 px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium">
            {briefing.status === "DRAFT" && "📝 Brouillon"}
            {briefing.status === "COMPLETE" && "✅ Complète"}
            {briefing.status === "SENT" && "📧 Envoyée"}
          </span>
        </div>
      </div>

      {/* Liste des artistes destinataires (affichage seul, pas d'édition) */}
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

      {/* Placeholder éditeur Lot B */}
      <div className="rounded-md border-2 border-dashed border-muted-foreground/30 bg-muted/10 p-8 text-center space-y-3">
        <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto" />
        <div>
          <h2 className="text-base font-semibold mb-1">
            Éditeur FDR — à venir Lot B
          </h2>
          <p className="text-sm text-muted-foreground">
            La FDR a été créée (id <code className="text-xs bg-muted/40 px-1 rounded">{briefing.id.slice(0, 8)}…</code>)
            avec un prefill depuis le deal :
          </p>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 text-left max-w-md mx-auto">
          <li>
            <strong>Lieu :</strong>{" "}
            {briefing.venueName ?? <em>(non renseigné)</em>}
            {briefing.venueCity && <> · {briefing.venueCity}</>}
          </li>
          <li>
            <strong>Heure show :</strong>{" "}
            {briefing.showTime ?? <em>(non renseignée)</em>}
          </li>
          <li>
            <strong>Contacts auto-ajoutés :</strong>{" "}
            {briefing.contacts.length === 0
              ? <em>aucun</em>
              : briefing.contacts.map((c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.company || "—").join(", ")}
          </li>
          <li>
            <strong>Trajets :</strong>{" "}
            {briefing.travels.length === 0
              ? <em>aucun</em>
              : `${briefing.travels.length} trajet(s)`}
          </li>
        </ul>
        <p className="text-[11px] text-muted-foreground/70 italic pt-2">
          Lot B livrera l&apos;éditeur inline complet (lieu / hôtel / restaurant
          / per diem / trajets / contacts / notes) au pattern KN show.
          <br />
          Puis Lot C — génération PDF, Lot D — envoi mail aux artistes.
        </p>
      </div>
    </div>
  );
}
