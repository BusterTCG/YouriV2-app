import { Trash2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { prisma } from "@/lib/db";
import { TrashList } from "@/components/trash/trash-list";
import type { TrashItem } from "@/components/trash/trash-row";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Corbeille — Youri",
};

/** Libellés courts de catégorie pour le sous-titre des deals. */
const CATEGORY_LABEL: Record<string, string> = {
  BOOKING: "Booking",
  PROD_EXE: "Prod Exé",
  CACHETS: "Cachets",
};

/** Couleur d'accent du liseré gauche par type d'élément. */
const ACCENT: Record<TrashItem["type"], string> = {
  Deal: "#6366f1", // indigo
  Task: "#f59e0b", // amber
  Artist: "#8b5cf6", // violet
};

/**
 * Corbeille (Sprint 10) — liste unifiée des éléments soft-deletés, restaurables
 * ou supprimables définitivement. Copie du pattern KuroNeko `/trash`, adaptée
 * aux entités Youri : Deal, Task (uniquement celles dont le deal parent est
 * vivant — sinon elles reviennent via la restauration du deal), Artist.
 *
 * Pas d'extension soft-delete globale côté Youri (cf. lib/db.ts no-op) → on
 * filtre directement sur `deletedAt: { not: null }`.
 */
export default async function TrashPage() {
  const [deals, tasks, artists] = await Promise.all([
    prisma.deal.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: {
        id: true,
        title: true,
        category: true,
        date: true,
        organizerName: true,
        venueCity: true,
        deletedAt: true,
      },
    }),
    prisma.task.findMany({
      // Seulement les tâches supprimées dont le deal parent est VIVANT.
      where: { deletedAt: { not: null }, deal: { deletedAt: null } },
      orderBy: { deletedAt: "desc" },
      select: {
        id: true,
        label: true,
        dueAt: true,
        deletedAt: true,
        deal: { select: { title: true } },
      },
    }),
    prisma.artist.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: { id: true, name: true, deletedAt: true },
    }),
  ]);

  // Qui a supprimé quoi — une seule requête sur l'audit log (multi-user).
  const allIds = [
    ...deals.map((d) => d.id),
    ...tasks.map((t) => t.id),
    ...artists.map((a) => a.id),
  ];
  const deletedBy = new Map<string, string | null>();
  if (allIds.length > 0) {
    const auditRows = await prisma.auditEntry.findMany({
      where: { action: "delete", entityId: { in: allIds } },
      orderBy: { createdAt: "desc" },
      select: { entityId: true, actorName: true },
    });
    for (const a of auditRows) {
      if (!deletedBy.has(a.entityId)) deletedBy.set(a.entityId, a.actorName);
    }
  }

  const items: TrashItem[] = [
    ...deals.map<TrashItem>((d) => ({
      id: d.id,
      type: "Deal",
      title: d.title,
      subtitle: [
        CATEGORY_LABEL[d.category] ?? d.category,
        d.organizerName ?? d.venueCity,
        format(d.date, "d MMM yyyy", { locale: fr }),
      ]
        .filter(Boolean)
        .join(" · "),
      deletedAt: d.deletedAt!,
      deletedByName: deletedBy.get(d.id) ?? null,
      accentColor: ACCENT.Deal,
    })),
    ...tasks.map<TrashItem>((t) => ({
      id: t.id,
      type: "Task",
      title: t.label,
      subtitle: [
        t.deal?.title,
        t.dueAt ? `échéance ${format(t.dueAt, "d MMM yyyy", { locale: fr })}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      deletedAt: t.deletedAt!,
      deletedByName: deletedBy.get(t.id) ?? null,
      accentColor: ACCENT.Task,
    })),
    ...artists.map<TrashItem>((a) => ({
      id: a.id,
      type: "Artist",
      title: a.name,
      subtitle: null,
      deletedAt: a.deletedAt!,
      deletedByName: deletedBy.get(a.id) ?? null,
      accentColor: ACCENT.Artist,
    })),
  ].sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());

  return (
    <div className="max-w-4xl space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          <Trash2 className="h-3.5 w-3.5" />
          Corbeille · {items.length} élément{items.length > 1 ? "s" : ""}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Corbeille</h1>
        <p className="text-muted-foreground">
          Les éléments supprimés sont conservés ici. Vous pouvez les{" "}
          <span className="font-medium">restaurer</span> ou les{" "}
          <span className="font-medium">supprimer définitivement</span>. Une
          suppression définitive est irréversible.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed py-16 text-center text-sm text-muted-foreground">
          La corbeille est vide.
          <br />
          <span className="text-xs">
            Les deals, tâches et artistes supprimés apparaîtront ici.
          </span>
        </div>
      ) : (
        <TrashList items={items} />
      )}
    </div>
  );
}
