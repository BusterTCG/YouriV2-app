"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { SidebarNav } from "@/components/layout/sidebar-nav";

/**
 * Hamburger menu visible md:hidden uniquement. Ouvre un Sheet à gauche
 * contenant la même navigation que la sidebar desktop.
 */
export function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0">
        <div className="border-b px-4 py-3">
          <Logo />
        </div>
        <SidebarNav isAdmin={isAdmin} onItemClick={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
