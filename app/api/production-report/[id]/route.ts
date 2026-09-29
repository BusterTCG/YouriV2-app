/**
 * Bilan d'exploitation d'une production (portage KN, Stan 2026-09-27).
 *   GET ?format=xlsx (défaut) → Excel (lib/finance/production-report-excel.ts)
 *   GET ?format=pdf           → PDF A4 paysage rendu depuis /print/production/[id]
 * Route protégée par le middleware (session youri-session).
 */

import { NextResponse } from "next/server";
import { getProductionReport, reportFileBase } from "@/lib/production-report-server";
import { buildProductionReportXlsx } from "@/lib/finance/production-report-excel";
import { XLSX_MIME, fileResponse, renderPrintPagePdf } from "@/lib/pdf/report-response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const fmt = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const report = await getProductionReport(id, Date.now());
  if (!report) return new NextResponse("Production introuvable", { status: 404 });
  const base = reportFileBase(report);
  try {
    if (fmt === "xlsx") {
      return fileResponse(await buildProductionReportXlsx(report), `${base}.xlsx`, XLSX_MIME);
    }
    const pdf = await renderPrintPagePdf(request, `/print/production/${id}`);
    return fileResponse(pdf, `${base}.pdf`, "application/pdf");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return new NextResponse(`Erreur génération bilan : ${message}`, { status: 500 });
  }
}
