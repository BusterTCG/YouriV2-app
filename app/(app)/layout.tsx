import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Shell des routes protégées — Sprint 0 : topbar minimaliste (logo + theme
 * toggle). Au Sprint 1+ on ajoutera : sidebar, mobile-nav, notification-bell,
 * filtre artiste, avatar user.
 *
 * Cf. docs/process/design-system.md § Layout standard.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur md:px-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  );
}
