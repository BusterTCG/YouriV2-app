/**
 * Endpoint GET qui rend une FDR Pangee en PDF binaire — Sprint 3.7 Lot C2.
 *
 * La logique Puppeteer + nom de fichier vit dans `lib/fdr-pdf.ts` (helper
 * réutilisable depuis la server action `sendBriefingByEmail` du Lot D).
 * Ici on ne fait que :
 *   1. Lire le cookie de session entrant
 *   2. Déléguer à `generateFdrPdf()`
 *   3. Retourner le binaire avec Content-Disposition: attachment
 */

import { NextResponse } from "next/server";
import { generateFdrPdf } from "@/lib/fdr-pdf";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;

  // Forward du cookie session user à Puppeteer (sinon middleware redirige sur /login)
  const sessionToken = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("youri-session="))
    ?.slice("youri-session=".length);
  if (!sessionToken) {
    return new NextResponse("Non authentifié", { status: 401 });
  }

  try {
    const origin = new URL(request.url).origin;
    const { buffer, filename } = await generateFdrPdf(id, origin, sessionToken);

    // Wrap dans un Blob — NextResponse n'accepte plus directement Uint8Array
    // sur le type strict BodyInit (TS récent).
    return new NextResponse(
      new Blob([buffer], { type: "application/pdf" }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}.pdf"`,
          "Cache-Control": "no-store, must-revalidate",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    const status = message.includes("introuvable") ? 404 : 500;
    return new NextResponse(`Erreur génération PDF : ${message}`, { status });
  }
}
