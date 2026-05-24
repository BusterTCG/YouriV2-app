# Architecture Decisions — Youri V2

**Verrouillées le** : 2026-05-24
**Source** : décisions tranchées avec Stan en session d'alignement avant Sprint 0

---

## Stack technique

| Couche | Choix | Pourquoi |
|---|---|---|
| Framework | Next.js 16.2.6 (App Router) | Cohérence avec KN, server actions |
| Langage | TypeScript 5 strict | — |
| ORM | Prisma 6 (mono-schema, base dédiée) | Pas de Prisma multi-schema — décidé après analyse |
| BDD | Postgres dédié (sur le VPS, base `youri`) | Une seule app écrit dans cette DB |
| UI | shadcn/ui + Tailwind v4 (OKLCH) | Identique KN |
| **Brand** | **Navy `#1a2540` + Gold `#d4a93a`** | Identique KN (pas de différenciation visuelle) |
| Auth | JWT cookie HS256 + Google OAuth + mdp secours | Pattern KN éprouvé |
| Validation | Zod + React Hook Form | — |
| Tests | Vitest + happy-dom | — |
| Hébergement | VPS mutualisé, `app.pangeeprod.com`, systemd + nginx | Sous-domaine distinct, port distinct |
| Notifications | In-app cloche (table `Notification`) | Pas d'email |
| AI | **AUCUN** (pas de chat, pas de quick-add Claude) | Décision V2 |
| Calendar/GCal/ICS | **AUCUN** | Décision V2 |

---

## Architecture multi-app & annuaire partagé

**KN = hub annuaire** (single writer authoritatif sur Contact / Venue / VenueRoom).
**Youri V2 = client** qui consomme via API REST.

```
┌──────────────────┐         ┌──────────────────┐
│ KuroNeko-App     │  HTTPS  │ Youri V2         │
│ (hub annuaire)   │◄────────┤ (client API)     │
│                  │         │                  │
│ Postgres KN      │         │ Postgres Youri   │
│ ├── Contact ★    │         │ ├── User         │
│ ├── Venue ★      │         │ ├── Artist       │
│ ├── VenueRoom ★  │         │ ├── Deal         │
│ └── (reste KN)   │         │ ├── DealArtiste  │
└──────────────────┘         │ ├── Task         │
        ▲                    │ └── ...          │
        │                    └──────────────────┘
        │ Endpoints exposés :
        │   GET    /api/external/contacts
        │   GET    /api/external/contacts/[id]
        │   POST   /api/external/contacts
        │   PATCH  /api/external/contacts/[id]
        │   GET    /api/external/venues
        │   POST   /api/external/venues
        │   PATCH  /api/external/venues/[id]
        │   GET    /api/external/venues/[id]/rooms
        │   POST   /api/external/venues/[id]/rooms
        │   (auth : Bearer ${INTER_APP_TOKEN})
```

**Stratégie de lecture** : snapshot local Youri stocke `{contactId, contactName, contactCompany, contactCity}` sur le `Deal` au moment du choix. Refetch via API uniquement quand l'user clique "Modifier ce contact". Si le contact est renommé côté KN, le snapshot Youri se désynchronise jusqu'au prochain edit — acceptable.

**Fallback si KN API down** : erreur explicite côté Youri ("Annuaire indisponible, réessaye dans quelques secondes"). Pas de mode dégradé, pas de cache local en écriture.

**Token inter-app** : variable `INTER_APP_TOKEN` (64+ chars hex aléatoires) stockée identique dans le `.env` des 2 apps. Voir [KuroNeko-App § API externe](https://github.com/BusterTCG/KuroNeko-App#api-externe-consomm%C3%A9e-par-youri-v2).

---

## Users & permissions

Table `User` côté Youri avec 3 seedés :
- **Stan** (ADMIN)
- **Certe** (MEMBER)
- **Angath** (MEMBER)

**Permissions** : MEMBER fait TOUT (créer/modifier/supprimer n'importe quel deal/tâche de n'importe quel user, valider n'importe quelle tâche). ADMIN = gestion users + édition templates de tâches uniquement. L'audit log trace qui a fait quoi en cas de litige.

**Login** : Google OAuth (whitelist 3 emails Pangee Prod) + mot de passe de secours type KN. Session JWT cookie `youri-session` HS256, 365j.

---

## Modèle de données (résumé)

### Côté Youri (base Postgres `youri`)

- **User** : id, email, name, passwordHash, googleEmail, role (ADMIN/MEMBER), color, active
- **Artist** : id, name, slug, color, notes, active, deletedAt — table dédiée, séparée de KN (rosters distincts)
- **Deal** : id, category (BOOKING/PROD_EXE/CACHETS), title, organizerId+snapshot, venueId+snapshot, notes, status (LEAD/EN_COURS/CONFIRMÉ/ANNULÉ), createdById, createdAt, deletedAt
  - **Champs Booking** : date unique, grossAmount, commissionPct, invoiceStatus
  - **Champs Prod Exé** : gauge, paying, coproductionPct (défaut 15), ticketingUrl
  - **Champs Cachets** : provider (texte), period (mois)
- **DealDate** (pour Prod Exé + Cachets multi-date) : id, dealId, date, endTime?, comment
- **DealArtiste** (multi-artiste) : id, dealId, artistId, cachetAmount, paymentStatus (PENDING/VALIDATED/PAID/CANCELLED), notes
- **ProductionLine** (uniquement Prod Exé) : id, dealId, kind (COST/REVENUE), label (enum), customLabel, amount, paymentStatus, paidAt?
- **TaskTemplate** : id, category, order, title, defaultAssigneeId?, defaultDaysBeforeDate?
- **Task** : id, dealId, templateId?, title, assigneeId, status (TODO/IN_PROGRESS/DONE/BLOCKED), dueDate?, completedAt?, completedById?, order, notes, deletedAt
- **Notification** : id, userId, type, title, body, linkUrl, readAt?, createdAt
- **AuditEntry** : id, entity, entityId, action, userId, before (JSON), summary, createdAt
- **AppSetting** : key, value

### Côté KN (base Postgres `kuroneko`, consommé via API)

- **Contact** : id, firstName, lastName, company, email, phone, city, profession, type (enum 8 valeurs), venueId?, notes, deletedAt
- **Venue** : id, name, city, address, capacity, notes, deletedAt
- **VenueRoom** : id, venueId, name, capacity, notes

---

## Multi-date

- **Booking** : mono-date (champ `date` unique sur le Deal)
- **Prod Exé** : multi-date via table `DealDate`
- **Cachets** : multi-date via table `DealDate`

---

## Multi-artiste

`DealArtiste` lie un Deal à N artistes avec :
- `cachetAmount` individuel
- `paymentStatus` individuel (PENDING / VALIDATED / PAID / CANCELLED)

Pas de tâches individuelles par artiste, pas d'owner individuel — décision pour rester simple.

---

## Statut deal + workflow tâches

**Statut deal manuel simple** : `LEAD` → `EN_COURS` → `CONFIRMÉ` (ou `ANNULÉ`).

**Workflow** : à la création d'un deal, server action lit `TaskTemplate` filtré sur la catégorie → crée N `Task` clonées avec assignation par défaut configurable et `dueDate` calculée depuis `date - defaultDaysBeforeDate`. Validation tracée (`completedById` + `completedAt`).

**Pas de couplage automatique** : le statut du deal reste manuel, la barre de progression des tâches donne la visibilité "où on en est". Le statut donne la phase commerciale, les tâches donnent le détail opérationnel.

---

## Cascade soft-delete

- delete **Deal** → cascade `Task` + `DealArtiste` + `ProductionLine` + `DealDate` (tous deletedAt)
- delete **Artist** → **bloqué** si des DealArtiste actifs le référencent (force à nettoyer avant)
- Restauration depuis `/trash` ressuscite tout l'arbre

---

## Pages & navigation

```
/login                       Public (Google + mdp secours)
/dashboard                   Mes tâches + alertes + KPIs financiers
/booking                     Liste deals Booking (table + filtres)
/booking/[id]                Détail Booking (infos, artistes, tâches)
/prod-executive              Liste Prod Exé
/prod-executive/[id]         Détail Prod Exé (lignes prod, dates, artistes, tâches)
/cachets                     Liste Gestion cachets
/cachets/[id]                Détail Cachet
/taches                      TOUTES mes tâches en cours (tri deadline) — vue centrale user
/artistes                    Liste des artistes Youri
/artistes/[slug]             Fiche artiste + ses deals
/contacts                    Annuaire contacts (wrapper API KN)
/lieux                       Annuaire lieux (wrapper API KN)
/reporting                   KPIs avancés, breakdown par artiste / cat / période
/trash                       Corbeille (deals, tâches, artistes soft-deleted)
/settings                    Profil organisation
/settings/users              Gestion 3 users (ADMIN seulement)
/settings/templates          Édition des checklists par catégorie de deal (ADMIN)
```

**Topbar** : logo + filtre artiste + cloche notif + avatar user + theme toggle
**Sidebar** : Dashboard / Booking / Prod Exé / Cachets / Tâches / Artistes / Contacts / Lieux / Reporting / Settings

---

## Plan en 13 sprints (validés)

| # | Sprint | Contenu |
|---|---|---|
| **PRÉALABLE KN** | API externe (✅ FAIT) | Endpoints `/api/external/*` côté KuroNeko-App |
| **0** | Bootstrap + infra VPS | Scaffold Next.js 16, Prisma, theme, sous-domaine, .claude/, prisma.config, error.tsx, /api/health, Eruda |
| **1** | Auth + 3 users + error.tsx segment | User table, OAuth, mdp secours, /settings/users |
| **2** | Client API KN + master data Artist | lib/kn-client.ts (fetch typé), pages /contacts /lieux (wrappers), table youri.Artist + page /artistes |
| **3** | Deal Booking + multi-artiste | Deal + DealArtiste, page /booking, form complet |
| **4** | Deal Prod Exé 15% + multi-date | ProductionLine, DealDate, calcul auto 15%, /prod-executive + tests Vitest |
| **5** | Deal Cachets + multi-date | Champs cachets, /cachets |
| **6** | Tâches + templates | TaskTemplate, Task, auto-création, /taches, /settings/templates + tests |
| **7** | Dashboard | Mes tâches + alertes + KPIs financiers |
| **8** | Notifications | Notification, cloche, triggers, cron retards |
| **9** | Reporting | KPIs avancés, charts Recharts, exports Excel |
| **10** | Soft-delete + Trash + Audit | Extension Prisma, /trash, AuditEntry |
| **11** | **Mobile responsive + PWA polish** | Test iPhone via cloudflared, mobile-nav, touch targets, viewport — exigence non-négociable |
| **12** | Polish + prod | Tests Vitest critiques, backups, pull-vps-backup.ps1, mise en prod |

**Total estimé** : ~18-25 jours dev (hors préalable KN déjà fait).

**Test mobile en continu** : à chaque sprint, dès qu'un écran est ajouté, le tester sur iPhone via le tunnel cloudflared. Le Sprint 11 est une passe finale de revue + corrections.

---

## Outillage repris de KN (intégré dans le plan)

- **Sprint 0** : `.claude/settings.json` + `prisma.config.ts` + `app/error.tsx` global + Eruda devtools mobile + `/api/health`
- **Sprint 1** : `app/(app)/error.tsx` per-segment
- **Sprint 2** : `scripts/audit-orphan-snapshots.ts` (détecte snapshots Contact désynchronisés vs API KN)
- **Sprint 4** : tests Vitest sur `lib/finance/` (15% Prod Exé)
- **Sprint 6** : tests Vitest sur agrégats multi-artiste + auto-création tâches
- **Sprint 12** : `scripts/pull-vps-backup.ps1` (rapatrier dump prod en local)

---

## Décisions explicitement HORS scope V2

- ❌ Google Calendar / ICS sync
- ❌ Appointments / RDV séparés des deals
- ❌ Shows page séparée (intégré dans Prod Exé)
- ❌ Briefing / FDR / PDF impression
- ❌ Claude API / chat / quick-add AI
- ❌ Page facturation dédiée (les statuts vivent sur la page deal)
- ❌ Email Resend

Si un besoin hors scope émerge en cours de développement, **vérifier avec Stan AVANT** d'ajouter.

---

## Migration depuis Youri V1

**Fresh start** : V1 (`C:\Users\stani\Dev\youri-app`) reste en lecture seule en parallèle. Pas d'import de données V1 dans V2.
