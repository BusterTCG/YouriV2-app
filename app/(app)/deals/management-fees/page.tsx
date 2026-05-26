import Link from "next/link";
import { ArrowLeft, Briefcase } from "lucide-react";
import { DealCategory } from "@prisma/client";
import { requireUser } from "@/lib/auth/users";
import {
  getManagementFeesList,
  type MfStatusFilter,
} from "@/lib/management-fees-list";
import { parsePeriodPreset, type PeriodPreset } from "@/lib/period-presets";
import { ManagementFeesPageClient } from "@/components/deals/management-fees-page-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Management fees — Pangee Prod",
};

interface PageProps {
  searchParams: Promise<{
    scope?: string; // "mine" | "all"
    associate?: string; // override scope (admin power-user)
    status?: string; // "all" | "pending" | "paid"
    period?: string; // PeriodPreset
    category?: string; // DealCategory
  }>;
}

/**
 * Page de suivi Management fees Pangee → associés (Stan 2026-05-26).
 *
 * Pré-filtrée par défaut sur l'associé connecté (user.pangeeKey) — l'user
 * voit "ses" MF en priorité. Switcher "Mes MF / Tous" pour voir l'équipe.
 *
 * Stocke le mode + les filtres en searchParams pour permettre le partage
 * de lien et la navigation back/forward.
 */
export default async function ManagementFeesPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const sp = await searchParams;

  // Détermine le filtre associé :
  //   - ?associate=xxx → filtre explicite (peut être null/empty pour Tous)
  //   - sinon scope=mine (défaut) → user.pangeeKey
  //   - sinon scope=all → tous
  const scope = sp.scope === "all" ? "all" : "mine";
  let associateKey: string | null;
  if (sp.associate !== undefined) {
    associateKey = sp.associate || null;
  } else if (scope === "all") {
    associateKey = null;
  } else {
    associateKey = user.pangeeKey;
  }

  // Défauts Stan 2026-05-26 : Tout l'historique · En cours · Toutes catégories.
  // L'utilisateur voit d'emblée ce qu'il reste à facturer/encaisser.
  const status: MfStatusFilter =
    sp.status === "paid" || sp.status === "pending" || sp.status === "all"
      ? sp.status
      : "pending";
  const period: PeriodPreset = parsePeriodPreset(sp.period, "all");
  const validCategories: DealCategory[] = ["BOOKING", "PROD_EXE", "CACHETS"];
  const category =
    sp.category && validCategories.includes(sp.category as DealCategory)
      ? (sp.category as DealCategory)
      : null;

  const data = await getManagementFeesList({
    associateKey,
    status,
    period,
    category,
  });

  return (
    <div className="max-w-7xl space-y-5">
      <div>
        <Link
          href="/deals"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Deals
        </Link>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          <Briefcase className="h-3.5 w-3.5" />
          Suivi
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Management fees</h1>
        <p className="text-sm text-muted-foreground">
          Reversement Pangee aux associés sur la marge des deals.
        </p>
      </div>

      <ManagementFeesPageClient
        data={data}
        currentUserPangeeKey={user.pangeeKey}
        scope={scope}
      />
    </div>
  );
}
