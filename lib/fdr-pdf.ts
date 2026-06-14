import "server-only";

import puppeteer from "puppeteer";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { prisma } from "@/lib/db";

/**
 * Génération PDF de la FDR — helper Node-only réutilisable.
 *
 * Extrait de `app/api/fdr-pdf/[id]/route.ts` (Lot C2) pour pouvoir
 * appeler depuis :
 *   - La route GET (téléchargement direct par l'user) → existant
 *   - La server action `sendBriefingByEmail` (Lot D) qui attache le PDF
 *     en PJ au mail envoyé via Resend
 *
 * Puppeteer demande Node Runtime (pas Edge) — d'où le `import "server-only"`.
 *
 * Chromium utilisé (approche KN, validée en prod) :
 *   - Dev local Windows/Mac : `puppeteer` bundled fonctionne tel quel.
 *   - Prod VPS Ubuntu : Google Chrome système via la variable d'env
 *     `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable` (lue
 *     automatiquement par `puppeteer.launch()`). Le deploy fait `npm ci` avec
 *     `PUPPETEER_SKIP_DOWNLOAD=true` → pas de Chromium bundled côté serveur,
 *     donc Chrome système obligatoire (installer `google-chrome-stable`).
 */

export interface FdrPdfResult {
  /** Le PDF binaire brut en ArrayBuffer (compatible Blob/NextResponse strict). */
  buffer: ArrayBuffer;
  /** Nom de fichier propre (sans extension) — ex. "FDR Boriss - Estrade 280526". */
  filename: string;
}

/**
 * Génère le PDF d'une FDR à partir du dealId.
 *
 * @param dealId — ID du Deal Booking
 * @param origin — Origin absolu pour atteindre /print/fdr (ex. "http://localhost:3001")
 * @param sessionToken — Cookie `youri-session` JWT à forwarder à Puppeteer
 *                      pour bypass le middleware auth (sinon redirige sur /login)
 * @throws Error si deal introuvable, Puppeteer échoue, ou navigation timeout
 */
export async function generateFdrPdf(
  dealId: string,
  origin: string,
  sessionToken: string,
): Promise<FdrPdfResult> {
  // Métadonnées légères pour le nom de fichier.
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, deletedAt: null, category: "BOOKING" },
    select: {
      date: true,
      venueCity: true,
      venueName: true,
      briefing: { select: { venueName: true } },
      dealArtistes: {
        where: { deletedAt: null },
        select: { artist: { select: { name: true } } },
      },
    },
  });
  if (!deal) {
    throw new Error("Deal Booking introuvable");
  }

  const lieu =
    deal.briefing?.venueName ?? deal.venueName ?? deal.venueCity ?? "Lieu";
  const dateStr = format(deal.date, "ddMMyy", { locale: fr });
  const artistesStr =
    deal.dealArtistes.map((da) => da.artist.name).join(", ") || "—";
  const filename = `FDR ${artistesStr} - ${lieu} ${dateStr}`
    .replace(/[^\w\s\-,]/g, "")
    .trim();

  // En PROD, l'app est derrière nginx (TLS) qui proxy vers le port local en
  // HTTP. Viser le domaine public (https://app.pangeeprod.com) donnerait un
  // mélange proto https forwardé + port interne http → net::ERR_SSL_PROTOCOL_
  // ERROR. Puppeteer tournant sur la MÊME machine, on vise la loopback HTTP
  // (bypass nginx/TLS). En dev, l'`origin` passé (localhost:port) est correct.
  // Port Youri prod = 3001 (next start -p 3001) — cf. PORT env si surchargé.
  const internalBase =
    process.env.NODE_ENV === "production"
      ? `http://127.0.0.1:${process.env.PORT ?? "3001"}`
      : origin;
  const printUrl = `${internalBase}/print/fdr/${dealId}?preview=1`;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 }); // A4 @ 96dpi

    // Forward du cookie de session via header — bypass le middleware auth de
    // Youri (Puppeteer = navigateur neuf sans cookie, sinon rend /login en PDF).
    // Via header plutôt que page.setCookie : plus robuste sur la loopback
    // (pas de contrainte de match domaine / flag secure).
    if (sessionToken) {
      await page.setExtraHTTPHeaders({
        Cookie: `youri-session=${sessionToken}`,
      });
    }

    await page.goto(printUrl, { waitUntil: "networkidle0", timeout: 30_000 });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    await browser.close();
    // Copie dans un ArrayBuffer strict — compatible Blob (NextResponse).
    // Les callers qui ont besoin de Buffer (Resend) feront Buffer.from(arrBuf).
    const arrBuf = new ArrayBuffer(pdfBuffer.byteLength);
    new Uint8Array(arrBuf).set(pdfBuffer);
    return {
      buffer: arrBuf,
      filename,
    };
  } catch (err) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    throw err;
  }
}
