import type { MetadataRoute } from "next";

/**
 * Web App Manifest — permet l'install "Ajouter à l'écran d'accueil" sur
 * iOS/Android, lance l'app en mode standalone (sans la barre Safari).
 *
 * Icons générées par `scripts/generate-icons.mjs` (à venir sprint icônes
 * définitives) depuis le logo Pangee/Youri.
 *
 * Convention Next 16 : Next sert ce fichier sous /manifest.webmanifest.
 *
 * Cf. docs/process/mobile-testing.md § PWA.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Youri — Pangee Prod",
    short_name: "Youri",
    description: "Outil interne de gestion pour Pangee Prod",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
