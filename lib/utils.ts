import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Helper standard shadcn — merge intelligent de classes Tailwind.
 * cn("p-2", isActive && "bg-primary", "p-4") → "bg-primary p-4"
 * (twMerge gère les conflits, dernier gagne).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
