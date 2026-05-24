"use client";

import { useEffect } from "react";

/**
 * Error boundary global — capture toute erreur non gérée par les segments.
 * Évite l'écran blanc en prod et donne un bouton de reload.
 *
 * En multi-user (cf. docs/architecture-decisions.md § Permissions), c'est
 * encore plus critique : l'erreur d'un user ne doit pas casser l'app pour
 * les autres.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log côté serveur (Next.js capture en console) + browser console pour
    // diagnostic. À l'avenir on pourra brancher Sentry / un transport custom.
    console.error("[Youri V2] Unhandled error", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md text-center">
        <h1 className="mb-2 text-2xl font-semibold text-foreground">
          Une erreur est survenue
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Désolé, quelque chose s&apos;est mal passé. L&apos;équipe a été notifiée
          dans les logs serveur.
        </p>
        {error.digest && (
          <p className="mb-6 font-mono text-xs text-muted-foreground">
            Ref : {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}
