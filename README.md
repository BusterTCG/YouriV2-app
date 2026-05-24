# Youri V2 — Pangee Prod

Outil interne de gestion pour Pangee Prod. Refonte multi-user de `youri-app` (V1) sur la base technique éprouvée de [KuroNeko-App](https://github.com/BusterTCG/KuroNeko-App).

> ⚠️ **En cours de scaffolding** — Sprint 0 démarre. Les sections "Stack" / "Getting started" / "Scripts" seront remplies au fur et à mesure des sprints.

## Pour démarrer

À venir au Sprint 0 (scaffold Next.js 16 + Prisma + theme + outillage).

## Vue d'ensemble

- **Équipe** : 3 utilisateurs (Stan ADMIN, Certe MEMBER, Angath MEMBER)
- **Catégories de deals** : Booking, Prod Exé 15%, Cachets
- **Multi-artiste** par deal (cachet + statut paiement individuels)
- **Workflow** : templates de tâches par catégorie, auto-créées à la création du deal, validation tracée par user
- **Annuaire Contact / Lieux** : consommé via API depuis [KuroNeko-App](https://github.com/BusterTCG/KuroNeko-App) (KN = hub annuaire authoritatif). Voir [docs/architecture-decisions.md](docs/architecture-decisions.md).
- **Hosting** : VPS mutualisé avec KN, sous-domaine `app.pangeeprod.com`

## Documentation projet

| Document | Rôle |
|---|---|
| [docs/architecture-decisions.md](docs/architecture-decisions.md) | Décisions verrouillées avant Sprint 0 (stack, DB, auth, workflow, sprints) |
| [docs/process/docs-layout.md](docs/process/docs-layout.md) | Conventions structure docs racine (README, ARCHITECTURE, CHANGELOG, AGENTS) |
| [docs/process/dev-scripts.md](docs/process/dev-scripts.md) | Scripts npm + utilitaires (backup auto predev, Lancer-Youri.bat, deploy.ps1) |
| [docs/process/vps-deploy.md](docs/process/vps-deploy.md) | Pipeline déploiement VPS (systemd + nginx + TZ=Europe/Paris) |
| [docs/process/code-conventions.md](docs/process/code-conventions.md) | Conventions code (Next.js 16, Prisma, server actions, dates UTC midi) |
| [docs/process/design-system.md](docs/process/design-system.md) | Design system (shadcn/ui + Tailwind v4 OKLCH + navy/gold + patterns layout) |
| [docs/process/mobile-testing.md](docs/process/mobile-testing.md) | Tests mobile (tunnel cloudflared iPhone + PWA + responsive) — exigence non-négociable |
| [AGENTS.md](AGENTS.md) | Règles globales pour agents IA travaillant sur ce repo |
| [CHANGELOG.md](CHANGELOG.md) | Historique des modifications par sprint (à créer au Sprint 0) |

## Lien avec KuroNeko-App

Les deux apps partagent l'annuaire **Contact / Venue / VenueRoom** :
- KN détient les données dans sa Postgres
- Youri V2 consomme via [API REST](https://github.com/BusterTCG/KuroNeko-App#api-externe-consomm%C3%A9e-par-youri-v2) authentifiée par token Bearer
- Snapshot local Youri pour la perf + résilience (le nom du contact est copié sur le deal au moment du choix)
