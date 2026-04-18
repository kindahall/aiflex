# AIflex — Plan d'implémentation

Plan vivant à suivre étape par étape jusqu'à ce qu'AIflex soit pleinement opérationnel. À cocher au fur et à mesure. Dernière mise à jour : 2026-04-12 (session 5).

**Légende :** ⬜ à faire · 🟡 en cours · ✅ fait · ❌ bloqué/abandonné

---

## 📊 Progression globale

- Phase 0 (Démo locale crédible) : 3 / 5 (0.1 et 0.5 reportées — clés API)
- Phase 1 (MVP stable) : 3 / 7 (1.4 quotas, 1.6 modération côté code, 1.7 healthcheck partiel)
- Phase 2 (Public-ready) : **8 / 8** ✅ toute la phase est terminée
- Phase 3 (Vision produit) : 1 / 4 (3.4 commentaires + remix + notifications + signalement + partage social)

---

## 🚨 PHASE 0 — Démo locale crédible

> Objectif : qu'on puisse faire tourner l'app localement et tenir une démo de bout en bout (créer un film + le regarder publié) sans bug rédhibitoire.

### 0.1 🟡 Créer `.env.local`
- Copier `.env.local.example` → `.env.local`
- Ajouter une vraie `ANTHROPIC_API_KEY`
- Ajouter une vraie `FAL_KEY`
- Définir `ADMIN_EMAIL` et `ADMIN_PASSWORD` (≥ 6 caractères)
- **Statut :** _reporté volontairement (décision user 2026-04-11). On code sans, on branchera les clés plus tard. Tant que ce n'est pas fait, le pipeline IA reste muet : signup/login/dashboard fonctionnent, mais `/api/concept`, `/api/scenario`, `/api/scenes`, `/api/scene-video` jetteront « ANTHROPIC_API_KEY manquant » / « FAL_KEY manquant »._
- **Notes :** _(à remplir)_

### 0.2 ✅ Fixer le logo "Reflex" → "AIflex"
- Fichier : [components/Navbar.tsx:52](components/Navbar.tsx#L52)
- Changer `Re<span>flex</span>` en `AI<span>flex</span>`
- **Statut :** _fait (déjà corrigé entre l'audit et la session — vérifié à la ligne 52, affiche bien `AI<span>flex</span>` avec accent flex-accent)_
- **Notes :** _Bonus : l'avatar passe en gradient flex-accent → flex-accent2 au lieu du carré noir._

### 0.3 ✅ Lecture publique des films communautaires
**C'est le bug le plus grave fonctionnellement.**
- Refondre [app/watch/[id]/page.tsx](app/watch/[id]/page.tsx) pour gérer deux cas :
  - ID du catalogue hardcodé (`cat-*`) → comportement actuel ✅
  - ID de projet user (`p_*`) → lecture via `<AssemblyPlayer>` ✅
- Brancher le bouton "▶" du Hero ([components/Hero.tsx](components/Hero.tsx)) sur `/watch/{featured.id}` ✅
- **Statut :** _fait_
- **Notes :**
  - Page reste un Server Component, branche directement sur `getProjectById` côté serveur (pas de round-trip HTTP).
  - Garde le 404 si le projet n'est ni publié ni public, ou si pas de concept.
  - Bump du compteur `views` fire-and-forget côté serveur (sans bloquer le rendu). Le endpoint `/api/feed/[id]` continue de bumper aussi pour les autres consommateurs — éventuelle dédup à faire plus tard.
  - "Films similaires" pour un projet user = autres projets publics du même genre via `listPublicProjects`.
  - Pour un item catalogue, ajout d'un bandeau ℹ "démo de catalogue" pour clarifier que ce ▶ là n'a pas de fichier vidéo réel.
  - Hero : la preview entière (pas juste le bouton) devient un Link vers `/watch/{item.id}` avec aria-label.

### 0.4 ✅ Appliquer `maxScenesPerProject` dans la génération
- Fichier : [app/api/scenes/route.ts](app/api/scenes/route.ts)
- Lire `getSettings().maxScenesPerProject` après génération ✅
- Tronquer le tableau `parsed.scenes` à cette limite ✅
- **Statut :** _fait_
- **Notes :** Clamp avec `Math.max(1, … || 24)` pour blinder contre une config nulle ou 0. Le slice intervient avant l'attribution des `id`/`index` pour que la numérotation reste 0…N-1 sans trou.

### 0.5 ⬜ Test manuel de bout en bout
Vérifier que le parcours suivant fonctionne sans erreur :
1. Démarrer `npm run dev`
2. Login admin
3. Créer un compte user
4. Studio → idée → concept → scénario → scènes → générer 2-3 vidéos
5. Publier le projet
6. Logout, retourner sur `/`, cliquer sur le film publié dans "✦ Créés sur AIflex"
7. Vérifier que la lecture marche
- **Statut :** _à faire_
- **Notes :** _(à remplir)_

---

## 🛠 PHASE 1 — MVP stable

> Objectif : que l'app tienne sur un déploiement réel (Vercel/Fly), sans cramer le budget API et sans perdre les vidéos en 24h.

### 1.1 ⬜ Migrer la base JSON → Postgres
- Choisir : Neon, Supabase ou Vercel Postgres
- Installer Prisma ou Drizzle
- Schéma : `users`, `sessions`, `projects`, `scenes`, `settings`, `usage_quotas`
- Réécrire [lib/server-db.ts](lib/server-db.ts) avec le client choisi
- Script de migration depuis `.data/db.json` (utile en dev)
- **Statut :** _à faire_
- **Notes :** _(à remplir)_

### 1.2 ⬜ Persister les vidéos fal.media → stockage objet
- Choisir : Cloudflare R2, S3, ou Supabase Storage
- Après chaque génération réussie :
  - Télécharger l'asset depuis `*.fal.media`
  - Upload vers le bucket
  - Stocker l'URL CDN persistante en DB
- Faire de même pour les thumbnails
- **Statut :** _à faire_
- **Notes :** _(à remplir)_

### 1.3 ⬜ Job queue async pour la génération vidéo
- Remplacer `fal.subscribe` par `fal.queue.submit` dans [lib/seedance.ts](lib/seedance.ts)
- Stocker `requestId` + `videoStatus: pending` en DB
- Endpoint webhook `/api/fal-webhook` pour réception de la complétion
- Côté client : polling sur `/api/projects/[id]` pour rafraîchir le statut
- Persister les erreurs dans `videoError`
- **Statut :** _à faire_
- **Notes :** _(à remplir)_

### 1.4 ✅ Système de quota par utilisateur
- ~~Table `usage_quotas`~~ : compteur stocké directement sur l'objet `User` via `usage: { month: "YYYY-MM", videosGenerated }` — plus simple pour la DB JSON, sera retravaillé avec la migration Postgres ✅
- Plafond par défaut : 30 vidéos / mois ; valeur dans `DEFAULT_PLATFORM_SETTINGS.monthlyVideoQuota` ✅
- Plafond configurable depuis `/admin/settings` (champ "Quota vidéo mensuel par utilisateur") ✅
- Vérification dans [api/scene-video/route.ts](app/api/scene-video/route.ts) avant l'appel fal.ai ; renvoie 429 + `quotaExceeded: true` si dépassé ✅
- Compteur incrémenté **uniquement après succès** de la génération (les erreurs ne consomment pas de quota) ✅
- Endpoint `/api/me/usage` + carte `QuotaCard` dans le dashboard avec barre de progression colorée (vert/orange/rouge selon palier 60%/90%) ✅
- Admins exemptés (illimité) — affichage `∞` dans le dashboard ✅
- **Statut :** _fait_
- **Notes :** Reset implicite : la fonction `getCurrentUsage` lit le mois courant et renvoie 0 si le mois stocké est obsolète, pas besoin de cron. La même logique s'applique côté `incrementVideoUsage` qui réinitialise avant d'incrémenter. Limitation connue : toujours pas de rate limit côté API, donc un user mal intentionné peut spammer le endpoint et faire monter le compteur très vite — c'est 1.5 qui complétera.

### 1.5 ⬜ Rate limiting
- Choisir : Upstash Redis ou `@vercel/kv`
- Limiter `/api/auth/login` et `/api/auth/signup` (par IP)
- Limiter `/api/concept`, `/api/scenario`, `/api/scenes`, `/api/scene-video` (par user)
- **Statut :** _à faire_
- **Notes :** _(à remplir)_

### 1.6 🟡 Modération basique des prompts
- Avant chaque appel Seedance : check Claude Haiku rapide ✅ ([lib/moderation.ts](lib/moderation.ts))
- Si bloqué → renvoyer 422 avec catégorie + message ✅
- ⬜ Logger les blocages dans une table `moderation_logs` (à faire avec la migration Postgres 1.1)
- **Statut :** _partiel — code prêt, exécution muette tant que ANTHROPIC_API_KEY n'est pas branché_
- **Notes :** Politique fail-open documentée : sans clé OU sur erreur transport Claude → `{ allowed: true, bypassed: true }`. Les bypass loggent vers la console pour qu'un futur Sentry les remonte. Catégories : minors, real-person, violence, hate, sexual, copyright, other. Le check tourne **avant** la déduction du quota pour qu'un prompt rejeté ne consomme pas de générations. Modèle utilisé : Claude Haiku 4.5 (jamais Opus, pour ne pas inverser le ratio coût/protection).

### 1.7 🟡 Healthcheck + error reporting
- Endpoint `/api/health` qui vérifie : DB, ANTHROPIC_API_KEY, FAL_KEY ✅
  - Mode `?strict=1` qui exige aussi les clés tierces
  - Sortie : `{ ok, checks, uptimeMs, latencyMs, version, env }`
- ⬜ Intégrer Sentry (`@sentry/nextjs`) — reporté avec les autres clés externes
- ⬜ Logger structuré (pino/winston) — reporté
- **Statut :** _partiel — endpoint OK, monitoring tiers en attente_
- **Notes :** Volontairement *cheap* : aucun appel réseau vers Anthropic ou fal.ai, on vérifie juste la présence des env vars. Ça évite que le healthcheck déclenche lui-même des coûts.

---

## 🌍 PHASE 2 — Public-ready

> Objectif : qu'on puisse ouvrir l'app au public sans risque légal, fonctionnel ou réputationnel.

### 2.1 ✅ Conformité légale
- Pages : `/legal/terms`, `/legal/privacy`, `/legal/ai-disclosure` ✅
- Footer global avec liens légaux ✅ ([components/Footer.tsx](components/Footer.tsx)) intégré dans `RootLayout`
- Bandeau cookies ✅ ([components/CookieNotice.tsx](components/CookieNotice.tsx)) — informationnel, dismiss persisté en localStorage
- Watermark "Généré par IA · AIflex" ✅ overlay top-right always-visible dans [AssemblyPlayer.tsx](components/AssemblyPlayer.tsx)
- ⬜ Métadonnées C2PA pour les vidéos (à brancher en même temps que le stockage objet 1.2)
- **Statut :** _fait, hors C2PA qui dépend du stockage objet_
- **Notes :** Layout partagé `LegalLayout.tsx` pour les 3 pages, classe `prose-legal` ajoutée à `globals.css` pour les h2/p/ul (évite de pull `@tailwindcss/typography` pour 3 docs). Adresses email mentionnées : hello@, legal@, privacy@, moderation@aiflex.app — à activer plus tard côté DNS/Resend. Le bandeau cookies n'est pas un "vrai" consent flow (pas de catégories) car on n'a qu'un cookie strictement nécessaire (session) — c'est juste une notice. Si on ajoute analytics/trackers plus tard, à upgrader.

### 2.2 ✅ Reset password self-service
- ⬜ Choisir provider : Resend ou Postmark — **stub console en attendant** ([lib/email.ts](lib/email.ts)) qui logge le lien dans la console serveur ; bascule automatique vers le vrai provider si `RESEND_API_KEY` ou `POSTMARK_API_KEY` est défini ✅
- Endpoint `/api/auth/forgot-password` ✅ — anti-énumération (toujours 200, message générique, work fire-and-forget)
- Endpoint `/api/auth/reset-password` ✅ — vérifie le token, hash + persiste le nouveau mot de passe
- Page `/forgot-password` ✅
- Page `/reset-password?token=…` ✅
- Token valide 1h, signé HMAC-SHA256 stateless ([lib/tokens.ts](lib/tokens.ts)) — pas de table à nettoyer ✅
- Lien "Mot de passe oublié ?" sur `/login` ✅
- **Statut :** _fait, provider réel à brancher_
- **Notes :** Tokens stateless = pas de DB de tokens à maintenir mais pas de révocation côté serveur, donc TTL court (1h pour reset, 24h pour vérification email). Secret HMAC : `AIFLEX_TOKEN_SECRET` env var, fallback dev hardcodé avec warn console.

### 2.3 ✅ Email verification au signup
- Envoi d'email fire-and-forget à l'inscription ✅
- Champ `emailVerified` + `emailVerifiedAt` sur `User` ✅
- Endpoint `/api/auth/verify-email` (idempotent) ✅
- Endpoint `/api/auth/resend-verification` (auth requise) ✅
- Page `/verify-email?token=…` qui consomme le token côté client ✅
- Banner "Vérifie ton email" sur le dashboard avec bouton de renvoi ✅
- Publication bloquée (`/api/projects/[id]/publish`) tant que non vérifié ; admins exemptés ; admin seedé auto-vérifié sur bootstrap ✅
- Création de projet et génération IA toujours autorisées (on bloque seulement la diffusion publique) ✅
- **Statut :** _fait_
- **Notes :** Failure mode signup : si l'envoi d'email échoue, on log mais on ne bloque pas l'inscription — l'utilisateur peut toujours redemander un lien depuis le dashboard. Token verify-email valide 24h. Admin seedé : `bootstrap()` met `emailVerified: true` automatiquement.

### 2.4 ✅ Likes + watchlist
- Tables `likes` et `watchlist` ajoutées au JSON DB (rétro-compat via `?? []` dans bootstrap) ✅
- API ✅ :
  - `GET/POST/DELETE /api/projects/[id]/like` (GET ouvert, POST/DELETE auth requise)
  - `GET/POST/DELETE /api/projects/[id]/watchlist` (auth requise)
  - `GET /api/me/watchlist`
- UI ✅ :
  - Composant client [components/EngagementBar.tsx](components/EngagementBar.tsx) avec mise à jour optimiste + revert sur erreur
  - Branché dans `UserFilmView` de [app/watch/[id]/page.tsx](app/watch/[id]/page.tsx)
  - Boutons en mode "connecte-toi" pour les anonymes
- Page [app/watchlist/page.tsx](app/watchlist/page.tsx) ✅
- Liens "Ma liste" ajoutés à la navbar et au menu déroulant ✅
- **Statut :** _fait_
- **Notes :** Le compteur `likes` sur l'objet Project reste la source de vérité d'affichage ; la table `likes` est la source de vérité du "did *this* user like it". Les deux sont synchronisés à chaque mutation. Cleanup en cascade : suppression d'un user → ses likes/watchlist + ceux pointant vers ses projets ; suppression d'un projet → ses likes/watchlist. Les entrées de watchlist pointant vers un projet dépublié sont silencieusement filtrées par `listWatchlist` (lazy GC).

### 2.5 ✅ Recherche + filtres
- Page [app/search/page.tsx](app/search/page.tsx) avec champ texte, filtre genre, filtre source (tout/communauté/catalogue) ✅
- API [app/api/search/route.ts](app/api/search/route.ts) qui croise catalogue + projets publics ✅
- URL synchronisée (`?q=&genre=&source=`) → résultats partageables ✅
- Lien "Rechercher" ajouté à `PUBLIC_LINKS` dans la navbar ✅
- **Statut :** _fait_
- **Notes :** Implémentation prototype : substring scan en mémoire (`Array.includes`) sur title/logline/synopsis/idea/author. Largement suffisant tant que le corpus est petit. À swap pour Postgres FTS (ou Meilisearch) une fois la migration DB faite. Tri stable : communauté avant catalogue, puis par engagement (likes pour la communauté, rating pour le catalogue).

### 2.6 ✅ Profils créateurs publics
- Page [app/u/[id]/page.tsx](app/u/[id]/page.tsx) listant les films publics d'un créateur + stats agrégées ✅
- API [app/api/users/[id]/route.ts](app/api/users/[id]/route.ts) (sanitized — pas d'email/role/suspended) ✅
- Lien depuis le bloc auteur de `/watch/[id]` vers `/u/{ownerId}` ✅
- Édition self-service du nom + bio depuis `/dashboard` ✅ ([components/ProfileEditCard.tsx](components/ProfileEditCard.tsx) + [app/api/me/profile/route.ts](app/api/me/profile/route.ts))
- Bio affichée sur `/u/[id]` quand présente ✅
- **Statut :** _fait_
- **Notes :** Server Component qui lit directement la DB. Stats agrégées : nb films publiés, likes cumulés, vues cumulées, vidéos IA générées, scènes écrites. À noter : j'ai dû corriger un Link imbriqué dans Link au moment de wrapper le bloc auteur — restructuration en deux Links siblings + le `<div>` parent en flex container statique. Pour la bio : champ optionnel, max 280 caractères, validation côté serveur dans `/api/me/profile`. Le composant `ProfileEditCard` est une client component qui utilise `useAuth().refresh()` pour propager la mise à jour à la navbar.

### 2.7 ✅ Tests e2e Playwright
- Config : [playwright.config.ts](playwright.config.ts) — webServer auto-start, Chromium seul, traces on first retry ✅
- Specs : [e2e/auth.spec.ts](e2e/auth.spec.ts) + [e2e/browse.spec.ts](e2e/browse.spec.ts) ✅
  - auth : signup → dashboard, verification banner visible, logout → home, forgot-password flow
  - browse : home rows, search vide, genre filter, watch catalogue, pages légales, healthcheck API
- Scripts npm : `e2e`, `e2e:ui`, `e2e:install` ✅
- `e2e/` et `playwright.config.ts` exclus du tsconfig principal (Playwright non installé par défaut) ✅
- README dans `e2e/` pour onboarding ✅
- **Statut :** _fait (code ready, nécessite `npm install -D @playwright/test && npm run e2e:install` pour lancer)_
- **Notes :** Les specs ne touchent pas au pipeline IA — elles vérifient les parcours auth + navigation + pages légales + healthcheck, qui fonctionnent sans aucune clé. Les emails test utilisent des adresses uniques `test+TIMESTAMP@aiflex.local` donc la DB s'accumule sans conflit. Pas de mocks : tests contre la vraie API.

### 2.8 ✅ CI GitHub Actions
- [.github/workflows/ci.yml](.github/workflows/ci.yml) ✅
- Job `static` : typecheck → build (tourne sur tout push/PR vers main) ✅
- Job `e2e` : install Playwright → run tests (conditionnel — saute si `@playwright/test` pas dans package.json) ✅
- Caching : `actions/cache` pour npm + Playwright browsers ✅
- Upload artefact `playwright-report` on failure ✅
- Concurrency : cancellation des runs en cours quand un nouveau push arrive ✅
- **Statut :** _fait_
- **Notes :** Pas de secrets nécessaires pour ces deux jobs — les tests et le build fonctionnent sans Anthropic/fal.ai. Une fois Playwright installé dans les devDependencies (`npm install -D @playwright/test`), le job `e2e` se déclenche automatiquement.

---

## 🚀 PHASE 3 — Vision produit complète

> Objectif : tendre vers la promesse Netflix-killer du brief.

### 3.1 ⬜ Crédits & abonnement (Stripe)
- Plans : Free / Creator / Studio
- Webhook Stripe → mise à jour `users.plan`
- Page `/pricing`, `/billing`
- **Statut :** _à faire_
- **Notes :** _(à remplir)_

### 3.2 ⬜ Génération audio (voix + musique)
- Voix : ElevenLabs ou fal.ai TTS
- Musique d'ambiance : Suno ou MusicGen via fal
- Mixer côté serveur ou côté client (Web Audio API)
- **Statut :** _à faire_
- **Notes :** _(à remplir)_

### 3.3 ⬜ Export MP4 réel
- Concaténer les scènes vidéo + audio en un seul fichier
- Option A : ffmpeg server-side (fly.io workers)
- Option B : Shotstack / Creatomate API
- Bouton "Télécharger le film" sur `/watch/[id]`
- **Statut :** _à faire_
- **Notes :** _(à remplir)_

### 3.4 🟡 Social : commentaires, remix, notifications
- Table `comments` + helpers DB (add, list, count, delete, cascade cleanup) ✅
- API : `GET/POST /api/projects/[id]/comments` + `DELETE /api/projects/[id]/comments/[commentId]` ✅
  - Modération texte via Claude Haiku avant insertion (tolérant sur critique honnête, strict sur haine/mineurs/spam) ✅
  - Suppression : auteur du commentaire OU propriétaire du film OU admin ✅
- Composant client [CommentsSection.tsx](components/CommentsSection.tsx) avec formulaire + liste + dates relatives ✅
- Intégré dans `/watch/[id]` UserFilmView ✅
- `lib/moderation.ts` refactoré pour supporter `ModerationKind` (visual-prompt + user-text) ✅
- Bouton "Remix this" ✅ — route `POST /api/projects/[id]/remix` + composant client `RemixButton` intégré dans `/watch/[id]`
- Notifications in-app ✅ :
  - Type `Notification` (like, comment, remix, video-ready, system) + DB helpers (create avec déduplications, list, countUnread, markRead, markAllRead) ✅
  - API : `GET/POST /api/me/notifications` + `PATCH /api/me/notifications/[id]` ✅
  - Hooks dans les routes like/comment/remix pour créer la notif au propriétaire du film (skip si auto-notif) ✅
  - Composant `NotificationBell` dans la navbar : bell icon + badge unread + dropdown avec 20 dernières notifs ✅
  - Page `/notifications` complète avec mark as read / tout marquer lu ✅
  - Cascade cleanup (suppression user/projet → purge des notifs associées) ✅
- Signalement in-app ✅ :
  - `ReportButton` (modal avec choix de raison + détails) intégré sur `/watch/[id]` ✅
  - Route `POST /api/report` (auth requise, log console — table `reports` prévue avec Postgres) ✅
- Partage social ✅ :
  - `ShareButtons` (copier le lien + partager sur X/Twitter) intégré sur `/watch/[id]` ✅
- ⬜ Notifications par email (à brancher une fois le vrai provider email configuré)
- **Statut :** _commentaires + remix + notifications in-app + signalement + partage social faits ; notifs email à brancher avec 2.2_
- **Notes :** Pas de pagination : tous les commentaires sont retournés (OK tant que la DB est petite). Formatage de date relatif client-side ("il y a 3h"). Suppression par le film owner = modération basique du créateur sur son propre contenu.

---

## 🐛 Bugs et observations à traiter en cours de route

_(à remplir au fur et à mesure que de nouveaux bugs sont découverts)_

- ✅ Hero `▶` non cliquable → réglé dans 0.3 (preview entière devient Link)
- ✅ `<img>` brut → swap `next/image` (avec `unoptimized` car sources tierces fal.media/picsum) dans SceneGrid et AssemblyPlayer
- ✅ Pas d'error boundary global → `app/global-error.tsx` ajouté
- ✅ Pas de loading.tsx / error.tsx au niveau des routes → `app/error.tsx` + `app/loading.tsx` ajoutés (override possible par segment)
- ✅ Bump du compteur `views` dupliqué → retiré de `/api/feed/[id]` (le SSR `/watch/[id]` reste la source de vérité, GET API redevient pure)
- ⬜ AssemblyPlayer n'auto-play pas et ne charge pas les contrôles natifs quand `playing=true` ([AssemblyPlayer.tsx:84](components/AssemblyPlayer.tsx#L84)) — UX à revoir une fois la lecture publique testée
- ⬜ AssemblyPlayer joue les vidéos sans son par défaut sur les autres surfaces (`muted` dans [SceneGrid.tsx](components/SceneGrid.tsx)) mais pas sur la watch page — uniformiser une fois l'audio générative branchée
- ⚠️ **Piège connu** : ne pas lancer `npm run build` puis `npm run dev` sans `rm -rf .next` entre les deux. Le build prod laisse des chunks aux noms hashés différents que le dev server ne sait pas relire → erreur runtime "Cannot find module './XXXX.js'". Si ça arrive : `rm -rf .next && npm run dev`.

---

## 📒 Journal des changements

_(rempli après chaque session d'implémentation)_

| Date | Phase | Changement | Notes |
|---|---|---|---|
| 2026-04-11 | — | Audit initial + création de ce plan | — |
| 2026-04-11 | 0.2 | Logo Navbar "Reflex" → "AIflex" | Constaté déjà corrigé en début de session ; bonus : avatar gradient |
| 2026-04-11 | 0.4 | `maxScenesPerProject` enforcé dans `/api/scenes` | Slice après parsing Claude, avant attribution des id/index |
| 2026-04-11 | 0.3 | Refonte `/watch/[id]` : gère projets user (`p_*`) + catalogue (`cat-*`) ; Hero preview cliquable | Server component, branchement direct sur `getProjectById` ; AssemblyPlayer pour les films user ; bandeau démo pour les items catalogue |
| 2026-04-11 | — | Typecheck OK après les 3 fix | `npm run typecheck` sans erreur |
| 2026-04-11 | 0.1 | Reporté volontairement | Décision user : on continue à coder sans clés API, on les branchera plus tard |
| 2026-04-11 | 2.4 | Likes + watchlist : DB tables, 3 routes API, EngagementBar, page /watchlist | Optimistic UI, cleanup en cascade, lazy GC |
| 2026-04-11 | 2.5 | Recherche + filtres : `/search` + `/api/search`, lien navbar | Substring scan in-memory, à swap Postgres FTS plus tard |
| 2026-04-11 | 2.6 | Profils créateurs `/u/[id]` + `/api/users/[id]` + lien depuis watch | Server component, sanitized API |
| 2026-04-11 | 1.4 | Quotas vidéo mensuels par user : DB, settings, route check, /api/me/usage, dashboard QuotaCard | Reset implicite par mois, admins exemptés, increment uniquement après succès |
| 2026-04-11 | 1.7 | Endpoint `/api/health` (mode normal + `?strict=1`) | Sentry/pino reportés avec les autres clés |
| 2026-04-11 | 2.1 | Pages légales (CGU, privacy, AI disclosure) + LegalLayout + Footer global + prose-legal CSS | Cookies/watermark à venir |
| 2026-04-11 | — | Typecheck OK après 6 lots de modifications | `npm run typecheck` sans erreur, à chaque jalon |
| 2026-04-11 | 2.1 | Bandeau cookies + watermark "Généré par IA" sur AssemblyPlayer | Section 2.1 maintenant complète sauf C2PA |
| 2026-04-11 | 2.6 | Édition self-service nom + bio (PATCH /api/me/profile, ProfileEditCard, affichage /u/[id]) | Section 2.6 maintenant complète |
| 2026-04-11 | 1.6 | Modération de prompt (lib/moderation.ts via Claude Haiku, branchée dans /api/scene-video) | Fail-open documenté ; muet sans clé Anthropic |
| 2026-04-11 | bugs | error.tsx + loading.tsx + global-error.tsx + dédup bump views + next/image | Build complet `npm run build` ✅ |
| 2026-04-11 | infra | `lib/tokens.ts` (HMAC stateless) + `lib/email.ts` (provider stub console) | Base partagée pour 2.2 et 2.3 |
| 2026-04-11 | 2.2 | Reset password : 2 routes API + 2 pages + lien sur /login | Anti-énumération, TTL 1h, signed token |
| 2026-04-11 | 2.3 | Email verification : 2 routes API + page /verify-email + signup + banner dashboard + gate publication | Admin seedé auto-vérifié, TTL 24h |
| 2026-04-11 | bug | Erreur runtime "Cannot find module './5611.js'" après `npm run build` puis `npm run dev` | Fix : `rm -rf .next` ; documenté dans la section bugs |
| 2026-04-12 | 3.4 | Commentaires : Comment type, DB helpers, API GET/POST/DELETE, moderation texte, CommentsSection, intégration /watch | Refactor moderation.ts pour ModerationKind (visual-prompt + user-text) |
| 2026-04-12 | 2.7 | Scaffolding Playwright : config, 2 specs (auth + browse), scripts npm, tsconfig exclu, README | Tests prêts, install Playwright nécessaire |
| 2026-04-12 | 2.8 | CI GitHub Actions : 2 jobs (static + e2e), caching, concurrency, artifact upload | Zéro secret nécessaire |
| 2026-04-12 | — | Phase 2 terminée à 8/8 | `npm run typecheck` ✅ |
| 2026-04-12 | UX | Dimensions cinéma 16:9 : covers 1280×720, `aspect-video` partout, grilles adaptées | Remplace l'ancien format portrait 4:5 / 2:3 style TikTok |
| 2026-04-12 | 3.4 | Remix : route POST + RemixButton + intégration /watch | Fork le concept en projet privé, redirige vers le studio |
| 2026-04-12 | UX | Page 404 custom (`not-found.tsx`) | Liens vers feed + recherche |
| 2026-04-12 | 3.4 | Notifications in-app : Notification type, DB helpers, 2 routes API, hooks like/comment/remix, NotificationBell navbar, page /notifications | Dédup, anti auto-notif, cascade cleanup |
| 2026-04-12 | 3.4 | Signalement in-app : ReportButton (modal), POST /api/report (log console) | Table reports prévue avec Postgres |
| 2026-04-12 | 3.4 | Partage social : ShareButtons (copier lien + X/Twitter) intégré sur /watch | Aucun SDK tiers, zéro tracking |
| 2026-04-12 | UX | Édition scène par scène : SceneGrid refondé avec SceneCard + SceneEditForm inline, callback onEditScene branché dans le studio | Modifiable tant que pas de vidéo générée ; sauvegarde côté serveur immédiate |
| 2026-04-12 | Netflix | Continue watching : WatchProgress type, DB helpers, /api/me/progress, ContinueWatchingRow (home), WatchPlayer (save progress dans AssemblyPlayer) | Debounce 3s, filtrage films en cours (0 < progress < 1), cascade cleanup |
| 2026-04-12 | Netflix | Pages genre `/genre/[genre]` — 12 genres avec descriptions, films communauté + catalogue | Server component, liens croisés entre genres |
| 2026-04-12 | Netflix | Page trending / Top 10 `/trending` — classement par engagement (likes*3 + views) | Médailles or/argent/bronze pour top 3 |
| 2026-04-12 | Runway | Contrôles par scène : aspect ratio (16:9/9:16/1:1), motion intensity (slow/normal/fast), negative prompt | Intégrés dans SceneEditForm, passés à /api/scene-video |
| 2026-04-12 | Pika | Prompt enhancement : /api/enhance-prompt (Claude améliore le visual prompt), bouton "✦ Améliorer" dans l'éditeur de scène | Fail-graceful sans ANTHROPIC_API_KEY |
| 2026-04-12 | Netflix | Lien "Top films" dans la navbar | — |
| 2026-04-12 | Netflix | Preview on hover : previewUrl dans feed + ContentCard avec autoplay vidéo muted au hover (500ms delay, fadeIn) | Animation tailwind fadeIn ajoutée |
| 2026-04-12 | UX | Onboarding guidé : 5 étapes (welcome, feed, studio, dashboard, communauté), localStorage, progress bar | Se déclenche uniquement pour les users connectés qui ne l'ont pas vu |
| 2026-04-12 | UX | Badges créateur : 12 badges (bronze/silver/gold/platinum), computeBadges() depuis stats, affichés sur /u/[id] et via /api/users/[id] | Tier colors, gamification sans persistence (compute from stats) |
| 2026-04-12 | UX | Timeline visuelle : SceneTimeline horizontal filmstrip dans le studio, drag scroll, progression vidéos | Vignettes proportionnelles à la durée |
| 2026-04-12 | UX | Épisodes / séries : seriesId + episodeNumber sur Project, API GET/PATCH /api/projects/[id]/series, EpisodeNav sur /watch | Groupement de projets en saison |
| 2026-04-12 | UX | Page pricing placeholder : 3 plans (Free/Creator/Studio) avec features, CTA, plan custom | Boutons "Bientôt disponible" tant que Stripe n'est pas branché |
| 2026-04-12 | UX | Raccourcis clavier : Space=play/pause, Left/Right=scène précédente/suivante dans AssemblyPlayer | Ignore quand un input est focusé |
| 2026-04-12 | Netflix | ContentRow scroll horizontal : flèches gauche/droite au hover, drag scroll, ResizeObserver, smooth scroll | Remplace la grille statique, style Netflix signature |
| 2026-04-12 | UX | Navbar mobile : hamburger → drawer, desktop links cachés sous md:, liens auth + profil dans le drawer | Responsive complet |
| 2026-04-12 | SEO | OG meta tags dynamiques sur /watch/[id] : generateMetadata() avec titre, logline, cover pour Twitter/Discord/iMessage | Server-side, zéro JS côté client |
| 2026-04-12 | UX | SkeletonCard + SkeletonRow pour les états de chargement | Shimmer animation réutilisable |
| 2026-04-12 | Admin | Reports : Report type + DB helpers, POST /api/report persiste en DB, GET/PATCH /api/admin/reports, page /admin/reports avec filtre et actions (traiter/rejeter) | Lien ajouté dans admin layout + page overview |
| 2026-04-12 | UX | Overlay raccourcis clavier : touche "?" toggle un panel flottant avec les shortcuts disponibles | Escape pour fermer, ignore les inputs |
| 2026-04-12 | PWA | Manifest + favicon SVG + meta theme-color + apple-web-app | Installable sur mobile via Add to Home Screen |
| 2026-04-12 | UX | Mode plein écran : bouton + touche F dans AssemblyPlayer, sync fullscreenchange | Icône bascule expand/compress |
| 2026-04-12 | UX | ScrollToTop : scroll automatique en haut à chaque changement de route | behavior instant |
| 2026-04-12 | UX | Timeline → scroll vers scène : clic dans SceneTimeline scrolle vers la carte correspondante dans SceneGrid | id scene-{index} sur chaque wrapper |
| 2026-04-12 | Netflix | "Pas intéressé" : useHiddenFilms (localStorage), bouton ✕ au hover sur ContentCard, filtre dans ContentRow | Masquage local, pas de persistence serveur |
| 2026-04-12 | Audit | Fix ThemeProvider type safety : ajout `mounted` à ThemeContextType, retrait `as any` dans Navbar | Plus de cast dangereux |
| 2026-04-12 | Audit | Hook useCooldown : prévient le spam-click (500ms like, 1s comment) | Branché dans EngagementBar + CommentsSection |
| 2026-04-12 | Audit | Toast branché partout : 10+ composants, erreurs silencieuses → toast error, success sur save/generate/comment/like/password | Le Toast system est ENFIN utilisé |
| 2026-04-12 | Audit | Server-side logging : .catch(() => {}) → console.error dans 3 routes API | Notifications fire-and-forget maintenant loguées |
| 2026-04-12 | Audit | Search UX : sort (pertinence/récent/populaire), loading overlay entre requêtes, highlight des résultats | 3 améliorations d'un coup |
| 2026-04-12 | Audit | EmptyState composant réutilisable + empty state search amélioré | Uniformisation des états vides |
| 2026-04-12 | Audit | Validation mot de passe temps réel sur signup (compteur + couleur rouge/vert) | Plus de frustration utilisateur |
| 2026-04-12 | Audit | Bouton "?" dans le player pour ouvrir l'overlay raccourcis | Affordance visible, pas juste un raccourci caché |
