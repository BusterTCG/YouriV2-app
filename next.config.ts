import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Origins autorisés en dev pour le tunnel cloudflared (test iPhone HTTPS).
   * Sans ça, Next 16 bloque les requêtes cross-origin en dev avec un warning
   * et casse le HMR via le tunnel. Voir docs/process/mobile-testing.md.
   */
  allowedDevOrigins: ["*.trycloudflare.com"],

  /**
   * Limite augmentée pour les uploads (contrats PDF, avatars artistes).
   * Par défaut 1MB → trop juste pour un scan A4.
   */
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
