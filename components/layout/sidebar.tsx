import { Logo } from "@/components/layout/logo";
import { SidebarNav } from "@/components/layout/sidebar-nav";

/**
 * Sidebar desktop fixe à gauche (md:flex). Cachée en mobile — remplacée par
 * le Sheet via <MobileNav /> dans la topbar.
 */
export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  return (
    <aside className="hidden h-screen w-60 shrink-0 flex-col border-r bg-background md:flex">
      <div className="flex h-14 items-center border-b px-4">
        <Logo />
      </div>
      <div className="flex-1 overflow-y-auto">
        <SidebarNav isAdmin={isAdmin} />
      </div>
    </aside>
  );
}
