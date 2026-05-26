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
 * Note prod : sur VPS / Vercel, `puppeteer` bundled ne marche pas. Migrer
 * vers `puppeteer-core` + `@sparticuz/chromium` au déploiement.
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

  const printUrl = `${origin}/print/fdr/${dealId}?preview=1`;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 }); // A4 @ 96dpi

    // Forward du cookie de session — bypass le middleware auth de Youri V2.
    const url = new URL(printUrl);
    await page.setCookie({
      name: "youri-session",
      value: sessionToken,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    });

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
