"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary du segment protégé (app/(app)/*).
 * Capture les erreurs des pages avec session — affiche un message sans
 * casser le shell (sidebar + topbar restent visibles).
 *
 * En multi-user, important : l'erreur sur la page d'un user (ex : Certe sur
 * /booking) ne doit pas pourrir la session des autres.
 */
export default function AppSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Youri V2 / segment app] Unhandled error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl py-12 text-center">
      <h2 className="mb-2 text-xl font-semibold text-foreground">
        Cette page a planté
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Une erreur est survenue lors du chargement. Tu peux réessayer ou
        retourner au dashboard.
      </p>
      {error.digest && (
        <p className="mb-6 font-mono text-xs text-muted-foreground">
          Ref : {error.digest}
        </p>
      )}
      <div className="flex justify-center gap-2">
        <Button variant="outline" onClick={reset}>
          Réessayer
        </Button>
        <Button asChild>
          <a href="/dashboard">Retour au dashboard</a>
        </Button>
      </div>
    </div>
  );
}
