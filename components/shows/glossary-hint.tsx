"use client";

// Bulle « ? » d'explication d'un terme métier (lib/production-glossary.ts) —
// Popover : s'ouvre au clic / au toucher (iPhone), pas seulement au survol.

import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GLOSSARY, type GlossaryKey } from "@/lib/production-glossary";
import { cn } from "@/lib/utils";

export function GlossaryHint({ term, className }: { term: GlossaryKey; className?: string }) {
  const g = GLOSSARY[term];
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={`Qu'est-ce que ${g.title} ?`}
        className={cn(
          "inline-flex items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground align-middle",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs space-y-1" align="start">
        <div className="font-semibold text-sm">{g.title}</div>
        <p className="text-muted-foreground leading-relaxed normal-case tracking-normal font-normal">{g.text}</p>
      </PopoverContent>
    </Popover>
  );
}
