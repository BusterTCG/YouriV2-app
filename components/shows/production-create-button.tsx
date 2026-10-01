"use client";

// « Nouvelle production » (portage KN, Stan 2026-10-01) : depuis l'accueil, on crée
// d'abord le spectacle (artiste + nom, contrat facultatif), puis on entre
// dans sa fiche pour ajouter dates, tournées et résidences.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createProduction } from "@/lib/actions/productions";

export function ProductionCreateButton({
  artists,
}: {
  artists: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [artistId, setArtistId] = useState("");
  const [name, setName] = useState("");
  const [prodExe, setProdExe] = useState("");
  const [coprod, setCoprod] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pct = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  function reset() {
    setArtistId("");
    setName("");
    setProdExe("");
    setCoprod("");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createProduction({
        artistId,
        name,
        prodExePct: pct(prodExe),
        coprodKnPct: pct(coprod),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      reset();
      if (res.data) router.push(`/shows/production/${res.data.id}`);
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1.5" />
        Nouvelle production
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle production</DialogTitle>
            <DialogDescription>
              Crée le spectacle, puis ajoute ses dates, tournées et résidences depuis sa fiche.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="space-y-1">
              <label className="text-xs font-medium">Artiste</label>
              <Select value={artistId} onValueChange={setArtistId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Choisir l'artiste…" />
                </SelectTrigger>
                <SelectContent>
                  {artists.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Nom du spectacle</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex. Insomniaque"
                className="h-9"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Prod-exé (% du CA)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={prodExe}
                  onChange={(e) => setProdExe(e.target.value)}
                  placeholder="facultatif"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Co-prod (% du bénéfice)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={coprod}
                  onChange={(e) => setCoprod(e.target.value)}
                  placeholder="facultatif"
                  className="h-9"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Le contrat se complète ensuite dans l&apos;onglet Contrat de la production.
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={pending || !artistId || !name.trim()}>
                {pending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Créer la production
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
