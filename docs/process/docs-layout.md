# Process — Structure des docs racine

Convention de docs à la racine de chaque app Stan (établie sur KuroNeko-App, à reproduire dans Youri V2 et tout futur projet).

## Fichiers obligatoires

- **README.md** — Stack en 3 lignes, `Getting started` (3-4 commandes npm), tableau des scripts npm, arbre de la structure du projet commenté, section Tests, section Sauvegardes, section "Données réelles importées" si pertinent. Pas de fioritures, pas de badges. Concis, opérationnel.
- **ARCHITECTURE.md** — Document de cadrage initial : vue d'ensemble + principe directeur en 1 ligne, stack technique en tableau, modèle de données (schéma Prisma résumé + diagramme ASCII relationnel), règles métier critiques numérotées, arborescence Next.js détaillée, wireframes ASCII des écrans clés, roadmap par sprints en tableau, "Décisions verrouillées" en checklist, "Prochaine étape" très concrète. À écrire AVANT de coder, et à amender quand l'archi évolue.
- **CHANGELOG.md** — Format "Keep a Changelog". Une entrée par sprint OU par grosse session, datée. Sections `Added` / `Changed` / `Fixed` / `Removed`. Process explicite en haut : "ce fichier est mis à jour à la fin de chaque modification significative". Très détaillé : noms exacts de modèles, champs, composants, migrations Prisma.
- **AGENTS.md** — Court à moyen. Règles globales pour tout agent qui touche le repo. Pointe vers `docs/architecture-decisions.md` + `docs/process/*` pour les détails. Wrappé en `<!-- BEGIN:xxx -->` / `<!-- END:xxx -->` pour qu'un outil puisse remplacer la section automatiquement.
- **CLAUDE.md** — Une seule ligne : `@AGENTS.md`. Délègue à AGENTS.md pour éviter la duplication.
- **AI_ROADMAP.md** (si l'app a de l'IA) — Phases numérotées (Phase 1 ✅ livré, Phase 2 🔜, etc.), livrables en checklist `- [x]` / `- [ ]`, hors-scope explicite, garde-fous (budget, toggle). À ne créer QUE si l'app utilise Claude API. Youri V2 n'en a pas en V1.
- **.env.example** — Toutes les variables d'env documentées avec sections délimitées par `# ═════` séparateurs, instructions détaillées pour obtenir chaque secret (URL console Google, etc.), exemples local/prod.

## Rationale

Stan tient à un onboarding "pris à froid" : quelqu'un (ou Claude) qui ouvre le repo doit comprendre l'app en 5 minutes via README + ARCHITECTURE, et reprendre n'importe quelle session en lisant CHANGELOG. C'est ce qui a permis de coder KN en sprints clairs sans tout perdre entre les sessions.

## Application

Au Sprint 0 de Youri V2, créer ces fichiers (sans AI_ROADMAP). Pour le CHANGELOG, créer la première entrée datée 2026-05-24 avec une section "Sprint 0 — Bootstrap" décrivant le scaffolding. Mettre à jour le CHANGELOG **à la fin de chaque sprint**. AGENTS.md de Youri reprend la règle Next.js de KN + ajoute les pointers vers `docs/`.

## Voir aussi

- [dev-scripts.md](dev-scripts.md)
- [vps-deploy.md](vps-deploy.md)
- [../architecture-decisions.md](../architecture-decisions.md)
