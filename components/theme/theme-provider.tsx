"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Theme provider — wrapper next-themes pour light/dark mode.
 * Configuré dans app/layout.tsx :
 *   <ThemeProvider attribute="class" defaultTheme="light" enableSystem
 *                  disableTransitionOnChange>
 *
 * Le thème est appliqué via classe `.dark` sur <html> ; les variables CSS
 * (cf. app/globals.css) prennent le relais pour les couleurs.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
