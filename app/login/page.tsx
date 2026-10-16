import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { devAccountPickerEnabled } from "@/lib/auth/dev-login";
import { DevAccountPicker } from "@/components/auth/dev-account-picker";
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

  // Dev local uniquement : choix du compte (tester le profil Production).
  const devAccounts = devAccountPickerEnabled((await headers()).get("host"))
    ? await prisma.user.findMany({
        where: { active: true },
        orderBy: [{ role: "asc" }, { name: "asc" }],
        select: { email: true, name: true, role: true },
      })
    : [];

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

        {devAccounts.length > 0 && (
          <DevAccountPicker
            accounts={devAccounts.map((a) => ({
              email: a.email,
              label: `${a.name} · ${a.role === "PRODUCTION" ? "Production" : a.role === "ADMIN" ? "Admin" : "Associé"}`,
            }))}
          />
        )}

        <p className="text-center text-xs text-muted-foreground">
          Accès limité aux 3 comptes autorisés. Pour activer un nouvel accès,
          contacte l&apos;administrateur.
        </p>
      </div>
    </div>
  );
}
