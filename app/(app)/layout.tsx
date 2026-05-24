import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { requireUser } from "@/lib/auth/users";

/**
 * Shell des routes protégées (Sprint 1).
 *
 * Force le rendu dynamique car on lit le cookie de session via requireUser().
 * Sans ça, Next essaie de pré-générer statiquement et crashe ou affiche un
 * shell sans user.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // `requireUser()` redirige vers /login si pas de session valide. Le
  // middleware racine intercepte normalement avant — c'est une double
  // sécurité au cas où.
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur md:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu
            name={user.name}
            email={user.email}
            color={user.color}
            role={user.role}
          />
        </div>
      </header>
      <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  );
}
