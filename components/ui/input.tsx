import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, onFocus, ...props }: React.ComponentProps<"input">) {
  // Champs chiffrés : tout sélectionner au focus pour que la frappe remplace
  // la valeur en place (un « 0 » ne doit jamais rester devant ce qu'on tape).
  const numeric =
    type === "number" || props.inputMode === "decimal" || props.inputMode === "numeric"
  return (
    <input
      type={type}
      onFocus={(e) => {
        onFocus?.(e)
        if (numeric) {
          const el = e.currentTarget
          requestAnimationFrame(() => el.select())
        }
      }}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
