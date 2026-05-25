"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PERIOD_PRESET_OPTIONS,
  STATUS_OPTIONS,
  DEFAULT_PERIOD,
  DEFAULT_STATUS,
  type PeriodPreset,
  type DealsListStatus,
} from "@/lib/deals-list-types";
import { ArtistFilterCombobox } from "@/components/shared/artist-filter-combobox";

/**
 * Filtres /deals/booking — pattern KN "dropdown mobile / segments desktop".
 * Identique KN sauf : pas de filtre catégorie (on est déjà sur BOOKING).
 *
 * Mobile (<md) : grid 2 cols (Période + Statut) + bouton reset.
 * Desktop (≥md) : segments inline + combobox artiste avec recherche texte.
 */
interface Props {
  period: PeriodPreset;
  status: DealsListStatus;
  artistSlug: string | null;
  artists: Array<{ id: string; name: string; slug: string }>;
}

export function DealsFilters({ period, status, artistSlug, artists }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string | null, defaultValue?: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || (defaultValue && value === defaultValue)) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  const hasFilter =
    period !== DEFAULT_PERIOD || status !== DEFAULT_STATUS || !!artistSlug;

  function reset() {
    router.replace(pathname);
  }

  return (
    <div className="space-y-2">
      {/* ─── Vue MOBILE ─── */}
      <div className="md:hidden grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Période
          </label>
          <Select value={period} onValueChange={(v) => setParam("period", v, DEFAULT_PERIOD)}>
            <SelectTrigger className="h-9 text-sm w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_PRESET_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Encaissement
          </label>
          <Select value={status} onValueChange={(v) => setParam("status", v, DEFAULT_STATUS)}>
            <SelectTrigger className="h-9 text-sm w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.emoji ? `${o.emoji} ${o.label}` : o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <ArtistFilterCombobox
            artists={artists}
            value={artistSlug}
            onChange={(slug) => setParam("artist", slug)}
            className="w-full"
          />
        </div>
        {hasFilter && (
          <button
            type="button"
            onClick={reset}
            className="col-span-2 inline-flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-2 border rounded-md"
          >
            <X className="h-3 w-3" />
            Réinitialiser les filtres
          </button>
        )}
      </div>

      {/* ─── Vue DESKTOP ─── */}
      <div className="hidden md:flex items-center gap-2 flex-wrap">
        <SegmentedPeriod
          value={period}
          onChange={(v) => setParam("period", v, DEFAULT_PERIOD)}
        />
        <SegmentedStatus
          value={status}
          onChange={(v) => setParam("status", v, DEFAULT_STATUS)}
        />
        <ArtistFilterCombobox
          artists={artists}
          value={artistSlug}
          onChange={(slug) => setParam("artist", slug)}
        />
        {hasFilter && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
          >
            <X className="h-3 w-3" />
            Réinitialiser
          </button>
        )}
      </div>
    </div>
  );
}

// ── Segments génériques (desktop) ──

function SegmentedPeriod({
  value,
  onChange,
}: {
  value: PeriodPreset;
  onChange: (v: PeriodPreset) => void;
}) {
  return (
    <Segmented<PeriodPreset>
      options={PERIOD_PRESET_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
      value={value}
      onChange={onChange}
    />
  );
}

function SegmentedStatus({
  value,
  onChange,
}: {
  value: DealsListStatus;
  onChange: (v: DealsListStatus) => void;
}) {
  return (
    <Segmented<DealsListStatus>
      options={STATUS_OPTIONS.map((o) => ({
        value: o.value,
        label: o.emoji ? `${o.emoji} ${o.label}` : o.label,
      }))}
      value={value}
      onChange={onChange}
    />
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center rounded px-2.5 py-1 text-xs transition-colors",
            value === o.value
              ? "bg-background shadow-sm font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
