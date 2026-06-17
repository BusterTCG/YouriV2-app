import { TrendingUp } from "lucide-react";
import {
  getReportingData,
  parseReportingPeriod,
} from "@/lib/reporting";
import { ReportingFilters } from "@/components/reporting/reporting-filters";
import { ReportingKpis } from "@/components/reporting/reporting-kpis";
import { ReportingChart } from "@/components/reporting/reporting-chart";
import { ReportingTopDeals } from "@/components/reporting/reporting-top-deals";
import { ReportingCategoryBreakdown } from "@/components/reporting/reporting-category-breakdown";
import { PrivacyToggle } from "@/components/dashboard/privacy-toggle";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reporting — Pangee Prod",
};

interface ReportingPageProps {
  searchParams: Promise<{ period?: string; artist?: string }>;
}

/**
 * Page /reporting Pangee — Sprint 9 Stan 2026-06-02.
 *
 * Copie fidèle de KuroNeko /reporting adaptée Pangee :
 *   - 6 KPIs sur les deals encaissés (budgetPaymentStatus=PAID + budgetPaidAt
 *     ∈ période) → cash-flow réel cohérent
 *   - Chart Marge Nette mensuelle (12 ou 24 mois selon préset)
 *   - Top 10 artistes par CA HT (prorata si plusieurs artistes sur un deal)
 *   - Breakdown Marge Nette par catégorie (Booking / Prod Exé / Cachets)
 *
 * Filtres URL :
 *   - ?period= : préset (this-year par défaut)
 *   - ?artist= : slug artiste optionnel
 *
 * PrivacyToggle aligné sur les filtres (Stan préfère pas dans le header).
 */
export default async function ReportingPage({ searchParams }: ReportingPageProps) {
  const sp = await searchParams;
  const period = parseReportingPeriod(sp.period);
  const artistSlug = sp.artist && sp.artist !== "all" ? sp.artist : null;

  const data = await getReportingData({ period, artistSlug });

  return (
    <div className="max-w-6xl space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          <TrendingUp className="h-3.5 w-3.5" />
          Reporting
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Reporting · {data.rangeLabel}
        </h1>
        <p className="text-muted-foreground text-sm">
          Vue stratégique des deals <strong>encaissés</strong> (budget Pangee
          reçu) dans la période. Cash-flow réel — les deals en cours ne sont
          pas comptés. Tous les KPIs sur le même set pour cohérence.
        </p>
      </div>

      {/* Filtres + toggle privacy collés (Stan 2026-06-02 : eye juste après
          le sélecteur artistes, pas relégué à l'extrême droite). */}
      <div className="flex items-center gap-2 flex-wrap">
        <ReportingFilters
          period={period}
          artistSlug={artistSlug}
          artists={data.artists}
        />
        <PrivacyToggle />
      </div>

      <ReportingKpis kpis={data.kpis} rangeLabel={data.rangeLabel} />

      <ReportingChart data={data.monthly} rangeLabel={data.rangeLabel} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ReportingTopDeals
          rows={data.topDeals}
          rangeLabel={data.rangeLabel}
        />
        <ReportingCategoryBreakdown
          data={data.byCategory}
          rangeLabel={data.rangeLabel}
        />
      </div>
    </div>
  );
}
