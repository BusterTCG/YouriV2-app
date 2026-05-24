<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (Next.js 16) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project conventions — Youri V2

Before writing any code, **read these documents** in `docs/`. They contain decisions verrouillées par Stan et conventions techniques éprouvées sur KuroNeko-App :

- [docs/architecture-decisions.md](docs/architecture-decisions.md) — Décisions architecturales (stack, DB, auth, workflow, plan 13 sprints)
- [docs/process/code-conventions.md](docs/process/code-conventions.md) — Next.js 16 quirks, Prisma singleton + soft-delete, server actions safeAction, dates UTC midi
- [docs/process/design-system.md](docs/process/design-system.md) — shadcn/ui + Tailwind v4 OKLCH, navy/gold, layout sidebar+topbar
- [docs/process/dev-scripts.md](docs/process/dev-scripts.md) — Scripts npm + backup-db.ts + Lancer-Youri.bat + deploy.ps1
- [docs/process/vps-deploy.md](docs/process/vps-deploy.md) — Hosting `app.pangeeprod.com`, systemd, nginx, TZ=Europe/Paris
- [docs/process/mobile-testing.md](docs/process/mobile-testing.md) — Test iPhone via tunnel cloudflared (exigence non-négociable)
- [docs/process/docs-layout.md](docs/process/docs-layout.md) — Structure README/ARCHITECTURE/CHANGELOG/AGENTS/.env.example

# Out of scope (decided by Stan — do not introduce)

- Google Calendar / ICS sync
- Appointments / RDV / Shows page separate
- Briefing / FDR / PDF export
- Claude API / chat / quick-add AI
- Dedicated facturation page (statuts live on deal page)
- Email Resend

Si une question hors scope se pose, **vérifier avec Stan AVANT** d'ajouter.

# Sister project — KuroNeko-App

KN détient l'annuaire **Contact / Venue / VenueRoom**. Youri V2 consomme via API REST `/api/external/*` (token Bearer `INTER_APP_TOKEN`). Voir [KuroNeko-App README](https://github.com/BusterTCG/KuroNeko-App#api-externe-consomm%C3%A9e-par-youri-v2).
