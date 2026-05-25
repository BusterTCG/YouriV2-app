"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Camera, Loader2, X, Move } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  uploadArtistAvatar,
  removeArtistAvatar,
} from "@/lib/actions/artists";
import { AvatarPositionDialog } from "./avatar-position-dialog";

/**
 * Avatar artiste — copie fidèle de KuroNeko-App `components/artists/artist-avatar.tsx`.
 *
 * - Mode `editable={true}` (fiche artiste header) : overlay caméra au hover,
 *   click → file picker natif (caméra/galerie sur mobile), X pour retirer,
 *   Move pour ouvrir AvatarPositionDialog (recadrage).
 * - Mode read-only (liste cards) : juste affichage.
 *
 * Si `avatarUrl` fourni : affiche l'image (avec fallback initiales si l'image
 * échoue à charger via onError). Sinon : rond plein avec initiales sur la
 * couleur de l'artiste.
 */
interface BaseProps {
  name: string;
  color: string;
  avatarUrl?: string | null;
  positionX?: number;
  positionY?: number;
  sizeClass?: string;
  textClass?: string;
  className?: string;
}

interface EditableProps extends BaseProps {
  editable: true;
  artistId: string;
}

interface ReadOnlyProps extends BaseProps {
  editable?: false;
  artistId?: string;
}

type Props = EditableProps | ReadOnlyProps;

export function ArtistAvatar(props: Props) {
  const {
    name,
    color,
    avatarUrl,
    positionX = 50,
    positionY = 50,
    sizeClass = "h-10 w-10",
    textClass = "text-sm",
    className,
  } = props;
  const editable = props.editable ?? false;
  const artistId = editable ? props.artistId : null;

  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [imgFailed, setImgFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positionDialogOpen, setPositionDialogOpen] = useState(false);

  const hasImage = !!avatarUrl && !imgFailed;
  const ini = initials(name);

  function openPicker() {
    if (!editable || pending) return;
    fileRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !artistId) return;
    setError(null);
    setImgFailed(false);
    const form = new FormData();
    form.append("artistId", artistId);
    form.append("file", file);
    startTransition(async () => {
      const res = await uploadArtistAvatar(form);
      if (!res.ok) setError(res.error);
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!artistId || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await removeArtistAvatar(artistId);
      if (!res.ok) setError(res.error);
    });
  }

  // Rendu interne du rond — object-position en % permet à l'utilisateur
  // de recadrer la photo dans le rond sans modifier le fichier source.
  const inner = hasImage ? (
    <Image
      src={avatarUrl}
      alt={name}
      width={240}
      height={240}
      className="h-full w-full object-cover"
      style={{ objectPosition: `${positionX}% ${positionY}%` }}
      onError={() => setImgFailed(true)}
    />
  ) : (
    <span className={cn("text-white font-semibold", textClass)}>{ini}</span>
  );

  // Mode non éditable : rendu simple, pas d'event
  if (!editable) {
    return (
      <div
        className={cn(
          sizeClass,
          "rounded-full flex items-center justify-center overflow-hidden shrink-0",
          className,
        )}
        style={hasImage ? undefined : { backgroundColor: color }}
      >
        {inner}
      </div>
    );
  }

  // Mode éditable : wrap clickable + overlay caméra au hover + bouton remove
  return (
    <div className={cn("relative shrink-0", className)}>
      {/* Pas de `capture` → iOS Safari ouvre le picker natif (Photothèque
          en premier, Prendre une photo + Parcourir en options). */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={pending}
        title={hasImage ? "Changer la photo" : "Ajouter une photo"}
        className={cn(
          sizeClass,
          "rounded-full flex items-center justify-center overflow-hidden cursor-pointer relative group/avatar transition-all",
          "ring-2 ring-transparent hover:ring-foreground/20 focus-visible:ring-foreground/40 focus-visible:outline-none",
          pending && "opacity-60 cursor-wait",
        )}
        style={hasImage ? undefined : { backgroundColor: color }}
      >
        {inner}
        {!pending && (
          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100 group-active/avatar:opacity-100 transition-opacity flex items-center justify-center">
            <Camera className="h-4 w-4 text-white" />
          </span>
        )}
        {pending && (
          <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="h-4 w-4 text-white animate-spin" />
          </span>
        )}
      </button>

      {/* Bouton retirer la photo (visible uniquement si photo + non pending) */}
      {hasImage && !pending && (
        <button
          type="button"
          onClick={handleRemove}
          title="Retirer la photo"
          className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-background border shadow-sm flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {/* Bouton repositionner */}
      {hasImage && !pending && artistId && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPositionDialogOpen(true);
          }}
          title="Repositionner la photo"
          className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background border shadow-sm flex items-center justify-center hover:bg-foreground hover:text-background transition-colors"
        >
          <Move className="h-3 w-3" />
        </button>
      )}

      {error && (
        <div className="absolute top-full left-0 mt-1 z-20 rounded-md border bg-destructive/10 text-destructive px-2 py-1 text-[10px] whitespace-nowrap shadow-md">
          {error}
        </div>
      )}

      {hasImage && artistId && avatarUrl && (
        <AvatarPositionDialog
          open={positionDialogOpen}
          onOpenChange={setPositionDialogOpen}
          artistId={artistId}
          avatarUrl={avatarUrl}
          name={name}
          initialPositionX={positionX}
          initialPositionY={positionY}
        />
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
