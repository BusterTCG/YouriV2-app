"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

/**
 * Bouton logout — appelle /api/auth/logout puis redirige vers /login.
 * Pensé pour être posé dans le UserMenu dropdown topbar.
 */
export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
    >
      <LogOut className="h-4 w-4" />
      {isPending ? "Déconnexion…" : "Se déconnecter"}
    </button>
  );
}
