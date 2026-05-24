import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme/theme-provider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Youri — Pangee Prod",
  description: "Outil interne de gestion pour Pangee Prod",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Youri",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // empêche zoom involontaire iOS
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Eruda devtools mobile — chargé en dev uniquement, inline dans <head> pour
  // bypasser le cycle d'hydration React. Permet de débugger sur smartphone
  // (console, network, elements inspector). Apparaît comme un bouton flottant
  // en bas à droite. Désactivable via ?noeruda=1 dans l'URL.
  // Cf. docs/process/mobile-testing.md
  const isDev = process.env.NODE_ENV === "development";

  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {isDev && (
          <script
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  if (new URLSearchParams(location.search).get('noeruda') === '1') return;
                  var s = document.createElement('script');
                  s.src = 'https://cdn.jsdelivr.net/npm/eruda';
                  s.onload = function() { window.eruda && window.eruda.init(); };
                  document.head.appendChild(s);
                })();
              `,
            }}
          />
        )}
      </head>
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
