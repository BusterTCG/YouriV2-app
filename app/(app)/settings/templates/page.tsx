import Link from "next/link";
import { ArrowLeft, ListChecks } from "lucide-react";
import { prisma } from "@/lib/db";
import { TemplatesEditor } from "@/components/tasks/templates-editor";
import type { DealCategory } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Templates de tâches — Youri Prod",
};

/**
 * Page d'édition des TaskTemplate par catégorie de deal.
 *
 * Sprint 6 — Stan 2026-05-31. Les modifications ici n'impactent QUE les
 * nouveaux deals (snapshot intégral au moment de createDeal).
 */
export default async function TemplatesSettingsPage() {
  const templates = await prisma.taskTemplate.findMany({
    where: { deletedAt: null },
    orderBy: [{ category: "asc" }, { order: "asc" }],
  });

  const byCategory: Record<DealCategory, typeof templates> = {
    BOOKING: templates.filter((t) => t.category === "BOOKING"),
    PROD_EXE: templates.filter((t) => t.category === "PROD_EXE"),
    CACHETS: templates.filter((t) => t.category === "CACHETS"),
  };

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <Link
          href="/settings"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Paramètres
        </Link>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          <ListChecks className="h-3.5 w-3.5" />
          Configuration
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Templates de tâches
        </h1>
        <p className="text-muted-foreground text-sm">
          Définit le pipeline de tâches générées automatiquement à la création
          de chaque deal. <strong>Les modifications ici n&apos;affectent QUE
          les nouveaux deals</strong> — les deals existants conservent leur
          pipeline d&apos;origine.
        </p>
      </div>

      <TemplatesEditor
        booking={byCategory.BOOKING}
        prodExe={byCategory.PROD_EXE}
        cachets={byCategory.CACHETS}
      />
    </div>
  );
}
