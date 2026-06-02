import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  HandCoins,
  TrendingUp,
} from "lucide-react";
import { SensitiveAmount } from "./sensitive-amount";
import type { AlertItem } from "@/lib/dashboard";

interface Props {
  aFacturerOld: AlertItem[];
  aPayerArtiste: AlertItem[];
}

/**
 * Section "Alertes actionnables" du dashboard (Sprint 7+ Stan 2026-06-02).
 *
 * 2 catégories :
 *   - "À facturer > 30j" : deals avec date show passée > 30j sans budget PAID
 *   - "Encaissé mais artiste pas payé" : cash dispo à reverser à l'artiste
 *
 * Si les 2 listes sont vides → la section ne s'affiche pas (rien d'urgent).
 */
export function DashboardAlerts({ aFacturerOld, aPayerArtiste }: Props) {
  const totalAlerts = aFacturerOld.length + aPayerArtiste.length;
  if (totalAlerts === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wider">
          Alertes
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {totalAlerts}
        </span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <AlertCard
          icon={<TrendingUp className="h-3.5 w-3.5 text-amber-500" />}
          title="À facturer (date passée > 30j)"
          items={aFacturerOld}
          emptyText="Aucun deal à relancer 👌"
          totalSuffix="à facturer"
        />
        <AlertCard
          icon={<HandCoins className="h-3.5 w-3.5 text-red-500" />}
          title="Encaissé — à reverser à l'artiste"
          items={aPayerArtiste}
          emptyText="Tous les artistes ont été payés 👌"
          totalSuffix="à reverser"
        />
      </div>
    </section>
  );
}

function AlertCard({
  icon,
  title,
  items,
  emptyText,
  totalSuffix,
}: {
  icon: React.ReactNode;
  title: string;
  items: AlertItem[];
  emptyText: string;
  totalSuffix: string;
}) {
  const total = items.reduce((acc, it) => acc + (it.amount ?? 0), 0);
  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-b bg-muted/30">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {icon}
          {title}
        </div>
        {items.length > 0 && total > 0 && (
          <div className="text-[11px] text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">
              <SensitiveAmount value={total} />
            </span>{" "}
            {totalSuffix}
          </div>
        )}
      </div>
      <div className="divide-y">
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground italic">
            {emptyText}
          </div>
        ) : (
          items.map((it) => (
            <Link
              key={it.id}
              href={it.href}
              className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors text-xs"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium leading-tight truncate">
                  {it.title}
                </div>
                <div className="text-[11px] text-muted-foreground inline-flex items-center gap-2 mt-0.5">
                  {it.subtitle && <span>{it.subtitle}</span>}
                  {it.date && (
                    <span className="inline-flex items-center gap-0.5">
                      <Calendar className="h-3 w-3" />
                      {format(it.date, "dd MMM yyyy", { locale: fr })}
                    </span>
                  )}
                </div>
              </div>
              {it.amount != null && it.amount > 0 && (
                <div className="text-xs tabular-nums font-medium shrink-0">
                  <SensitiveAmount value={it.amount} />
                </div>
              )}
              <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
