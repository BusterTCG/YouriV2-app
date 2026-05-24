# Process — Scripts npm + utilitaires dev

Convention scripts de dev sur les apps Stan (KuroNeko → Youri V2).

## package.json — scripts npm standards

```json
{
  "scripts": {
    "predev": "tsx scripts/backup-db.ts",
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "backup": "tsx scripts/backup-db.ts",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio",
    "db:reset": "prisma migrate reset"
  }
}
```

**Clé** : `predev` est un hook npm natif qui s'exécute AVANT `dev` automatiquement — backup garanti sans rien à penser.

## scripts/ standards

- **backup-db.ts** — pour Youri V2 (Postgres) : `pg_dump youri > backups/dev-YYYYMMDD-HHmm.dump` (rotation FIFO 30 backups). Crée le dossier si absent. Skip silencieux si pas de DB. Adapté du pattern KN qui faisait copyFileSync SQLite.
- **vps-backup.sh** — script bash quotidien sur le VPS (cron) : `pg_dump youri | gzip` + rotation 14 jours.
- **pull-vps-backup.ps1** — récupère le dernier dump VPS en local via scp pour debugger contre la vraie data multi-user (CRITIQUE en multi-user — reproduit un bug "chez Certe" sans avoir accès à sa session).
- **deploy.ps1** — pipeline complet : 1) backup pre-deploy VPS, 2) tar du code (exclut node_modules/.next/.env/db/uploads/.git), 3) scp vers /tmp, 4) ssh stop service, 5) extract over /home/stan/youri, 6) npm ci + prisma migrate deploy + npm run build, 7) start service + health check HTTPS 200. Rollback manuel via backup.
- **generate-icons.mjs** — génère les icons PWA (192/512/maskable + apple-touch + favicon) depuis un SVG/PNG source via sharp.
- **Lancer-Youri.bat** / **Arreter-Youri.bat** — scripts Windows à double-clic pour Stan : lance `npm run dev` + ouvre cloudflared tunnel pour test iPhone HTTPS + ouvre le navigateur après 8s. Cf. `Lancer-KuroNeko.bat`.

## Rationale

Stan utilise ces scripts au quotidien sans toucher au terminal. Le backup auto avant chaque `npm run dev` a sauvé KN plusieurs fois. Le tunnel cloudflared est ESSENTIEL pour tester sur iPhone pendant le dev (HMR fonctionne via le tunnel — voir [mobile-testing.md](mobile-testing.md)).

## Application

Sprint 0 de Youri V2 : copier la structure des scripts depuis KN, adapter pour Postgres au lieu de SQLite. Garder les noms `Lancer-Youri.bat` / `Arreter-Youri.bat`. Garder le hook `predev`. Pour la sauvegarde Postgres, viser `pg_dump youri` (notre base dédiée).

## Voir aussi

- [docs-layout.md](docs-layout.md)
- [vps-deploy.md](vps-deploy.md)
- [mobile-testing.md](mobile-testing.md)
