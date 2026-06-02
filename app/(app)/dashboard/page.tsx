import { LayoutDashboard } from "lucide-react";
import { requireUser } from "@/lib/auth/users";
import {
  getDashboardData,
  type DashboardPeriod,
  type DashboardCategoryFilter,
} from "@/lib/dashboard";
import { DashboardKpis } from "@/components/dashboard/dashboard-kpis";
import {
  DashboardMyTasks,
  DashboardUpcomingTasks,
} from "@/components/dashboard/dashboard-my-tasks";
import { DashboardAlerts } from "@/components/dashboard/dashboard-alerts";
import { DashboardWeek } from "@/components/dashboard/dashboard-week";
import { DashboardChart } from "@/components/dashboard/dashboard-chart";
import { PeriodToggle } from "@/components/dashboard/period-toggle";
import { CategoryFilter } from "@/components/dashboard/category-filter";
import { ArtistFilterDropdown } from "@/components/dashboard/artist-filter-dropdown";
import { PrivacyToggle } from "@/components/dashboard/privacy-toggle";

/**
 * Dashboard Pangee Prod — Sprint 7 Stan 2026-06-02.
 *
 * Copie fidèle du dashboard KuroNeko (`/dashboard`) adaptée au modèle Pangee :
 *   - 3 KPIs : CA HT encaissé, Marge Nette, % Marge Nette
 *   - Section "Mes tâches courantes" (réutilise Sprint 6 — workflow séquentiel)
 *   - Section "Cette semaine" (deals < 7 jours)
 *   - Graphique Marge Nette mensuelle 12 mois glissants
 *
 * Filtres top-bar :
 *   - Période (month / year) — URL `?period=year`
 *   - Catégorie (BOOKING / PROD_EXE / CACHETS / all) — URL `?cat=BOOKING`
 *   - Artiste (slug) — URL `?artist=<slug>`
 *
 * Multi-user : "Mes tâches" filtré sur `user.pangeeKey` (Stan/Certe/Angath).
 */

interface DashboardPageProps {
  searchParams: Promise<{
    period?: string;
    cat?: string;
    artist?: string;
  }>;
}

const CATEGORY_VALUES: DashboardCategoryFilter[] = [
  "all",
  "BOOKING",
  "PROD_EXE",
  "CACHETS",
];

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const sp = await searchParams;
  // Stan 2026-06-02 : défaut = "year" (vue annuelle prioritaire). Mois = opt-in.
  const period: DashboardPeriod = sp.period === "month" ? "month" : "year";
  const category: DashboardCategoryFilter =
    sp.cat && CATEGORY_VALUES.includes(sp.cat as DashboardCategoryFilter)
      ? (sp.cat as DashboardCategoryFilter)
      : "all";
  const artistSlug = sp.artist && sp.artist !== "all" ? sp.artist : null;

  const user = await requireUser();
  const data = await getDashboardData({
    period,
    category,
    artistSlug,
    myPangeeKey: user.pangeeKey,
  });

  const periodLabel = period === "year" ? "année en cours" : "mois en cours";

  return (
    <div className="max-w-6xl space-y-5">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Pilotage Pangee
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Bonjour {user.name.split(" ")[0]} — vue {periodLabel}, tes tâches
            courantes et l&apos;activité à venir.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-start sm:justify-end sm:shrink-0">
          <CategoryFilter />
          <ArtistFilterDropdown
            artistSlug={artistSlug}
            artists={data.artists}
          />
          <PeriodToggle />
          <PrivacyToggle />
        </div>
      </div>

      {/* ── KPIs financiers ─────────────────────────────────────────────── */}
      <DashboardKpis
        kpis={data.kpis}
        period={period}
        periodLabel={periodLabel}
      />

      {/* ── Alertes actionnables (n'affiche rien si aucune alerte) ──────── */}
      <DashboardAlerts
        aFacturerOld={data.alerts.aFacturerOld}
        aPayerArtiste={data.alerts.aPayerArtiste}
      />

      {/* ── Graphique 12 mois plein largeur (vision macro, juste sous les KPIs).
            Stan 2026-06-02 v3 : remonté entre les KPIs et le bloc planning. */}
      <DashboardChart data={data.monthlyMargeNette} period={period} />

      {/* ── 3 colonnes planning : Mes tâches | À venir | Cette semaine
            Plan d'action visible d'un coup d'œil. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <DashboardMyTasks
          tasks={data.myTasks}
          teamTasksCount={data.teamTasksCount}
        />
        <DashboardUpcomingTasks upcoming={data.myUpcomingTasks} />
        <DashboardWeek items={data.thisWeek} />
      </div>
    </div>
  );
}
