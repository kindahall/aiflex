# AiFlex — Brief complet v8 pour Claude Code
> Extension du brief V7. V7 reste la base de référence (sections 1-18).
> V8 ajoute : sécurité/conformité, protection créateurs, monétisation étendue, UX spectateur/créateur, social, infra/ops, légal, growth, IA avancée.
> Stack : Next.js 14 · TypeScript · Prisma · PostgreSQL (VPS) · Backblaze B2 · Cloudflare CDN · Redis/BullMQ · VPS Ubuntu + Nginx · PWA

---

## Partie A — Rappel rapide : ce qui doit être fait depuis le V7

Aucun changement sur les décisions V7. À implémenter intégralement :
- **A1** Modèles Prisma manquants (Film, Series, Episode, GenerationJob, Subscription, FilmView, CreatorPayout, FilmBoost, AdAccount, AdCampaign, AdImpression + champs suites/modération/cercle privé sur Film, `role/credits/suspended` sur User)
- **A2** Librairies backend : `lib/remotion-render.ts`, `lib/seedance.ts`, `lib/flux.ts`, `lib/ads.ts`, `lib/payouts.ts`, `lib/agent.ts`, `lib/prompts/{scenario,series,sequel,agent}.ts`
- **A3** Types partagés : `FORMAT_CONFIG`, `SEQUEL_PRICE`, `SERIES_CONFIG`, `getCreatorRevenueShare()`, `calculatePayoutSplit()`, enums (`AdminReviewStatus`, `PayoutType`, `ReleaseMode`, `AdFormat`, `BoostType`)
- **A4** Pages UI : `/sequel/[filmId]`, `/agent/validate/[jobId]`, `/create/series`, `/advertise`, `/boost/[filmId]`, `/admin/reviews/[filmId]`, dashboards `EarningsDashboard` et `RoyaltyDashboard`
- **A5** API routes : `sequel`, `films/[id]/sequels`, `films/[id]/disavow`, `upload/{init,file,invite}`, `agent/{start,validate,reschedule,cron-check}`, `admin/review`, `views`, `ads/{serve,impression}`, `boost`, `payouts`, `push/subscribe`, `stripe/webhook`
- **A6** Composants : `SequelTree`, `AdPlayer`, `GenerationProgress`, `InstallPrompt`, `BoostSelector`, `SubscriptionGate`
- **A7** Remotion (dossier `remotion/` + `Film/Scene/Subtitle/Root` + `remotion.config.ts`)
- **A8** Stockage B2 + Cloudflare proxy
- **A9** Crons : mensuel (payouts), hebdo (séries), 5 min (agent)
- **A10** PWA : `next-pwa`, VAPID, `web-push`, notifications
- **A11** Stripe Connect (onboarding, seuil $10, frais 2 %)
- **A12** Modération admin : middleware `/admin` + flux approve/reject avec avoir crédité
- **A13** Double pipeline Seedance : Runway manuel (premium) + Atlas Cloud auto (créateurs)

---

## Partie B — Additions fonctionnelles (nouvelles)

### 19. Sécurité & conformité

#### 19.1 Modération IA des prompts utilisateurs (B1.1)
Avant toute génération (film, série, suite, upload description) :

```typescript
// lib/moderation.ts
export async function moderatePrompt(text: string): Promise<
  { ok: true } | { ok: false; reason: string; categories: string[] }
> {
  // 1. OpenAI omni-moderation-latest (gratuit, multimodal)
  // 2. Fallback : Claude avec prompt de modération dédié
  // Catégories bloquantes : sexual/minors, violence/extreme, self-harm, CSAM,
  // hate/threat, illicit/weapons
}
```

- Appel en amont dans `/api/generate/scenario`, `/api/sequel`, `/api/upload/init`.
- Logs des refus dans `ModerationLog` (voir 19.9).
- En cas de doute → file admin `/admin/moderation-queue`.

#### 19.2 Watermarking visible (B1.2)
Conformité AI Act EU (art. 50) + California SB-942 + China Interim Measures.

- Mention fixe bas-droit sur chaque vidéo IA : "Généré par IA – AiFlex"
- Opacité 60 %, police blanche stroke noir, taille 2 % hauteur vidéo
- Ajouté dans le composant Remotion `<Watermark />` ou via ffmpeg drawtext si pipeline non-Remotion
- Activable par admin pour tests, ON par défaut en prod
- **Obligatoire** sur tout `uploadType = "ai_generated"` public

#### 19.3 Watermarking invisible + C2PA (B1.3)
- Signature C2PA (Content Credentials) dans les métadonnées MP4
- Bibliothèque : `c2patool` (CLI Rust officielle d'Adobe) exécutée après render
- Contient : créateur, modèle IA utilisé, date, prompt hash (pas le prompt brut)
- Permet vérification sur contentauthenticity.org
- Watermark perceptuel optionnel : `@withkoji/watermark` ou StegaStamp

#### 19.4 Vérification d'âge (B1.4)
Requis par UK OSA, DSA EU, Texas HB 1181.

- Contenu marqué `isAdult = true` (nouveau champ Film) → catalogue masqué aux non-vérifiés
- Vérification 2 niveaux :
  - **Niveau 1** (défaut) : auto-déclaration + carte bancaire présente
  - **Niveau 2** (UK/FR adulte) : intégration **Yoti** ou **VerifyMy** (KYC léger, $0.50–$1/check)
- Nouveau champ `User.ageVerified: "none" | "self_declared" | "verified"` + `ageVerifiedAt`
- Pages adulte cloisonnées dans `/adult/*` avec splash d'entrée

#### 19.5 Signalement utilisateur (B1.5)
Modèle `Report` déjà présent, à étendre :

```prisma
model Report {
  id          String   @id @default(cuid())
  reporterId  String
  filmId      String?
  commentId   String?
  userId      String?   // signalement d'utilisateur
  reason      String    // "inappropriate" | "copyright" | "csam" | "hate" | "spam" | "other"
  details     String?
  status      String    @default("pending") // "pending" | "reviewed" | "dismissed" | "actioned"
  reviewedBy  String?
  reviewedAt  DateTime?
  action      String?   // "removed" | "warned" | "suspended" | "none"
  createdAt   DateTime @default(now())

  @@index([status])
}
```

Page `/admin/reports` avec file triée par urgence (CSAM > copyright > autres).
Signalement CSAM → déclenche workflow automatique : retrait immédiat + alerte admin + conservation preuves 90 jours.

#### 19.6 Logs d'audit admin (B1.6)
```prisma
model AdminAuditLog {
  id        String   @id @default(cuid())
  adminId   String
  action    String   // "approve_film" | "reject_film" | "suspend_user" | "disavow_sequel" | ...
  targetId  String   // id de l'entité (film, user, sequel)
  targetType String  // "film" | "user" | "sequel" | "report"
  metadata  Json?
  ipAddress String?
  createdAt DateTime @default(now())

  @@index([adminId])
  @@index([createdAt])
}
```
Conservation 2 ans minimum (traçabilité).

#### 19.7 Conformité RGPD (B1.7)
- Page `/account/privacy` avec :
  - **Export** données (JSON téléchargeable, inclut films/commentaires/abonnement/vues)
  - **Suppression** compte (soft delete 30 jours, hard delete après)
  - **Opt-out marketing** (email marketing uniquement)
  - **Historique consentements** (cookies, CGU versions, newsletter)
- Nouveau modèle :
```prisma
model ConsentRecord {
  id         String   @id @default(cuid())
  userId     String
  type       String   // "cgu" | "privacy" | "cookies_analytics" | "cookies_marketing" | "newsletter"
  version    String   // "2026-04-14"
  accepted   Boolean
  ipAddress  String?
  createdAt  DateTime @default(now())

  @@index([userId])
}
```

#### 19.8 Rate limiting renforcé (B1.8)
Étendre `middleware.ts` existant :
- Génération : max **3/h** en express, **5/h** en assisté (par user)
- Création de suite : max **2/h** par user, max **10/jour** par film parent
- Inscription : max **3/h** par IP
- Commentaires : max **20/h** par user
- Rate limits configurables via `PlatformSettings` admin

#### 19.9 Journal modération contenu
```prisma
model ModerationLog {
  id         String   @id @default(cuid())
  userId     String
  contentType String  // "prompt" | "comment" | "upload"
  content     String
  decision    String  // "allowed" | "blocked" | "flagged_for_review"
  categories  String[]
  score       Float?
  createdAt   DateTime @default(now())

  @@index([userId])
  @@index([decision])
}
```

---

### 20. Protection des créateurs originaux (B2)

#### 20.1 Plafond de suites par film (B2.1)
- Champ `Film.maxSequels: Int? @default(100)` (admin peut ajuster par film)
- Une fois atteint → bouton "Générer suite" désactivé avec message "Limite atteinte"
- Créateur original peut augmenter jusqu'à 500 max

#### 20.2 Délai avant première suite (B2.2)
- Champ `Film.sequelsUnlockAt: DateTime?` = `publishedAt + 7 jours` par défaut
- Modifiable par créateur (min 0, max 30 jours)
- Pendant le délai : `allowSequels` est forcé à false

#### 20.3 Pré-modération optionnelle des suites (B2.3)
- Nouveau champ `Film.requireSequelApproval: Boolean @default(false)`
- Si `true` : suites créées partent en `status = "awaiting_parent_approval"`
- Créateur parent notifié → page `/account/pending-sequels` → Approve / Reject
- Reject = remboursement intégral au créateur suite (avoir crédité)
- Timeout 72 h → approbation automatique (éviter blocage)

#### 20.4 Royalty configurable (B2.4)
- Remplacer `royaltyEnabled: Boolean` par `royaltyPercent: Int? @default(10)` (0, 5, 10, 15, 20)
- `0` = équivalent à l'ancien `royaltyEnabled = false`
- Fonction `calculatePayoutSplit()` mise à jour :

```typescript
export function calculatePayoutSplit(
  viewValue: number,
  pct: number,
  royaltyPercent: number // 0-20
): { sequelCreator: number; originalCreator: number; platform: number } {
  const share = getCreatorRevenueShare(pct);
  const totalCreator = viewValue * share;
  const royalty = viewValue * (royaltyPercent / 100);
  return {
    sequelCreator: totalCreator - royalty,
    originalCreator: royalty,
    platform: viewValue - totalCreator,
  };
}
```

#### 20.5 Attribution visuelle (B2.5)
Composant `<SequelBadge />` obligatoire en haut de `/watch/[filmId]` pour toute suite :
```tsx
{film.parentFilmId && (
  <Link href={`/watch/${film.parentFilmId}`}>
    <Badge>Suite de : {parentFilm.title}</Badge>
  </Link>
)}
```
Également visible sur les cards catalogue + tags Open Graph.

---

### 21. Monétisation complémentaire (B3)

#### 21.1 Tips / dons (B3.1)
Modèle `Tip` déjà présent, à câbler :
- Bouton "🎁 Envoyer un tip" sur page `/watch/[filmId]`
- Montants prédéfinis : $1, $3, $5, $10, custom
- Stripe Checkout one-shot
- 10 % prélevés par AiFlex, 90 % au créateur
- Message libre optionnel affiché au créateur

#### 21.2 Pay-per-view (B3.2)
Pour spectateurs sans abonnement voulant accéder à un film premium ponctuel :
- Champ `Film.ppvPrice: Int?` (centimes, admin/créateur configurable)
- Modèle `PpvPurchase { userId, filmId, amountCents, stripePaymentId, purchasedAt }`
- Accès à vie une fois acheté
- 50 % créateur / 50 % AiFlex (même split que subscription)

#### 21.3 Codes promo & parrainage (B3.3)
```prisma
model PromoCode {
  id          String   @id @default(cuid())
  code        String   @unique
  type        String   // "discount" | "free_month" | "referral"
  value       Int      // % ou mois gratuits
  maxUses     Int?
  usedCount   Int      @default(0)
  expiresAt   DateTime?
  createdBy   String?  // admin ou referrer userId
  createdAt   DateTime @default(now())
}

model ReferralLink {
  id         String   @id @default(cuid())
  userId     String   @unique
  code       String   @unique
  signups    Int      @default(0)
  conversions Int     @default(0)
  earnedCents Int     @default(0)
  createdAt  DateTime @default(now())
}
```
- Parrain gagne 1 mois gratuit OU 5 % à vie (choix au setup) après conversion filleul
- Tracking cookie 30 jours

#### 21.4 Plan Famille (B3.4)
- Nouveau plan Stripe `family` à $14.99/mois
- 4 profils autorisés sous un compte (voir 22.1)
- Contrôle parental activable par profil
- Visible dans `/pricing`

#### 21.5 Bundle créateur (B3.5)
- Un créateur peut activer "Bundle créateur" : $4.99/mois donne accès à TOUT son catalogue (sans abonnement AiFlex global)
- 70 % créateur / 30 % AiFlex (meilleur split car pas de mutualisation)
- Modèle `CreatorBundleSubscription { userId, creatorId, stripeSubscriptionId, status, ... }`

#### 21.6 Abonnement annuel (B3.6)
- Plans `light_yearly` ($49.99 = 10 mois payés), `premium_yearly` ($99.99 = 10 mois payés)
- Ajouter à la table Subscription : `billingCycle: "monthly" | "yearly"`

#### 21.7 Creator Pro (B3.7)
Plan créateur avec génération incluse :
- `$29.99/mois` : 2× épisode 5min + 1× épisode 15min / mois (≈ $40 de valeur API)
- `$79.99/mois` : 5× épisode 15min + 1× court 30min / mois
- `$199.99/mois` : 1× film 1h30 + 3× épisode 15min / mois
- Modèle `CreatorPlan { userId, plan, monthlyQuota: Json, usedThisMonth: Json, resetAt }`

---

### 22. Expérience spectateur (B4)

#### 22.1 Profils multi-utilisateurs (B4.1)
```prisma
model UserProfile {
  id           String   @id @default(cuid())
  accountId    String   // User.id (compte parent)
  name         String
  avatarUrl    String?
  isKids       Boolean  @default(false)
  parentalPin  String?  // hash bcrypt si adulte
  ageRating    String   @default("all") // "kids" | "teens" | "all" | "adult"
  createdAt    DateTime @default(now())

  @@index([accountId])
}
```
- Max 4 profils (5 avec plan Famille)
- Splash `/who-is-watching` à la connexion
- WatchProgress, Watchlist, Follow, FilmView liés à `profileId` et non `userId`

#### 22.2 Contrôle parental renforcé (B4.2)
- `ParentalControl` existant → étendre
- PIN 4 chiffres sur sortie d'un profil Kids vers profil adulte
- Filtre catalogue automatique `ageRating` sur profils Kids
- Heure de couvre-feu (ex : pas de lecture après 21h sur profil Kids)
- Rapport hebdomadaire email au parent : temps passé, contenus vus

#### 22.3 Partage de listes (B4.3)
- `Watchlist` → nouveau champ `shareToken: String? @unique`, `isPublic: Boolean`
- Route publique `/list/[token]` (read-only)
- Bouton "Partager ma liste" sur `/watchlist`

#### 22.4 Continue watching (B4.4)
Déjà présent (`WatchProgress`), à câbler dans le home :
- Carrousel "Reprendre" en haut
- Reprise automatique à ±5 s de la position (buffer)
- Synchro cross-device (via user, pas appareil)
- Nettoyage auto après 30 jours d'inactivité sur un film

#### 22.5 Recommandations IA (B4.5)
- Ajouter **pgvector** à Postgres : `CREATE EXTENSION vector;`
- Champ `Film.embedding: Unsupported("vector(1536)")?` (embed synopsis + genre + tags via OpenAI text-embedding-3-small)
- Profil utilisateur : `profile.preferenceEmbedding` = moyenne pondérée des films complétés >70 %
- Requête home : `ORDER BY film.embedding <=> profile.preferenceEmbedding LIMIT 20`
- Fallback : trending + nouveauté si moins de 3 films vus

#### 22.6 Sous-titres multilingues auto (B4.6)
Pipeline :
1. À la fin du render → Whisper large-v3 (self-hosted GPU ou Replicate) sur l'audio MP4
2. Fichier VTT stocké sur B2
3. Traduction Claude Haiku (plus rapide/moins cher) vers 10 langues : EN, FR, ES, DE, IT, PT, JA, KO, AR, ZH
4. Multi-piste VTT servie au lecteur HTML5

Schéma :
```prisma
model Subtitle {
  id        String @id @default(cuid())
  filmId    String?
  episodeId String?
  lang      String  // "en" | "fr" | ...
  url       String  // CDN B2
  auto      Boolean @default(true)
  createdAt DateTime @default(now())

  @@index([filmId, lang])
}
```

#### 22.7 Doublage auto (B4.7)
- ElevenLabs **Multilingual v2** ou **Dubbing Studio API**
- À la demande (créateur active sur son film)
- Coût : ~$0.30/min de vidéo par langue
- Stocké comme piste audio alternative dans le lecteur
- Modèle `Dub { filmId, lang, audioUrl, createdAt }`

#### 22.8 Mode hors-ligne / download (B4.8)
- Réservé au plan Premium
- Max 10 téléchargements simultanés par compte
- DRM léger : URL signée 7 jours, re-check abonnement au démarrage lecture
- Tech : IndexedDB + service worker (existe partiellement dans `sw.js`)
- Nouveau champ `User.downloadQuota: Int @default(10)`

---

### 23. Expérience créateur (B5)

#### 23.1 Dashboard analytics (B5.1)
Page `/account/analytics/[filmId]` :
- Vues 30 j (graphique)
- Complétion moyenne (%) + distribution
- Carte chaleur monde (pays top 10)
- Heures pics lecture
- CTR thumbnail (impressions catalogue → clicks)
- Revenus estimés vs réels
- Source de trafic (search / reco / catalogue / partage)

Nécessite agrégats :
```prisma
model DailyFilmStats {
  id              String   @id @default(cuid())
  filmId          String
  date            DateTime
  views           Int
  uniqueViewers   Int
  avgCompletion   Float
  revenueCents    Int
  thumbnailImpressions Int
  thumbnailClicks Int

  @@unique([filmId, date])
  @@index([filmId])
}
```
Agrégation via cron nuit (02h00).

#### 23.2 A/B test de thumbnails (B5.2)
- Créateur upload 2-3 thumbnails
- Champ `Film.thumbnailVariants: Json` = array de `{url, impressions, clicks}`
- Rotation aléatoire pendant 7 jours
- Best CTR devient `thumbnailUrl` définitif
- Créateur peut forcer manuellement

#### 23.3 Génération thumbnail IA (B5.3)
À la fin du scénario :
- Claude propose 3 prompts Flux basés sur les scènes-clés
- Flux génère 3 images 16:9
- Créateur choisit (ou A/B test auto 23.2)
- Coût : ~$0.01/film

#### 23.4 Régénération partielle de scène (B5.4)
Page `/account/films/[id]/scenes/[idx]/regenerate` :
- Créateur modifie le prompt d'une seule scène
- Nouvelle génération Seedance sur cette scène uniquement
- Remotion re-render seulement les segments affectés (ou ffmpeg concat avec nouveau clip)
- Coût = coût d'UNE scène (~$1.32 pour 60s)
- Historique des versions : `SceneVersion { filmId, sceneIndex, prompt, clipUrl, active }`

#### 23.5 Editeur timeline simple (B5.5)
`VideoEditor.tsx` existant à étendre :
- Réordonner scènes (drag&drop)
- Ajuster durée ±2 s par scène
- Remplacer sous-titres
- Re-render partiel (voir 23.4)

#### 23.6 Collaboration (B5.6)
Modèle `Collaborator` existant :
- Inviter co-créateurs par email
- Rôles : `viewer` (stats seulement), `editor` (modifier scénario/régénérer), `owner`
- Split revenus configurable (ex : 60/40) dans `CollaboratorSplit`
- Ajouter à `CreatorPayout` : distribution par collaborateur

#### 23.7 Templates / presets de style (B5.7)
Collection de preset prompts :
```typescript
// lib/style-presets.ts
export const STYLE_PRESETS = {
  pixar_kids: { label: "Pixar enfants",  promptSuffix: "Pixar 3D animation style, bright colors, friendly expressions, ..." },
  noir_cinema: { label: "Noir cinéma",   promptSuffix: "Film noir, black and white, dramatic shadows, 1940s aesthetic, ..." },
  anime_90s: { label: "Anime 90s",       promptSuffix: "90s anime style, hand-drawn, cel shading, vibrant colors, ..." },
  realistic_drama: { label: "Drame réaliste", promptSuffix: "Cinematic realistic drama, natural lighting, shallow depth of field, ..." },
  // 10-15 presets au total
};
```
- Sélecteur dans le formulaire de création
- Preset appliqué automatiquement à chaque `scene.prompt`

---

### 24. Social & communauté (B6)

#### 24.1 Commentaires (B6.1)
`Comment` existant :
- Threading 2 niveaux max
- Mentions `@user` (notification)
- Markdown limité (gras, italique, lien)
- Like comment (`Like` existant)

#### 24.2 Follow créateurs (B6.2)
`Follow` existant :
- Compteur followers public sur `/profile/[id]`
- Feed `/feed` = films récents des créateurs suivis

#### 24.3 Notifications de sortie (B6.3)
À chaque nouveau film public d'un créateur → notification push + email à tous ses followers (opt-out possible).

#### 24.4 Messagerie directe (B6.4)
`Conversation`, `DirectMessage` existants :
- 1-to-1 uniquement
- Modération auto (19.1) sur les messages
- Bloquer/signaler utilisateur

#### 24.5 Challenges mensuels (B6.5)
```prisma
model Challenge {
  id           String   @id @default(cuid())
  title        String
  description  String
  theme        String   // "western", "enfant", ...
  startAt      DateTime
  endAt        DateTime
  prizePoolCents Int
  winnerFilmId String?
  status       String   // "open" | "judging" | "closed"
  createdAt    DateTime @default(now())
}

model ChallengeEntry {
  id          String @id @default(cuid())
  challengeId String
  filmId      String
  votes       Int    @default(0)
  createdAt   DateTime @default(now())

  @@unique([challengeId, filmId])
}
```
- Admin crée les challenges
- Vote communautaire + vote admin (50/50)
- Winner gagne cash + homepage boost 30j gratuit

#### 24.6 Format vertical Shorts (B6.6)
- Nouveau format `short_vertical` : 30-60 s, 9:16
- Coût : ~$0.80 via Seedance Fast
- Prix public $0.99 / privé $1.99
- Feed dédié `/shorts` (scroll vertical TikTok-like)
- Partage social prioritaire

---

### 25. Infrastructure & ops (B7)

#### 25.1 Observabilité (B7.1)
- **Sentry** : erreurs front + back (`@sentry/nextjs`)
- **PostHog** : analytics produit (funnels, session replay) — self-hosted possible sur VPS
- Events clés : `signup`, `generation_started`, `generation_completed`, `payment_succeeded`, `sequel_created`, `film_viewed_70pct`
- Env vars : `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`

#### 25.2 Queue BullMQ + Redis (B7.2)
Remplacer `job-queue.ts` in-memory :
```bash
npm install bullmq ioredis
sudo apt install redis-server
```
- Queues : `scenario`, `clips`, `render`, `upload`, `notifications`, `payouts`
- Workers dédiés (processus séparés, PM2)
- Retry automatique (3 tentatives, backoff exponentiel)
- Dashboard admin `/admin/queues` (bull-board)
- Jobs persistés → restart VPS sans perdre la file

#### 25.3 CDN signed URLs (B7.3)
Pour contenu premium / cercle privé :
- Cloudflare Worker sur `cdn.aiflex.*` vérifie signature HMAC-SHA256 + expiration
- URL : `https://cdn.aiflex.com/films/abc/output.mp4?exp=1712345678&sig=...`
- TTL 4 h (renouvelée par le lecteur)
- Gratuit sinon : URL publique directe

#### 25.4 Backups DB automatisés (B7.4)
- Cron nuit : `pg_dump` → chiffrement gpg → upload B2 bucket `aiflex-backups`
- Rotation : 7 quotidiens + 4 hebdo + 12 mensuels
- Script `scripts/backup-db.sh` + cron
- Test restore mensuel obligatoire (cron dry-run)

#### 25.5 Staging + CI/CD (B7.5)
- Branche `staging` → déploie sur VPS `staging.aiflex.com`
- Branche `main` → déploie en prod après review
- GitHub Actions : lint + typecheck + tests + build + deploy SSH
- Variables secrets dans GitHub Secrets

#### 25.6 Feature flags (B7.6)
- **GrowthBook** (self-hosted) ou **PostHog Feature Flags** (gratuit, déjà en 25.1)
- Flags : `sequels_enabled`, `ads_enabled`, `dubbing_enabled`, `shorts_enabled`, `ai_recommendations`
- Rollout progressif % utilisateurs + cible par plan

#### 25.7 Health check / uptime (B7.7)
- Endpoint `/api/health` (déjà présent) retournant JSON : DB OK, Redis OK, B2 OK, disk space
- UptimeRobot monitore `/api/health` + `/` + `cdn.aiflex.com/healthcheck.txt`
- Alertes Slack/email si down > 2 min

#### 25.8 Quota API par user (B7.8)
- Voir 19.8 (rate limiting)
- Compteur quotidien par user : Claude tokens, Replicate images, Seedance seconds
- Affichage dans `/account/usage`
- Stop dur si dépassement quota gratuit (plan Premium a quota plus élevé)

---

### 26. Business & légal (B8)

#### 26.1 Pages légales (B8.1)
Routes statiques à créer :
- `/legal/terms` — CGU plateforme
- `/legal/privacy` — Politique de confidentialité (RGPD + CCPA)
- `/legal/cgv` — Conditions générales de vente
- `/legal/dmca` — Procédure takedown + formulaire
- `/legal/creator-terms` — CGU créateurs (cession droits, royalty suite, splits)
- `/legal/community-guidelines` — Règles communautaires
- `/legal/cookies` — Politique cookies

Contenu rédigé par juriste (budget ~$1500-3000 one-shot). Versions + dates de mise à jour obligatoires.

#### 26.2 DMCA takedown (B8.2)
- Formulaire `/legal/dmca` (nom, email, URL contenu, description œuvre originale, déclaration bonne foi, signature)
- Email auto `dmca@aiflex.com` → crée `Report { reason: "copyright" }` auto-priorité haute
- Retrait sous 24 h ouvrées
- Créateur notifié → peut contre-notification (10 jours délai)
- Logs dans `DMCANotice` model

#### 26.3 Mentions légales (B8.3)
Page `/legal/imprint` obligatoire (France/DE) :
- Nom société, SIRET, TVA, adresse siège, directeur publication, hébergeur (OVH/Hetzner)

#### 26.4 Conservation logs (B8.4)
- Logs connexion utilisateurs (IP, User-Agent, timestamp) : **1 an** (LCEN FR)
- Logs modération : **2 ans**
- Logs transactions Stripe : **10 ans** (obligations comptables)
- Logs DMCA : **3 ans**
- Modèle `AccessLog` + cron purge hors rétention

#### 26.5 Cookie consent banner (B8.5)
- Banner bottom sur première visite
- 3 catégories : essentiel (toujours ON), analytics, marketing
- Réglable dans `/account/privacy`
- Cookies marketing (affiliation, remarketing) désactivés par défaut EU
- Librairie : `react-cookie-consent` ou custom

#### 26.6 CGU créateurs spécifiques (B8.6)
Clauses critiques à inclure :
- Cession droits d'exploitation non-exclusive à AiFlex (pas cession patrimoniale)
- Garantie créateur sur contenu uploadé (pas de plagiat, pas de violation droits tiers)
- Clause royalty suite : accepter le partage 50/10/40 si `allowSequels = true`
- Droit d'AiFlex de refuser/retirer contenu à sa discrétion
- Résolution litiges : médiation puis tribunal compétent

#### 26.7 Assurance RC Pro (B8.7)
- Mention dans `/legal/about` (rassure investisseurs/partenaires)
- Contrat Hiscox ou AXA — contenu numérique + data breach
- Budget ~$500-1500/an
- Non-technique mais à prévoir avant lancement public

---

### 27. Growth (B9)

#### 27.1 SEO (B9.1)
- `sitemap.xml` dynamique : tous les films `visibility=public, status=ready`
- `robots.txt` : allow `/watch/*`, `/catalogue`, `/creators/*`, disallow `/account`, `/admin`, `/api`
- Open Graph complet par film : `og:video`, `og:image`, `og:title`, `og:description`
- Schema.org JSON-LD `VideoObject` sur chaque page watch :

```json
{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": "...",
  "description": "...",
  "thumbnailUrl": "...",
  "uploadDate": "...",
  "duration": "PT5M",
  "contentUrl": "...",
  "embedUrl": "..."
}
```

- Meta tags par page (Next.js `metadata` API)
- URLs propres : `/watch/my-film-title-abc123` au lieu de `/watch/abc123`

#### 27.2 Partage social + embeds (B9.2)
- Boutons partage : Twitter/X, Facebook, WhatsApp, Reddit, lien copy
- Embed iframe : `/embed/[filmId]` → preview 30 s avec CTA "Voir la suite sur AiFlex"
- Open Graph video pour preview auto sur réseaux sociaux
- Partage sans compte possible (cookie tracking attribution parrainage 21.3)

#### 27.3 Programme d'affiliation (B9.3)
Étendre 21.3 (parrainage) :
- Ouverture programme affilié public (créateurs de contenu externe, influenceurs)
- 5 % à vie sur abonnements filleuls
- Dashboard `/affiliate` : liens de tracking, conversions, gains, versement Stripe
- Seuil versement $50 (vs $10 créateur classique)

#### 27.4 Email marketing (B9.4)
Resend (déjà prévu V7) + segmentation :
- Onboarding 7 jours (D0, D1, D3, D7) : intro, feature unique (suites), conseils créateur
- Réactivation : inactif 14 jours → "Ces nouveaux films vont te plaire"
- Notifications releases créateur suivi (opt-in)
- Récap mensuel : revenus créateur, vues, top films
- Broadcast admin : nouveautés plateforme, challenges
- Respect unsubscribe + double opt-in (EU)

#### 27.5 Landing pages A/B (B9.5)
- Plusieurs variantes `/` selon UTM source (ex : `?src=tiktok`, `?src=enfants`)
- Images/titre/CTA différents
- Tracking conversion via PostHog (25.1)
- Outil : `app/(landings)/[variant]/page.tsx`

---

### 28. IA avancée (B10)

#### 28.1 Voix clonée créateur (B10.1)
- ElevenLabs Voice Cloning : créateur upload 30-60 s de sa voix
- Clone stocké par créateur (`User.elevenLabsVoiceId`)
- Utilisable dans :
  - Narration/voix off des scènes
  - Prompt vocal de création (dictée → Claude)
- Coût : $22/mois plan Creator ElevenLabs ou $0.30/1k chars pay-as-you-go
- Prévoir opt-in explicite créateur (droit à l'image/voix)

#### 28.2 Lip-sync (B10.2)
Route `/api/generate/lip-sync` déjà présente — à câbler dans pipeline :
- Après Seedance clip + TTS dialogue → **Sync Labs** (sync.so) ou **Wav2Lip**
- Coût Sync Labs : ~$0.15/min synchronisé
- Activable par scène (flag `scene.lipSync: boolean`)
- Fallback silencieux si échec (clip original sans lip-sync)

#### 28.3 Génération musique originale (B10.3)
- **Suno API** ou **Udio** (quand API public) ou **Stable Audio 2.0**
- Prompt basé sur genre + ambiance scène (généré par Claude)
- 60-90 s générés, ajustable
- Coût : $0.05-0.20/piste
- Stocké sur B2, référencé dans `composition.music`
- Royalty-free (generated, pas sampling)

#### 28.4 Continuité personnages inter-films (B10.4)
- **InstantID** ou **PuLID** (open source, tourne sur H100/A100)
- Stocke embedding facial du personnage (vecteur 512)
- Réutilisable dans TOUS les films du créateur sans upload d'image à chaque fois
- Améliore cohérence visuelle des suites massivement

```prisma
model Character {
  id             String @id @default(cuid())
  creatorId      String
  name           String
  description    String
  facialEmbedding Unsupported("vector(512)")?
  referenceImageUrl String?
  public         Boolean @default(false) // louable par autres créateurs
  createdAt      DateTime @default(now())

  @@index([creatorId])
}
```

#### 28.5 Banque de personnages réutilisables (B10.5)
- Créateur peut publier ses personnages en "location" : autres créateurs les utilisent moyennant royalty
- Ex : créateur A publie "Capitaine Laser" à 5 %/vue
- Créateur B génère un film avec ce personnage → 5 % revenus B → A
- Modèle `CharacterLicense { characterId, borrowerId, royaltyPercent, filmId? }`
- Ouvre un vrai marché d'univers étendus

---

## 29. Delta Prisma consolidé (v8)

Ajouts par rapport au schéma V7. Migration : `npx prisma migrate dev --name v8_additions`.

### 29.1 Modifications Film
```prisma
model Film {
  // ... champs V7
  isAdult              Boolean  @default(false)
  maxSequels           Int?     @default(100)
  sequelsUnlockAt      DateTime?
  requireSequelApproval Boolean @default(false)
  royaltyPercent       Int      @default(10) // remplace royaltyEnabled
  ppvPrice             Int?
  thumbnailVariants    Json?
  embedding            Unsupported("vector(1536)")?
  slug                 String?  @unique
  publishedAt          DateTime?

  @@index([isAdult])
  @@index([slug])
}
```

### 29.2 Modifications User
```prisma
model User {
  // ... champs V7
  ageVerified        String   @default("none")
  ageVerifiedAt      DateTime?
  elevenLabsVoiceId  String?
  downloadQuota      Int      @default(10)
  referralCode       String?  @unique
}
```

### 29.3 Nouveaux modèles (résumé)
- `ModerationLog`, `AdminAuditLog`, `ConsentRecord`
- `UserProfile`, `Subtitle`, `Dub`
- `PpvPurchase`, `PromoCode`, `ReferralLink`
- `CreatorBundleSubscription`, `CreatorPlan`
- `DailyFilmStats`, `SceneVersion`, `CollaboratorSplit`
- `Challenge`, `ChallengeEntry`
- `Character`, `CharacterLicense`
- `AccessLog`, `DMCANotice`

Détails dans les sections 19-28 ci-dessus.

---

## 30. Nouvelles variables d'environnement (v8)

```env
# Modération
OPENAI_MODERATION_API_KEY=sk-...   # fallback gratuit

# Âge KYC (B1.4)
YOTI_API_KEY=...
YOTI_SDK_ID=...

# Observabilité (B7.1)
SENTRY_DSN=https://...
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://eu.posthog.com

# Redis (B7.2)
REDIS_URL=redis://localhost:6379

# ElevenLabs (B4.7, B10.1)
ELEVENLABS_API_KEY=...

# Sync Labs / lip-sync (B10.2)
SYNC_LABS_API_KEY=...

# Suno / musique (B10.3)
SUNO_API_KEY=...

# Feature flags (B7.6)
GROWTHBOOK_API_KEY=...   # si self-hosted

# Backups (B7.4)
BACKUP_GPG_RECIPIENT=backup@aiflex.com

# C2PA (B1.3)
C2PA_SIGNING_CERT_PATH=/etc/aiflex/c2pa-cert.pem
C2PA_SIGNING_KEY_PATH=/etc/aiflex/c2pa-key.pem
```

---

## 31. Dépendances additionnelles

```bash
# Modération + embeddings
npm install openai

# Observabilité
npm install @sentry/nextjs posthog-js posthog-node

# Queue
npm install bullmq ioredis
npm install --save-dev @types/ioredis

# pgvector (ORM support)
npm install pgvector

# Cookie consent
npm install react-cookie-consent

# ElevenLabs
npm install elevenlabs

# c2patool (binaire externe)
# → Installer via release GitHub Adobe CAI

# Charts analytics créateur
npm install recharts

# Feature flags
npm install @growthbook/growthbook-react
```

---

## 32. Ordre d'implémentation recommandé (v8)

**Phase 1 — Fondations légales & sécurité (semaine 1-2)**
1. Modération prompts (19.1) + watermarking visible (19.2)
2. Pages légales squelette (26.1) + cookie banner (26.5)
3. Logs audit admin + moderation log (19.6, 19.9)
4. Rate limiting étendu (19.8)

**Phase 2 — Base V7 non implémentée (semaine 3-5)**
5. Delta Prisma V7 complet (A1) + V8 (29)
6. Middleware admin (A12) + types partagés (A3)
7. `lib/storage.ts` B2 (A8) + Cloudflare setup
8. `lib/seedance.ts`, `lib/flux.ts`, `lib/agent.ts` (A2)
9. Crons node-cron (A9) — passage BullMQ (B7.2) en Phase 4

**Phase 3 — Suites & modération (semaine 6-7)**
10. Système suites complet (A4, A5, A6)
11. Protection créateurs originaux (B2.1-B2.5)
12. Admin review uploads (A12)
13. Stripe Connect payouts (A11)

**Phase 4 — Monétisation étendue & UX (semaine 8-10)**
14. Profils multi-utilisateurs (B4.1) + contrôle parental (B4.2)
15. Tips, PPV, parrainage, plan Famille, annuel (B3.1-B3.6)
16. BullMQ + Redis (B7.2)
17. Analytics créateur (B5.1) + A/B thumbnails (B5.2, B5.3)

**Phase 5 — Growth & avancé (semaine 11-14)**
18. SEO + embeds + affiliation (B9)
19. Recommandations pgvector (B4.5)
20. Sous-titres + doublage (B4.6, B4.7)
21. Challenges + Shorts (B6.5, B6.6)
22. Feature flags + observabilité (B7.1, B7.6)

**Phase 6 — IA avancée (semaine 15+)**
23. Voix clonée + lip-sync + musique IA (B10.1-B10.3)
24. Continuité personnages + banque (B10.4, B10.5)
25. Remotion migration (A7) si pipeline FAL insuffisant

---

## 33. Points critiques v8

**Légal**
- Ne PAS lancer public avant : CGU/Privacy/DMCA/CGV rédigées, cookie banner, watermark AI Act, vérification âge si adulte, logs rétention en place
- Budget juriste one-shot : ~$2000
- Assurance RC Pro : $500-1500/an

**Conformité IA**
- AI Act EU applicable progressivement 2025-2027 (art. 50 sur watermark opérationnel **août 2026**)
- C2PA = avantage compétitif vs concurrents, pas obligation

**Données personnelles**
- Pas de stockage IP brute > 1 an
- Embeddings visage (B10.4) = donnée biométrique → consentement explicite obligatoire
- DPO à nommer si > 250 employés OU traitement sensible grand public

**Infra**
- Passer de `job-queue.ts` à BullMQ AVANT le lancement public (perte de jobs au restart = catastrophique sur paiements)
- Backups DB testés AVANT public (restore dry-run mensuel)
- pgvector impose PostgreSQL 15+ avec extension installée

**Monétisation**
- PPV (B3.2) : attention TVA par pays destination (MOSS EU)
- Bundle créateur (B3.5) : risque cannibaliser l'abonnement global → monitorer
- Creator Pro (B3.7) : calibrer quotas pour marge ≥ 40 %

**Protection mineurs**
- Profil Kids = SOFT gate (filtre catalogue), PAS de vraie protection KYC
- Pour vraie protection : coupler 19.4 (Yoti) sur profils adultes des comptes avec Kids

---

## 34. Récapitulatif priorités

| Tier | Éléments | Quand |
|------|----------|-------|
| **T1 Bloquant lancement** | A1, A4, A5, A11, A12, B1.1, B1.2, B8.1-B8.5 | Avant ouverture publique |
| **T2 Différenciant business** | A2, A9, B2, B5.1, A3 | Pré-lancement si possible |
| **T3 Qualité & croissance** | A6, A10, B7.1, B7.2, B9, B4.5-B4.7 | Post-lancement, 3 premiers mois |
| **T4 Évaluer plus tard** | A13, A7, B3.3-B3.7, B6.5-B6.6, B10 | Après validation product-market fit |

---

## Fin V8

Référence V7 pour tout ce qui n'apparaît pas ici : concepts, tarification principale, APIs vidéo, Remotion, Nginx, modèle Prisma de base.
