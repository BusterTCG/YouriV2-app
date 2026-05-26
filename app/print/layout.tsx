// Layout dédié à la page d'impression FDR.
// Neutralise le shell app (sidebar/topbar) — la page imprimée doit être propre.
// Reprend le pattern KuroNeko-App `app/print/layout.tsx`.

export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-white text-black">{children}</div>;
}
