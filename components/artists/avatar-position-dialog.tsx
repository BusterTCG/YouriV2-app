"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Loader2, Move } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { updateArtistAvatarPosition } from "@/lib/actions/artists";

/**
 * Modale de repositionnement de la photo dans le rond avatar — copie fidèle
 * de KuroNeko-App `components/artists/avatar-position-dialog.tsx`.
 *
 * UX : drag direct (PointerEvents — desktop + mobile) sur preview 240px.
 * Sensibilité = 100/PREVIEW_SIZE → une traversée complète = 100 % object-pos.
 * Pas de zoom V1.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artistId: string;
  avatarUrl: string;
  name: string;
  initialPositionX: number;
  initialPositionY: number;
}

const PREVIEW_SIZE = 240;
const DRAG_SENSITIVITY = 100 / PREVIEW_SIZE;

export function AvatarPositionDialog({
  open,
  onOpenChange,
  artistId,
  avatarUrl,
  name,
  initialPositionX,
  initialPositionY,
}: Props) {
  const [posX, setPosX] = useState(initialPositionX);
  const [posY, setPosY] = useState(initialPositionY);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const draggingRef = useRef(false);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    posX: number;
    posY: number;
  } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  function onPointerDown(e: React.PointerEvent) {
    draggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX,
      posY,
    };
    previewRef.current?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const newX = dragStartRef.current.posX + dx * DRAG_SENSITIVITY;
    const newY = dragStartRef.current.posY + dy * DRAG_SENSITIVITY;
    setPosX(clamp(newX, 0, 100));
    setPosY(clamp(newY, 0, 100));
  }

  function onPointerUp(e: React.PointerEvent) {
    draggingRef.current = false;
    dragStartRef.current = null;
    previewRef.current?.releasePointerCapture(e.pointerId);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await updateArtistAvatarPosition({
        artistId,
        x: posX,
        y: posY,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onOpenChange(false);
    });
  }

  function handleReset() {
    setPosX(50);
    setPosY(50);
  }

  function handleCancel() {
    setPosX(initialPositionX);
    setPosY(initialPositionY);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : handleCancel())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Move className="h-4 w-4" />
            Repositionner la photo
          </DialogTitle>
          <DialogDescription>
            Fais glisser la photo dans le rond pour ajuster le cadrage.
            Centre le visage ou la partie que tu veux voir.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          <div
            ref={previewRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="relative rounded-full overflow-hidden border-2 border-foreground/20 cursor-grab active:cursor-grabbing touch-none select-none"
            style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
          >
            <Image
              src={avatarUrl}
              alt={name}
              width={PREVIEW_SIZE * 2}
              height={PREVIEW_SIZE * 2}
              draggable={false}
              className="h-full w-full object-cover pointer-events-none"
              style={{ objectPosition: `${posX}% ${posY}%` }}
            />
          </div>

          <div className="text-[11px] text-muted-foreground tabular-nums">
            X : {Math.round(posX)} % · Y : {Math.round(posY)} %
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive w-full text-center">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={pending}
          >
            Recentrer
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={pending}
          >
            Annuler
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={pending}
            className="gap-1.5"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
