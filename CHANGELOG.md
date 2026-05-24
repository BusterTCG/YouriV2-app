# Changelog

Historique des modifications de Youri V2. Format inspiré de [Keep a Changelog](https://keepachangelog.com).

> **Process** : ce fichier est mis à jour à la fin de chaque sprint OU à la fin de chaque session significative. Une entrée = une date + une liste de changements groupés par catégorie (`Added`, `Changed`, `Fixed`, `Removed`).

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
