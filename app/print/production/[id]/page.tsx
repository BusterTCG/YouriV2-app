import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductionReport, reportFileBase } from "@/lib/production-report-server";
import { ProductionReportPrint } from "@/components/shows/production-report-print";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Page d'impression du bilan d'exploitation — hors layout (app), convertie en
// PDF par /api/production-report/[id]?format=pdf (Chromium headless).
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const r = await getProductionReport(id, Date.now());
  return { title: r ? reportFileBase(r) : "Bilan d'exploitation" };
}

export default async function ProductionReportPrintPage({ params }: PageProps) {
  const { id } = await params;
  // eslint-disable-next-line react-hooks/purity -- server component, 1 exécution / requête
  const r = await getProductionReport(id, Date.now());
  if (!r) notFound();
  return <ProductionReportPrint r={r} />;
}
