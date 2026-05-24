# Changelog

Historique des modifications de Youri V2. Format inspiré de [Keep a Changelog](https://keepachangelog.com).

> **Process** : ce fichier est mis à jour à la fin de chaque sprint OU à la fin de chaque session significative. Une entrée = une date + une liste de changements groupés par catégorie (`Added`, `Changed`, `Fixed`, `Removed`).

---

## [Sprint 2 — Master data : kn-client + Artist + sidebar nav] — 2026-05-24

Annuaire (Contact / Venue / VenueRoom) consommé depuis KN via API REST + table Artist locale Youri (rosters distincts) + vraie nav latérale.

### Added — client API inter-app

- `lib/kn-client.ts` : client HTTP typé vers KN avec helper `knFetch<T>` (Bearer token, timeout 5s), 10 fonctions typées (list/get/create/update contacts/venues/rooms), erreurs typées (`KnApiUnavailableError`, `KnNotFoundError`, `KnValidationError`), types `KnContact/KnVenue/KnVenueRoom/KnList<T>`, types `ContactSnapshot/VenueSnapshot` préparés pour Sprint 3.

### Added — schéma & seed

- Model Prisma `Artist` (id, name unique, slug unique, color, notes, active, deletedAt). Migration `add_artist`.
- `lib/slug.ts` : `slugify()` (strip diacritiques, lowercase, tirets) + `uniqueSlug()` (suffixe -2/-3 si collision).
- Seed étendu : 3 artistes exemples (Artiste Test 1/2/3, couleurs pink/emerald/orange).

### Added — composants UI shadcn

- `components/ui/dialog.tsx`, `textarea.tsx`, `badge.tsx`, `separator.tsx`, `sheet.tsx` (primitives écrites à la main, Radix UI pour Dialog/Separator/Sheet).

### Added — nav sidebar + mobile

- `components/layout/nav-config.ts` : 5 groupes (Pilotage / Deals / Annuaire / Outils / Administration), flags `placeholder` (WIP) et `adminOnly`.
- `components/layout/sidebar-nav.tsx` : rendu nav réutilisé desktop + sheet, highlight item actif via `usePathname`, items WIP en opacity réduite + badge "WIP".
- `components/layout/sidebar.tsx` : sidebar desktop fixe (hidden md:flex, w-60).
- `components/layout/mobile-nav.tsx` : hamburger md:hidden ouvrant un Sheet.
- `app/(app)/layout.tsx` refondu : sidebar + topbar avec hamburger mobile, calcule `isAdmin` pour filtrer les items adminOnly.

### Added — pages /artistes (CRUD local Youri)

- `app/(app)/artistes/page.tsx` : liste cards (3 colonnes desktop, 1 mobile) avec puce couleur + badge Inactif + extrait notes. Bouton "Nouvel artiste".
- `app/(app)/artistes/[slug]/page.tsx` : fiche détail avec 3 cards (Notes / Métadonnées / Deals & tâches placeholder Sprint 3).
- `components/artists/` : `artist-form-dialog.tsx` (form name/color picker HTML5/notes/active), `new-artist-button.tsx`, `artist-edit-button.tsx`, `artist-delete-button.tsx` (suppression à 2 clics dans 4s, pattern KN).
- `lib/actions/artists.ts` : `createArtist` (auto-slug + unique suffix), `updateArtist` (recalcule slug si name change), `softDeleteArtist` (TODO Sprint 3 : check DealArtiste avant). Zod + safeAction.

### Added — pages /contacts (wrapper API KN)

- `app/(app)/contacts/page.tsx` : Suspense + appel `listContacts({ q })` côté server. Gère `KnApiUnavailableError` → card rouge "Annuaire indisponible" au lieu de 500.
- `components/contacts/` : `contacts-search.tsx` (debounce 300ms, `?q=`), `contacts-list.tsx` (cards avec type badge, société, ville, phone/email cliquables, notes), `contact-form-dialog.tsx` (firstName/lastName/company/city/type select/profession/phone/email/notes), `new-contact-button.tsx`.
- `lib/actions/contacts.ts` : `createContact` + `updateContact` proxy vers `lib/kn-client.ts`. Pas de table Contact locale.

### Added — pages /lieux (wrapper API KN + sous-salles)

- `app/(app)/lieux/page.tsx` : même pattern que /contacts.
- `components/venues/` : `venues-search.tsx`, `venues-list.tsx`, `new-venue-button.tsx`, `venue-form-dialog.tsx` avec section "Sous-salles" inline (visible en edit only — besoin de venueId).
- `lib/actions/venues.ts` : `createVenue`, `updateVenue`, `createVenueRoom` proxies vers kn-client.

### Added — tests

- `tests/slug.test.ts` : 10 tests (slugify diacritiques, ponctuation, edge cases / uniqueSlug suffix). **32/32 verts au total** (dates 17 + session 5 + slug 10).

### Fixed — bug détecté pendant le smoke test (côté KN)

- Next 16 levait "You cannot use different slug names for the same dynamic path ('venueId' !== 'id')" car KN avait `venues/[id]/route.ts` et `venues/[venueId]/rooms/route.ts` (slugs incohérents). Fix appliqué dans le commit KN `46d53f3` : renommage `[venueId]` → `[id]` + alias local `venueId` pour clarté dans le handler. Path API inchangé, zéro impact sur le kn-client Youri.

### Validated — smoke test e2e KN ↔ Youri

```
✅ KN /api/external/contacts (avec token)  → HTTP 200
✅ Youri /api/health                       → HTTP 200
✅ Login Stan sur Youri /api/auth/password → HTTP 200 + cookie
✅ /contacts (Youri → API KN)              → HTTP 200
✅ /lieux (Youri → API KN)                 → HTTP 200
✅ /artistes (Youri local)                 → HTTP 200
✅ KN renvoie bien la liste Contacts       → "total":1
```

### Connu / TODO

- `softDeleteArtist` : Sprint 3 ajoutera check `prisma.dealArtiste.count` pour bloquer la suppression si DealArtiste actifs référencent l'artiste (décision verrouillée cascade soft-delete).
- Page `/settings` parent toujours absente — `/settings/users` reste l'unique page settings pour l'instant.

---

## [Sprint 1 — Auth + 3 users] — 2026-05-24

Auth multi-user complète : 3 comptes seedés (Stan ADMIN, Certe MEMBER, Angath MEMBER), login Google OAuth + mot de passe de secours, middleware cookie, page ADMIN de gestion des users.

### Added — données & schéma

- Enum `UserRole` (ADMIN | MEMBER) + enum `AuthSource` (GOOGLE | PASSWORD) dans `prisma/schema.prisma`.
- Modèle `User` : id, email (unique), name, passwordHash (bcrypt), color, role, active, lastAuthSource, lastLoginAt, createdAt, updatedAt. **Pas de soft-delete** — on désactive via `active: false` au lieu de supprimer (préserve l'historique d'audit / completedBy futur).
- Migration `20260524*_add_user`.
- `prisma/seed.ts` étendu : 3 users seedés (Stan/violet, Certe/cyan, Angath/amber), `upsert` idempotent, mdp hashé bcrypt depuis `APP_PASSWORD` env var. Le hash n'est PAS réécrit si l'user existe déjà (préserve les changements de mdp post-seed).

### Added — auth

- `lib/auth/session.ts` : `getSession`, `createSession({userId, email, role, source})`, `destroySession`. JWT HS256 dans cookie `youri-session`, httpOnly + secure (prod) + sameSite=lax, 365 jours. Fail-closed si `SESSION_SECRET` < 32 chars.
- `lib/auth/users.ts` : `getCurrentUser` (cached par render React), `requireUser` (redirect /login si absent), `requireAdmin` (redirect /dashboard si pas ADMIN), `isAdmin` (boolean UI).
- `middleware.ts` racine : protège tout sauf PUBLIC_PATHS (/login, /api/auth/*, /api/health, assets statiques). Pages non-loggées → 307 vers /login?from=...&. API → 401 JSON. Edge runtime (jose, pas Prisma).

### Added — API routes

- `POST /api/auth/password` : login mdp. Body `{email, password}`. Bcrypt compare constant-time + dummy hash si user inexistant (anti-timing leak). Délai 250ms en cas d'échec (anti-bruteforce). Met à jour `lastLoginAt` + `lastAuthSource: PASSWORD` (fire & forget).
- `GET /api/auth/google` : init OAuth (redirect Google avec scope `openid email profile`, state = `from`). 503 si `GOOGLE_CLIENT_ID` absent.
- `GET /api/auth/google/callback` : échange code → token Google → parse id_token → vérif `email_verified` + whitelist `AUTH_ALLOWED_EMAILS` → trouve user en BDD (pas de création à la volée) → crée session + redirect `from`. Erreurs renvoyées sur `/login?error=...`.
- `POST /api/auth/logout` : destroy cookie session.

### Added — UI

- `components/ui/input.tsx` + `label.tsx` (primitives shadcn écrites à la main).
- `components/auth/login-form.tsx` : Client component. Bouton "Continuer avec Google" + section repliable "Mot de passe de secours" (form email + mdp). Affiche les erreurs OAuth depuis `?error=` query param. Préserve `?from=` pour ramener à la destination après login.
- `app/login/page.tsx` : page publique, redirige direct vers /dashboard si déjà loggué. `<Suspense>` autour du form (useSearchParams).
- `components/layout/logout-button.tsx` : POST /api/auth/logout puis push /login.
- `components/layout/user-menu.tsx` : avatar circulaire (initiales colorées via `user.color`) + dropdown maison (nom, email, rôle, logout). Close au click outside.
- `app/(app)/layout.tsx` mis à jour : `requireUser()` au top + UserMenu dans la topbar (force-dynamic).
- `app/(app)/error.tsx` : error boundary du segment protégé (avec boutons "Réessayer" + "Retour dashboard").

### Added — settings ADMIN

- `lib/actions/users.ts` : 2 server actions ADMIN-only — `resetUserPassword` (Zod, 8 chars min, bcrypt) et `toggleUserActive` (empêche l'admin de se désactiver lui-même). Chaque action démarre par `await requireAdmin()`.
- `app/(app)/settings/users/page.tsx` : table des 3 users avec rôle, statut active, dernier login. `requireAdmin()` au top — un MEMBER tombe sur /dashboard.
- `app/(app)/settings/users/users-table.tsx` : client component avec form inline "Réinit. mdp" (8 chars min, l'ADMIN saisit le mdp à transmettre à l'user) + bouton "Désactiver/Réactiver".

### Added — tests

- `tests/auth/session.test.ts` : 5 tests sur la mécanique JWT (signature valide, mauvais secret, token corrompu, token expiré, alg:none attempt). **22/22 verts** au total (dates + session).

### Validated — smoke test e2e (port 3001, contre la vraie DB SQLite)

```
✅ GET /dashboard sans cookie       → HTTP 307 → /login?from=/dashboard
✅ GET /api/health (public)         → HTTP 200 { ok:true, db:"up" }
✅ POST /api/auth/password (OK)     → HTTP 200 + cookie youri-session posé
✅ GET /dashboard avec cookie       → HTTP 200
✅ POST /api/auth/password (WRONG)  → HTTP 401 { error:"Identifiants invalides" }
✅ GET /settings/users (ADMIN)      → HTTP 200
```

### Known / TODO

- ⚠️ **Next 16 warning** : "The `middleware` file convention is deprecated. Please use `proxy` instead." À migrer vers `proxy.ts` (nouvelle convention Next 16). Fonctionne pour l'instant — fix prévu Sprint 11 (polish + mobile).
- ⚠️ **Google OAuth pas testé** : nécessite `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` dans `.env.local`. Stan doit créer un OAuth Client distinct dans Google Cloud Console (cf. `docs/process/vps-deploy.md § OAuth Google`). Le code est en place, fonctionnel dès que les credentials sont fournis.
- ⚠️ Page `/settings` (parent) n'existe pas encore (uniquement `/settings/users`). Sera ajoutée Sprint ultérieur quand on aura d'autres sections (profil org, templates de tâches, etc.).

### Mdp par défaut au login

`APP_PASSWORD` env var (cf. `.env.local`, actuellement `ChangeMeBeforeProd2026`). Identique pour les 3 users au seed initial. L'ADMIN peut le réinitialiser individuellement via `/settings/users` à tout moment.

---

## [Sprint 0 — Bootstrap] — 2026-05-24

Scaffold initial du projet Youri V2 avant le développement métier.

### Added — stack & configuration

- **Next.js 16.2.6** + React 19.2.4 + TypeScript 5 strict
- **Tailwind CSS v4** (@tailwindcss/postcss) avec variables OKLCH + thème navy/gold (identique KuroNeko)
- **Prisma 6.19.3** + `prisma.config.ts` (dotenv/config + seed tsx) — SQLite en dev, Postgres prévu en prod
- **Vitest 4** + happy-dom + alias `@` + stub `server-only` pour tests
- shadcn config (`components.json`)
- `next.config.ts` : `allowedDevOrigins: ['*.trycloudflare.com']` (HMR via tunnel iPhone) + `serverActions.bodySizeLimit: 5mb`
- ESLint flat config (`next/core-web-vitals` + `next/typescript`)
- `.env.example` documenté (DATABASE_URL, SESSION_SECRET, AUTH_ALLOWED_EMAILS, INTER_APP_TOKEN, KN_API_BASE_URL, etc.)

### Added — app router

- `app/layout.tsx` : Inter font + ThemeProvider (next-themes light/dark) + Eruda devtools mobile (dev only, désactivable `?noeruda=1`) + viewport mobile + PWA Apple meta
- `app/globals.css` : variables OKLCH navy `#1a2540` + gold `#d4a93a` + fix iOS (font-size 16px sur inputs anti-zoom, no spinners number)
- `app/page.tsx` : redirect → `/dashboard`
- `app/(app)/layout.tsx` : shell minimal (topbar logo + theme toggle), sera étendu Sprint 1+
- `app/(app)/dashboard/page.tsx` : placeholder Sprint 0 avec 3 cards (Mes tâches / Alertes / CA) — réécrit Sprint 7
- `app/error.tsx` : error boundary global FR (évite l'écran blanc en prod, important multi-user)
- `app/manifest.ts` : PWA installable iOS/Android (standalone, theme_color, 3 icons)
- `app/api/health/route.ts` : healthcheck public (ping `SELECT 1`), retourne `{ ok, db, version, timestamp }`

### Added — libs

- `lib/db.ts` : Prisma client singleton (globalThis hack pour HMR) + extension soft-delete noop (sera peuplée Sprint 1+ avec User/Artist/Deal/Task)
- `lib/errors.ts` : `safeAction<T>` wrapper + `humanizeError` (codes Prisma P2025/P2002/P2003/P2014) + `logError` + type `ActionResult<T>`
- `lib/utils.ts` : `cn(...classes)` helper standard shadcn
- `lib/dates.ts` : convention **UTC midi** (calendarDate, toUtcMidi, firstOfMonth, isSameCalendarDay, parseCalendarDate, formatFr, formatEur) — évite les bugs de timezone SSR/client (cf. `docs/process/code-conventions.md` § Dates)

### Added — Prisma

- `prisma/schema.prisma` minimal : datasource sqlite + generator client + 1 modèle `AppSetting` (key/value runtime) comme smoke test
- `prisma/seed.ts` : seed bootstrap (upsert `AppSetting "bootstrap-version" = "0.1.0"`)
- Migration `20260524*_init` appliquée

### Added — UI base

- `components/theme/theme-provider.tsx` + `theme-toggle.tsx` (next-themes light/dark, mount-safe pour éviter hydration mismatch)
- `components/ui/button.tsx` + `card.tsx` (shadcn primitives écrites à la main — les autres composants seront ajoutés via `npx shadcn add` au fil des sprints)
- `components/layout/logo.tsx` : logo texte placeholder ("YOURI v2") — sera remplacé par un SVG quand l'identité visuelle sera validée

### Added — outillage

- `scripts/backup-db.ts` : copie SQLite avant chaque `npm run dev` (hook `predev`), rotation FIFO 30 backups (le pg_dump VPS sera séparé via `scripts/vps-backup.sh` futur)
- `Lancer-Youri.bat` + `Arreter-Youri.bat` : scripts Windows pour lancer/arrêter le dev server sur **port 3001** (KN tourne sur 3000) + tunnel cloudflared pour test iPhone HTTPS
- `.claude/settings.json` : allow-list permissions (npm, npx, prisma, vitest, curl, git, tasklist, netstat) pour fluidifier Claude Code
- `.claude/launch.json` : config FleetView/Claude Code IDE (youri-dev sur port 3001)

### Added — tests

- `vitest.config.ts` + `tests/__mocks__/server-only.ts` (stub Vitest)
- `tests/dates.test.ts` : **17 tests verts** sur `lib/dates.ts` (calendarDate, toUtcMidi, firstOfMonth, isSameCalendarDay, parseCalendarDate, formatFr 5 patterns, formatEur)

### Fixed — bug timezone détecté pendant le smoke test

- `parseCalendarDate("2026-05-09")` retournait le 8 mai au lieu du 9 — `parseISO` de date-fns interprétait la string sans TZ comme local (Paris UTC+2 en mai). Fix : parse manuel `YYYY-MM-DD` puis `calendarDate(y, m-1, d)` qui force UTC midi. Test ajouté.

### Validated — smoke test final

- `npm install` ✅ (945 packages)
- `npx prisma generate` ✅
- `npx prisma migrate dev --name init` ✅ (DB créée, seed exécuté)
- `npx vitest run` ✅ (17/17 verts)
- `npx tsc --noEmit` ✅ (zero erreur)
- `npm run dev` + `curl /api/health` ✅ → `HTTP 200 { ok: true, db: "up", version: "0.1.0" }`

### Out of scope (à venir aux sprints suivants)

- ❌ Sprint 1 : auth + 3 users (JWT cookie, Google OAuth, mdp secours, `/login`, `/settings/users`) + middleware + `app/(app)/error.tsx`
- ❌ Sprint 2 : `lib/kn-client.ts` (client API vers KN pour Contact/Venue) + pages `/contacts` `/lieux` + table `Artist` + `/artistes` + `scripts/audit-orphan-snapshots.ts`
- ❌ Sprint 3+ : deals (Booking / Prod Exé / Cachets), tâches workflow, dashboard réel, notifications, etc.
