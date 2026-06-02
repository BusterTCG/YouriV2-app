"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REPORTING_PERIOD_OPTIONS } from "@/lib/reporting-types";

interface Props {
  period: string;
  artistSlug: string | null;
  artists: Array<{ id: string; name: string; slug: string; color: string | null }>;
}

/**
 * Bandeau filtres /reporting — copie fidèle KN. Pilote `?period=` et
 * `?artist=` dans l'URL. Defaults sortis du composant (cf. page.tsx).
 */
export function ReportingFilters({ period, artistSlug, artists }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all" || value === "this-year") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={period} onValueChange={(v) => setParam("period", v)}>
        <SelectTrigger className="h-8 text-xs min-w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REPORTING_PERIOD_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={artistSlug ?? "all"}
        onValueChange={(v) => setParam("artist", v)}
      >
        <SelectTrigger className="h-8 text-xs min-w-[180px]">
          <SelectValue placeholder="Tous artistes" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous artistes</SelectItem>
          {artists.map((a) => (
            <SelectItem key={a.id} value={a.slug}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
