<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (Next.js 16) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# RÈGLE CRITIQUE — Youri V2 = copie fidèle de KuroNeko-App

**KuroNeko-App** (sister repo : https://github.com/BusterTCG/KuroNeko-App) est la baseline éprouvée. Youri V2 doit **REPRODUIRE À L'IDENTIQUE** ses features (forms, dialogs, recherches multi-token, fiches artistes riches, KPIs, layout, behaviors), PAS les simplifier.

## Workflow obligatoire AVANT de coder une feature Youri

1. **Identifier la feature équivalente dans KN** (page, dialog, server action, helper, etc.) — chemin typique `C:\Users\stani\Dev\KuroNeko-App\...`
2. **Read le code KN entier** (composant + actions + helpers utilisés)
3. **Reproduire dans Youri** : mêmes champs, mêmes placeholders, même UX, mêmes raccourcis, mêmes validations
4. **N'écarter QUE** les éléments explicitement hors scope V2 (voir [docs/architecture-decisions.md](docs/architecture-decisions.md))
5. **Adapter UNIQUEMENT** ce qui est multi-user (assignation, audit, permissions) ou multi-artiste (DealArtiste)

## Écarts AUTORISÉS (validés par Stan)

- Multi-user (table `User`, sessions, role ADMIN/MEMBER, audit log par user)
- Multi-artiste sur les deals (table `DealArtiste`, cachet + paymentStatus individuels)
- 3 catégories de deals : Booking / Prod Exé 15% / Cachets (vs 5 sur KN)
- API HTTP vers KN pour Contact/Venue/VenueRoom (Youri n'a PAS de table locale)

## Hors scope V2 — NE PAS implémenter

- Google Calendar / ICS sync
- Appointments / RDV séparés des deals
- Shows page séparée (intégré dans Prod Exé)
- Briefing / FDR / PDF impression
- Claude API / chat / quick-add AI
- Page facturation dédiée (les statuts vivent sur la page deal)
- Email Resend

**Tout le reste = COPIE FIDÈLE de KN**.

# Project conventions — Youri V2

Before writing any code, **read these documents** in `docs/`. They contain decisions verrouillées par Stan et conventions techniques éprouvées sur KuroNeko-App :

- [docs/architecture-decisions.md](docs/architecture-decisions.md) — Décisions architecturales (stack, DB, auth, workflow, plan 13 sprints)
- [docs/process/code-conventions.md](docs/process/code-conventions.md) — Next.js 16 quirks, Prisma singleton + soft-delete, server actions safeAction, dates UTC midi
- [docs/process/design-system.md](docs/process/design-system.md) — shadcn/ui + Tailwind v4 OKLCH, navy/gold, layout sidebar+topbar
- [docs/process/dev-scripts.md](docs/process/dev-scripts.md) — Scripts npm + backup-db.ts + Lancer-Youri.bat + deploy.ps1
- [docs/process/vps-deploy.md](docs/process/vps-deploy.md) — Hosting `app.pangeeprod.com`, systemd, nginx, TZ=Europe/Paris
- [docs/process/mobile-testing.md](docs/process/mobile-testing.md) — Test iPhone via tunnel cloudflared (exigence non-négociable)
- [docs/process/docs-layout.md](docs/process/docs-layout.md) — Structure README/ARCHITECTURE/CHANGELOG/AGENTS/.env.example

Si une question hors scope se pose ou si une feature KN n'est pas claire, **vérifier avec Stan AVANT** de coder.

# Sister project — KuroNeko-App

KN détient l'annuaire **Contact / Venue / VenueRoom**. Youri V2 consomme via API REST `/api/external/*` (token Bearer `INTER_APP_TOKEN`). Voir [KuroNeko-App README](https://github.com/BusterTCG/KuroNeko-App#api-externe-consomm%C3%A9e-par-youri-v2).
