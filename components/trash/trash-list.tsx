"use client";

import { useRouter } from "next/navigation";
import { TrashRow, type TrashItem, type TrashType } from "./trash-row";
import { restoreDeal, permanentlyDeleteDeal } from "@/lib/actions/deals";
import { restoreTask, permanentlyDeleteTask } from "@/lib/actions/tasks";
import { restoreArtist, permanentlyDeleteArtist } from "@/lib/actions/artists";
import type { ActionResult } from "@/lib/errors";

interface Props {
  items: TrashItem[];
}

/**
 * Liste cliente de la corbeille — dispatch restore / suppression définitive
 * vers la bonne server action selon le type. Copie du pattern KuroNeko
 * `trash-list`, adaptée aux entités Youri (Deal / Task / Artist).
 *
 * En cas d'échec d'une action (ex: suppression définitive d'un artiste lié à
 * des deals → bloquée), on remonte le message d'erreur via `alert` plutôt que
 * d'échouer silencieusement.
 */
export function TrashList({ items }: Props) {
  const router = useRouter();

  async function run(res: ActionResult) {
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  async function handleRestore(id: string, type: TrashType) {
    if (type === "Deal") await run(await restoreDeal(id));
    else if (type === "Task") await run(await restoreTask(id));
    else if (type === "Artist") await run(await restoreArtist(id));
  }

  async function handleDelete(id: string, type: TrashType) {
    if (type === "Deal") await run(await permanentlyDeleteDeal(id));
    else if (type === "Task") await run(await permanentlyDeleteTask(id));
    else if (type === "Artist") await run(await permanentlyDeleteArtist(id));
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <TrashRow
          key={`${item.type}-${item.id}`}
          item={item}
          onRestore={handleRestore}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}
