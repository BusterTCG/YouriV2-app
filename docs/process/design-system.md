# Process — Design system

Design system éprouvé sur KuroNeko-App. Youri V2 reprend la même charte (navy `#1a2540` + gold `#d4a93a`) selon décision Stan.

## Stack UI

- **shadcn/ui** (v4) — composants Radix + Tailwind composés. Installés un par un via `npx shadcn add <component>`. Vivent dans `components/ui/`. JAMAIS modifier le composant shadcn directement — créer un wrapper dans `components/<feature>/` si custom.
- **Tailwind CSS v4** + `@tailwindcss/postcss`. Pas de `tailwind.config.ts` (auto-détecté). Variables CSS dans `app/globals.css`.
- **OKLCH** pour toutes les couleurs (light/dark seamless). Variables `--color-*`, `--radius-*`, `--font-*`, `--chart-*` exposées via `@theme` directive.
- **next-themes** + `ThemeProvider` dans `app/layout.tsx` + `ThemeToggle` dans la topbar. Light par défaut, persisté via cookie.

## Composants shadcn à installer (Sprint 0)

Liste minimale tirée de KN : `button`, `card`, `separator`, `dropdown-menu`, `tooltip`, `badge`, `input`, `textarea`, `select`, `label`, `popover`, `command`, `form`, `checkbox`, `calendar`, `dialog`, `sheet`. Ajouter `table` pour les pages liste denses (/booking, /prod-executive, etc.).

## Charte navy/gold

- **Navy** `#1a2540` → header app, badges principaux
- **Gold** `#d4a93a` → accent KURO NEKO / YOURI (label, CTA secondaire)
- **Status colors** : green=done, orange=in-progress, red=blocked/retard, purple=pending, ambre=à régler
- **Charts** : palette 5 couleurs en gradient (light → dark) pour stacks Recharts
- Définir variables CSS dans `globals.css` :
  ```css
  :root {
    --yr-navy: oklch(0.25 0.05 250);
    --yr-gold: oklch(0.75 0.13 85);
    /* ...status colors */
  }
  ```

## Layout standard

- **`app/(app)/layout.tsx`** : shell avec `<Sidebar />` (gauche, collapsible mobile via `<Sheet />`) + `<Topbar />` (logo + filtre artiste + cloche notif + theme toggle + **avatar user** vu qu'on est multi-user) + `<main>` avec `p-4 md:p-6 lg:p-8`.
- **`components/layout/sidebar.tsx`** : nav verticale, items configurés via `components/layout/nav-config.ts`, badge unread sur certains items (tâches).
- **`components/layout/topbar.tsx`** : header sticky top, hauteur fixe `h-14`.
- **`components/layout/mobile-nav.tsx`** : hamburger menu visible `md:hidden`, ouvre la sidebar dans une Sheet.
- **`components/layout/notification-bell.tsx`** : badge unread count, dropdown des 10 dernières notifs.
- **`components/layout/logo.tsx`** : SVG inline, hauteur `h-8`.
- **`components/layout/user-menu.tsx`** : avatar + nom + bouton logout + lien /settings (spécifique Youri vu qu'on est multi-user — KN avait juste un logout).

## Polices

- **Inter** (Google Fonts via `next/font/google`) — corps de texte
- **Geist Mono** (Vercel) — code/monospace si besoin

## Patterns récurrents

- **Soft-delete UI** : page `/trash` avec table des éléments supprimés + bouton "Restaurer" + "Supprimer définitivement". Réutiliser le pattern de `components/trash/` KN.
- **Form pattern** : `<Form>` shadcn + `useForm` + Zod resolver + server action côté `onSubmit`.
- **Confirm destructive** : pour delete, bouton qui demande un 2e clic dans les 4 secondes (pas de modal Dialog). Cf. `ShowDeleteButton` KN.
- **Inline edit** : champs qui auto-sauvegardent au blur/change sans bouton "Sauvegarder". Pattern dans `ShowSummaryCard` KN. À utiliser sur les pages détail Youri V2 (Deal/Show).

## Hors scope Youri V2

- **Quick-Add ⌘K** : pas dans le scope V2 — out of scope (cf. architecture-decisions.md)

## Rationale

Ces patterns ont été itérés sur ~12 sprints KN avec retours métier Stan. Reproduire = gain de temps massif + cohérence visuelle entre les 2 apps (Stan navigue entre les deux quotidiennement).

## Application

Sprint 0 Youri V2, installer shadcn + Tailwind v4 + next-themes, copier la charte de couleurs OKLCH depuis KN `app/globals.css`, copier `components/layout/*` + `components/theme/*` + `components/ui/*` en bloc, adapter `nav-config.ts` pour la nav Youri (Booking/Prod Exé/Cachets/Tâches/etc.). Adapter le shell pour inclure le `user-menu` (multi-user spécifique).

## Voir aussi

- [mobile-testing.md](mobile-testing.md)
- [code-conventions.md](code-conventions.md)
- [../architecture-decisions.md](../architecture-decisions.md)
