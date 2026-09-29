import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDealReport } from "@/lib/deal-report";
import { DealReportPrint } from "@/components/shows/deal-report-print";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ showId: string }>;
}

// Page d'impression du compte de production d'une date — hors layout (app),
// convertie en PDF par /api/financial-export/[showId]?format=pdf.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { showId } = await params;
  const r = await getDealReport(showId, Date.now());
  return { title: r ? r.fileBase : "Compte de production" };
}

export default async function DealReportPrintPage({ params }: PageProps) {
  const { showId } = await params;
  // eslint-disable-next-line react-hooks/purity -- server component, 1 exécution / requête
  const r = await getDealReport(showId, Date.now());
  if (!r) notFound();
  return <DealReportPrint r={r} />;
}
