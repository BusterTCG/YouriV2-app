import Link from "next/link";
import { ListChecks, Settings as SettingsIcon, Users } from "lucide-react";
import { requireUser } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Paramètres — Youri Prod",
};

/**
 * Index des paramètres — Sprint 6 (Stan 2026-05-31).
 *
 * Liste les sous-pages disponibles avec leur restriction d'accès.
 * À étendre au fur et à mesure des sprints (notifications, intégrations…).
 */
export default async function SettingsIndexPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  return (
    <div className="max-w-3xl space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          <SettingsIcon className="h-3.5 w-3.5" />
          Configuration
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
        <p className="text-muted-foreground text-sm">
          Configuration de l&apos;application et de l&apos;équipe Pangee Prod.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <SettingsCard
          href="/settings/templates"
          icon={<ListChecks className="h-5 w-5" />}
          title="Templates de tâches"
          description="Pipelines auto-générés à la création d'un deal (Booking / Prod Exé / Cachets)."
        />
        {isAdmin && (
          <SettingsCard
            href="/settings/users"
            icon={<Users className="h-5 w-5" />}
            title="Utilisateurs"
            description="Gestion des comptes équipe (admin uniquement)."
            badge="Admin"
          />
        )}
      </div>
    </div>
  );
}

function SettingsCard({
  href,
  icon,
  title,
  description,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-md border bg-card p-4 hover:bg-accent/30 transition-colors block space-y-1"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {badge && (
          <span className="text-[10px] uppercase tracking-wider rounded border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0.5">
            {badge}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground leading-snug">
        {description}
      </p>
    </Link>
  );
}
