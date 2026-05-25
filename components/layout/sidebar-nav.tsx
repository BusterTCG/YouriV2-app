"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "@/components/layout/nav-config";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  isAdmin: boolean;
  onItemClick?: () => void; // pour fermer le sheet mobile au clic
}

/**
 * Contenu nav réutilisé par la sidebar desktop (md:flex) ET la sheet mobile.
 * Met en évidence l'item actif via comparaison usePathname().
 */
export function SidebarNav({ isAdmin, onItemClick }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-6 px-2 py-4">
      {NAV_GROUPS.map((group) => {
        const visibleItems = group.items.filter((item) => !item.adminOnly || isAdmin);
        if (visibleItems.length === 0) return null;

        const groupHeaderActive =
          group.href != null &&
          (pathname === group.href || pathname.startsWith(group.href + "/"));

        return (
          <div key={group.label} className="flex flex-col gap-1">
            {group.href ? (
              <Link
                href={group.href}
                onClick={onItemClick}
                className={cn(
                  "px-3 text-xs font-semibold uppercase tracking-wide transition-colors",
                  groupHeaderActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {group.label}
              </Link>
            ) : (
              <h3 className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </h3>
            )}
            {visibleItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href + "/"));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onItemClick}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-foreground hover:bg-accent/50",
                    item.placeholder && "opacity-50",
                  )}
                  title={item.placeholder ? "À venir dans un sprint ultérieur" : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.placeholder && (
                    <span className="ml-auto text-[10px] uppercase text-muted-foreground">
                      WIP
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
