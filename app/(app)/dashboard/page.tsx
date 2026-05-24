import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Dashboard placeholder — Sprint 0.
 *
 * Cette page sera réécrite au Sprint 7 (Dashboard) avec :
 *   - Mes tâches en cours (tri deadline)
 *   - Alertes (tâches en retard, cachets impayés, deals sans tâche)
 *   - KPIs financiers (CA, marge, encaissé ce mois)
 *
 * Pour Sprint 0 : juste un placeholder qui prouve que l'app rend bien
 * (theme, layout, typo, card shadcn fonctionnels).
 */
export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">
          Sprint 0 — scaffold initial. Le dashboard réel viendra au Sprint 7.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mes tâches</CardTitle>
            <CardDescription>Sprint 6+7</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-muted-foreground">—</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alertes</CardTitle>
            <CardDescription>Sprint 7</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-muted-foreground">—</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">CA du mois</CardTitle>
            <CardDescription>Sprint 7</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-muted-foreground">—</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">État du sprint</CardTitle>
          <CardDescription>Référence</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Cette app est en cours de scaffolding (Sprint 0). Voir{" "}
            <a className="underline" href="https://github.com/BusterTCG/YouriV2-app" target="_blank" rel="noopener noreferrer">
              le repo GitHub
            </a>{" "}
            et <code>docs/architecture-decisions.md</code> pour le plan complet.
          </p>
          <p className="text-muted-foreground">
            Prochain sprint : <strong>Sprint 1 — Auth + 3 users (Stan ADMIN, Certe MEMBER, Angath MEMBER)</strong>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
