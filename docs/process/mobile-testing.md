# Process — Test mobile (exigence non-négociable)

Stan teste systématiquement ses apps sur iPhone Safari en plus du desktop — c'est une exigence **non-négociable**. Le process suivant a été mis au point sur KuroNeko et doit être repris dans Youri V2.

## Tunnel HTTPS dev (cloudflared)

- Binaire `cloudflared.exe` placé à `C:\Users\stani\Dev\cloudflared.exe` (déjà installé).
- Lancé par le `.bat` au moment de `npm run dev`, dans une **2e fenêtre cmd dédiée** : `cloudflared tunnel --url http://localhost:3000`.
- Génère une URL HTTPS publique éphémère type `https://xxx-yyy-zzz.trycloudflare.com`.
- À coller dans Safari iPhone → app accessible en HTTPS (donc PWA installable, Service Workers OK, géoloc OK).
- **HMR/Fast Refresh fonctionne via le tunnel** — modifs en live sur le téléphone.
- Pour que Next.js accepte les requêtes du tunnel : `next.config.ts` doit avoir `allowedDevOrigins: ['*.trycloudflare.com']` (sinon CORS dev bloque).
- La fenêtre tunnel DOIT rester ouverte tant que Stan utilise l'app sur iPhone.

Pour Youri V2 : adapter le `.bat` pour pointer sur le port 3000 (ou 3001 si parallèle à KN). Cf. `Lancer-KuroNeko.bat` lignes 23-46 pour le bloc cloudflared exact.

## PWA — installable iOS/Android

- **`app/manifest.ts`** (Next 16 sert ça sous `/manifest.webmanifest`) : `name`, `short_name`, `display: "standalone"`, `theme_color: "#000000"`, `background_color: "#ffffff"`, 3 icons (192, 512, 512 maskable).
- **Icons** dans `public/` : `icon-192.png`, `icon-512.png`, `icon-1024.png` (source), `apple-touch-icon.png` (180×180), `icon-180.png`, `favicon-32.png`, `logo-mark.png`.
- **Generator** : `scripts/generate-icons.mjs` produit toutes les tailles depuis un SVG/PNG source via `sharp`. Lancer une fois au Sprint 0.
- **Middleware** : exclure ces fichiers du matcher d'auth pour qu'ils soient servis publiquement.
- **`app/layout.tsx`** : exporter `viewport` avec `themeColor`, `width: "device-width"`, `initialScale: 1`, `maximumScale: 1` (empêche zoom involontaire iOS).
- **Apple meta tags** : Next gère via `metadata.appleWebApp = { capable: true, statusBarStyle: "black-translucent", title: "Youri" }`.

## Composants mobile-first

- **`components/layout/mobile-nav.tsx`** : hamburger visible `md:hidden`, ouvre `<Sheet side="left">` qui contient la même nav que la sidebar desktop.
- **Sidebar desktop** cachée `hidden md:flex` ; le `<main>` prend toute la largeur sur mobile.
- **Touch targets** : minimum 44×44px (recommandation iOS HIG) — Tailwind `min-h-11 min-w-11` sur boutons d'action mobile.
- **Inputs sans zoom iOS** : `font-size: 16px` minimum sur tous les `<input>`, `<textarea>`, `<select>` (sinon Safari zoom automatiquement au focus). Forcé dans `globals.css` via reset.
- **`100dvh`** au lieu de `100vh` pour les overlays plein écran (gère la barre Safari qui apparaît/disparaît).
- **Tables responsives** : cards empilées sur mobile (`md:table md:row` pattern) plutôt que scroll horizontal.

## Process de test mobile

1. Lancer `Lancer-Youri.bat` → ouvre tunnel + serveur dev
2. Copier l'URL trycloudflare dans Safari iPhone
3. Tester chaque flow critique : login, création deal, validation tâche, navigation, formulaires
4. Vérifier : pas de zoom au focus input, touch targets atteignables au pouce, sheet mobile ne se bloque pas, scroll fluide, dark mode lisible en plein soleil
5. Tester "Ajouter à l'écran d'accueil" Safari → app launch en standalone

## Rationale

Stan se déplace beaucoup (lieux, RDV organisateurs) et a besoin de valider des tâches / consulter des deals depuis son iPhone en temps réel. Une app desktop-only ne lui sert à rien sur la route. C'est un usage **quotidien** et non un "nice to have".

## Application

Sprint 0 Youri V2 → installer cloudflared logic dans le `.bat`, mettre en place le PWA manifest + icons, configurer viewport + apple meta. **Sprint 11 dédié "Mobile responsive + PWA polish"** en fin de cycle pour passer chaque écran en revue sur iPhone et corriger les régressions responsive. Tester en cours de route à chaque sprint (pas seulement à la fin) sur les pages qui viennent d'être ajoutées.

## Voir aussi

- [dev-scripts.md](dev-scripts.md)
- [design-system.md](design-system.md)
- [../architecture-decisions.md](../architecture-decisions.md)
