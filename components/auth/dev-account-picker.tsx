/**
 * Choix du compte en dev local (Stan 2026-10-16) — n'est rendu que si
 * `devLoginAccounts` renvoie des comptes (jamais en prod ni via le tunnel).
 */
export function DevAccountPicker({
  accounts,
  from,
}: {
  accounts: Array<{ email: string; label: string }>;
  from?: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-amber-500/50 bg-amber-500/5 p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400">
        Dev local · se connecter en tant que
      </div>
      <div className="flex flex-col gap-1.5">
        {accounts.map((a) => (
          <a
            key={a.email}
            href={`/api/auth/dev-login?email=${encodeURIComponent(a.email)}${
              from ? `&from=${encodeURIComponent(from)}` : ""
            }`}
            className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent transition-colors"
          >
            <span className="truncate">{a.email}</span>
            <span className="text-[11px] text-muted-foreground shrink-0">{a.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
