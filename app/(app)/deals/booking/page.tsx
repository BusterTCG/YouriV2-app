import { Briefcase, ArrowLeft } from "lucide-react";
import Link from "next/link";
import {
  getBookingDealsList,
  parsePeriod,
  parseStatus,
  PERIOD_PRESET_OPTIONS,
} from "@/lib/deals-list";
import { DealsFilters } from "@/components/deals/deals-filters";
import { DealsTotals } from "@/components/deals/deals-totals";
import { BookingDealsList } from "@/components/deals/booking-deals-list";
import { NewDealButton } from "@/components/deals/new-deal-button";
import { PrivacyToggle } from "@/components/dashboard/privacy-toggle";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Booking — Youri Prod",
};

interface BookingPageProps {
  searchParams: Promise<{
    period?: string;
    status?: string;
    artist?: string;
  }>;
}

/**
 * Liste des deals Booking (cession/booking, mono-date). Strictement filtrée
 * sur `category=BOOKING`. Filtres URL-driven : période / statut / artiste.
 *
 * Sprint 3.4 = vue lecture seule. Le bouton "+ Nouveau deal" + édition
 * inline arrivent Phase 3.5 (form composite avec lignes DealArtiste).
 */
export default async function BookingPage({ searchParams }: BookingPageProps) {
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const status = parseStatus(sp.status);
  const artistSlug = sp.artist && sp.artist !== "all" ? sp.artist : null;

  const data = await getBookingDealsList({ period, status, artistSlug });

  const periodLabel =
    PERIOD_PRESET_OPTIONS.find((o) => o.value === period)?.label ?? "Tout";

  return (
    <div className="max-w-[1400px] space-y-5">
      <div>
        <Link
          href="/deals"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Toutes catégories
        </Link>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <Briefcase className="h-3.5 w-3.5" />
            Booking · {data.totals.count} deal{data.totals.count > 1 ? "s" : ""}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Booking</h1>
          <p className="text-muted-foreground text-sm">
            Cession / booking d&apos;artistes auprès d&apos;organisateurs
            (mono-date). Multi-artiste supporté — cachet + commission Youri
            par artiste avec statuts de paiement indépendants.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <NewDealButton />
          <PrivacyToggle />
        </div>
      </div>

      <DealsFilters
        period={period}
        status={status}
        artistSlug={artistSlug}
        artists={data.artists}
      />

      <DealsTotals totals={data.totals} periodLabel={periodLabel} />

      <BookingDealsList deals={data.deals} totals={data.totals} />
    </div>
  );
}
