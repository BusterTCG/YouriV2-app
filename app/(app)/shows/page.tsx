import { Theater } from "lucide-react";
import {
  getProdExeDealsList,
  parsePeriod,
  parseStatus,
  PERIOD_PRESET_OPTIONS,
} from "@/lib/prod-executive-list";
import { DealsFilters } from "@/components/deals/deals-filters";
import { ProdExeDealsList } from "@/components/deals/prod-exe-deals-list";
import { NewDealButton } from "@/components/deals/new-deal-button";
import { PrivacyToggle } from "@/components/dashboard/privacy-toggle";
import { ProductionsView, ShowsTabs } from "@/components/shows/productions-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Productions — Youri Prod",
};

interface ShowsPageProps {
  searchParams: Promise<{
    view?: string;
    period?: string;
    status?: string;
    artist?: string;
  }>;
}

/**
 * Productions (portage de la refonte « Production » KN, Stan 2026-09-29).
 * Vue par défaut « Productions » (spectacles en cours + prochaines dates).
 * La liste de toutes les dates (ex-page Prod Exé, colonnes marge / MF) reste
 * accessible via ?view=dates.
 */
export default async function ShowsPage({ searchParams }: ShowsPageProps) {
  const sp = await searchParams;
  if (sp.view !== "dates") {
    return <ProductionsView />;
  }
  return <DatesView sp={sp} />;
}

async function DatesView({ sp }: { sp: Awaited<ShowsPageProps["searchParams"]> }) {
  const period = parsePeriod(sp.period);
  const status = parseStatus(sp.status);
  const artistSlug = sp.artist && sp.artist !== "all" ? sp.artist : null;

  const data = await getProdExeDealsList({ period, status, artistSlug });

  const periodLabel =
    PERIOD_PRESET_OPTIONS.find((o) => o.value === period)?.label ?? "Tout";

  return (
    <div className="max-w-[1400px] space-y-5">
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <Theater className="h-3.5 w-3.5" />
            Productions · {data.totals.count} date{data.totals.count > 1 ? "s" : ""}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Productions</h1>
          <p className="text-muted-foreground text-sm">
            Toutes les dates de production : billetterie, marge, suivi des
            paiements et management fees.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <NewDealButton category="PROD_EXE" />
          <PrivacyToggle />
        </div>
      </div>

      <ShowsTabs current="dates" />

      <DealsFilters
        period={period}
        status={status}
        artistSlug={artistSlug}
        artists={data.artists}
      />

      <ProdExeDealsList deals={data.deals} totals={data.totals} periodLabel={periodLabel} />
    </div>
  );
}
