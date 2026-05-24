import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/users";

/**
 * Page publique de connexion. Si l'user est déjà loggué, redirige direct
 * vers /dashboard (évite de re-saisir login alors qu'on a déjà une session).
 */
export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <div className="flex justify-center">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Connexion à Youri
          </h1>
          <p className="text-sm text-muted-foreground">
            Outil interne Pangee Prod
          </p>
        </div>

        <Suspense fallback={<div className="h-40" />}>
          <LoginForm />
        </Suspense>

        <p className="text-center text-xs text-muted-foreground">
          Accès limité aux 3 comptes autorisés. Pour activer un nouvel accès,
          contacte l&apos;administrateur.
        </p>
      </div>
    </div>
  );
}
