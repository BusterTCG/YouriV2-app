import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarRange, ChevronLeft, ChevronRight, MapPin, Theater } from "lucide-react";
import { prisma } from "@/lib/db";
import { getProductionSummaries } from "@/lib/productions";
import { performanceTotals } from "@/lib/performances";
import { contractRates, residencyContractOf } from "@/lib/finance/production-overhead";
import { SensitiveAmount } from "@/components/dashboard/sensitive-amount";
import { PrivacyToggle } from "@/components/dashboard/privacy-toggle";
import { PerformancesCard } from "@/components/shows/performances-card";
import { ResidencyWizard } from "@/components/shows/residency-wizard";
import { DeleteResidencyButton, MonthReleve, ResidencyChecklist } from "@/components/shows/residency-month-parts";
import { SectionTitle } from "@/components/shows/section-title";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const VENUE_KIND_LABEL: Record<string, string> = {
  PROD: "Location",
  CO_REAL: "Co-réalisation",
  CESSION: "Cession",
};

/**
 * Fiche Résidence (portage KN, étape 2) : une salle sur plusieurs mois,
 * une seule fiche avec les mois à l'intérieur. Chaque mois = séances (payants,
 * billetterie par soir) + relevé du théâtre + charges du mois + résultat.
 */
export default async function ResidencyPage({ params }: Props) {
  const { id } = await params;
  // eslint-disable-next-line react-hooks/purity -- server component, 1 exécution / requête
  const nowMs = Date.now();
  const residency = await prisma.residency.findUnique({
    where: { id },
    include: {
      production: { include: { artist: { select: { name: true, color: true } } } },
    },
  });
  if (!residency) notFound();

  const [deals, [summary]] = await Promise.all([
    prisma.deal.findMany({
      where: { residencyId: id, category: "PROD_EXE", deletedAt: null },
      orderBy: { date: "asc" },
      include: {
        performances: { orderBy: [{ date: "asc" }, { time: "asc" }] },
        productionLines: {
          where: { deletedAt: null },
          select: { kind: true, label: true, amount: true, paymentStatus: true },
        },
      },
    }),
    getProductionSummaries({ id: residency.productionId }, nowMs),
  ]);
  const views = new Map((summary?.deals ?? []).map((v) => [v.id, v]));
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  const todayKey = format(today, "yyyy-MM-dd");
  // Contrat appliqué aux mois de résidence (contrat « Résidences » distinct
  // si la production en définit un).
  const resRates = summary ? contractRates(residencyContractOf(summary)) : null;
  const prodExe = (resRates?.pe ?? 0) > 0;

  // Totaux de la résidence
  const allPerfs = deals.flatMap((d) => d.performances.map((p) => ({ ...p, dealCapacity: d.capacity })));
  const active = allPerfs.filter((p) => !p.cancelled);
  const played = active.filter((p) => p.date.toISOString().slice(0, 10) < todayKey).length;
  let paying = 0;
  let capacity = 0;
  let ticketing = 0;
  for (const d of deals) {
    const t = performanceTotals(d.performances, d.capacity);
    paying += t.paying ?? 0;
    if (t.paying && t.capacity) capacity += t.capacity;
    ticketing += t.grossTicketing ?? 0;
  }
  const fill = capacity ? Math.round((paying / capacity) * 100) : null;
  let recette = 0;
  let result = 0;
  let artist = 0;
  for (const d of deals) {
    const v = views.get(d.id);
    recette += v?.pnl.revenue ?? 0;
    result += v?.pnl.margin ?? 0;
    artist += v?.pnl.artistAmount ?? 0;
  }
  const first = active[0]?.date;
  const last = active[active.length - 1]?.date;
  const venueKind = deals.find((d) => d.venueDealKind)?.venueDealKind;
  const coRealPct = deals.find((d) => d.coRealKnPct != null)?.coRealKnPct;
  const all = (k: "contractSigned" | "ticketingReady" | "vhrBooked") => deals.length > 0 && deals.every((d) => d[k]);

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/shows" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="h-3 w-3" />
          Productions
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <Link href={`/shows/production/${residency.productionId}`} className="hover:text-foreground font-medium">
          {residency.production.name}
        </Link>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <Theater className="h-3.5 w-3.5" />
            Résidence ·{" "}
            <span style={{ color: residency.production.artist.color }}>{residency.production.artist.name}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {residency.production.name} — {residency.name}
          </h1>
          <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
            {first && last && (
              <span className="inline-flex items-center gap-1">
                <CalendarRange className="h-3.5 w-3.5" />
                {format(first, "d MMM yyyy", { locale: fr })} → {format(last, "d MMM yyyy", { locale: fr })}
              </span>
            )}
            {residency.venueCity && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {residency.venueCity}
              </span>
            )}
            <span>
              {played}/{active.length} séances jouées · {deals.length} mois
            </span>
            {venueKind && (
              <span>
                {VENUE_KIND_LABEL[venueKind]}
                {venueKind === "CO_REAL" && coRealPct != null && ` ${Number(coRealPct)} % Pangee`}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ResidencyWizard productionId={residency.productionId} residency={{ id, name: residency.name }} />
          <PrivacyToggle />
          <div className="ml-auto">
            <DeleteResidencyButton residencyId={id} name={residency.name} months={deals.length} />
          </div>
        </div>
        <ResidencyChecklist
          residencyId={id}
          contractSigned={all("contractSigned")}
          ticketingReady={all("ticketingReady")}
          vhrBooked={all("vhrBooked")}
        />
      </div>

      {/* KPIs résidence */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Séances" value={`${played}/${active.length}`} />
        <Kpi label="Payants" value={paying ? paying.toLocaleString("fr-FR") : "—"} />
        <Kpi label="Remplissage" value={fill != null ? `${fill} %` : "—"} />
        <Kpi label="Billetterie HT" value={<SensitiveAmount value={ticketing} />} />
        <Kpi label={venueKind === "CO_REAL" ? "Recette (relevés)" : "Recette HT"} value={<SensitiveAmount value={recette} />} />
        <Kpi
          label={prodExe ? "Net artiste" : "Résultat"}
          value={<SensitiveAmount value={prodExe ? artist : result} />}
          tone={(prodExe ? artist : result) >= 0 ? "pos" : "neg"}
        />
      </div>

      {deals.length === 0 && (
        <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          Aucune séance dans cette résidence — « Ajouter des séances » ou « Supprimer la résidence ».
        </p>
      )}

      {/* Un bloc par mois */}
      {deals.map((d) => {
        const v = views.get(d.id);
        const month = d.performances[0]?.date ?? d.date;
        const recetteLines = d.productionLines.filter((l) => l.label === "RECETTE_HT");
        const t = performanceTotals(d.performances, d.capacity);
        return (
          <section key={d.id} className="rounded-md border bg-card/50 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <SectionTitle tone="gold">{format(month, "MMMM yyyy", { locale: fr })}</SectionTitle>
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <span className="text-muted-foreground">
                  Charges du mois{" "}
                  <span className="font-semibold text-foreground">
                    <SensitiveAmount value={(v?.pnl.lineCost ?? 0) + (v?.pnl.overheadShare ?? 0)} />
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {prodExe ? "Net artiste" : "Résultat"}{" "}
                  <span
                    className={cn(
                      "font-semibold",
                      (prodExe ? v?.pnl.artistAmount ?? 0 : v?.pnl.margin ?? 0) >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400",
                    )}
                  >
                    <SensitiveAmount value={prodExe ? v?.pnl.artistAmount ?? 0 : v?.pnl.margin ?? 0} />
                  </span>
                </span>
                <Link
                  href={`/shows/${d.id}`}
                  className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Charges &amp; détail du mois
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
            <PerformancesCard
              dealId={d.id}
              title="Séances"
              performances={d.performances.map((p) => ({
                id: p.id,
                day: p.date.toISOString().slice(0, 10),
                time: p.time,
                capacity: p.capacity,
                paying: p.paying,
                invited: p.invited,
                grossTicketing: p.grossTicketing != null ? Number(p.grossTicketing) : null,
                cancelled: p.cancelled,
              }))}
              dealCapacity={d.capacity}
              venueDealKind={d.venueDealKind}
              recetteHt={recetteLines.reduce((s, l) => s + Number(l.amount), 0)}
              legacyPaying={d.paying}
              todayKey={todayKey}
              hideRecette
            />
            <MonthReleve
              key={`releve-${d.id}-${recetteLines.reduce((s, l) => s + Number(l.amount), 0)}`}
              dealId={d.id}
              venueDealKind={d.venueDealKind}
              recetteHt={recetteLines.reduce((s, l) => s + Number(l.amount), 0)}
              recetteLines={recetteLines.length}
              status={recetteLines[0]?.paymentStatus ?? null}
              ticketing={t.grossTicketing}
            />
          </section>
        );
      })}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{label}</div>
      <div
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "pos" && "text-emerald-600 dark:text-emerald-400",
          tone === "neg" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </div>
    </div>
  );
}
