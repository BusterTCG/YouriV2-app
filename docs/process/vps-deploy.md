# Process — Déploiement VPS Hetzner

VPS Hetzner sur lequel sont hébergées les apps de Stan. Pour Youri V2, le sous-domaine cible est **`app.pangeeprod.com`** (même VPS que KN, port distinct, service systemd distinct).

## Stack VPS

- **OS** : Linux (Ubuntu/Debian, user `stan`)
- **Postgres** : instance unique sur le VPS, 2 bases distinctes — `kuroneko` (existante) et `youri` (à créer au Sprint 0). Pas de schéma `shared` — Contact/Venue restent dans la base `kuroneko`, Youri y accède via API HTTPS sur KN (token `INTER_APP_TOKEN`).
- **nginx** : reverse proxy HTTPS, vhost par sous-domaine
- **Certbot** : certificats Let's Encrypt par sous-domaine
- **systemd** : un service par app (`kuroneko.service` existe déjà, créer `youri.service` au Sprint 0)
- **Node** : installé globalement, `npm run start` lance le serveur Next.js sur un port local (3000 pour KN, 3001 envisagé pour Youri)
- **Backups** : `/home/stan/backups/` (rotation 14j sur VPS, pull manuel local depuis `pull-vps-backup.ps1`)

## Service systemd pattern (cf. `scripts/kuroneko.service` chez KN)

```ini
[Unit]
Description=Youri Next.js production server
After=network.target

[Service]
Type=simple
User=stan
WorkingDirectory=/home/stan/youri
EnvironmentFile=/home/stan/youri/.env
Environment=NODE_OPTIONS=--max-old-space-size=2048
Environment=TZ=Europe/Paris        # CRITIQUE pour formatage dates SSR Paris
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=10
NoNewPrivileges=yes
ProtectSystem=full
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

**Pourquoi `TZ=Europe/Paris`** : sans ça, les dates stockées UTC (`2027-05-11T22:00:00Z` = 12 mai 00h Paris) s'affichent au mauvais jour côté SSR alors que le client affiche le bon. Bug réel rencontré sur KN sur le show "La Source - Traversière".

## Pipeline deploy.ps1

1. SSH `pg_dump` pre-deploy → `/home/stan/backups/pre-deploy-<timestamp>.dump.gz`
2. `tar -czf` du code local (exclut `node_modules`, `.next`, `.env*`, `prisma/*.db*`, `public/uploads`, `.git`, `tsconfig.tsbuildinfo`, `backups`)
3. `scp` vers `/tmp/youri-deploy.tar.gz`
4. SSH : `sudo systemctl stop youri`
5. `tar -xzf` over `/home/stan/youri` (préserve `.env`, DB, `public/uploads`)
6. `PUPPETEER_SKIP_DOWNLOAD=true npm ci --no-audit --no-fund`
7. `npx prisma migrate deploy`
8. `NODE_OPTIONS='--max-old-space-size=3072' npm run build`
9. `sudo systemctl start youri` + `sleep 2` + status
10. Health check `curl -sS -o /dev/null -w '%{http_code}' https://app.pangeeprod.com/api/health` → doit retourner 2xx

**Rollback** : pas de rollback code automatique ; backup DB conservé. Faire `git revert` + redeploy si besoin.

## OAuth Google — particularité multi-app

Quand 2 apps partagent le même Google Cloud Project, **chaque OAuth Client doit lister TOUTES les redirect URIs**, ou créer un OAuth Client distinct par app. Pour Youri V2 : créer un nouveau OAuth Client distinct dans la même console Google Cloud (plus propre que mutualiser).

URIs à déclarer pour Youri :
- `https://app.pangeeprod.com/api/auth/google/callback`
- `http://localhost:3000/api/auth/google/callback` (dev)

## Rationale

Cette infra a été montée pour KN et fonctionne. Pas la peine de réinventer. Mutualiser le VPS = économique + une seule chaîne de backup à maintenir.

## Application

Sprint 0 Youri V2, copier `kuroneko.service` → `youri.service` en changeant `WorkingDirectory`, `EnvironmentFile`, `Description`. Adapter `deploy.ps1` (variables `$VPS_HOST`, `$VPS_APP_DIR`, `$HEALTH_URL`). Créer vhost nginx pour `app.pangeeprod.com` pointant vers `localhost:3001`. Lancer certbot. Au premier deploy, créer manuellement `/home/stan/youri/` + `.env` + appliquer migrations Prisma initiales avant `systemctl start`.

## Voir aussi

- [dev-scripts.md](dev-scripts.md)
- [../architecture-decisions.md](../architecture-decisions.md)
