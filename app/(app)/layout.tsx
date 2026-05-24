import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Logo } from "@/components/layout/logo";
import { requireUser } from "@/lib/auth/users";

/**
 * Shell des routes protégées Youri V2.
 *
 * Layout :
 *   - Sidebar gauche fixe (md:flex) avec nav par groupes (Pilotage / Deals /
 *     Annuaire / Outils / Administration)
 *   - Topbar sticky en haut : hamburger md:hidden + logo (mobile) ou rien
 *     (desktop, logo dans la sidebar) + ThemeToggle + UserMenu
 *   - Main scrollable
 *
 * Force dynamic car requireUser() lit le cookie session.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar isAdmin={isAdmin} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2">
            <MobileNav isAdmin={isAdmin} />
            {/* Logo visible uniquement sur mobile — sur desktop il est dans la sidebar */}
            <div className="md:hidden">
              <Logo />
            </div>
          </div>
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

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
