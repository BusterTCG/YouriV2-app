"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Form de login Youri V2.
 *
 * UI :
 *   - Bouton primaire "Continuer avec Google" (lien vers /api/auth/google)
 *   - Section repliable "Mot de passe de secours" (email + mdp → POST /api/auth/password)
 *
 * En cas d'erreur OAuth (callback redirige vers /login?error=...), l'erreur
 * est affichée en haut.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");
  const from = searchParams.get("from") ?? "/dashboard";

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Identifiants invalides");
          return;
        }
        // Login OK → push vers la destination originelle
        router.push(from);
        router.refresh();
      } catch (e) {
        console.error(e);
        setError("Erreur réseau, réessaie");
      }
    });
  }

  const googleHref = `/api/auth/google?from=${encodeURIComponent(from)}`;

  return (
    <div className="w-full max-w-sm space-y-6">
      {oauthError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {oauthError}
        </div>
      )}

      <Button asChild className="w-full" size="lg">
        <a href={googleHref}>Continuer avec Google</a>
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <button
            type="button"
            onClick={() => setShowPasswordForm((v) => !v)}
            className="bg-background px-3 text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            {showPasswordForm ? "Masquer" : "Mot de passe de secours"}
          </button>
        </div>
      </div>

      {showPasswordForm && (
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@pangeeprod.com"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isPending}
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Connexion…" : "Se connecter"}
          </Button>
        </form>
      )}
    </div>
  );
}
