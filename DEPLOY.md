# Déploiement Youri V2

Procédure en 5 étapes, à suivre à chaque mise en production (portée de
KuroNeko-App le 2026-09-29). Serveur : VPS Hetzner partagé avec KN
(`ssh stan@app.kuronekoprod.com`), app servie sur `https://app.pangeeprod.com`,
dossier `/home/stan/youri`, service `youri`, base `prisma/prod.db` (SQLite).

## 1. Contrôles automatiques

```powershell
npm run predeploy
```

Git propre, tests, types, lint (erreurs), schéma Prisma = migrations, build de
production. Arrêter le serveur de dev avant (le build partage `.next`).
`scripts/deploy.ps1` relance ces contrôles et s'arrête s'ils échouent.

## 2. Répétition sur une copie de la base de production

1. Récupérer la sauvegarde de la nuit : la plus récente dans
   `%USERPROFILE%\Backups\Youri` (tâche planifiée `scripts/pull-vps-backup.ps1`),
   ou directement sur le VPS :
   `ssh stan@app.kuronekoprod.com "ls -t /home/stan/backups/youri-*.db.gz | head -1"`,
   puis `scp` et décompression (`gunzip` / 7-Zip) dans `backups/`.
2. `npm run predeploy:rehearsal -- backups/youri-AAAAMMJJ-HHMMSS.db`
3. Lire `backups/rehearsal-report.md` : aucun deal disparu, écarts de part
   Pangee et de management fees expliqués, productions / résidences attendues.

La base de dev et le serveur ne sont jamais touchés. Les copies
(`backups/rehearsal-*`, `prisma/recette.db`) sont ignorées par git.

## 3. Revue de code

Relecture de tout l'écart depuis le dernier tag `deploy-*` (`git diff <tag> HEAD`) :
calculs financiers, management fees (jamais dans les bilans / exports / compte
artiste), migrations de données, actions serveur, écrans.

## 4. Recette (Stan)

```powershell
copy backups\rehearsal-after.db backups\recette-source.db
node scripts/dev-recette.mjs backups/recette-source.db
```

(ou la configuration « youri-recette » de `.claude/launch.json`). L'app tourne
sur http://localhost:3001 avec la copie migrée de la production, **coupée de
l'extérieur** :

- connexion Google désactivée → se connecter avec le mot de passe de secours ;
- aucun email (FDR…) ne part ;
- l'API KN pointe sur le KN **local** (http://localhost:3000) : aucune fiche
  contact / lieu du KN de production n'est créée ou modifiée.

Check-list minimale :

- [ ] Une production réelle : dates, résidences, KPI, onglet Résultats, bilan PDF et Excel.
- [ ] Compte artiste d'une production avec versements (soldes, statuts « réglé »).
- [ ] Une date de résidence : séances, relevé, « Éditer » (le mois ne doit pas bouger).
- [ ] Management fees : montants inchangés sur la page Management fees, absents des bilans / exports.
- [ ] Listes Booking / Production / Cachets : totaux, filtres.
- [ ] Corbeille : supprimer puis restaurer un deal.
- [ ] Sur iPhone (tunnel) : fiche production, fiche date.

## 5. Déploiement

```powershell
.\scripts\deploy.ps1
```

Enchaîne : contrôles (`npm run predeploy`, déploiement annulé s'ils échouent)
→ sauvegarde de la base sur le VPS (`youri-pre-deploy-*.db.gz`)
→ envoi du code → `rsync --delete` (`.env`, `prod.db`, `public/uploads`
préservés) → `npm ci` → `prisma migrate deploy` → build → redémarrage →
contrôle HTTPS → tag git `deploy-AAAAMMJJ-HHMM` (= version en ligne, aussi
écrite dans `DEPLOYED_COMMIT` sur le serveur).

## Retour arrière

1. Code : `git checkout <tag deploy précédent>` puis `.\scripts\deploy.ps1 -SkipChecks`
   (revenir ensuite sur `main`).
2. Base (uniquement si une migration a abîmé des données — les migrations ne
   se « défont » pas) :
   ```bash
   ssh stan@app.kuronekoprod.com
   sudo systemctl stop youri
   cp /home/stan/youri/prisma/prod.db /home/stan/backups/youri-avant-rollback.db
   gunzip -c /home/stan/backups/youri-pre-deploy-AAAAMMJJ-HHMMSS.db.gz > /home/stan/youri/prisma/prod.db
   sudo systemctl start youri
   ```
   ⚠️ Les saisies faites entre le déploiement et le retour arrière sont perdues.
