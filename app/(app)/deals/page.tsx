import Link from "next/link";
import { Briefcase, TrendingUp, Wallet } from "lucide-react";
import type { DealCategory } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDealsCategoryRecap } from "@/lib/deals-list";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Deals — Youri Prod",
};

/**
 * Page parent /deals : 3 cards récap par catégorie (Booking / Prod Exé / Cachet).
 * Chaque card est cliquable et amène à la page filtrée correspondante.
 *
 * Sprint 3 : seul Booking est livré (`/deals/booking`). Prod Exé (Sprint 4)
 * et Cachets (Sprint 5) affichent un badge WIP — les cards restent cliquables
 * mais mènent à une page placeholder.
 */
const CATEGORIES: Array<{
  category: DealCategory;
  label: string;
  description: string;
  href: string;
  icon: typeof Briefcase;
  wip: boolean;
}> = [
  {
    category: "BOOKING",
    label: "Booking",
    description: "Cession / booking d'artistes auprès d'organisateurs (mono-date).",
    href: "/deals/booking",
    icon: Briefcase,
    wip: false,
  },
  {
    category: "PROD_EXE",
    label: "Prod Exé",
    description: "Production exécutive 15 % — lignes recettes/dépenses, multi-date.",
    href: "/deals/prod-executive",
    icon: TrendingUp,
    wip: false,
  },
  {
    category: "CACHETS",
    label: "Cachets",
    description: "Gestion paie intermittents, multi-date.",
    href: "/deals/cachets",
    icon: Wallet,
    wip: true,
  },
];

function eur(n: number): string {
  return n.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

export default async function DealsPage() {
  const recap = await getDealsCategoryRecap();
  const byCategory = new Map(recap.map((r) => [r.category, r] as const));

  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <Briefcase className="h-3.5 w-3.5" />
            Pilotage
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Deals</h1>
          <p className="text-muted-foreground text-sm">
            Vue d&apos;ensemble des 3 catégories Youri. Clique sur une carte
            pour ouvrir la liste filtrée et gérer les deals correspondants.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {CATEGORIES.map((cat) => {
          const data = byCategory.get(cat.category) ?? { count: 0, totalMarge: 0 };
          const Icon = cat.icon;
          return (
            <Link
              key={cat.category}
              href={cat.href}
              className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40 rounded-xl"
            >
              <Card className="h-full transition-colors hover:bg-accent/40 hover:border-foreground/30 cursor-pointer">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-[--yr-gold]" />
                      <CardTitle className="text-base">{cat.label}</CardTitle>
                    </div>
                    {cat.wip && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        WIP
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs">
                    {cat.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      Deals actifs
                    </span>
                    <span className="text-2xl font-semibold tabular-nums">
                      {data.count}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between border-t pt-2">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      Marge Youri
                    </span>
                    <span className="text-base font-medium tabular-nums text-[--yr-gold]">
                      {eur(data.totalMarge)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
