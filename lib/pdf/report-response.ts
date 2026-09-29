import "server-only";

// Rendu PDF d'une page /print/* par Chromium + réponse fichier, commun aux
// documents financiers (bilan d'exploitation, compte de production) — portage
// KN. Même mécanique que la FDR (cf. lib/fdr-pdf.ts).

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import puppeteer from "puppeteer";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Réponse de téléchargement — filename ASCII de repli + filename* UTF-8. */
export function fileResponse(buf: Buffer | Uint8Array, filename: string, type: string) {
  const ascii = filename.normalize("NFD").replace(/[^\x20-\x7e]/g, "");
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}

/** Rend `printPath` (ex. "/print/compte/abc") en PDF A4 paysage. */
export async function renderPrintPagePdf(request: Request, printPath: string): Promise<Uint8Array> {
  // Derrière nginx en prod : Chromium vise la loopback HTTP (port Youri 3001,
  // cf. lib/fdr-pdf.ts).
  const base =
    process.env.NODE_ENV === "production"
      ? `http://127.0.0.1:${process.env.PORT ?? "3001"}`
      : new URL(request.url).origin;
  // /print est protégé par le middleware → on transmet le cookie de session.
  const sessionToken = (await cookies()).get("youri-session")?.value;
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    if (sessionToken) {
      await page.setExtraHTTPHeaders({ Cookie: `youri-session=${sessionToken}` });
    }
    await page.setViewport({ width: 1123, height: 794 }); // A4 paysage @ 96 dpi
    await page.goto(`${base}${printPath}`, { waitUntil: "networkidle0", timeout: 30_000 });
    return await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await browser.close().catch(() => {});
  }
}
