import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import FdrPage from "@/app/(app)/deals/booking/[id]/fdr/page";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * FDR d'une date de production — route KN (/shows/[id]/briefing, bouton
 * « Ouvrir la FDR » / « Créer la FDR » de la fiche date). Même éditeur que la
 * FDR Booking ; le fil d'Ariane et les retours pointent vers /shows.
 */
export default async function ShowBriefingPage({ params }: PageProps) {
  const { id } = await params;
  const deal = await prisma.deal.findFirst({
    where: { id, deletedAt: null, category: "PROD_EXE" },
    select: { id: true },
  });
  if (!deal) notFound();
  return FdrPage({ params });
}
