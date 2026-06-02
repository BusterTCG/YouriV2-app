import { TrendingUp, ArrowLeft } from "lucide-react";
import Link from "next/link";
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

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Prod Exécutive — Youri Prod",
};

interface ProdExePageProps {
  searchParams: Promise<{
    period?: string;
    status?: string;
    artist?: string;
  }>;
}

/**
 * Liste des deals Prod Exécutive — Sprint 4.
 *
 * Pattern identique à `/deals/booking` : filtres URL period/status/artist,
 * tableau riche avec jauge/billetterie/marge/suivi op, agrégats top.
 */
export default async function ProdExecutivePage({ searchParams }: ProdExePageProps) {
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const status = parseStatus(sp.status);
  const artistSlug = sp.artist && sp.artist !== "all" ? sp.artist : null;

  const data = await getProdExeDealsList({ period, status, artistSlug });

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
            <TrendingUp className="h-3.5 w-3.5" />
            Prod Exécutive · {data.totals.count} deal{data.totals.count > 1 ? "s" : ""}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Prod Exécutive</h1>
          <p className="text-muted-foreground text-sm">
            Production exécutive 15 % du CA billetterie. Multi-date (résidence /
            tournée), 3 modèles salle (Prod / Co-réal / Cession), lignes
            recettes &amp; charges détaillées.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <NewDealButton category="PROD_EXE" />
          <PrivacyToggle />
        </div>
      </div>

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
