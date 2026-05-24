# Youri V2 — Pangee Prod

Outil interne de gestion pour Pangee Prod. Refonte multi-user de `youri-app` (V1) sur la base technique éprouvée de [KuroNeko-App](https://github.com/BusterTCG/KuroNeko-App).

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind 4** + **shadcn/ui**
- **Prisma 6** + **SQLite** (local) → **Postgres** (prod VPS)
- **Vitest** pour les tests · **Recharts** pour les graphiques (Sprint 9+)
- **next-themes** light/dark · **OKLCH** navy `#1a2540` / gold `#d4a93a` (identique KN)

## Getting started

```bash
npm install                # 945 packages
npm run db:migrate         # crée la SQLite locale + applique migration init + seed
npm run dev                # http://localhost:3001 (port 3001, KN tourne sur 3000)
```

Ou en double-clic sous Windows : **`Lancer-Youri.bat`** (lance le serveur + tunnel cloudflared pour test iPhone HTTPS + ouvre le navigateur après 8s).

Pour arrêter : **`Arreter-Youri.bat`** (tue les process node port 3001 + cloudflared).

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Démarre le serveur de dev sur port 3001 (sauvegarde SQLite auto avant via `predev`) |
| `npm run build` | Build de production |
| `npm test` | Lance la suite Vitest une fois |
| `npm run test:watch` | Mode watch des tests |
| `npm run backup` | Sauvegarde manuelle de la base SQLite vers `/backups` |
| `npm run db:migrate` | Crée + applique une migration Prisma |
| `npm run db:seed` | Réinitialise les données seedées |
| `npm run db:studio` | Ouvre Prisma Studio (UI SQL) |
| `npm run db:reset` | Wipe + re-migrate + re-seed |
| `npm run lint` | ESLint |

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
