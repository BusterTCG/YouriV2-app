"use client";

import { TrendingUp, Briefcase, Theater, Ticket } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Vue d'ensemble — placeholder Sprint 3.
 *
 * Stan veut 4 box KPI financiers (validé 2026-05-26) :
 *   1. **Total**     — somme des montants tous deals confondus (artiste)
 *   2. **Booking**   — catégorie BOOKING (cession/booking, mono-date)
 *   3. **Spectacle** — catégorie PROD_EXE (production exécutive 15%, multi-date)
 *   4. **Cachet**    — catégorie CACHETS (gestion paie intermittents, multi-date)
 *
 * Côté Youri V2 — pas encore branché car le model `Deal` Pangee arrive au
 * Sprint 3 (cf. project-youri-v2 plan + règles métier Youri V2 en mémoire).
 * À ce moment, on branchera :
 *   - prisma.deal.aggregate({ where: { artistId, category, deletedAt: null },
 *     _sum: { artistAmount: true, grossAmount: true } })
 *   - Sélecteur de période (cf. lib/period-presets.ts à porter)
 *   - Pie chart Recharts par catégorie (optionnel — à valider Sprint 3)
 *
 * En attendant, on affiche les 4 box vides pour figer la structure visuelle
 * et permettre à Stan de valider la disposition dès maintenant.
 */
interface OverviewSectionProps {
  artistName: string;
}

const KPI_BOXES = [
  { label: "Total", icon: TrendingUp, hint: "Tous deals confondus" },
  { label: "Booking", icon: Briefcase, hint: "Cession / booking" },
  { label: "Spectacle", icon: Theater, hint: "Prod Exé 15 %" },
  { label: "Cachet", icon: Ticket, hint: "Intermittents" },
] as const;

export function OverviewSection({ artistName }: OverviewSectionProps) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-[--yr-gold]" />
          Vue d&apos;ensemble — à venir Sprint 3
        </CardTitle>
        <CardDescription>
          KPIs financiers de <strong>{artistName}</strong> seront branchés
          dès que le model <code className="rounded bg-muted px-1">Deal</code>{" "}
          Pangee sera livré (Sprint 3). En attendant, complète la fiche
          d&apos;identité dans l&apos;onglet « Infos ».
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {KPI_BOXES.map((box) => {
            const Icon = box.icon;
            return (
              <div
                key={box.label}
                className="rounded-md border bg-muted/20 p-4 space-y-1"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <Icon className="h-3.5 w-3.5" />
                  {box.label}
                </div>
                <div className="text-2xl font-semibold tabular-nums text-muted-foreground/50">
                  —
                </div>
                <div className="text-[11px] text-muted-foreground/60 italic">
                  {box.hint}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
