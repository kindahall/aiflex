# AiFlex — Brief complet v6 pour Claude Code
> Application de génération et partage de films par IA
> Stack : Next.js 14 · TypeScript · Prisma · PostgreSQL (VPS) · Backblaze B2 · Cloudflare CDN · VPS Ubuntu + Nginx · PWA
> Firebase Storage → SUPPRIMÉ — remplacé par Backblaze B2 + Cloudflare CDN
> État actuel : Auth ✅ · Page création ✅ · Prisma ✅ · APIs NON connectées ❌

---

## 1. Concept de l'application

AiFlex est une plateforme de streaming hybride où :
- L'utilisateur peut **générer un film par IA** à partir d'un simple prompt texte
- L'utilisateur peut **générer une série par IA** (épisodes courts liés, cliffhangers automatiques)
- L'utilisateur peut **uploader ses propres films** depuis son ordinateur
- N'importe quel spectateur peut **générer une suite** d'un film ou série existant (avec accord du créateur)
- Les films publics sont consultables gratuitement (avec pub) ou sans pub (abonnement)
- Les films uploadés en public sont **soumis à validation admin** avant mise en ligne

**Problème résolu** : Fini le scroll infini sur Netflix. Tu veux exactement un film précis ce soir ? Tu le décris, AiFlex le génère. Tu veux la suite d'un film que tu as adoré ? Tu la crées toi-même.

**Quadruple économie** :
- Les **spectateurs** regardent gratuitement (avec pub) ou s'abonnent
- Les **créateurs** paient pour produire et gagnent des revenus sur les vues
- Les **créateurs de suites** paient pour générer et partagent les revenus avec le créateur original
- Les **annonceurs** paient pour être visibles auprès des non-abonnés

---

## 2. Les types d'utilisateurs

### Spectateur gratuit
- Accès aux films gratuits du catalogue (avec publicité)
- Ne peut pas générer ni créer
- Peut s'abonner à tout moment

### Spectateur Premium — $9.99/mois
- Accès catalogue complet illimité, zéro publicité
- Peut acheter des générations IA à la carte
- Peut uploader ses propres films
- Peut générer des suites (avec accord créateur)
- Partage des revenus s'il publie un film public

### Spectateur Light — $4.99/mois
- Accès catalogue complet
- Voit des publicités (pre-roll, mid-roll, bannières)
- Peut acheter des générations IA à la carte
- Peut uploader ses propres films
- Peut générer des suites (avec accord créateur)
- Peut upgrader en Premium à tout moment

### Créateur
- Tout abonné (Light ou Premium) peut créer ou uploader
- Paie la génération IA OU l'upload à la carte
- Peut booster la visibilité de ses films publics
- Gagne des revenus quand ses films publics sont vus
- Peut autoriser ou interdire les suites sur ses créations
- Touche 10% de royalty sur chaque suite publique générée par un tiers

### Administrateur
- Rôle `admin` en base de données
- Accède au back-office `/admin`
- Valide ou rejette les films/séries uploadés en public
- Reçoit une notification à chaque nouveau contenu soumis
- Peut suspendre un compte utilisateur

### Annonceur externe
- Compte entreprise dédié
- Crée des campagnes publicitaires ciblées
- Paie au CPM
- Pubs diffusées aux non-abonnés et abonnés Light uniquement

---

## 3. Les formats de contenu

### 3.1 Épisode court (nouveau)
- Durée : 3 à 5 minutes
- Usage : série TikTok-style, cliffhanger final automatique
- Généré par IA ou uploadé manuellement
- Organisé en saisons + épisodes

### 3.2 Court-métrage
- Durée : 15 à 30 minutes
- Film standalone ou épisode long

### 3.3 Long métrage
- Durée : 1h30
- Film complet

---

## 4. Modèle tarifaire complet

### 4.1 Accès spectateur

| Plan | Prix | Pubs | Accès |
|------|------|------|-------|
| Gratuit | $0 | Oui | Films marqués "gratuit" uniquement |
| Light | $4.99/mois | Oui | Catalogue complet |
| Premium | $9.99/mois | Non | Catalogue complet |

---

### 4.2 Génération IA — À la carte

| Format | Durée | Prix privé | Prix public |
|--------|-------|-----------|------------|
| Épisode court | 3-5 min | $0.99 | $0.49 |
| Court-métrage | 15-30 min | $8.99-$16.99 | $5.99-$10.99 |
| Long métrage | 1h30 | $44.99 | $39.99 |
| Série (10 épisodes courts) | 10 × 5 min | $7.99 | $3.99 |

> Films IA publics → visibles immédiatement sans validation admin.
> Long métrage 1h30 public fixé à $39.99 (coût API réel ~$35).

---

### 4.3 Upload personnel

**Privé — cercle d'amis**

| Taille fichier | Prix |
|---------------|------|
| Jusqu'à 500 MB | $1.99 |
| 500 MB à 2 GB | $3.99 |
| 2 GB à 5 GB | $6.99 |

**Public — catalogue (soumis à validation admin)**

| Durée | Prix |
|-------|------|
| Moins de 30 min | $4.99 |
| 30 min à 1h | $8.99 |
| Plus de 1h | $14.99 |

---

### 4.4 Génération d'une suite

L'utilisateur génère la suite d'un film ou série existant.

| Format suite | Prix |
|-------------|------|
| Épisode court (suite) | $0.99 |
| Court-métrage (suite) | $8.99 |
| Long métrage (suite) | $29.99 |

> Prix légèrement réduit sur le long métrage car le contexte narratif
> est déjà fourni — moins de travail de scénario pour Claude.

---

### 4.5 Boost de visibilité

| Format boost | Durée | Prix |
|-------------|-------|------|
| Mise en avant homepage | 24h | $4.99 |
| Mise en avant catégorie | 7 jours | $14.99 |
| Badge "Film du moment" | 30 jours | $39.99 |

---

### 4.6 Publicité annonceurs (CPM)

| Format | Placement | CPM |
|--------|-----------|-----|
| Pre-roll 15 sec | Avant le film | $10 |
| Mid-roll 30 sec | À mi-film | $15 |
| Bannière catalogue | Page catalogue | $4 |

Diffusée aux spectateurs gratuits ET abonnés Light.
Jamais aux abonnés Premium.

---

## 5. Système de suites — Mécanique complète

### 5.1 Options créateur par film/série

Sur chaque film ou série qu'il crée ou uploade, le créateur peut configurer :

```
allowSequels        Boolean  → autorise les suites par d'autres utilisateurs
allowPublicSequels  Boolean  → autorise la publication des suites au catalogue
royaltyEnabled      Boolean  → veut toucher 10% sur chaque suite publique
notifyOnSequel      Boolean  → reçoit une notification à chaque suite créée
```

Par défaut : `allowSequels = false` — le créateur doit explicitement activer.

---

### 5.2 Pipeline de génération d'une suite

```
[Spectateur regarde un film/épisode]
      ↓
[Bouton "Générer la suite" visible si allowSequels = true]
      ↓
[Spectateur décrit sa suite + choisit le format]
      ↓
[Paiement Stripe]
      ↓
[Claude génère en héritant du contexte parent :
  - Titre, synopsis, genre du film parent
  - Personnages principaux (extraits du scénario parent)
  - Univers visuel (style, époque, lieu)
  - Dernier événement connu (fin du film parent)
  - Prompt du spectateur pour orienter la nouvelle direction]
      ↓
[Seedance génère les clips]
      ↓
[Remotion assemble le film]
      ↓
[Film créé avec parentFilmId lié au film parent]
      ↓
[Si visibility = public]
  → Films IA : visible immédiatement
  → Films uploadés : soumis à validation admin
      ↓
[Partage des revenus sur les vues]
  → 50% créateur de la suite
  → 10% créateur original (royalty si royaltyEnabled = true)
  → 40% AiFlex
  (si royaltyEnabled = false → 50% créateur suite + 50% AiFlex)
```

---

### 5.3 Désaveu d'une suite

Le créateur original peut à tout moment **désavouer** une suite :
- Le lien avec le film parent est retiré du catalogue
- La suite reste accessible mais n'apparaît plus dans l'arbre du film parent
- Le créateur original cesse de recevoir des royalties sur cette suite
- Le créateur de la suite est notifié

---

### 5.4 Arbre des suites dans le catalogue

Sur la page d'un film public, une section "Univers étendu" affiche :
- Le film original
- Toutes les suites approuvées liées (triées par nombre de vues)
- Les suites de suites (arbre récursif, max 3 niveaux affichés)

---

## 6. Système de séries — Mécanique complète

### 6.1 Création d'une série

L'utilisateur crée une série en définissant :
- Titre de la série
- Synopsis général
- Nombre d'épisodes (5, 10, 20...)
- Durée par épisode (3 min ou 5 min)
- Genre
- Visibilité (privé / public)

Claude génère **tous les scénarios des épisodes en une seule passe**, avec :
- Continuité narrative entre les épisodes
- Cliffhanger automatique à la fin de chaque épisode
- Personnages cohérents visuellement (description physique répétée)

### 6.2 Diffusion des épisodes

Deux modes au choix du créateur :
- **Binge** : tous les épisodes disponibles immédiatement
- **Hebdomadaire** : 1 épisode publié automatiquement chaque semaine (cron)

### 6.3 Tarification série

| Formule | Épisodes | Prix |
|---------|---------|------|
| Mini-série privée | 5 × 5 min | $3.99 |
| Série standard privée | 10 × 5 min | $7.99 |
| Série longue privée | 20 × 5 min | $14.99 |
| Mini-série publique | 5 × 5 min | $1.99 |
| Série standard publique | 10 × 5 min | $3.99 |
| Série longue publique | 20 × 5 min | $7.99 |

---

## 7. Partage des revenus — Modèle créateur

### Logique de calcul (type Spotify)

```
Valeur par visionnage = abonnement mensuel ÷ contenus vus ce mois
Distribution selon type de contenu :
  - Film/série standard : 50% créateur / 50% AiFlex
  - Suite avec royalty : 50% créateur suite / 10% créateur original / 40% AiFlex
  - Suite sans royalty : 50% créateur suite / 50% AiFlex
```

### Seuils de complétion

| Complétion | Part créateur | Part AiFlex |
|-----------|--------------|-------------|
| 100% | 50% | 50% |
| 70% à 99% | 35% | 65% |
| 30% à 69% | 15% | 85% |
| Moins de 30% | 0% | 100% |

### Versement
- Calcul mensuel automatique via cron (1er de chaque mois)
- Versement via Stripe Connect
- Seuil minimum : $10
- AiFlex prélève 2% de frais de traitement

---

## 8. Coûts réels des APIs

| Format | Seedance 1080p | Claude | Total | Marge privé | Marge public |
|--------|---------------|--------|-------|-------------|--------------|
| 5 min | ~$0.80 | <$0.05 | ~$0.85 | ~$0.14 ✅ | ~-$0.36 ⚠️ |
| 15 min | ~$5 | <$0.10 | ~$5.10 | ~$3.89 ✅ | ~$0.89 ✅ |
| 30 min | ~$11 | <$0.10 | ~$11.10 | ~$5.89 ✅ | ~$0.89 ✅ |
| 1h30 | ~$35 | <$0.10 | ~$35.10 | ~$9.89 ✅ | ~$4.89 ✅ |
| Série 10×5min | ~$8 | ~$0.30 | ~$8.30 | ~-$0.31 ⚠️ | ~-$4.31 ❌ |

> ⚠️ Les épisodes courts et séries publiques sont vendus à perte ou à marge nulle.
> C'est volontaire — le but est d'acquérir des créateurs et enrichir le catalogue.
> La marge se récupère sur les abonnements spectateurs et les revenus publicitaires.

---

## 9. Pipelines de génération

### 9.1 Film classique

```
Prompt utilisateur + format + visibilité
  → Paiement Stripe
  → Claude → scénario + JSON Remotion
  → Seedance → clips MP4 (batch 5 simultanés)
  → Webhook Seedance → clips Firebase
  → Remotion → MP4 final + thumbnail
  → Film disponible
```

### 9.2 Série

```
Prompt utilisateur + nombre épisodes + durée + visibilité
  → Paiement Stripe
  → Claude → scénarios de TOUS les épisodes en une passe
             (avec cliffhangers + continuité + personnages cohérents)
  → Pour chaque épisode en parallèle :
      Seedance → clips → Remotion → MP4
  → Épisodes disponibles selon mode (binge ou hebdomadaire)
  → Si hebdomadaire : cron publie 1 épisode/semaine
```

### 9.3 Suite d'un film existant

```
Spectateur choisit un film avec allowSequels = true
  → Décrit sa suite
  → Paiement Stripe
  → Claude → scénario héritant du contexte parent
             (personnages, univers, dernier événement)
  → Seedance → clips → Remotion → MP4
  → Film créé avec parentFilmId
  → Notification au créateur original
  → Partage revenus configuré (avec ou sans royalty)
```

### 9.4 Upload personnel

```
Fichier vidéo local
  → ffprobe → durée + taille
  → Calcul tarif → Paiement Stripe
  → Upload Firebase
  → Génération thumbnail (ffmpeg)
  → Si privé_cercle : inviteToken + emails invités
  → Si public : status pending_review + notification admin
```

### 9.5 Diffusion publicitaire

```
Spectateur gratuit ou Light lance un contenu
  → AdServer sélectionne campagne active
  → Pre-roll 15 sec (non skippable)
  → Contenu démarre
  → À 50% → Mid-roll 30 sec
  → AdImpression enregistrée → CPM déduit
```

---

## 10. Statuts d'un film/épisode

```
# Génération IA
pending              → paiement en attente
generating_scenario  → Claude génère
generating_clips     → Seedance génère
rendering            → Remotion assemble
ready                → disponible

# Upload
pending              → paiement en attente
uploading            → fichier en cours d'upload
processing           → ffprobe + thumbnail
pending_review       → en attente validation admin (public uniquement)
approved             → validé, visible catalogue
rejected             → refusé

# Série — épisodes programmés
scheduled            → généré mais pas encore publié (mode hebdomadaire)

# Commun
error                → échec
```

---

## 11. Structure des fichiers

```
/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx                            ✅ EXISTANT
│   │   └── register/page.tsx                         ✅ EXISTANT
│   ├── (app)/
│   │   ├── layout.tsx                                ✅ EXISTANT
│   │   ├── dashboard/page.tsx                        ✅ EXISTANT
│   │   ├── create/page.tsx                           ✅ EXISTANT — connecter APIs
│   │   ├── create/series/page.tsx                    ❌ À CRÉER — création série
│   │   ├── upload/page.tsx                           ❌ À CRÉER
│   │   ├── watch/[filmId]/page.tsx                   ❌ À CRÉER — lecteur film
│   │   ├── watch/series/[seriesId]/page.tsx          ❌ À CRÉER — lecteur série
│   │   ├── watch/invite/[token]/page.tsx             ❌ À CRÉER — accès cercle
│   │   ├── sequel/[filmId]/page.tsx                  ❌ À CRÉER — créer une suite
│   │   ├── catalogue/page.tsx                        ❌ À CRÉER — films + séries
│   │   ├── catalogue/series/page.tsx                 ❌ À CRÉER — catalogue séries
│   │   ├── account/page.tsx                          ❌ À CRÉER
│   │   └── advertise/page.tsx                        ❌ À CRÉER
│   ├── admin/
│   │   ├── layout.tsx                                ❌ À CRÉER
│   │   ├── dashboard/page.tsx                        ❌ À CRÉER
│   │   ├── reviews/page.tsx                          ❌ À CRÉER
│   │   ├── reviews/[filmId]/page.tsx                 ❌ À CRÉER
│   │   └── users/page.tsx                            ❌ À CRÉER
│   └── api/
│       ├── generate/
│       │   ├── scenario/route.ts                     ❌ À CRÉER
│       │   ├── series/route.ts                       ❌ À CRÉER — scénarios série
│       │   ├── clips/route.ts                        ❌ À CRÉER
│       │   └── render/route.ts                       ❌ À CRÉER
│       ├── sequel/
│       │   └── route.ts                              ❌ À CRÉER — génération suite
│       ├── upload/
│       │   ├── init/route.ts                         ❌ À CRÉER
│       │   ├── file/route.ts                         ❌ À CRÉER
│       │   └── invite/route.ts                       ❌ À CRÉER
│       ├── series/
│       │   ├── route.ts                              ❌ À CRÉER
│       │   └── [seriesId]/
│       │       ├── route.ts                          ❌ À CRÉER
│       │       └── episodes/route.ts                 ❌ À CRÉER
│       ├── films/
│       │   ├── route.ts                              ❌ À CRÉER
│       │   └── [filmId]/
│       │       ├── route.ts                          ❌ À CRÉER
│       │       └── sequels/route.ts                  ❌ À CRÉER — liste suites
│       ├── admin/
│       │   ├── review/route.ts                       ❌ À CRÉER
│       │   ├── films/route.ts                        ❌ À CRÉER
│       │   └── users/route.ts                        ❌ À CRÉER
│       ├── views/route.ts                            ❌ À CRÉER
│       ├── ads/
│       │   ├── serve/route.ts                        ❌ À CRÉER
│       │   └── impression/route.ts                   ❌ À CRÉER
│       ├── boost/route.ts                            ❌ À CRÉER
│       ├── payouts/route.ts                          ❌ À CRÉER
│       ├── stripe/
│       │   ├── checkout/route.ts                     ❌ À CRÉER
│       │   └── webhook/route.ts                      ❌ À CRÉER
│       └── webhooks/
│           └── seedance/route.ts                     ❌ À CRÉER
├── components/
│   ├── create/
│   │   ├── PromptInput.tsx                           ✅ EXISTANT
│   │   ├── FormatSelector.tsx                        ❌ À CRÉER
│   │   ├── VisibilitySelector.tsx                    ❌ À CRÉER
│   │   ├── PricingSummary.tsx                        ❌ À CRÉER
│   │   └── GenerationProgress.tsx                   ❌ À CRÉER
│   ├── series/
│   │   ├── SeriesForm.tsx                            ❌ À CRÉER
│   │   ├── EpisodeList.tsx                           ❌ À CRÉER
│   │   └── SeriesProgress.tsx                        ❌ À CRÉER
│   ├── sequel/
│   │   ├── SequelPromptInput.tsx                     ❌ À CRÉER
│   │   ├── ParentFilmContext.tsx                     ❌ À CRÉER — affiche le contexte hérité
│   │   └── SequelPricingSummary.tsx                  ❌ À CRÉER
│   ├── upload/
│   │   ├── FileDropzone.tsx                          ❌ À CRÉER
│   │   ├── UploadVisibilitySelector.tsx              ❌ À CRÉER
│   │   ├── InviteEmailsInput.tsx                     ❌ À CRÉER
│   │   ├── UploadPricingSummary.tsx                  ❌ À CRÉER
│   │   └── UploadProgress.tsx                        ❌ À CRÉER
│   ├── watch/
│   │   ├── VideoPlayer.tsx                           ❌ À CRÉER
│   │   ├── AdPlayer.tsx                              ❌ À CRÉER
│   │   ├── FilmMeta.tsx                              ❌ À CRÉER
│   │   ├── SequelButton.tsx                          ❌ À CRÉER — bouton "Générer la suite"
│   │   └── SequelTree.tsx                            ❌ À CRÉER — arbre des suites
│   ├── catalogue/
│   │   ├── FilmGrid.tsx                              ❌ À CRÉER
│   │   ├── FilmCard.tsx                              ❌ À CRÉER
│   │   ├── SeriesGrid.tsx                            ❌ À CRÉER
│   │   ├── SeriesCard.tsx                            ❌ À CRÉER
│   │   └── BoostedFilmBadge.tsx                      ❌ À CRÉER
│   ├── account/
│   │   ├── EarningsDashboard.tsx                     ❌ À CRÉER
│   │   ├── RoyaltyDashboard.tsx                      ❌ À CRÉER — gains royalties
│   │   └── SubscriptionManager.tsx                   ❌ À CRÉER
│   └── admin/
│       ├── ReviewQueue.tsx                           ❌ À CRÉER
│       ├── ReviewPlayer.tsx                          ❌ À CRÉER
│       ├── ReviewRejectModal.tsx                     ❌ À CRÉER
│       └── AdminStats.tsx                            ❌ À CRÉER
├── remotion/
│   ├── index.ts                                      ❌ À CRÉER
│   ├── Root.tsx                                      ❌ À CRÉER
│   ├── Film.tsx                                      ❌ À CRÉER
│   ├── Scene.tsx                                     ❌ À CRÉER
│   ├── Subtitle.tsx                                  ❌ À CRÉER
│   └── Transitions.tsx                               ❌ À CRÉER
├── lib/
│   ├── claude.ts                                     ❌ À CRÉER
│   ├── seedance.ts                                   ❌ À CRÉER
│   ├── remotion-render.ts                            ❌ À CRÉER
│   ├── storage.ts                                    ❌ À CRÉER — Backblaze B2 + Cloudflare CDN
│   ├── firebase.ts                                   ✅ EXISTANT — garder UNIQUEMENT pour l'Auth
│   ├── stripe.ts                                     ❌ À CRÉER
│   ├── ads.ts                                        ❌ À CRÉER
│   ├── payouts.ts                                    ❌ À CRÉER
│   ├── upload.ts                                     ❌ À CRÉER
│   ├── mailer.ts                                     ❌ À CRÉER
│   ├── notifications.ts                              ❌ À CRÉER
│   └── prompts/
│       ├── scenario.ts                               ❌ À CRÉER — film classique
│       ├── series.ts                                 ❌ À CRÉER — série complète
│       └── sequel.ts                                 ❌ À CRÉER — suite avec contexte
├── middleware.ts                                     ❌ À CRÉER
├── prisma/
│   └── schema.prisma                                 ✅ EXISTANT — migrations à appliquer
├── types/
│   └── film.ts                                       ❌ À CRÉER
└── remotion.config.ts                                ❌ À CRÉER
```

---

## 12. Schéma Prisma complet

```prisma
// Ajouter au schema.prisma existant

model Series {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id])

  title           String
  synopsis        String
  genre           String
  visibility      String    @default("private")
  // "private" | "private_circle" | "public"

  // Configuration diffusion
  releaseMode     String    @default("binge")
  // "binge" | "weekly"

  // Suites
  allowSequels    Boolean   @default(false)
  allowPublicSequels Boolean @default(false)
  royaltyEnabled  Boolean   @default(true)
  notifyOnSequel  Boolean   @default(true)

  // Paiement
  stripePaymentId String?
  amountPaid      Int?

  // Modération (si public uploadé)
  adminReviewStatus String?
  adminReviewNote   String?
  reviewedBy        String?
  reviewedAt        DateTime?

  episodes        Episode[]
  boosts          FilmBoost[]

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([userId])
  @@index([visibility])
}

model Episode {
  id              String   @id @default(cuid())
  seriesId        String
  series          Series   @relation(fields: [seriesId], references: [id])
  userId          String

  episodeNumber   Int
  seasonNumber    Int      @default(1)
  title           String?
  synopsis        String?
  cliffhanger     String?  // texte du cliffhanger final généré par Claude

  // Pipeline
  status          String   @default("pending")
  // pending | generating_clips | rendering | scheduled | ready | error
  composition     Json?
  outputUrl       String?
  thumbnailUrl    String?
  errorMessage    String?

  // Programmation hebdomadaire
  scheduledAt     DateTime?
  publishedAt     DateTime?

  // Vues
  views           FilmView[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([seriesId])
  @@index([status])
  @@unique([seriesId, seasonNumber, episodeNumber])
}

model Film {
  id               String          @id @default(cuid())
  userId           String
  user             User            @relation(fields: [userId], references: [id])

  // Type
  uploadType       String          @default("ai_generated")
  // "ai_generated" | "user_upload"

  // Contenu
  userPrompt       String?
  title            String?
  synopsis         String?
  genre            String?

  // Format
  format           String?
  // "episode_short" | "short_15" | "short_30" | "film_90"
  durationMinutes  Int?

  // Upload
  fileSize         BigInt?
  originalFileName String?

  // Visibilité
  visibility       String          @default("private")
  // "private" | "private_circle" | "public"
  isFreeContent    Boolean         @default(false)
  // true = visible sans abonnement (avec pub)

  // Cercle d'amis
  inviteToken      String?         @unique
  invitedEmails    String[]

  // Pipeline
  status           String          @default("pending")
  composition      Json?
  errorMessage     String?

  // Suites
  parentFilmId     String?         // lien vers le film parent
  parentFilm       Film?           @relation("FilmSequels", fields: [parentFilmId], references: [id])
  sequels          Film[]          @relation("FilmSequels")
  allowSequels     Boolean         @default(false)
  allowPublicSequels Boolean       @default(false)
  royaltyEnabled   Boolean         @default(true)
  notifyOnSequel   Boolean         @default(true)
  isDisavowed      Boolean         @default(false)
  // true = le créateur original a désavoué ce film (suite retirée de l'arbre)

  // Modération admin
  adminReviewStatus String?
  // null | "pending_review" | "approved" | "rejected"
  adminReviewNote  String?
  reviewedBy       String?
  reviewedAt       DateTime?
  creditIssued     Boolean         @default(false)
  creditAmount     Int?

  // Output
  outputUrl        String?
  thumbnailUrl     String?

  // Paiement
  stripePaymentId  String?
  amountPaid       Int?

  // Relations
  views            FilmView[]
  boosts           FilmBoost[]
  payouts          CreatorPayout[]

  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  @@index([userId])
  @@index([status])
  @@index([visibility])
  @@index([uploadType])
  @@index([adminReviewStatus])
  @@index([parentFilmId])
}

model User {
  // Ajouter à ton modèle User existant :
  role             String   @default("user") // "user" | "admin"
  credits          Int      @default(0)      // avoir en centimes
  suspended        Boolean  @default(false)
}

model Subscription {
  id                   String   @id @default(cuid())
  userId               String   @unique
  user                 User     @relation(fields: [userId], references: [id])
  stripeCustomerId     String   @unique
  stripeSubscriptionId String   @unique
  status               String
  plan                 String   // "light" | "premium"
  currentPeriodEnd     DateTime
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
}

model FilmView {
  id                String   @id @default(cuid())
  filmId            String?
  film              Film?    @relation(fields: [filmId], references: [id])
  episodeId         String?
  episode           Episode? @relation(fields: [episodeId], references: [id])
  userId            String
  user              User     @relation(fields: [userId], references: [id])
  percentageWatched Int
  userPlan          String   // "free" | "light" | "premium"
  watchedAt         DateTime @default(now())

  @@index([filmId])
  @@index([episodeId])
  @@index([userId])
  @@index([watchedAt])
}

model CreatorPayout {
  id             String    @id @default(cuid())
  userId         String
  user           User      @relation(fields: [userId], references: [id])
  filmId         String?
  film           Film?     @relation(fields: [filmId], references: [id])
  episodeId      String?
  month          String
  totalViews     Int
  qualifiedViews Int
  grossAmount    Int
  netAmount      Int
  payoutType     String    @default("primary")
  // "primary" = créateur du contenu
  // "royalty" = créateur original d'un film dont une suite a été publiée
  status         String    @default("pending")
  stripePayoutId String?
  paidAt         DateTime?
  createdAt      DateTime  @default(now())

  @@unique([userId, filmId, month, payoutType])
  @@index([userId])
  @@index([status])
}

model FilmBoost {
  id              String   @id @default(cuid())
  filmId          String?
  film            Film?    @relation(fields: [filmId], references: [id])
  seriesId        String?
  series          Series?  @relation(fields: [seriesId], references: [id])
  userId          String
  type            String
  startAt         DateTime
  endAt           DateTime
  amountPaid      Int
  stripePaymentId String?
  createdAt       DateTime @default(now())

  @@index([endAt])
}

model Notification {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  type      String
  // "film_approved" | "film_rejected" | "film_ready" | "series_ready"
  // "payout_sent" | "new_review" | "sequel_created" | "sequel_disavowed"
  title     String
  message   String
  filmId    String?
  seriesId  String?
  read      Boolean  @default(false)
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([read])
}

model AdAccount {
  id               String       @id @default(cuid())
  companyName      String
  email            String       @unique
  stripeCustomerId String?      @unique
  status           String       @default("active")
  campaigns        AdCampaign[]
  createdAt        DateTime     @default(now())
}

model AdCampaign {
  id          String         @id @default(cuid())
  adAccountId String
  adAccount   AdAccount      @relation(fields: [adAccountId], references: [id])
  name        String
  format      String
  videoUrl    String?
  imageUrl    String?
  targetGenre String?
  budgetCents Int
  spentCents  Int            @default(0)
  cpmCents    Int
  status      String         @default("active")
  impressions AdImpression[]
  startAt     DateTime
  endAt       DateTime?
  createdAt   DateTime       @default(now())

  @@index([status])
}

model AdImpression {
  id         String     @id @default(cuid())
  campaignId String
  campaign   AdCampaign @relation(fields: [campaignId], references: [id])
  filmId     String?
  episodeId  String?
  userId     String
  format     String
  costCents  Int
  watchedAt  DateTime   @default(now())

  @@index([campaignId])
  @@index([watchedAt])
}
```

---

## 13. Types TypeScript partagés

```typescript
// types/film.ts

export type FilmFormat =
  | 'episode_short'  // 3-5 min
  | 'short_15'       // 15 min
  | 'short_30'       // 30 min
  | 'film_90';       // 1h30

export type FilmVisibility  = 'private' | 'private_circle' | 'public';
export type UploadType      = 'ai_generated' | 'user_upload';
export type UserPlan        = 'free' | 'light' | 'premium';
export type AdFormat        = 'preroll_15' | 'midroll_30' | 'banner';
export type BoostType       = 'homepage_24h' | 'category_7d' | 'badge_30d';
export type PayoutType      = 'primary' | 'royalty';
export type ReleaseMode     = 'binge' | 'weekly';
export type AdminReviewStatus = 'pending_review' | 'approved' | 'rejected';

export type FilmStatus =
  | 'pending' | 'generating_scenario' | 'generating_clips'
  | 'rendering' | 'uploading' | 'processing'
  | 'pending_review' | 'approved' | 'rejected'
  | 'scheduled' | 'ready' | 'error';

export interface Scene {
  id: string;
  index: number;
  prompt: string;
  clipUrl: string | null;
  seedanceJobId: string | null;
  duration: number;
  transition: 'cut' | 'fade' | 'dissolve';
  subtitle: string | null;
}

export interface RemotionComposition {
  fps: 30;
  scenes: Scene[];
  music: { url: string; volume: number; fadeOut: boolean } | null;
  totalDurationInFrames: number;
}

// Tarifs génération IA
export const FORMAT_CONFIG: Record<FilmFormat, {
  label: string;
  durationMinutes: number;
  sceneCount: number;
  privatePrice: number;
  publicPrice: number;
}> = {
  episode_short: {
    label: 'Épisode court — 5 min',
    durationMinutes: 5,
    sceneCount: 5,
    privatePrice: 99,
    publicPrice: 49,
  },
  short_15: {
    label: 'Court-métrage — 15 min',
    durationMinutes: 15,
    sceneCount: 15,
    privatePrice: 899,
    publicPrice: 599,
  },
  short_30: {
    label: 'Court-métrage — 30 min',
    durationMinutes: 30,
    sceneCount: 30,
    privatePrice: 1699,
    publicPrice: 1099,
  },
  film_90: {
    label: 'Film complet — 1h30',
    durationMinutes: 90,
    sceneCount: 90,
    privatePrice: 4499,
    publicPrice: 3999,
  },
};

// Tarifs séries
export const SERIES_CONFIG: Record<string, {
  label: string;
  episodeCount: number;
  durationPerEpisode: number;
  privatePrice: number;
  publicPrice: number;
}> = {
  mini_5:     { label: 'Mini-série 5 épisodes',      episodeCount: 5,  durationPerEpisode: 5, privatePrice: 399,  publicPrice: 199  },
  standard_10:{ label: 'Série standard 10 épisodes', episodeCount: 10, durationPerEpisode: 5, privatePrice: 799,  publicPrice: 399  },
  long_20:    { label: 'Série longue 20 épisodes',   episodeCount: 20, durationPerEpisode: 5, privatePrice: 1499, publicPrice: 799  },
};

// Tarifs suites
export const SEQUEL_PRICE: Record<FilmFormat, number> = {
  episode_short: 99,
  short_15:      899,
  short_30:      1699,
  film_90:       2999,
};

// Tarifs upload privé — selon taille
export function getUploadPrivatePrice(fileSizeBytes: number): number {
  const mb = fileSizeBytes / (1024 * 1024);
  if (mb <= 500)  return 199;
  if (mb <= 2048) return 399;
  return 699;
}

// Tarifs upload public — selon durée
export function getUploadPublicPrice(durationMinutes: number): number {
  if (durationMinutes < 30)  return 499;
  if (durationMinutes <= 60) return 899;
  return 1499;
}

// Boosts
export const BOOST_CONFIG: Record<BoostType, {
  label: string;
  durationHours: number;
  price: number;
}> = {
  homepage_24h: { label: 'Homepage 24h',        durationHours: 24,  price: 499  },
  category_7d:  { label: 'Catégorie 7 jours',   durationHours: 168, price: 1499 },
  badge_30d:    { label: 'Badge du moment 30j', durationHours: 720, price: 3999 },
};

// CPM annonceurs
export const CPM_CONFIG: Record<AdFormat, number> = {
  preroll_15: 1000,
  midroll_30: 1500,
  banner:     400,
};

// Part créateur selon complétion
export function getCreatorRevenueShare(percentageWatched: number): number {
  if (percentageWatched >= 100) return 0.50;
  if (percentageWatched >= 70)  return 0.35;
  if (percentageWatched >= 30)  return 0.15;
  return 0;
}

// Calcul partage revenus avec royalty
export function calculatePayoutSplit(
  viewValue: number,
  percentageWatched: number,
  hasRoyalty: boolean
): { sequelCreator: number; originalCreator: number; platform: number } {
  const share = getCreatorRevenueShare(percentageWatched);
  const totalCreator = viewValue * share;
  if (!hasRoyalty) {
    return { sequelCreator: totalCreator, originalCreator: 0, platform: viewValue - totalCreator };
  }
  const royalty = totalCreator * 0.10 / 0.50; // 10% de la valeur totale
  return {
    sequelCreator: totalCreator - royalty,
    originalCreator: royalty,
    platform: viewValue - totalCreator,
  };
}
```

---

## 14. Prompts Claude

### 14.1 Film classique
```typescript
// lib/prompts/scenario.ts
export const buildScenarioPrompt = (format: FilmFormat): string => `
Tu es un scénariste pour AiFlex. Génère un scénario + composition Remotion.
Scènes : ${FORMAT_CONFIG[format].sceneCount}
Durée/scène : 60s = 1800 frames à 30fps
Réponse : JSON STRICT uniquement.
{
  "title": "string",
  "synopsis": "string",
  "genre": "string",
  "composition": {
    "fps": 30,
    "totalDurationInFrames": number,
    "scenes": [{
      "id": "scene_1", "index": 0,
      "prompt": "Description Seedance complète (lieu, lumière, personnages physiques, action, dialogues, caméra)",
      "duration": 1800,
      "transition": "cut|fade|dissolve",
      "subtitle": "string|null"
    }],
    "music": { "url": "", "volume": 0.12, "fadeOut": true }
  }
}`;
```

### 14.2 Série complète
```typescript
// lib/prompts/series.ts
export const buildSeriesPrompt = (episodeCount: number, durationPerEpisode: number): string => `
Tu es un scénariste pour AiFlex. Génère une série complète de ${episodeCount} épisodes.
Chaque épisode : ${durationPerEpisode} minutes = ${durationPerEpisode * 5} scènes de 60s.
RÈGLES IMPORTANTES :
- Chaque épisode doit se terminer par un CLIFFHANGER fort
- Les personnages doivent avoir une description physique identique dans tous les épisodes
- La narration doit progresser logiquement entre les épisodes
Réponse : JSON STRICT uniquement.
{
  "seriesTitle": "string",
  "seriesSynopsis": "string",
  "genre": "string",
  "episodes": [
    {
      "episodeNumber": 1,
      "title": "string",
      "synopsis": "string",
      "cliffhanger": "string — description du cliffhanger final",
      "composition": { ...même structure que film classique... }
    }
  ]
}`;
```

### 14.3 Suite avec contexte parent
```typescript
// lib/prompts/sequel.ts
export const buildSequelPrompt = (
  format: FilmFormat,
  parentContext: {
    title: string;
    synopsis: string;
    genre: string;
    characters: string;   // personnages extraits du scénario parent
    lastEvent: string;    // dernier événement connu (fin du film parent)
  }
): string => `
Tu es un scénariste pour AiFlex. Génère une SUITE du film "${parentContext.title}".
CONTEXTE HÉRITÉ (obligatoire à respecter) :
- Synopsis original : ${parentContext.synopsis}
- Genre : ${parentContext.genre}
- Personnages principaux : ${parentContext.characters}
- Dernier événement connu : ${parentContext.lastEvent}
CONSIGNES :
- Respecte la continuité narrative et visuelle
- Les personnages doivent avoir la même apparence physique
- Le ton et le style doivent correspondre au film original
- La suite doit être autonome (compréhensible sans avoir vu l'original)
Nombre de scènes : ${FORMAT_CONFIG[format].sceneCount}
Réponse : JSON STRICT identique au format film classique.`;
```

---

## 15. API Routes complètes

### 15.1 Génération série
```
POST /api/generate/series
Body: { seriesId, seriesType }
→ Vérifie paiement validé
→ Update status → "generating_scenario"
→ Appelle Claude avec buildSeriesPrompt
→ Parse JSON → crée chaque Episode en base avec sa composition
→ Lance la génération des clips pour TOUS les épisodes en parallèle
→ En mode weekly : premier épisode status "ready", autres "scheduled"
→ En mode binge : tous les épisodes générés simultanément
```

### 15.2 Génération suite
```
POST /api/sequel
Body: { parentFilmId, userPrompt, format, visibility }
→ Vérifie que allowSequels = true sur le film parent
→ Vérifie paiement validé
→ Extrait le contexte du film parent (title, synopsis, genre, composition)
→ Construit parentContext pour buildSequelPrompt
→ Appelle Claude avec buildSequelPrompt
→ Génère le film normalement (clips → render)
→ Crée Film avec parentFilmId
→ Notifie le créateur original (notify type "sequel_created")
→ Configure le partage des revenus selon royaltyEnabled du parent
```

### 15.3 Désaveu d'une suite
```
POST /api/films/[filmId]/disavow
Body: { sequelId }
→ Vérifie que l'utilisateur est le créateur du film parent
→ Update isDisavowed = true sur la suite
→ Notifie le créateur de la suite (notify type "sequel_disavowed")
→ La suite reste accessible mais n'apparaît plus dans l'arbre
```

### 15.4 Liste des suites d'un film
```
GET /api/films/[filmId]/sequels
→ Retourne les suites directes (parentFilmId = filmId)
   filtrées : isDisavowed = false + visibility = "public" + status = "ready"
→ Triées par vues DESC
→ Récursif max 3 niveaux pour l'arbre
```

### 15.5 Cron publication hebdomadaire
```
POST /api/series/publish-scheduled
→ Appelé par cron chaque lundi à 9h00
→ Trouve tous les épisodes status = "scheduled"
   dont scheduledAt <= now()
→ Update status → "ready"
→ Notifie les abonnés de la série (si feature abonnement série ajoutée plus tard)
```

### 15.6 Stripe Checkout (unifié)
```
POST /api/stripe/checkout
Body: {
  type: "film_generation" | "series_generation" | "sequel_generation"
      | "user_upload" | "film_boost" | "subscription",
  filmId?, seriesId?, parentFilmId?,
  format?, seriesType?, visibility?,
  boostType?, planType?,
  fileSizeBytes?, estimatedDurationMinutes?
}
→ Calcule prix selon type + paramètres
→ Crée Stripe Checkout Session
→ Retourne { checkoutUrl }
```

### 15.7 Stripe Webhook
```
→ checkout.session.completed :
   - "film_generation"   → déclenche /api/generate/scenario
   - "series_generation" → déclenche /api/generate/series
   - "sequel_generation" → déclenche /api/sequel
   - "user_upload"       → débloque /api/upload/file
   - "film_boost"        → crée FilmBoost
   - "subscription"      → crée/update Subscription
```

### 15.8 Admin — Décision modération
```
POST /api/admin/review
Body: { filmId | seriesId, decision, note? }
→ Si approved → status "ready" + visible catalogue
→ Si rejected → avoir crédité + email créateur avec raison
```

### 15.9 Versements créateurs (cron mensuel)
```
POST /api/payouts
→ Calcule pour chaque vue :
   - Si film avec parentFilmId et royaltyEnabled :
       → calculatePayoutSplit(viewValue, percentage, true)
       → Crée 2 CreatorPayout : une "primary" + une "royalty"
   - Sinon :
       → calculatePayoutSplit(viewValue, percentage, false)
       → Crée 1 CreatorPayout : "primary"
→ Si netAmount >= $10 → Stripe Connect transfer
```

---

## 16. Composants Remotion

### Film.tsx
```typescript
import { AbsoluteFill, Series, Audio, useVideoConfig } from 'remotion';
import { SceneComponent } from './Scene';
import { RemotionComposition } from '@/types/film';

export const Film: React.FC<{ composition: RemotionComposition }> = ({ composition }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {composition.music?.url && (
        <Audio
          src={composition.music.url}
          volume={(frame) => {
            const vol = composition.music!.volume;
            if (!composition.music!.fadeOut) return vol;
            const fadeStart = composition.totalDurationInFrames - fps * 5;
            if (frame < fadeStart) return vol;
            return vol * (1 - (frame - fadeStart) / (fps * 5));
          }}
        />
      )}
      <Series>
        {composition.scenes.map((scene) => (
          <Series.Sequence key={scene.id} durationInFrames={scene.duration}>
            <SceneComponent scene={scene} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
```

### Scene.tsx
```typescript
import { AbsoluteFill, Video, useCurrentFrame, interpolate } from 'remotion';
import { Scene } from '@/types/film';
import { Subtitle } from './Subtitle';

export const SceneComponent: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const opacity = scene.transition === 'fade'
    ? interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })
    : 1;
  return (
    <AbsoluteFill style={{ opacity }}>
      {scene.clipUrl && (
        <Video src={scene.clipUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      {scene.subtitle && <Subtitle text={scene.subtitle} />}
    </AbsoluteFill>
  );
};
```

### Subtitle.tsx
```typescript
import { AbsoluteFill } from 'remotion';
export const Subtitle: React.FC<{ text: string }> = ({ text }) => (
  <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', padding: '4rem' }}>
    <div style={{
      background: 'rgba(0,0,0,0.65)', color: '#fff',
      fontFamily: 'Georgia, serif', fontSize: '1rem',
      letterSpacing: '0.12em', textTransform: 'uppercase',
      padding: '0.5rem 1.5rem', borderLeft: '3px solid rgba(255,255,255,0.4)',
    }}>
      {text}
    </div>
  </AbsoluteFill>
);
```

---

## 17. Variables d'environnement

```env
# .env.local

ANTHROPIC_API_KEY=sk-ant-...

SEEDANCE_API_URL=https://api.seedance.io/v1
SEEDANCE_API_KEY=...
SEEDANCE_WEBHOOK_SECRET=...

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Base de données PostgreSQL sur VPS (via Prisma)
DATABASE_URL=postgresql://user:password@localhost:5432/aiflex

# Backblaze B2 — Stockage vidéos (compatible API S3)
B2_KEY_ID=...                          # Application Key ID Backblaze
B2_APPLICATION_KEY=...                 # Application Key Backblaze
B2_BUCKET_NAME=aiflex-videos
B2_BUCKET_ID=...
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com  # Adapter selon ta région B2

# Cloudflare — CDN pour servir les vidéos
# Les vidéos uploadées sur B2 sont servies via Cloudflare (bande passante gratuite)
CLOUDFLARE_ZONE_ID=...
NEXT_PUBLIC_CDN_URL=https://cdn.aiflex.ton-domaine.com
# Ce domaine pointe vers ton bucket B2 via Cloudflare (configurer dans CF dashboard)

REMOTION_BUNDLE_URL=https://aiflex.ton-domaine.com/remotion-bundle/

RESEND_API_KEY=re_...

NEXT_PUBLIC_APP_URL=https://aiflex.ton-domaine.com

NEXTAUTH_SECRET=...

# Replicate (génération images personnages via Flux)
REPLICATE_API_KEY=r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 17b. Stockage vidéo — Backblaze B2 + Cloudflare CDN

### Pourquoi ce choix

Firebase Storage est supprimé pour le stockage vidéo. Les raisons :
- Bande passante Firebase → $0.12/GB → **$18 000/mois** à 1 000 films × 50 vues ❌
- Backblaze B2 + Cloudflare → bande passante **$0** grâce à l'accord entre les deux services ✅
- Coût stockage B2 → **$0.006/GB/mois** vs $0.026/GB Firebase

Firebase reste uniquement pour **l'authentification utilisateur** (Auth) — rien d'autre.

---

### Architecture de stockage

```
[Remotion génère le MP4 final sur le VPS]
        ↓
[lib/storage.ts — uploadToB2()]
  → Upload vers Backblaze B2 (API compatible S3)
  → Chemin : films/{filmId}/output.mp4
        ↓
[Cloudflare CDN]
  → Le bucket B2 est connecté à Cloudflare via un CNAME
  → Domaine : cdn.aiflex.ton-domaine.com → bucket B2
  → Bande passante entre B2 et Cloudflare = GRATUITE
        ↓
[Utilisateur]
  → Reçoit l'URL : https://cdn.aiflex.ton-domaine.com/films/{filmId}/output.mp4
  → Vidéo servie depuis le CDN Cloudflare mondial
  → Chargement rapide partout dans le monde
```

---

### lib/storage.ts — Client Backblaze B2

```typescript
// lib/storage.ts
// Backblaze B2 est compatible avec l'API S3 d'Amazon
// On utilise @aws-sdk/client-s3 qui fonctionne nativement avec B2

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

const b2Client = new S3Client({
  endpoint: process.env.B2_ENDPOINT!,
  region: 'us-west-004', // Adapter selon ta région B2
  credentials: {
    accessKeyId: process.env.B2_KEY_ID!,
    secretAccessKey: process.env.B2_APPLICATION_KEY!,
  },
});

const BUCKET = process.env.B2_BUCKET_NAME!;
const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL!;

/**
 * Upload un fichier depuis le VPS vers Backblaze B2
 * Retourne l'URL CDN Cloudflare publique
 */
export async function uploadToB2(
  localPath: string,
  remotePath: string,
  contentType: string
): Promise<string> {
  const fileBuffer = fs.readFileSync(localPath);

  await b2Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: remotePath,
      Body: fileBuffer,
      ContentType: contentType,
      // Rendre le fichier public
      ACL: 'public-read',
    })
  );

  // Retourner l'URL CDN Cloudflare (pas l'URL B2 directe)
  return `${CDN_URL}/${remotePath}`;
}

/**
 * Upload un Buffer (pour les images Flux/thumbnails)
 */
export async function uploadBufferToB2(
  buffer: Buffer,
  remotePath: string,
  contentType: string
): Promise<string> {
  await b2Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: remotePath,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read',
    })
  );

  return `${CDN_URL}/${remotePath}`;
}

/**
 * Supprimer un fichier de B2
 */
export async function deleteFromB2(remotePath: string): Promise<void> {
  await b2Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: remotePath,
    })
  );
}

/**
 * Chemins de stockage standardisés
 */
export const storagePaths = {
  filmOutput:    (filmId: string) => `films/${filmId}/output.mp4`,
  filmThumbnail: (filmId: string) => `films/${filmId}/thumbnail.jpg`,
  filmClip:      (filmId: string, jobId: string) => `films/${filmId}/clips/${jobId}.mp4`,
  episodeOutput: (episodeId: string) => `episodes/${episodeId}/output.mp4`,
  characterPreview: (jobId: string, index: number) => `previews/${jobId}/char-${index}.webp`,
  uploadedFilm:  (filmId: string) => `uploads/${filmId}/original.mp4`,
};
```

---

### Configuration Cloudflare — Connecter B2 au CDN

```
Étapes à faire une seule fois dans les dashboards :

1. Dans Backblaze B2 :
   → Créer un bucket "aiflex-videos"
   → Activer "Public" sur le bucket
   → Noter l'endpoint : s3.us-west-004.backblazeb2.com (selon ta région)

2. Dans Cloudflare DNS :
   → Ajouter un enregistrement CNAME :
     Nom : cdn
     Cible : aiflex-videos.s3.us-west-004.backblazeb2.com
     Proxy : ✅ Activé (orange cloud)
   → Résultat : cdn.aiflex.ton-domaine.com sert les fichiers B2 via CF

3. Dans Cloudflare Cache Rules (optionnel mais recommandé) :
   → Règle : cdn.aiflex.ton-domaine.com/films/*
   → Cache TTL : 1 an pour les MP4 (ils ne changent jamais)
   → Cache TTL : 30 jours pour les thumbnails

4. Tester :
   → Uploader un fichier test sur B2
   → Accéder via https://cdn.aiflex.ton-domaine.com/test.mp4
   → Doit fonctionner sans passer par B2 directement
```

---

### Mise à jour de remotion-render.ts

```typescript
// lib/remotion-render.ts — REMPLACER uploadToFirebase par uploadToB2

import { renderMedia, selectComposition } from '@remotion/renderer';
import { uploadToB2, storagePaths } from './storage';
import { RemotionComposition } from '@/types/film';
import { execSync } from 'child_process';
import * as fs from 'fs';

export async function renderFilm(
  filmId: string,
  composition: RemotionComposition
): Promise<{ outputUrl: string; thumbnailUrl: string }> {
  const outputPath = `/tmp/${filmId}.mp4`;
  const thumbnailPath = `/tmp/${filmId}-thumb.jpg`;

  const selected = await selectComposition({
    serveUrl: process.env.REMOTION_BUNDLE_URL!,
    id: 'Film',
    inputProps: { composition },
  });

  await renderMedia({
    composition: selected,
    serveUrl: process.env.REMOTION_BUNDLE_URL!,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps: { composition },
    concurrency: 4,
    chromiumOptions: { disableWebSecurity: true },
  });

  // Génération thumbnail via ffmpeg
  execSync(`ffmpeg -i ${outputPath} -ss 00:00:10 -vframes 1 ${thumbnailPath}`);

  // Upload sur Backblaze B2 (pas Firebase)
  const [outputUrl, thumbnailUrl] = await Promise.all([
    uploadToB2(outputPath, storagePaths.filmOutput(filmId), 'video/mp4'),
    uploadToB2(thumbnailPath, storagePaths.filmThumbnail(filmId), 'image/jpeg'),
  ]);

  // Nettoyage des fichiers temporaires
  fs.unlinkSync(outputPath);
  fs.unlinkSync(thumbnailPath);

  return { outputUrl, thumbnailUrl };
}
```

---

### Mise à jour de lib/flux.ts

```typescript
// lib/flux.ts — REMPLACER uploadFileToFirebase par uploadBufferToB2

import { uploadBufferToB2, storagePaths } from './storage';

export async function generateCharacterImages(
  prompt: string,
  jobId: string,
  count: number = 3
): Promise<string[]> {
  const Replicate = require('replicate');
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_KEY! });

  const results = await Promise.all(
    Array.from({ length: count }).map(() =>
      replicate.run('black-forest-labs/flux-schnell', {
        input: {
          prompt: `Portrait cinématographique, haute qualité. ${prompt}`,
          num_outputs: 1,
          aspect_ratio: '2:3',
          output_format: 'webp',
          output_quality: 90,
        },
      })
    )
  );

  // Upload sur Backblaze B2
  const urls = await Promise.all(
    results.map(async (output: any, i: number) => {
      const imageUrl = Array.isArray(output) ? output[0] : output;
      const response = await fetch(imageUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      return uploadBufferToB2(
        buffer,
        storagePaths.characterPreview(jobId, i),
        'image/webp'
      );
    })
  );

  return urls;
}
```

---

### Coût réel Backblaze B2 + Cloudflare

```
Scénario : 1 000 films, chaque film regardé 50 fois

Stockage :
  1 000 films × 3 GB = 3 000 GB
  3 000 × $0.006 = $18/mois

Bande passante (via Cloudflare) :
  1 000 × 50 vues × 3 GB = 150 000 GB
  $0 — gratuit grâce à l'accord B2/Cloudflare

Total stockage + streaming : $18/mois ✅

Comparaison Firebase au même volume :
  Stockage : $78/mois
  Bande passante : $18 000/mois
  Total Firebase : $18 078/mois ❌
```

---

### Installation dépendances stockage

```bash
# AWS SDK v3 — compatible Backblaze B2
npm install @aws-sdk/client-s3
```

---

### Points d'attention Backblaze B2 + Cloudflare

- **ACL public-read** → obligatoire sur chaque fichier uploadé pour que le CDN puisse le servir
- **Endpoint B2** → varie selon la région du bucket. Vérifier dans le dashboard B2 après création
- **CNAME Cloudflare** → doit être en mode Proxy (orange cloud) pour que la bande passante soit gratuite. En mode DNS only (gris) → bande passante B2 facturée normalement
- **Ne jamais exposer B2_APPLICATION_KEY** côté client → toujours uploader depuis le VPS/serveur
- **Fichiers temporaires /tmp** → toujours nettoyer après upload pour ne pas saturer le disque VPS
- **Cache Cloudflare** → les MP4 sont immutables une fois générés → TTL long (1 an) pour maximiser le cache hit rate et réduire les requêtes vers B2

```nginx
server {
    listen 443 ssl;
    server_name aiflex.ton-domaine.com;

    ssl_certificate /etc/letsencrypt/live/aiflex.ton-domaine.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aiflex.ton-domaine.com/privkey.pem;

    client_max_body_size 5120M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /remotion-bundle/ {
        alias /home/deploy/aiflex/remotion-bundle/;
        add_header Cache-Control "public, max-age=31536000";
    }

    location /api/generate/render {
        proxy_pass http://localhost:3000;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /api/upload/file {
        proxy_pass http://localhost:3000;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

---

## 19. Installation des dépendances

```bash
# PWA
npm install next-pwa
npm install web-push
npm install --save-dev @types/web-push sharp

# Générer les VAPID keys (une seule fois)
npx web-push generate-vapid-keys

# Stockage vidéo — Backblaze B2 (API compatible S3)
npm install @aws-sdk/client-s3

# Stripe
npm install stripe @stripe/stripe-js

# ffmpeg
npm install fluent-ffmpeg
npm install --save-dev @types/fluent-ffmpeg

# Resend
npm install resend

# Cron (versements + publication hebdomadaire)
npm install node-cron
npm install --save-dev @types/node-cron

# Upload multipart
npm install formidable
npm install --save-dev @types/formidable

# Agent — images personnages
npm install replicate

# Migrations Prisma
npx prisma migrate dev --name add_series_episodes_sequels_full
npx prisma generate

# VPS
sudo apt install ffmpeg

# Build Remotion
npx remotion bundle remotion/index.ts --out ./remotion-bundle
```

> Note : Firebase n'est plus installé pour le stockage.
> Si Firebase Auth est déjà en place → conserver uniquement `firebase` et `firebase-admin` pour l'authentification.
> Supprimer toute référence à Firebase Storage dans le code existant.

---

## 20. Ordre d'implémentation recommandé

1. **Migrer Prisma** → tous les modèles + `npx prisma migrate dev`
2. **Ajouter role/credits/suspended sur User** → créer premier admin manuellement
3. **Créer types/film.ts** → tous les types + configs + fonctions
4. **Créer middleware.ts** → protection /admin + /api/admin
5. **Créer lib/storage.ts** → client Backblaze B2 (uploadToB2, uploadBufferToB2, deleteFromB2, storagePaths)
6. **Configurer Cloudflare** → CNAME cdn.aiflex.ton-domaine.com → bucket B2 en mode Proxy
7. **Créer lib/claude.ts**
6. **Créer lib/prompts/** → scenario.ts + series.ts + sequel.ts
7. **Créer lib/seedance.ts**
8. **Créer lib/stripe.ts**
9. **Créer lib/remotion-render.ts**
10. **Créer lib/upload.ts** → ffprobe + calcul tarifs
11. **Créer lib/mailer.ts** + **lib/notifications.ts**
12. **Créer lib/ads.ts** + **lib/payouts.ts**
13. **Créer composants Remotion** + remotion.config.ts
14. **Créer API routes** dans cet ordre :
    - `stripe/checkout` + `stripe/webhook`
    - `generate/scenario` → `generate/clips` → `webhooks/seedance` → `generate/render`
    - `generate/series`
    - `sequel/route.ts`
    - `upload/init` → `upload/file` → `upload/invite`
    - `admin/review` + `admin/films` + `admin/users`
    - `films/[filmId]/sequels` + `films/[filmId]/disavow`
    - `series/route.ts` + `series/[seriesId]/episodes`
    - `series/publish-scheduled`
    - `views/route.ts`
    - `ads/serve` + `ads/impression`
    - `boost/route.ts`
    - `payouts/route.ts`
15. **Connecter page create** → film classique + Stripe
16. **Créer page create/series** → SeriesForm + SeriesProgress
17. **Créer page sequel/[filmId]** → SequelPromptInput + ParentFilmContext
18. **Créer page upload**
19. **Créer GenerationProgress** → polling toutes les 10s
20. **Créer page watch/[filmId]** → VideoPlayer + AdPlayer + SequelButton + SequelTree
21. **Créer page watch/series/[seriesId]** → EpisodeList + lecteur
22. **Créer page watch/invite/[token]**
23. **Créer page catalogue** → FilmGrid + SeriesGrid + BoostedFilmBadge
24. **Créer pages admin** → dashboard + reviews + users
25. **Créer page account** → EarningsDashboard + RoyaltyDashboard + SubscriptionManager
26. **Créer page advertise**
27. **Configurer crons** :
    - 1er du mois minuit → /api/payouts
    - Chaque lundi 9h → /api/series/publish-scheduled
28. **Config PWA** :
    - Installer next-pwa + web-push
    - Créer public/manifest.json
    - Configurer next.config.js avec runtimeCaching
    - Ajouter balises meta dans app/layout.tsx
    - Créer composant InstallPrompt
    - Générer les icônes PWA (toutes les tailles)
    - Générer les VAPID keys + créer /api/push/subscribe
    - Intégrer sendPushNotification dans /api/generate/render (quand film ready)
    - Tester l'installation sur Android (Chrome) + iOS (Safari)
29. **Agent de création** :
    - Migrer Prisma → ajouter GenerationJob
    - Créer lib/flux.ts → génération images personnages (Replicate)
    - Créer lib/prompts/agent.ts → prompt système agent
    - Créer lib/agent.ts → orchestrateur (startAgent, validateAndLaunch, launchGeneration, calculateLaunchTime)
    - Ajouter champs mode + scheduledAt dans le formulaire existant
    - Créer API routes agent : /api/agent/start + validate + reschedule + jobs + cron-check
    - Mettre à jour Stripe Webhook → créer GenerationJob au lieu de Film directement
    - Créer page /agent/validate/[jobId] → carrousel images + validation scénario
    - Ajouter cron toutes les 5 min pour les jobs planifiés
30. **Config Nginx** + **Build Remotion bundle** sur VPS

---

## 21. PWA — Progressive Web App

AiFlex doit être installable comme une vraie application mobile dès le lancement,
sans passer par l'App Store ni Google Play.
La PWA est activée via **next-pwa** et se comporte comme une app native sur Android et iOS.

### 21.1 Ce que ça apporte

- Icône sur l'écran d'accueil du téléphone
- Plein écran sans barre d'URL (mode standalone)
- Chargement rapide grâce au cache Service Worker
- Accès offline aux pages déjà visitées
- Notifications push (Android complet, iOS 16.4+)
- Zéro commission App Store (30% économisés sur chaque paiement)

### 21.2 Installation des dépendances

```bash
npm install next-pwa
npm install --save-dev @types/node
```

### 21.3 Configuration next.config.js

```javascript
// next.config.js
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      // Cache des pages HTML
      urlPattern: /^https:\/\/aiflex\.ton-domaine\.com\/.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-cache',
        expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
      },
    },
    {
      // Cache des assets statiques (JS, CSS, fonts)
      urlPattern: /\.(?:js|css|woff2|woff|ttf)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets',
        expiration: { maxEntries: 100, maxAgeSeconds: 2592000 },
      },
    },
    {
      // Cache des images et thumbnails
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'image-cache',
        expiration: { maxEntries: 200, maxAgeSeconds: 604800 },
      },
    },
    {
      // Ne PAS cacher les vidéos — trop lourdes et dynamiques
      urlPattern: /\.(?:mp4|webm|m3u8)$/,
      handler: 'NetworkOnly',
    },
    {
      // Ne PAS cacher les appels API
      urlPattern: /^https:\/\/aiflex\.ton-domaine\.com\/api\/.*/,
      handler: 'NetworkOnly',
    },
  ],
});

module.exports = withPWA({
  // Tes autres configs Next.js ici
});
```

### 21.4 Manifest — public/manifest.json

```json
{
  "name": "AiFlex — Films générés par IA",
  "short_name": "AiFlex",
  "description": "Génère le film que tu veux voir ce soir",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#000000",
  "theme_color": "#000000",
  "lang": "fr",
  "categories": ["entertainment", "video"],
  "icons": [
    {
      "src": "/icons/icon-72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-96.png",
      "sizes": "96x96",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-128.png",
      "sizes": "128x128",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable any"
    }
  ],
  "screenshots": [
    {
      "src": "/screenshots/mobile-catalogue.png",
      "sizes": "390x844",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Catalogue AiFlex"
    },
    {
      "src": "/screenshots/mobile-create.png",
      "sizes": "390x844",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Créer un film"
    }
  ],
  "shortcuts": [
    {
      "name": "Créer un film",
      "url": "/create",
      "icons": [{ "src": "/icons/shortcut-create.png", "sizes": "96x96" }]
    },
    {
      "name": "Catalogue",
      "url": "/catalogue",
      "icons": [{ "src": "/icons/shortcut-catalogue.png", "sizes": "96x96" }]
    }
  ]
}
```

### 21.5 Balises HTML dans app/layout.tsx

```typescript
// app/layout.tsx — ajouter dans <head>
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#000000" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="AiFlex" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

### 21.6 Bannière d'installation — composant InstallPrompt

```typescript
// components/pwa/InstallPrompt.tsx
// Affiche une bannière "Installer AiFlex" sur mobile
// quand l'app n'est pas encore installée

'use client';
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Vérifie si déjà installé
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setShowBanner(false);
    setDeferredPrompt(null);
  };

  if (!showBanner) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#111',
      color: '#fff',
      padding: '1rem 1.5rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 9999,
      borderTop: '1px solid #333',
    }}>
      <div>
        <p style={{ fontWeight: 600, margin: 0 }}>Installer AiFlex</p>
        <p style={{ fontSize: '0.8rem', color: '#999', margin: 0 }}>
          Accès rapide depuis ton écran d'accueil
        </p>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={() => setShowBanner(false)}
          style={{ background: 'transparent', color: '#999', border: 'none', cursor: 'pointer' }}
        >
          Plus tard
        </button>
        <button
          onClick={handleInstall}
          style={{
            background: '#fff',
            color: '#000',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Installer
        </button>
      </div>
    </div>
  );
}
```

### 21.7 Notifications push — Film généré prêt

```typescript
// lib/push-notifications.ts
// Notifie l'utilisateur mobile quand son film est prêt
// (pendant qu'il a fermé l'app et attend)

export async function subscribeUserToPush(userId: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  });

  // Envoyer la subscription au backend
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, subscription }),
  });
}

export async function sendPushNotification(options: {
  userId: string;
  title: string;
  body: string;
  url: string;
}): Promise<void> {
  // Appelé côté serveur quand un film passe en status "ready"
  // Utilise web-push pour envoyer la notification
  const webpush = require('web-push');
  webpush.setVapidDetails(
    'mailto:contact@aiflex.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const subscription = await getSubscriptionFromDB(options.userId);
  if (!subscription) return;

  await webpush.sendNotification(
    subscription,
    JSON.stringify({
      title: options.title,
      body: options.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: { url: options.url },
    })
  );
}
```

### 21.8 Variables d'environnement supplémentaires

```env
# VAPID Keys pour les notifications push
# Générer avec : npx web-push generate-vapid-keys
NEXT_PUBLIC_VAPID_PUBLIC_KEY=Bxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VAPID_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 21.9 Génération des icônes PWA

```bash
# Installer sharp pour générer les icônes depuis une image source
npm install --save-dev sharp

# Script scripts/generate-icons.js
# Place ton logo source (1024x1024 PNG) dans /public/icon-source.png
# puis lance : node scripts/generate-icons.js
# Il génère automatiquement toutes les tailles requises
```

### 21.10 Points d'attention PWA

- **Les vidéos MP4 ne sont JAMAIS mises en cache** — elles sont trop lourdes
  et chargées en streaming depuis Firebase Storage. Utiliser `NetworkOnly` dans runtimeCaching.
- **Les appels API ne sont JAMAIS mis en cache** — statuts de génération,
  paiements Stripe, données utilisateur. Toujours `NetworkOnly`.
- **iOS Safari** → la bannière d'installation automatique n'existe pas sur iOS.
  Ajouter un message dans l'UI : "Sur iPhone : Safari → Partager → Sur l'écran d'accueil".
- **Mode offline** → afficher une page offline.html propre si l'utilisateur
  n'a pas de connexion. Ne pas laisser l'écran blanc.
- **VAPID keys** → générer UNE SEULE FOIS et ne jamais les changer en production
  (sinon toutes les subscriptions existantes deviennent invalides).
- **Déclenchement install** → la bannière `beforeinstallprompt` n'apparaît
  que si l'utilisateur a visité le site au moins 2 fois. C'est une règle Chrome.

---

## 22. Agent de création — Orchestrateur intelligent

L'agent de création prend en charge le formulaire existant et orchestre
tout le pipeline de génération de manière intelligente et automatisée.
**Il ne remplace pas le formulaire — il travaille avec lui en arrière-plan.**

---

### 22.1 Les deux champs supplémentaires dans le formulaire existant

Le formulaire actuel (genre, description, durée, visibilité) reçoit deux nouveaux champs :

```typescript
// Ajout dans le formulaire de création existant

mode: 'express' | 'assisted'
// express  → génération directe sans validation intermédiaire
// assisted → agent présente scénario + images personnages avant de lancer

scheduledAt: Date | null
// null     → génération immédiate après paiement
// Date     → génération programmée à l'heure choisie par l'utilisateur
```

**Interface du champ mode :**
```
● Express      — Mon film démarre maintenant, sans aperçu
● Assisté      — Je veux voir les personnages et le scénario avant
```

**Interface du champ scheduledAt :**
```
● Maintenant
● Programmer   — [Sélecteur heure/date]
  ex: "Ce soir à 20h → génération lancée à 19h pour être prête à temps"
```

---

### 22.2 Flux complet de l'agent

```
[Formulaire soumis + paiement validé]
          ↓
[Agent démarre — lib/agent.ts]
          ↓
┌─────────────────────────────────────────────┐
│ ÉTAPE 1 — ANALYSE DU FORMULAIRE             │
│ Claude analyse les données collectées :     │
│ → Extrait genre, ambiance, personnages      │
│ → Détecte les manques ou ambiguïtés         │
│ → Enrichit le prompt si nécessaire          │
│ → Définit le style visuel pour Flux         │
└─────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────┐
│ ÉTAPE 2 — GÉNÉRATION SCÉNARIO               │
│ Claude génère :                             │
│ → Titre + synopsis                          │
│ → Descriptions physiques des personnages    │
│ → Scénario scène par scène (JSON Remotion)  │
│ → Prompt Flux par personnage principal      │
└─────────────────────────────────────────────┘
          ↓
    [Mode Express ?]
    /           \
  OUI           NON (Assisté)
   ↓              ↓
   ↓    ┌─────────────────────────────────────┐
   ↓    │ ÉTAPE 3 — IMAGES PERSONNAGES        │
   ↓    │ Flux (Replicate) génère :           │
   ↓    │ → 2-3 images par personnage         │
   ↓    │ → Style cohérent avec l'ambiance    │
   ↓    │ Stockées dans Firebase Storage      │
   ↓    └─────────────────────────────────────┘
   ↓              ↓
   ↓    ┌─────────────────────────────────────┐
   ↓    │ ÉTAPE 4 — VALIDATION UTILISATEUR    │
   ↓    │ Page /agent/validate/[jobId]        │
   ↓    │ Affiche :                           │
   ↓    │ → Images des personnages            │
   ↓    │ → Synopsis + scènes résumées        │
   ↓    │ Boutons :                           │
   ↓    │ → "C'est parfait, générer le film"  │
   ↓    │ → "Modifier un personnage"          │
   ↓    │ → "Changer le scénario"             │
   ↓    └─────────────────────────────────────┘
          ↓
    [scheduledAt défini ?]
    /               \
  NON               OUI
   ↓                 ↓
   ↓    ┌────────────────────────────────────┐
   ↓    │ ÉTAPE 5 — PLANIFICATION            │
   ↓    │ Agent calcule l'heure de lancement │
   ↓    │ Ex: film 30 min → prend 45 min     │
   ↓    │ Utilisateur veut regarder à 20h    │
   ↓    │ → Agent lance à 19h00              │
   ↓    │ Job stocké en base (status:        │
   ↓    │ "scheduled")                       │
   ↓    │ Cron vérifie toutes les 5 min      │
   ↓    └────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────┐
│ ÉTAPE 6 — GÉNÉRATION VIDÉO                  │
│ Seedance génère chaque clip MP4             │
│ Les descriptions physiques des personnages  │
│ validés sont injectées dans chaque prompt   │
│ de scène pour garantir la cohérence         │
└─────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────┐
│ ÉTAPE 7 — RENDU REMOTION                    │
│ Assemblage MP4 final + thumbnail            │
└─────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────┐
│ ÉTAPE 8 — NOTIFICATION                      │
│ Push notification + email :                 │
│ "🎬 Ton film [titre] est prêt !"            │
│ Lien direct vers /watch/[filmId]            │
└─────────────────────────────────────────────┘
```

---

### 22.3 Nouveau modèle Prisma — GenerationJob

```prisma
model GenerationJob {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  filmId          String?   // lié au Film une fois créé
  film            Film?     @relation(fields: [filmId], references: [id])

  // Configuration
  mode            String    // "express" | "assisted"
  format          String    // FilmFormat
  visibility      String
  userPrompt      String

  // Planification
  scheduledAt     DateTime? // heure de lancement souhaitée
  launchAt        DateTime? // heure calculée de lancement réel
                            // = scheduledAt - durée_estimée_génération

  // Données collectées et générées
  formData        Json      // données brutes du formulaire
  scenarioData    Json?     // scénario + descriptions personnages (Claude)
  characterImages Json?     // { personnage: string, images: string[] }[]
  validatedData   Json?     // données après validation utilisateur

  // Statut
  status          String    @default("pending")
  // "pending"             → job créé, paiement en attente
  // "analyzing"           → agent analyse le formulaire
  // "scenario_ready"      → scénario + images générés, attente validation
  // "awaiting_validation" → en attente de validation utilisateur (mode assisté)
  // "scheduled"           → planifié, en attente de l'heure de lancement
  // "generating"          → génération vidéo en cours
  // "done"                → film prêt
  // "error"               → échec

  errorMessage    String?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([userId])
  @@index([status])
  @@index([launchAt])
}
```

---

### 22.4 lib/agent.ts — Orchestrateur principal

```typescript
// lib/agent.ts
// Orchestrateur central de l'agent de création
// Appelé après validation du paiement Stripe

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './prisma';
import { generateCharacterImages } from './flux';
import { buildAgentScenarioPrompt } from './prompts/agent';
import { notify } from './notifications';
import { FilmFormat, FORMAT_CONFIG } from '@/types/film';

export async function startAgent(jobId: string): Promise<void> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`Job ${jobId} introuvable`);

  // ÉTAPE 1 — Analyse + génération scénario
  await prisma.generationJob.update({
    where: { id: jobId },
    data: { status: 'analyzing' },
  });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 8192,
    system: buildAgentScenarioPrompt(job.format as FilmFormat),
    messages: [{ role: 'user', content: JSON.stringify(job.formData) }],
  });

  const raw = (message.content[0] as { type: 'text'; text: string }).text;
  const scenarioData = JSON.parse(raw);

  await prisma.generationJob.update({
    where: { id: jobId },
    data: { scenarioData, status: 'scenario_ready' },
  });

  // ÉTAPE 2 — Mode assisté : générer images personnages
  if (job.mode === 'assisted') {
    const characters = scenarioData.characters as Array<{
      name: string;
      description: string;
      fluxPrompt: string;
    }>;

    const characterImages = await Promise.all(
      characters.map(async (char) => ({
        name: char.name,
        images: await generateCharacterImages(char.fluxPrompt, 3),
      }))
    );

    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        characterImages,
        status: 'awaiting_validation',
      },
    });

    // Notifier l'utilisateur que la validation est prête
    await notify({
      userId: job.userId,
      type: 'validation_ready',
      title: 'Ton film est prêt à valider',
      message: 'Découvre tes personnages et valide le scénario avant la génération.',
      filmId: jobId,
      sendEmail: true,
      emailSubject: '🎬 AiFlex — Tes personnages t\'attendent !',
      emailHtml: `
        <h2>Tes personnages sont prêts</h2>
        <p>Valide le scénario et les personnages de ton film avant de lancer la génération.</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/agent/validate/${jobId}"
           style="display:inline-block;background:#000;color:#fff;padding:12px 24px;
                  text-decoration:none;border-radius:4px;margin-top:16px;">
          Voir mes personnages
        </a>
      `,
    });

    return; // Pause — attend la validation utilisateur
  }

  // Mode express → continuer directement
  await launchGeneration(jobId);
}

export async function validateAndLaunch(jobId: string, validatedData: object): Promise<void> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`Job ${jobId} introuvable`);

  await prisma.generationJob.update({
    where: { id: jobId },
    data: { validatedData },
  });

  await launchGeneration(jobId);
}

async function launchGeneration(jobId: string): Promise<void> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  // Vérifier si planifié
  if (job.launchAt && job.launchAt > new Date()) {
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: 'scheduled' },
    });
    return; // Le cron lancera à l'heure prévue
  }

  // Lancer immédiatement
  await prisma.generationJob.update({
    where: { id: jobId },
    data: { status: 'generating' },
  });

  // Créer le Film en base et lancer le pipeline classique
  const scenarioData = job.scenarioData as any;
  const film = await prisma.film.create({
    data: {
      userId: job.userId,
      uploadType: 'ai_generated',
      userPrompt: job.userPrompt,
      title: scenarioData.title,
      synopsis: scenarioData.synopsis,
      genre: scenarioData.genre,
      format: job.format,
      visibility: job.visibility,
      composition: scenarioData.composition,
      status: 'generating_clips',
    },
  });

  await prisma.generationJob.update({
    where: { id: jobId },
    data: { filmId: film.id },
  });

  // Déclencher la génération des clips
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/generate/clips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filmId: film.id }),
  });
}
```

---

### 22.5 lib/flux.ts — Génération images personnages

```typescript
// lib/flux.ts
// Génère les images des personnages via Flux sur Replicate
// Coût : ~$0.003 par image soit ~$0.03 pour 3 images × 3 personnages

export async function generateCharacterImages(
  prompt: string,
  count: number = 3
): Promise<string[]> {
  const Replicate = require('replicate');
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_KEY! });

  const results = await Promise.all(
    Array.from({ length: count }).map(() =>
      replicate.run(
        'black-forest-labs/flux-schnell',
        {
          input: {
            prompt: `Portrait cinématographique, haute qualité. ${prompt}`,
            num_outputs: 1,
            aspect_ratio: '2:3',
            output_format: 'webp',
            output_quality: 90,
          },
        }
      )
    )
  );

  // Upload sur Firebase et retourner les URLs
  const { uploadFileToFirebase } = require('./firebase');
  const urls = await Promise.all(
    results.map(async (output: any, i: number) => {
      const imageUrl = Array.isArray(output) ? output[0] : output;
      const response = await fetch(imageUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      const path = `character-previews/${Date.now()}-${i}.webp`;
      return uploadFileToFirebase(buffer, path, 'image/webp');
    })
  );

  return urls;
}
```

---

### 22.6 lib/prompts/agent.ts — Prompt système agent

```typescript
// lib/prompts/agent.ts

export const buildAgentScenarioPrompt = (format: FilmFormat): string => `
Tu es l'agent de création de films d'AiFlex.
Tu reçois les données du formulaire de création d'un utilisateur.
Tu génères un scénario complet ET les descriptions des personnages pour la génération d'images.

## Données d'entrée (JSON)
{
  genre: string,
  description: string,
  ambiance: string,
  characters?: string,
  duration: string
}

## Format de réponse — JSON STRICT uniquement

{
  "title": "string",
  "synopsis": "string (2-3 phrases)",
  "genre": "string",
  "characters": [
    {
      "name": "string",
      "role": "string (protagoniste | antagoniste | secondaire)",
      "description": "string — description physique TRÈS détaillée pour Seedance",
      "fluxPrompt": "string — prompt optimisé pour Flux : apparence, style vestimentaire, expression, éclairage cinématographique"
    }
  ],
  "composition": {
    "fps": 30,
    "totalDurationInFrames": number,
    "scenes": [
      {
        "id": "scene_1",
        "index": 0,
        "prompt": "Description Seedance — OBLIGATOIRE : inclure la description physique complète de chaque personnage présent dans la scène pour garantir la cohérence visuelle",
        "duration": 1800,
        "transition": "cut|fade|dissolve",
        "subtitle": "string|null"
      }
    ],
    "music": { "url": "", "volume": 0.12, "fadeOut": true }
  }
}

## Règles importantes
- La description physique des personnages doit être IDENTIQUE dans toutes les scènes où ils apparaissent
- Le fluxPrompt doit être en anglais et optimisé pour la génération d'images portrait
- Nombre de scènes : ${FORMAT_CONFIG[format].sceneCount}
`;
```

---

### 22.7 API Routes agent

```
POST /api/agent/start
Body: { jobId }
→ Appelé par Stripe Webhook après paiement validé (type "film_generation")
→ Lance startAgent(jobId) en fire-and-forget
→ Retourne { success: true }

POST /api/agent/validate
Body: { jobId, validatedData }
→ Utilisateur valide le scénario et les images
→ validatedData contient les images choisies par personnage
→ Lance validateAndLaunch(jobId, validatedData)
→ Retourne { success: true }

POST /api/agent/reschedule
Body: { jobId, newScheduledAt }
→ Permet de reprogrammer un job en status "scheduled"
→ Recalcule launchAt = newScheduledAt - durée_estimée
→ Update en base

GET /api/agent/jobs
→ Liste tous les jobs de l'utilisateur connecté
→ Inclut status, characterImages, scheduledAt, filmId
→ Trié par createdAt DESC

POST /api/agent/cron-check
→ Appelé par cron toutes les 5 minutes
→ Trouve tous les jobs status = "scheduled" avec launchAt <= now()
→ Pour chaque job → appelle launchGeneration(jobId)
```

---

### 22.8 Page de validation — /agent/validate/[jobId]

```
Affiche pour l'utilisateur en mode "assisté" :

SECTION 1 — Personnages
  Pour chaque personnage :
    → Nom + rôle
    → 3 images générées par Flux (carrousel)
    → L'utilisateur peut :
        ✅ Valider ce personnage
        🔄 Régénérer les images (re-appel Flux, coût ~$0.01)
        ✏️ Modifier la description → régénère

SECTION 2 — Scénario
  → Synopsis
  → Liste des scènes résumées (pas les prompts complets)
  → L'utilisateur peut :
        ✅ Valider le scénario
        ✏️ Demander une modification globale

SECTION 3 — Programmation
  → Si scheduledAt défini → affiche "Génération prévue à [heure]"
  → Bouton "Modifier l'heure"
  → Sinon → "Génération démarrera immédiatement"

BOUTON FINAL → "Lancer la génération"
  → POST /api/agent/validate
  → Redirige vers /dashboard avec GenerationProgress
```

---

### 22.9 Calcul de l'heure de lancement automatique

```typescript
// lib/agent.ts — fonction utilitaire

export function calculateLaunchTime(
  scheduledAt: Date,
  format: FilmFormat
): Date {
  // Durées estimées de génération par format (en minutes)
  const estimatedDuration: Record<FilmFormat, number> = {
    episode_short: 15,   // 5 min de film → ~15 min de génération
    short_15:      45,   // 15 min de film → ~45 min
    short_30:      90,   // 30 min de film → ~1h30
    film_90:       240,  // 1h30 de film   → ~4h
  };

  const bufferMinutes = 15; // marge de sécurité
  const totalMinutes = estimatedDuration[format] + bufferMinutes;

  const launchAt = new Date(scheduledAt.getTime() - totalMinutes * 60 * 1000);

  // Si launchAt est dans le passé → lancer immédiatement
  if (launchAt <= new Date()) return new Date();

  return launchAt;
}
```

---

### 22.10 Mise à jour Stripe Webhook pour l'agent

```typescript
// Dans /api/stripe/webhook/route.ts
// Modifier le handler "film_generation" :

if (metadata.type === 'film_generation') {
  // Créer le GenerationJob
  const job = await prisma.generationJob.create({
    data: {
      userId: metadata.userId,
      mode: metadata.mode,              // "express" | "assisted"
      format: metadata.format,
      visibility: metadata.visibility,
      userPrompt: metadata.userPrompt,
      formData: JSON.parse(metadata.formData),
      scheduledAt: metadata.scheduledAt ? new Date(metadata.scheduledAt) : null,
      launchAt: metadata.scheduledAt
        ? calculateLaunchTime(new Date(metadata.scheduledAt), metadata.format)
        : new Date(), // immédiat
      status: 'pending',
      stripePaymentId: session.id,
    },
  });

  // Lancer l'agent en fire-and-forget
  fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/agent/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: job.id }),
  });
}
```

---

### 22.11 Variables d'environnement supplémentaires

```env
# Replicate (génération images personnages via Flux)
REPLICATE_API_KEY=r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 22.12 Installation dépendances agent

```bash
npm install replicate
```

### 22.13 Cron supplémentaire

```typescript
// Dans le fichier cron existant — ajouter :

// Toutes les 5 minutes — vérification jobs planifiés
cron.schedule('*/5 * * * *', async () => {
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/agent/cron-check`, {
    method: 'POST',
  });
});
```

---

## 23. Points d'attention critiques

- **Firebase** → conserver UNIQUEMENT pour l'Auth utilisateur. Supprimer toute référence à Firebase Storage dans le code existant. Remplacer tous les appels `uploadToFirebase()` par `uploadToB2()`.
- **Backblaze B2** → ne jamais exposer B2_APPLICATION_KEY côté client. Tous les uploads passent par le VPS.
- **Cloudflare CDN** → le CNAME doit être en mode Proxy (orange cloud) pour bande passante gratuite. Sans ça, B2 facture la bande passante normalement.
- **URLs stockage** → toujours utiliser `storagePaths.*` pour construire les chemins de fichiers. Ne jamais construire les chemins manuellement.
- **Premier admin** → `UPDATE "User" SET role = 'admin' WHERE email = 'ton@email.com';`
- **Films IA publics** → jamais soumis à review. Films uploadés publics → TOUJOURS review admin.
- **Suites IA** → jamais soumises à review (contenu contrôlé par Claude). Suites uploadées → review.
- **allowSequels = false par défaut** → le créateur doit EXPLICITEMENT activer pour autoriser les suites.
- **Contexte parent pour les suites** → extraire les personnages depuis `composition.scenes[0].prompt` du film parent pour alimenter buildSequelPrompt.
- **Série en mode weekly** → générer tous les épisodes d'un coup, stocker en "scheduled", publier via cron.
- **isFreeContent** → films marqués gratuits visibles sans abonnement avec pub. Configurable par l'admin uniquement (pas par le créateur).
- **Royalty sur désaveu** → si le créateur désavoue une suite, il cesse de recevoir des royalties à partir du mois suivant.
- **Remotion renderMedia()** → VPS uniquement, timeout 3600s, concurrency 4.
- **Upload 5 GB max** → `client_max_body_size 5120M` Nginx + `bodyParser: false` sur /api/upload/file.
- **Pub jamais sur private_circle** → vérifier visibility AVANT /api/ads/serve.
- **Firebase Admin SDK** → singleton `if (!getApps().length)`.
- **Catalogue** → afficher uniquement :
  - Films IA : `visibility = "public"` ET `status = "ready"`
  - Uploads : `visibility = "public"` ET `adminReviewStatus = "approved"`
  - Films gratuits sans abonnement : `isFreeContent = true`
- **SequelTree** → récursif max 3 niveaux, filtrer `isDisavowed = false`.
- **Seedance polling fallback** → cron 30s si webhook non supporté.
- **Seuil versement créateur** → $10 minimum, cumul mois suivant si en dessous.
- **PWA vidéos** → ne JAMAIS mettre les MP4 en cache Service Worker — utiliser NetworkOnly pour toutes les URLs Firebase Storage.
- **PWA VAPID keys** → générer une seule fois, ne jamais changer en production.
- **PWA iOS** → pas de bannière automatique sur Safari. Afficher un message manuel "Safari → Partager → Sur l'écran d'accueil".
- **Push notifications** → déclencher sendPushNotification() dans /api/generate/render quand status passe à "ready".
- **Agent mode assisté** → les images Flux sont stockées temporairement. Si l'utilisateur ne valide pas dans 48h → supprimer les images Firebase + annuler le job.
- **Agent planification** → calculateLaunchTime() doit toujours ajouter 15 min de buffer. Si launchAt calculé est dans le passé → lancer immédiatement.
- **Agent cohérence personnages** → la description physique des personnages validés doit être injectée dans CHAQUE prompt de scène Seedance. C'est le point le plus important pour la qualité visuelle du film.
- **Replicate Flux** → utiliser `flux-schnell` pour la rapidité (~5 sec/image). Passer à `flux-dev` si la qualité est insuffisante (~30 sec/image, plus cher).
- **Cron agent** → toutes les 5 minutes, pas plus fréquent. Éviter les doublons avec un check `launchAt <= now() AND status = "scheduled"`.
- **GenerationJob vs Film** → le GenerationJob est le conteneur de tout le processus. Le Film est créé seulement quand la génération vidéo démarre réellement. Ne pas confondre les deux.
```
