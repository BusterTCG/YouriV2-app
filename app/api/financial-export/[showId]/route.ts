/**
 * Compte de production d'une date de production (portage KN, Stan 2026-09-27 —
 * même design et même architecture que le bilan d'exploitation).
 *   GET ?format=xlsx (défaut) → Excel (lib/finance/deal-report-excel.ts)
 *   GET ?format=pdf           → PDF A4 paysage rendu depuis /print/compte/[showId]
 * Route protégée par le middleware (session youri-session).
 */

import { NextResponse } from "next/server";
import { getDealReport } from "@/lib/deal-report";
import { buildDealReportXlsx } from "@/lib/finance/deal-report-excel";
import { XLSX_MIME, fileResponse, renderPrintPagePdf } from "@/lib/pdf/report-response";
import { canAccessDeal } from "@/lib/auth/access";

interface RouteContext {
  params: Promise<{ showId: string }>;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { showId } = await params;
  if (!(await canAccessDeal(showId))) {
    return NextResponse.json({ ok: false, error: "Accès non autorisé" }, { status: 403 });
  }
  const fmt = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const report = await getDealReport(showId, Date.now());
  if (!report) return new NextResponse("Date introuvable", { status: 404 });
  try {
    if (fmt === "xlsx") {
      return fileResponse(await buildDealReportXlsx(report), `${report.fileBase}.xlsx`, XLSX_MIME);
    }
    const pdf = await renderPrintPagePdf(request, `/print/compte/${showId}`);
    return fileResponse(pdf, `${report.fileBase}.pdf`, "application/pdf");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return new NextResponse(`Erreur génération compte de production : ${message}`, { status: 500 });
  }
}
