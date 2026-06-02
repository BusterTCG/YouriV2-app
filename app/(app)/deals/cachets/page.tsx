import { Wallet, ArrowLeft } from "lucide-react";
import Link from "next/link";
import {
  getCachetsDealsList,
  parsePeriod,
  parseStatus,
  PERIOD_PRESET_OPTIONS,
} from "@/lib/cachets-list";
import { DealsFilters } from "@/components/deals/deals-filters";
import { CachetsDealsList } from "@/components/deals/cachets-deals-list";
import { NewDealButton } from "@/components/deals/new-deal-button";
import { PrivacyToggle } from "@/components/dashboard/privacy-toggle";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Cachets — Youri Prod",
};

interface CachetsPageProps {
  searchParams: Promise<{
    period?: string;
    status?: string;
    artist?: string;
  }>;
}

/**
 * Liste des deals Cachets — Sprint 5.
 *
 * Modèle : Pangee facture un tiers pour le compte d'un artiste, conserve un
 * % de gestion (default 10) et reverse le reste à l'artiste sous forme de
 * cachet brut (paie via GUSO/CDDU).
 */
export default async function CachetsPage({ searchParams }: CachetsPageProps) {
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const status = parseStatus(sp.status);
  const artistSlug = sp.artist && sp.artist !== "all" ? sp.artist : null;

  const data = await getCachetsDealsList({ period, status, artistSlug });

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
            <Wallet className="h-3.5 w-3.5" />
            Cachets · {data.totals.count} deal{data.totals.count > 1 ? "s" : ""}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Cachets</h1>
          <p className="text-muted-foreground text-sm">
            Pangee facture pour le compte de l&apos;artiste, conserve un % de
            gestion (défaut 10 %) et reverse le cachet brut à l&apos;artiste
            (paie GUSO/CDDU). 1 artiste = 1 deal.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <NewDealButton category="CACHETS" />
          <PrivacyToggle />
        </div>
      </div>

      <DealsFilters
        period={period}
        status={status}
        artistSlug={artistSlug}
        artists={data.artists}
      />

      <CachetsDealsList deals={data.deals} totals={data.totals} periodLabel={periodLabel} />
    </div>
  );
}
