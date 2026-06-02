"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { formatEur } from "@/components/deals/deal-helpers";

/**
 * Mode "privacy" — masque les montants sensibles en € (façon appli bancaire).
 *
 * Stan 2026-06-02 : toggle Eye / EyeOff dans le header du dashboard, état
 * persisté en localStorage. Les pourcentages et compteurs restent affichés
 * (info moins sensible, utile pour le pilotage).
 *
 * Pattern : Client Component Provider qui peut wrapper du contenu Server.
 * Les composants Server Component peuvent rendre `<SensitiveAmount>`
 * (Client Component) qui lit le context.
 */

interface PrivacyContextValue {
  isPrivate: boolean;
  toggle: () => void;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

const STORAGE_KEY = "yr-privacy-mode";

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [isPrivate, setIsPrivate] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Restore from localStorage au montage (côté client only, jamais SSR).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setIsPrivate(true);
    } catch {
      // localStorage indisponible (Safari privé, SSR…) — on garde le défaut.
    }
    setHydrated(true);
  }, []);

  const toggle = useCallback(() => {
    setIsPrivate((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Avant l'hydratation, on force isPrivate à false pour matcher le SSR
  // (qui ne lit pas localStorage). Évite un flash de chiffres masqués si
  // l'user avait activé le mode privé précédemment.
  const value: PrivacyContextValue = {
    isPrivate: hydrated ? isPrivate : false,
    toggle,
  };

  return (
    <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
  );
}

/** Hook lecture du mode privacy. Retourne `{ isPrivate: false, toggle: noop }`
 *  si appelé en dehors d'un Provider — Server Components safe. */
export function usePrivacy(): PrivacyContextValue {
  const ctx = useContext(PrivacyContext);
  return ctx ?? { isPrivate: false, toggle: () => {} };
}

/**
 * Hook pratique pour les Client Components qui doivent formater plein de
 * montants € (tableaux deals…). Renvoie une fonction `(n) => string` qui
 * retourne `•••••` en mode privé, sinon le format euro classique.
 *
 * Usage :
 *   const eur = useEur();
 *   <td>{eur(deal.budgetAmount)}</td>
 */
export function useEur(): (n: number | null | undefined) => string {
  const { isPrivate } = usePrivacy();
  if (isPrivate) return () => "•••••";
  return (n) => (n == null ? "—" : formatEur(n));
}
