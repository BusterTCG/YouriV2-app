import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/users";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UsersTable } from "./users-table";

/**
 * /settings/users — gestion des 3 users Pangee Prod par l'ADMIN (Stan).
 *
 * Affiche : table des users avec rôle, statut active, dernier login, source.
 * Actions par user : Réinitialiser le mdp, Activer/Désactiver.
 *
 * Garde `requireAdmin()` → MEMBER tombe sur /dashboard (redirect).
 */
export const dynamic = "force-dynamic";

export default async function SettingsUsersPage() {
  const admin = await requireAdmin();

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      color: true,
      active: true,
      lastAuthSource: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Utilisateurs</h1>
        <p className="text-sm text-muted-foreground">
          Gestion des comptes Pangee Prod — accès ADMIN uniquement.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comptes ({users.length})</CardTitle>
          <CardDescription>
            Réinitialiser un mdp ou désactiver un compte. Les comptes désactivés
            ne peuvent plus se connecter mais leur historique reste tracé.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersTable users={users} currentAdminId={admin.id} />
        </CardContent>
      </Card>
    </div>
  );
}
