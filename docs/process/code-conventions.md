# Process — Conventions code

Conventions techniques établies sur KuroNeko-App, à reproduire dans Youri V2.

## Next.js 16 — pièges connus

- **Lire `node_modules/next/dist/docs/` AVANT d'écrire du code** : la 16 a des breaking changes vs training data des LLM. C'est la règle d'AGENTS.md.
- **App router uniquement** (pas de Pages router). Route groups `(app)`, `(auth)` pour grouper sans slug d'URL.
- **`export const dynamic = "force-dynamic"`** sur les segments protégés qui utilisent `useSearchParams()` ou `cookies()` — sinon le build SSG casse. KN l'applique sur le segment `(app)`.
- **Middleware Edge** : utiliser `jose` (WebCrypto natif) pour JWT, PAS `jsonwebtoken` (Node-only, casse en Edge). Pas de Prisma dans middleware sans Accelerate.
- **`next.config.ts`** : ajouter `serverExternalPackages` pour les libs natives (puppeteer, node-ical), augmenter `serverActions.bodySizeLimit` à 5MB si uploads (avatars). Ajouter `allowedDevOrigins` pour le tunnel cloudflared mobile.
- **Pas de Server Components nested inside Client Components**. Convention : `'use client'` en haut des composants UI interactifs uniquement.

## Prisma — singleton + soft-delete

- **`lib/db.ts`** : Prisma client singleton avec `globalThis` hack pour éviter la création multiple en dev (HMR). Pattern standard, à copier tel quel.
- **Soft-delete via Prisma extension** : champ `deletedAt: DateTime?` sur les modèles concernés (Task, Deal, Contact, Artist…). Extension qui filtre auto `deletedAt: null` sur tous les `findMany`/`findFirst`. Pour query les supprimés : `prisma.task.findMany({ where: { deletedAt: { not: null } } })`. Page `/trash` pour restaurer.
- **Migrations versionnées** dans `prisma/migrations/`. Une migration par changement de schéma. Nom explicite : `add_deal_venue_brand`, `drop_production_line_unique`. `npm run db:migrate` en dev, `prisma migrate deploy` en prod.
- **Seed** dans `prisma/seed.ts`, lancé par `npm run db:seed`. Pour Youri V2 : seed les 3 users + quelques templates de tâches.

## Server Actions — pattern `safeAction`

- Toutes les mutations passent par des server actions dans `lib/actions/<entity>.ts`, JAMAIS par des API routes (sauf intégrations externes type Google OAuth callback ou API inter-app).
- Pattern `safeAction` ou `ActionResult<T>` dans `lib/errors.ts` : retourne `{ ok: true, data }` ou `{ ok: false, error: string }`. Capture les erreurs Prisma/Zod et les transforme en messages user-friendly français.
- Validation Zod côté serveur dans CHAQUE action (jamais confiance au client). Schéma Zod défini en haut du fichier action, réutilisé côté form via `@hookform/resolvers/zod`.
- Audit log : à la fin de chaque mutation, `await createAuditEntry({ entity, entityId, action, before, summary, userId })` pour tracer qui a fait quoi.

## Dates — convention UTC midi

- **Toutes les dates de "date d'événement" (deal, task) sont stockées en UTC à 12:00:00**, pas 00:00:00.
- **Pourquoi** : évite les bugs de fuseau (un truc à minuit Paris = 22h UTC la veille, donc affiché au mauvais jour selon le serveur). Midi UTC = 14h Paris été / 13h Paris hiver, toujours le même jour partout.
- Helper centralisé `lib/dates.ts` (ou `lib/yr-date.ts`) : `toUtcMidi(date)`, `formatFr(date)`, etc. Tout passe par là, jamais de `new Date()` ad-hoc dans le code métier.

## Naming

- Modèles Prisma en `PascalCase` singulier (`Deal`, `Task`, `User`).
- Enums en `SCREAMING_SNAKE` (`DealCategory.BOOKING`).
- Server actions en camelCase verbe : `createDeal`, `updateTaskStatus`, `softDeleteContact`.
- Composants React : PascalCase, fichier `kebab-case.tsx` (`new-deal-button.tsx`).
- Dossiers feature dans `components/` : `kebab-case` pluriel (`components/deals/`, `components/tasks/`).

## Tests Vitest

- Tests sur les helpers métier critiques uniquement (commission Prod Exé 15%, parser, formatters, dates). Pas de tests UI.
- `tests/` à la racine, `vitest.config.ts` avec `happy-dom`.
- Pour Youri V2 spécifiquement : tester l'auto-création de tâches depuis TaskTemplate (Sprint 6), les agrégats multi-artiste, le calcul 15% Prod Exé (Sprint 4).

## Inter-app — client API vers KuroNeko

Youri V2 consomme l'API externe de KN (Contact / Venue / VenueRoom). Pattern client à mettre dans `lib/kn-client.ts` :

- `fetch` typé (TypeScript) vers chaque endpoint KN
- Header `Authorization: Bearer ${INTER_APP_TOKEN}` ajouté automatiquement
- Timeout court (5s) — KN sur le même VPS répond vite ou plante vite
- Gestion d'erreur explicite : si KN renvoie 401/500 → propager l'erreur jusqu'à l'UI ("Annuaire indisponible, réessaye")
- Snapshot local : au moment où l'user choisit un contact dans le form Deal, copier `{id, name, company, city}` dans les champs `organizerSnapshot*` du Deal pour éviter les refetch constants

## Rationale

Ces conventions ont été éprouvées sur KN sur ~12 sprints. Les enfreindre = bugs déjà connus (timezone, JWT Edge, soft-delete oublié, etc.).

## Application

Sprint 0 Youri V2, copier `lib/db.ts`, `lib/errors.ts`, `middleware.ts` (en adaptant le nom du cookie `youri-session`), pattern d'audit. Vérifier `next.config.ts` pour les `serverExternalPackages` selon les libs utilisées. Configurer `TZ=Europe/Paris` dans le service systemd dès le Sprint 0.

## Voir aussi

- [design-system.md](design-system.md)
- [../architecture-decisions.md](../architecture-decisions.md)
