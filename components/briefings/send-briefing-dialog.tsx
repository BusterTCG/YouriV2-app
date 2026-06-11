"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  Paperclip,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { sendBriefingByEmail } from "@/lib/actions/briefings";

/**
 * Dialog d'envoi mail de la FDR — Sprint 3.7 Lot D.
 *
 * Reçoit la liste des dealArtistes du deal avec leur personalEmail
 * (depuis ArtistProfile, fetché côté server parent). Affichage :
 *   - Checkbox par artiste avec email pré-rempli
 *   - Si email manquant → warning + lien vers /artistes/[slug]?tab=info
 *   - Sujet pré-rempli "FDR — {Artistes} — {Lieu} — {DDMMYY}"
 *   - Body pré-rempli avec template Pangee standard
 *   - Bouton "Envoyer" qui appelle sendBriefingByEmail → PDF auto en PJ
 */

export interface SendDialogArtiste {
  /** ID du DealArtiste (clé pour cocher/décocher). */
  dealArtisteId: string;
  artistName: string;
  artistSlug: string;
  /** Email récupéré depuis ArtistProfile.personalEmail — peut être null. */
  email: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  briefingId: string;
  dealId: string;
  dealTitle: string;
  dealDate: Date;
  venueLabel: string | null;
  artistes: SendDialogArtiste[];
}

export function SendBriefingDialog({
  open,
  onOpenChange,
  briefingId,
  dealId: _dealId,
  dealTitle,
  dealDate,
  venueLabel,
  artistes,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string[] | null>(null);

  // Cochés par défaut : tous ceux qui ont un email valide
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Init du subject + body au montage / réouverture
  const defaultSubject = `FDR — ${artistes.map((a) => a.artistName).join(", ") || "—"} — ${venueLabel ?? "—"} — ${format(dealDate, "dd/MM/yy", { locale: fr })}`;
  const defaultBody = `Bonjour,

Tu trouveras ci-joint la feuille de route pour ${dealTitle}, le ${format(dealDate, "EEEE d MMMM yyyy", { locale: fr })}${venueLabel ? ` à ${venueLabel}` : ""}.

N'hésite pas à revenir vers nous pour toute question.

L'équipe Pangee Prod`;

  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  /** Pièces jointes additionnelles (billets de train, fiche technique, etc.)
   *  Le PDF de la FDR est ajouté automatiquement côté server au moment de
   *  l'envoi — pas la peine de le faire transiter par le client. */
  const [attachments, setAttachments] = useState<File[]>([]);

  // Reset à l'ouverture
  useEffect(() => {
    if (open) {
      setError(null);
      setSuccess(null);
      setChecked(
        new Set(
          artistes.filter((a) => a.email).map((a) => a.dealArtisteId),
        ),
      );
      setSubject(defaultSubject);
      setBody(defaultBody);
      setAttachments([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    setError(null);
    setSuccess(null);
    const ids = Array.from(checked);
    if (ids.length === 0) {
      setError("Coche au moins un destinataire.");
      return;
    }
    startTransition(async () => {
      try {
        // Convertit les PJ en base64 (FileReader → readAsDataURL → split).
        // Le PDF FDR sera attaché auto côté server, pas besoin ici.
        const additionalAttachments = await Promise.all(
          attachments.map(
            (f) =>
              new Promise<{
                filename: string;
                contentBase64: string;
                mimeType: string;
              }>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const result = reader.result as string;
                  // dataURL = "data:<mime>;base64,<payload>"
                  const base64 = result.split(",")[1] ?? "";
                  resolve({
                    filename: f.name,
                    contentBase64: base64,
                    mimeType: f.type || "application/octet-stream",
                  });
                };
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(f);
              }),
          ),
        );

        const res = await sendBriefingByEmail({
          briefingId,
          dealArtisteIds: ids,
          subject,
          body,
          additionalAttachments,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setSuccess(res.data?.sentTo ?? []);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur conversion fichiers");
      }
    });
  }

  function addFiles(files: FileList | File[]) {
    setAttachments((prev) => [...prev, ...Array.from(files)]);
  }
  function removeFile(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  const validCount = Array.from(checked).filter((id) => {
    const a = artistes.find((x) => x.dealArtisteId === id);
    return a && a.email;
  }).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-yr-gold" />
            Envoyer la FDR par mail
          </DialogTitle>
          <DialogDescription>
            La FDR sera envoyée en pièce jointe PDF aux destinataires
            cochés. Le statut passera à <strong>📧 Envoyée</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Liste destinataires */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Destinataires ({validCount} coché{validCount > 1 ? "s" : ""})
            </label>
            <div className="rounded-md border bg-card overflow-hidden divide-y">
              {artistes.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground italic text-center">
                  Aucun artiste rattaché à ce deal.
                </div>
              ) : (
                artistes.map((a) => {
                  const hasEmail = !!a.email;
                  const isChecked = checked.has(a.dealArtisteId);
                  return (
                    <label
                      key={a.dealArtisteId}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 text-sm",
                        hasEmail
                          ? "cursor-pointer hover:bg-accent/30"
                          : "opacity-70",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={!hasEmail}
                        onChange={() => toggle(a.dealArtisteId)}
                        className="h-4 w-4 accent-yr-gold"
                      />
                      <span className="font-medium flex-1 min-w-0 truncate">
                        {a.artistName}
                      </span>
                      {hasEmail ? (
                        <span className="text-xs text-muted-foreground tabular-nums truncate max-w-[280px]">
                          {a.email}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Email manquant —{" "}
                          <Link
                            href={`/artistes/${a.artistSlug}?tab=info`}
                            target="_blank"
                            className="underline hover:text-amber-900"
                          >
                            compléter
                          </Link>
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Sujet */}
          <div className="space-y-1.5">
            <label
              htmlFor="mail-subject"
              className="text-xs uppercase tracking-wider text-muted-foreground font-semibold"
            >
              Sujet *
            </label>
            <Input
              id="mail-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={pending}
              className="text-sm"
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <label
              htmlFor="mail-body"
              className="text-xs uppercase tracking-wider text-muted-foreground font-semibold"
            >
              Message *
            </label>
            <Textarea
              id="mail-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              disabled={pending}
              className="text-sm"
            />
          </div>

          {/* Zone PJ — la FDR PDF s'attache auto côté server, l'user peut
              ajouter d'autres documents (billets train, fiche tech, etc.).
              Stan 2026-05-26 : copie fidèle KN AttachmentZone. */}
          <AttachmentZone
            attachments={attachments}
            onAdd={addFiles}
            onRemove={removeFile}
            disabled={pending}
          />

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              ⚠ {error}
            </div>
          )}
          {success && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5 inline mr-1" />
              FDR envoyée à : <strong>{success.join(", ")}</strong>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {success ? "Fermer" : "Annuler"}
          </Button>
          {!success && (
            <Button
              type="button"
              onClick={submit}
              disabled={pending || validCount === 0}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-1.5" />
              )}
              Envoyer à {validCount} destinataire{validCount > 1 ? "s" : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────── AttachmentZone ────────────────────────────

/**
 * Zone drag & drop + bouton Parcourir pour ajouter des PJ additionnelles
 * (billets de train, fiche technique, etc.). Stan 2026-05-26 — copie
 * fidèle KN AttachmentZone.
 *
 * Le PDF de la FDR est attaché AUTOMATIQUEMENT côté server au moment de
 * l'envoi — pas besoin de le faire transiter par le client. Mention "FDR
 * PDF auto-attachée" affichée pour rassurer l'user.
 */
function AttachmentZone({
  attachments,
  onAdd,
  onRemove,
  disabled,
}: {
  attachments: File[];
  onAdd: (files: FileList | File[]) => void;
  onRemove: (idx: number) => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) onAdd(e.dataTransfer.files);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Pièces jointes
          {attachments.length > 0 && (
            <span className="ml-1.5 normal-case text-muted-foreground/70">
              ({attachments.length + 1})
            </span>
          )}
        </label>
        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
          <FileText className="h-3 w-3" />
          FDR PDF attachée automatiquement
        </span>
      </div>

      {/* Zone drop */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-md border-2 border-dashed p-3 transition-colors flex items-center justify-between gap-3 flex-wrap",
          dragging
            ? "border-yr-gold bg-yr-gold/10"
            : "border-muted-foreground/30 bg-muted/20",
        )}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          <Paperclip className="h-4 w-4 text-muted-foreground/60 shrink-0" />
          <span>
            Glisser-déposer d&apos;autres documents (billets de train, fiche
            technique…)
          </span>
        </div>
        <label
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium text-yr-gold shrink-0",
            disabled
              ? "opacity-50 cursor-not-allowed"
              : "cursor-pointer hover:underline",
          )}
        >
          ou Parcourir
          <input
            type="file"
            multiple
            className="hidden"
            disabled={disabled}
            onChange={(e) => {
              if (e.target.files) onAdd(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {/* Liste des fichiers ajoutés */}
      {attachments.length > 0 && (
        <ul className="space-y-1">
          {attachments.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-2 text-xs bg-card rounded-md border px-2 py-1.5"
            >
              <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate" title={f.name}>
                {f.name}
              </span>
              <span className="text-muted-foreground tabular-nums shrink-0 text-[10px]">
                {(f.size / 1024).toFixed(0)} ko
              </span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                disabled={disabled}
                className="text-destructive hover:bg-destructive/10 rounded p-0.5 disabled:opacity-50"
                title="Retirer"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
