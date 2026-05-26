/**
 * Endpoint qui rend une FDR Pangee en PDF binaire — Sprint 3.7 Lot C2.
 *
 * Copie fidèle KN `/api/fdr-pdf/[showId]` adaptée Pangee multi-artiste :
 *   - Param URL = dealId (vs showId KN)
 *   - Nom fichier = "FDR {Artistes joinés} - {Lieu} DDMMYY.pdf"
 *   - Source HTML = /print/fdr/[id]?preview=1 (vue Lot C1)
 *
 * Flux :
 *   1. Lance Chromium headless via Puppeteer
 *   2. Navigue sur /print/fdr/[id]?preview=1 (preview=1 évite l'auto-print)
 *   3. Attend networkidle0 (fonts + images chargées)
 *   4. Génère PDF A4 portrait avec `page.pdf()`
 *   5. Retourne le buffer avec Content-Disposition: attachment
 *
 * Sur Vercel/VPS prod : `puppeteer` bundled ne marche pas → migrer vers
 * `puppeteer-core` + `@sparticuz/chromium`. Pour le dev local Windows/Mac,
 * `puppeteer` standalone fonctionne tel quel.
 */

import { NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { prisma } from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;

  // Métadonnées légères pour construire le nom de fichier (pas l'intégrale).
  const deal = await prisma.deal.findFirst({
    where: { id, deletedAt: null, category: "BOOKING" },
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
    return new NextResponse("Deal Booking introuvable", { status: 404 });
  }

  const lieu =
    deal.briefing?.venueName ?? deal.venueName ?? deal.venueCity ?? "Lieu";
  const dateStr = format(deal.date, "ddMMyy", { locale: fr });
  const artistesStr =
    deal.dealArtistes.map((da) => da.artist.name).join(", ") || "—";
  // Nom de fichier propre : pas d'accent ni caractère spécial qui pose
  // souci selon les OS / mailers. On garde lettres / chiffres / espaces /
  // tirets / virgules (pour les artistes joints).
  const safeName = `FDR ${artistesStr} - ${lieu} ${dateStr}`
    .replace(/[^\w\s\-,]/g, "")
    .trim();

  // URL absolue de la vue print — preview=1 désactive l'auto-print
  // (sinon Puppeteer déclencherait window.print() dans le contexte
  // headless, sans effet mais inutile).
  const origin = new URL(request.url).origin;
  const printUrl = `${origin}/print/fdr/${id}?preview=1`;

  // ─ Forward de la session user à Puppeteer ─
  // Sans cookie, le middleware redirige Puppeteer vers /login (Youri V2 est
  // multi-user authentifié). On lit le cookie `youri-session` JWT de la
  // requête entrante et on l'injecte dans Puppeteer pour qu'il ait la même
  // session que l'utilisateur qui a déclenché le téléchargement.
  const sessionToken = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("youri-session="))
    ?.slice("youri-session=".length);
  if (!sessionToken) {
    return new NextResponse("Non authentifié", { status: 401 });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 }); // A4 @ 96dpi

    // Injecte le cookie de session AVANT la navigation — Puppeteer enverra
    // ce cookie au middleware Edge qui validera le JWT et laissera passer.
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
      printBackground: true, // Préserve les fonds (bandeau navy + or)
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    await browser.close();
    browser = undefined;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
        // Cache court : si l'user édite la FDR, il veut un PDF à jour.
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (err) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return new NextResponse(`Erreur génération PDF : ${message}`, {
      status: 500,
    });
  }
}
