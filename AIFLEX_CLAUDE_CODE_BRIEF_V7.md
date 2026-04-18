# AiFlex — Brief complet v7 pour Claude Code
> Plateforme de streaming hybride avec génération IA à la demande
> Stack : Next.js 14 · TypeScript · Prisma · PostgreSQL (VPS) · Backblaze B2 · Cloudflare CDN · VPS Ubuntu + Nginx · PWA
> Firebase → conservé UNIQUEMENT pour l'Auth utilisateur
> État actuel : Auth ✅ · Page création ✅ · Prisma ✅ · APIs NON connectées ❌

---

## 1. Concept et vision

AiFlex est une plateforme de streaming où :
- Les spectateurs regardent un catalogue de films et séries générés par IA
- Les créateurs génèrent leurs propres films/séries et gagnent de l'argent sur les vues
- N'importe quel spectateur peut générer la **suite** d'un film qu'il a aimé — même si le film original ne lui appartient pas
- Les films uploadés depuis l'extérieur sont soumis à validation admin avant publication

**Problème résolu** : Fini le scroll infini sur Netflix. Tu décris le film que tu veux, AiFlex le génère. Tu as adoré un film et tu veux savoir ce qui se passe après ? Tu génères la suite toi-même.

**Stratégie de lancement v1 :**
- Runway illimité $95/mois → générer les premiers épisodes soi-même
- Ouvrir ensuite aux créateurs qui paient le vrai coût API
- Pas de génération à la demande grand public au lancement → catalogue curé d'abord

---

## 2. Stack technique et APIs vidéo

### 2.1 Infrastructure

```
Next.js 14         → Application web + API routes
TypeScript         → Typage complet
PostgreSQL (VPS)   → Base de données principale (via Prisma)
Backblaze B2       → Stockage des vidéos MP4
Cloudflare CDN     → Distribution des vidéos (bande passante gratuite)
Firebase Auth      → Authentification utilisateurs (UNIQUEMENT)
Remotion           → Assemblage des clips en film final (sur VPS)
Nginx + Ubuntu     → Serveur web + reverse proxy
PWA                → Application mobile installable
```

### 2.2 Double pipeline vidéo — Décision stratégique

Deux niveaux de qualité selon le cas d'usage :

**Niveau 1 — Films premium (catalogue principal)**
- Modèle : **Seedance 2** via Runway illimité $95/mois
- Génération manuelle par le fondateur
- Qualité maximale, coût fixe mensuel
- Pas d'API automatisée pour ce niveau

**Niveau 2 — Génération automatisée (créateurs + suites)**
- Modèle principal : **Seedance 1.5 Fast** via Atlas Cloud
- Tarif : **$0.022/seconde** de vidéo produite
- Coût réel par format :
  - Épisode 5 min  → ~$6.60
  - Épisode 15 min → ~$19.80
  - Court 30 min   → ~$39.60
  - Film 1h30      → ~$118.80
- Fallback qualité/prix : **Wan 2.6** via API (~$0.04/sec)

### 2.3 Pourquoi ces choix

Seedance 2 via fal.ai coûte **$0.24/sec** — inviable pour la génération automatique.
Seedance 1.5 Fast via Atlas Cloud coûte **$0.022/sec** — 11x moins cher, qualité très proche.
Wan 2.6 open source ne peut PAS tourner sur un VPS standard (besoin H100 80GB VRAM).
Wan 2.6 API à $0.04/sec reste viable pour du contenu de remplissage.

### 2.4 Génération images personnages (agent)

- Modèle : **Flux Schnell** via Replicate
- Tarif : ~$0.003/image
- Usage : 3 images × 3 personnages = ~$0.03 par film en mode assisté

---

## 3. Modèle tarifaire complet

### 3.1 Abonnements spectateurs

| Plan | Prix | Pubs | Accès |
|------|------|------|-------|
| Gratuit | $0 | Oui | Films marqués "gratuit" uniquement |
| Light | $4.99/mois | Oui | Catalogue complet |
| Premium | $9.99/mois | Non | Catalogue complet |

### 3.2 Génération IA — À la carte (créateurs)

| Format | Durée | Coût API réel | Prix privé | Prix public |
|--------|-------|--------------|-----------|------------|
| Épisode court | 5 min | ~$6.60 | $9.99 | $4.99 |
| Épisode standard | 15 min | ~$19.80 | $29.99 | $14.99 |
| Court-métrage | 30 min | ~$39.60 | $59.99 | $29.99 |
| Film complet | 1h30 | ~$118.80 | $179.99 | $89.99 |
| Série 10 épisodes × 5 min | 50 min | ~$66 | $99.99 | $49.99 |
| Série 10 épisodes × 15 min | 150 min | ~$198 | $299.99 | $149.99 |

> Prix révisés pour refléter le coût API réel ($0.022/sec Seedance 1.5 Fast)
> Marge minimum 50% sur chaque génération

### 3.3 Génération d'une suite — Tarification spécifique

La suite peut être générée sur N'IMPORTE QUEL film public,
même si le film original n'appartient pas au créateur de la suite.
Le créateur original doit avoir activé `allowSequels = true`.

| Format suite | Coût API | Prix facturé | Marge |
|-------------|---------|-------------|-------|
| Suite épisode 5 min | ~$6.60 | $9.99 | ~$3.39 ✅ |
| Suite épisode 15 min | ~$19.80 | $29.99 | ~$10.19 ✅ |
| Suite court 30 min | ~$39.60 | $59.99 | ~$20.39 ✅ |
| Suite film 1h30 | ~$118.80 | $169.99 | ~$51.19 ✅ |

### 3.4 Upload personnel

**Privé (cercle d'amis)**

| Taille fichier | Prix |
|---------------|------|
| Jusqu'à 500 MB | $1.99 |
| 500 MB à 2 GB | $3.99 |
| 2 GB à 5 GB | $6.99 |

**Public (soumis validation admin)**

| Durée | Prix |
|-------|------|
| Moins de 30 min | $4.99 |
| 30 min à 1h | $8.99 |
| Plus de 1h | $14.99 |

### 3.5 Boost visibilité créateur

| Format | Durée | Prix |
|--------|-------|------|
| Homepage 24h | 24h | $4.99 |
| Catégorie 7 jours | 7j | $14.99 |
| Badge "du moment" | 30j | $39.99 |

### 3.6 Publicité annonceurs (CPM)

| Format | Placement | CPM |
|--------|-----------|-----|
| Pre-roll 15 sec | Avant le film | $10 |
| Mid-roll 30 sec | À mi-film | $15 |
| Bannière catalogue | Page catalogue | $4 |

---

## 4. Système de suites — Règle clé

### 4.1 Principe fondamental

**N'importe qui peut générer la suite d'un film qu'il a regardé,
même si ce film ne lui appartient pas,
à condition que le créateur original ait activé l'option.**

C'est le différenciateur le plus fort d'AiFlex.
Un bon film devient un univers que la communauté étend elle-même.

### 4.2 Conditions pour générer une suite

1. Le film parent doit être public et en status `ready`
2. `allowSequels = true` sur le film parent (activé par le créateur)
3. L'utilisateur qui génère la suite doit être abonné (Light ou Premium)
4. Paiement validé avant génération

### 4.3 Partage des revenus sur les suites

```
Spectateur regarde une suite
        ↓
Valeur du visionnage calculée (abonnement ÷ films vus ce mois)
        ↓
Si royaltyEnabled = true sur le film parent :
  50% → créateur de la suite
  10% → créateur du film original (royalty)
  40% → AiFlex

Si royaltyEnabled = false :
  50% → créateur de la suite
  50% → AiFlex
```

### 4.4 Désaveu

Le créateur original peut désavouer une suite :
- La suite est retirée de l'arbre du film parent
- Elle reste accessible via lien direct
- Les royalties s'arrêtent le mois suivant
- Le créateur de la suite est notifié

### 4.5 Arbre des suites dans le catalogue

Sur la page d'un film, section "Univers étendu" :
- Film original
- Toutes les suites approuvées liées (triées par vues)
- Suites de suites (récursif max 3 niveaux)
- Filtré : `isDisavowed = false` uniquement

---

## 5. Système de séries

### 5.1 Création d'une série

Formulaire de création série :
- Titre de la série
- Synopsis général
- Nombre d'épisodes (5, 10, 20)
- Durée par épisode (5 min ou 15 min)
- Genre
- Visibilité (privé / public)

Claude génère **tous les scénarios en une seule passe** avec :
- Continuité narrative entre les épisodes
- **Cliffhanger automatique** à la fin de chaque épisode
- Description physique des personnages répétée pour la cohérence visuelle

### 5.2 Modes de diffusion

- **Binge** → tous les épisodes disponibles immédiatement
- **Hebdomadaire** → 1 épisode publié automatiquement chaque semaine (cron)

### 5.3 Cible prioritaire au lancement

Les séries pour enfants (5-15 min par épisode) sont le format
le plus viable économiquement au lancement :
- Coût maîtrisé (~$19.80/épisode via Seedance 1.5 Fast)
- Parents paient sans hésiter ($7.99-9.99/mois)
- Forte fidélité (un enfant regarde 50x le même épisode)

---

## 6. Agent de création — Orchestrateur intelligent

L'agent travaille **en arrière-plan** avec le formulaire existant.
Il ne remplace pas le formulaire — il l'orchestre.

### 6.1 Deux nouveaux champs dans le formulaire

```
mode: 'express' | 'assisted'
  express  → génération directe sans aperçu
  assisted → agent présente scénario + images personnages avant de lancer

scheduledAt: Date | null
  null → génération immédiate
  Date → génération programmée (ex: "génère ce matin, je regarde ce soir")
```

### 6.2 Flux agent complet

```
[Formulaire soumis + paiement validé]
        ↓
[Agent analyse le formulaire — Claude]
        ↓
[Claude génère scénario + descriptions personnages + prompts Flux]
        ↓
[Mode Express ?]
  OUI → lance génération vidéo directement
  NON (assisté) →
    Flux génère 2-3 images par personnage principal
    Présente à l'utilisateur :
      → Photos des personnages
      → Synopsis + scènes résumées
      → Boutons : Valider / Modifier / Reprogrammer
        ↓
[scheduledAt défini ?]
  NON → lance génération immédiatement
  OUI → calcule heure de lancement (scheduledAt - durée_estimée - 15min buffer)
        stocke en "scheduled", cron toutes les 5 min vérifie et lance
        ↓
[Seedance 1.5 Fast → clips MP4]
        ↓
[Remotion → assemblage MP4 final]
        ↓
[Upload Backblaze B2 → URL Cloudflare CDN]
        ↓
[Push notification + email : "🎬 Ton film [titre] est prêt !"]
```

### 6.3 Calcul heure de lancement automatique

```typescript
const estimatedDuration = {
  episode_5:  15,   // min
  episode_15: 45,
  short_30:   90,
  film_90:    240,
};
// launchAt = scheduledAt - (estimatedDuration + 15 min buffer)
// Si launchAt dans le passé → lancer immédiatement
```

---

## 7. Modération admin — Uploads publics

### 7.1 Règle fondamentale

- Films **générés par IA** → jamais soumis à review (contenu contrôlé par Claude)
- Films **uploadés depuis l'extérieur** en public → TOUJOURS soumis à review admin
- Films uploadés en **cercle privé** → jamais soumis à review

### 7.2 Flux de modération

```
Upload public validé par Stripe
        ↓
status: "pending_review"
Film NON visible dans le catalogue
        ↓
Notification admin (email + in-app)
        ↓
Admin visionne dans /admin/reviews/[filmId]
        ↓
APPROUVE → status "ready" → visible catalogue
           Email créateur : "✅ Ton film est en ligne !"

REJETTE + raison → status "rejected"
                   Avoir crédité sur compte créateur
                   Email créateur avec raison du refus
```

### 7.3 En cas de rejet

- Avoir crédité sur `user.credits` en centimes
- Pas de remboursement Stripe automatique
- Créateur peut corriger et re-soumettre (nouveau paiement)

---

## 8. Partage des revenus créateurs

### 8.1 Calcul mensuel (type Spotify)

```
Valeur par visionnage = abonnement mensuel ÷ nombre de films vus ce mois
Distribution :
  Film standard     → 50% créateur / 50% AiFlex
  Suite avec royalty → 50% créateur suite / 10% créateur original / 40% AiFlex
  Suite sans royalty → 50% créateur suite / 50% AiFlex
```

### 8.2 Seuils de complétion

| Complétion | Part créateur | Part AiFlex |
|-----------|--------------|-------------|
| 100% | 50% | 50% |
| 70-99% | 35% | 65% |
| 30-69% | 15% | 85% |
| < 30% | 0% | 100% |

### 8.3 Versement

- Calcul le 1er de chaque mois (cron)
- Versement via **Stripe Connect** si cumul >= $10
- AiFlex prélève 2% de frais de traitement
- En dessous de $10 → report mois suivant

---

## 9. Stockage vidéo — Backblaze B2 + Cloudflare

### 9.1 Pourquoi ce choix

Firebase Storage → coût bande passante = **$18 000/mois** à 1 000 films × 50 vues ❌
Backblaze B2 + Cloudflare → bande passante **$0** (accord entre les deux services) ✅

### 9.2 Coût mensuel réel

```
1 000 films × 3 GB = 3 000 GB stockés
3 000 × $0.006 = $18/mois de stockage
Bande passante = $0 (Cloudflare)
Total = $18/mois ✅
```

### 9.3 Configuration

```
Backblaze B2 :
  Bucket : aiflex-videos (public)
  Endpoint : s3.us-west-004.backblazeb2.com

Cloudflare DNS :
  CNAME cdn.aiflex.ton-domaine.com → aiflex-videos.s3.us-west-004.backblazeb2.com
  Proxy : ✅ Activé (orange cloud — obligatoire pour bande passante gratuite)

Cache rules :
  /films/* → TTL 1 an (MP4 immutables)
  /episodes/* → TTL 1 an
  /thumbnails/* → TTL 30 jours
```

### 9.4 lib/storage.ts — Client B2

```typescript
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';

const b2 = new S3Client({
  endpoint: process.env.B2_ENDPOINT!,
  region: 'us-west-004',
  credentials: {
    accessKeyId: process.env.B2_KEY_ID!,
    secretAccessKey: process.env.B2_APPLICATION_KEY!,
  },
});

export async function uploadToB2(
  localPath: string,
  remotePath: string,
  contentType: string
): Promise<string> {
  await b2.send(new PutObjectCommand({
    Bucket: process.env.B2_BUCKET_NAME!,
    Key: remotePath,
    Body: fs.readFileSync(localPath),
    ContentType: contentType,
    ACL: 'public-read',
  }));
  return `${process.env.NEXT_PUBLIC_CDN_URL}/${remotePath}`;
}

export async function uploadBufferToB2(
  buffer: Buffer,
  remotePath: string,
  contentType: string
): Promise<string> {
  await b2.send(new PutObjectCommand({
    Bucket: process.env.B2_BUCKET_NAME!,
    Key: remotePath,
    Body: buffer,
    ContentType: contentType,
    ACL: 'public-read',
  }));
  return `${process.env.NEXT_PUBLIC_CDN_URL}/${remotePath}`;
}

export const storagePaths = {
  filmOutput:       (id: string) => `films/${id}/output.mp4`,
  filmThumbnail:    (id: string) => `films/${id}/thumbnail.jpg`,
  filmClip:         (id: string, jobId: string) => `films/${id}/clips/${jobId}.mp4`,
  episodeOutput:    (id: string) => `episodes/${id}/output.mp4`,
  characterPreview: (jobId: string, i: number) => `previews/${jobId}/char-${i}.webp`,
  uploadedFilm:     (id: string) => `uploads/${id}/original.mp4`,
};
```

---

## 10. Schéma Prisma complet

```prisma
model Film {
  id               String   @id @default(cuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id])

  uploadType       String   @default("ai_generated") // "ai_generated" | "user_upload"
  userPrompt       String?
  title            String?
  synopsis         String?
  genre            String?
  format           String?
  // "episode_5" | "episode_15" | "short_30" | "film_90"
  durationMinutes  Int?

  // Upload
  fileSize         BigInt?
  originalFileName String?

  // Visibilité
  visibility       String   @default("private")
  // "private" | "private_circle" | "public"
  isFreeContent    Boolean  @default(false)
  // Admin only — visible sans abonnement avec pub

  // Cercle d'amis
  inviteToken      String?  @unique
  invitedEmails    String[]

  // Pipeline
  status           String   @default("pending")
  composition      Json?
  errorMessage     String?

  // Suites — CLEF DU SYSTÈME
  parentFilmId       String?  // Film dont celui-ci est la suite
  parentFilm         Film?    @relation("FilmSequels", fields: [parentFilmId], references: [id])
  sequels            Film[]   @relation("FilmSequels")
  allowSequels       Boolean  @default(false)
  // true = n'importe qui peut générer une suite de ce film
  // même si le film ne lui appartient pas
  allowPublicSequels Boolean  @default(false)
  royaltyEnabled     Boolean  @default(true)
  notifyOnSequel     Boolean  @default(true)
  isDisavowed        Boolean  @default(false)
  // true = créateur original a retiré ce film de l'arbre du parent

  // Modération admin (uploads publics uniquement)
  adminReviewStatus  String?
  // null | "pending_review" | "approved" | "rejected"
  adminReviewNote    String?
  reviewedBy         String?
  reviewedAt         DateTime?
  creditIssued       Boolean  @default(false)
  creditAmount       Int?

  // Output
  outputUrl         String?
  thumbnailUrl      String?

  // Paiement
  stripePaymentId   String?
  amountPaid        Int?     // centimes

  views   FilmView[]
  boosts  FilmBoost[]
  payouts CreatorPayout[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([status])
  @@index([visibility])
  @@index([parentFilmId])
  @@index([adminReviewStatus])
}

model Series {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  title       String
  synopsis    String
  genre       String
  visibility  String    @default("private")
  releaseMode String    @default("binge") // "binge" | "weekly"

  // Suites sur séries
  allowSequels       Boolean @default(false)
  allowPublicSequels Boolean @default(false)
  royaltyEnabled     Boolean @default(true)
  notifyOnSequel     Boolean @default(true)

  stripePaymentId    String?
  amountPaid         Int?

  adminReviewStatus  String?
  adminReviewNote    String?
  reviewedBy         String?
  reviewedAt         DateTime?

  episodes Episode[]
  boosts   FilmBoost[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([visibility])
}

model Episode {
  id            String   @id @default(cuid())
  seriesId      String
  series        Series   @relation(fields: [seriesId], references: [id])
  userId        String
  episodeNumber Int
  seasonNumber  Int      @default(1)
  title         String?
  synopsis      String?
  cliffhanger   String?  // texte du cliffhanger généré par Claude
  status        String   @default("pending")
  // pending | generating_clips | rendering | scheduled | ready | error
  composition   Json?
  outputUrl     String?
  thumbnailUrl  String?
  errorMessage  String?
  scheduledAt   DateTime?
  publishedAt   DateTime?
  views         FilmView[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([seriesId, seasonNumber, episodeNumber])
  @@index([seriesId])
  @@index([status])
}

model GenerationJob {
  id           String    @id @default(cuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id])
  filmId       String?
  film         Film?     @relation(fields: [filmId], references: [id])

  mode         String    // "express" | "assisted"
  format       String
  visibility   String
  userPrompt   String
  scheduledAt  DateTime?
  launchAt     DateTime?
  formData     Json
  scenarioData Json?
  characterImages Json?  // images Flux générées
  validatedData   Json?  // données après validation utilisateur

  status       String    @default("pending")
  // pending | analyzing | scenario_ready | awaiting_validation
  // | scheduled | generating | done | error
  errorMessage String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([status])
  @@index([launchAt])
}

model User {
  // Ajouter au modèle existant :
  role      String  @default("user") // "user" | "admin"
  credits   Int     @default(0)      // avoir en centimes (remboursements)
  suspended Boolean @default(false)
}

model Subscription {
  id                   String   @id @default(cuid())
  userId               String   @unique
  user                 User     @relation(fields: [userId], references: [id])
  stripeCustomerId     String   @unique
  stripeSubscriptionId String   @unique
  status               String   // "active" | "canceled" | "past_due"
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
  id             String   @id @default(cuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id])
  filmId         String?
  film           Film?    @relation(fields: [filmId], references: [id])
  episodeId      String?
  month          String   // "2026-04"
  totalViews     Int
  qualifiedViews Int
  grossAmount    Int      // centimes avant frais
  netAmount      Int      // centimes après 2% frais AiFlex
  payoutType     String   @default("primary")
  // "primary" = créateur du contenu
  // "royalty"  = créateur original d'un film dont une suite a été publiée
  status         String   @default("pending")
  // "pending" | "paid" | "below_threshold"
  stripePayoutId String?
  paidAt         DateTime?
  createdAt      DateTime @default(now())

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
  type            String   // "homepage_24h" | "category_7d" | "badge_30d"
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
  // "validation_ready" (agent mode assisté)
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
  format      String         // "preroll_15" | "midroll_30" | "banner"
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

## 11. Types TypeScript partagés

```typescript
// types/film.ts

export type FilmFormat =
  | 'episode_5'    // 5 min
  | 'episode_15'   // 15 min
  | 'short_30'     // 30 min
  | 'film_90';     // 1h30

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
  duration: number;           // frames à 30fps
  transition: 'cut' | 'fade' | 'dissolve';
  subtitle: string | null;
}

export interface RemotionComposition {
  fps: 30;
  scenes: Scene[];
  music: { url: string; volume: number; fadeOut: boolean } | null;
  totalDurationInFrames: number;
}

export const FORMAT_CONFIG: Record<FilmFormat, {
  label: string;
  durationMinutes: number;
  sceneCount: number;
  apiCostCents: number;    // coût API réel en centimes ($0.022/sec)
  privatePrice: number;   // prix facturé en centimes
  publicPrice: number;
}> = {
  episode_5:  { label: 'Épisode 5 min',    durationMinutes: 5,   sceneCount: 5,  apiCostCents: 660,   privatePrice: 999,   publicPrice: 499  },
  episode_15: { label: 'Épisode 15 min',   durationMinutes: 15,  sceneCount: 15, apiCostCents: 1980,  privatePrice: 2999,  publicPrice: 1499 },
  short_30:   { label: 'Court-métrage 30 min', durationMinutes: 30, sceneCount: 30, apiCostCents: 3960, privatePrice: 5999, publicPrice: 2999 },
  film_90:    { label: 'Film complet 1h30', durationMinutes: 90, sceneCount: 90, apiCostCents: 11880, privatePrice: 17999, publicPrice: 8999 },
};

// Tarifs suites (légèrement réduits car contexte fourni)
export const SEQUEL_PRICE: Record<FilmFormat, number> = {
  episode_5:  999,
  episode_15: 2999,
  short_30:   5999,
  film_90:    16999,
};

// Tarifs séries
export const SERIES_CONFIG: Record<string, {
  label: string;
  episodeCount: number;
  format: FilmFormat;
  apiCostCents: number;
  privatePrice: number;
  publicPrice: number;
}> = {
  mini_5x5:    { label: 'Mini-série 5×5min',    episodeCount: 5,  format: 'episode_5',  apiCostCents: 3300,  privatePrice: 4999,  publicPrice: 2499  },
  standard_10x5:  { label: 'Série 10×5min',     episodeCount: 10, format: 'episode_5',  apiCostCents: 6600,  privatePrice: 9999,  publicPrice: 4999  },
  mini_5x15:   { label: 'Mini-série 5×15min',   episodeCount: 5,  format: 'episode_15', apiCostCents: 9900,  privatePrice: 14999, publicPrice: 7499  },
  standard_10x15: { label: 'Série 10×15min',    episodeCount: 10, format: 'episode_15', apiCostCents: 19800, privatePrice: 29999, publicPrice: 14999 },
};

// Calcul part créateur
export function getCreatorRevenueShare(pct: number): number {
  if (pct >= 100) return 0.50;
  if (pct >= 70)  return 0.35;
  if (pct >= 30)  return 0.15;
  return 0;
}

// Calcul partage avec royalty
export function calculatePayoutSplit(
  viewValue: number,
  pct: number,
  hasRoyalty: boolean
): { sequelCreator: number; originalCreator: number; platform: number } {
  const share = getCreatorRevenueShare(pct);
  const totalCreator = viewValue * share;
  if (!hasRoyalty) return { sequelCreator: totalCreator, originalCreator: 0, platform: viewValue - totalCreator };
  const royalty = viewValue * 0.10;
  return { sequelCreator: totalCreator - royalty, originalCreator: royalty, platform: viewValue - totalCreator };
}
```

---

## 12. API vidéo — Clients

### 12.1 Seedance 1.5 Fast via Atlas Cloud (pipeline automatisé)

```typescript
// lib/seedance.ts
const SEEDANCE_URL = 'https://api.atlascloud.ai/v1'; // Atlas Cloud
const SEEDANCE_KEY = process.env.SEEDANCE_API_KEY!;

export const seedance = {
  async generateClip(options: {
    prompt: string;
    durationSeconds: number;
    aspectRatio: '16:9' | '9:16';
    webhookUrl: string;
    metadata: { filmId: string; sceneId: string };
  }) {
    const res = await fetch(`${SEEDANCE_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SEEDANCE_KEY}` },
      body: JSON.stringify({ ...options, model: 'seedance-v1.5-pro-fast' }),
    });
    if (!res.ok) throw new Error(`Seedance error: ${res.status}`);
    return res.json();
  },

  async getJob(jobId: string) {
    const res = await fetch(`${SEEDANCE_URL}/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${SEEDANCE_KEY}` },
    });
    return res.json();
  },
};
```

### 12.2 Flux via Replicate (images personnages)

```typescript
// lib/flux.ts
import { uploadBufferToB2, storagePaths } from './storage';

export async function generateCharacterImages(
  prompt: string,
  jobId: string,
  count = 3
): Promise<string[]> {
  const Replicate = require('replicate');
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_KEY! });

  const results = await Promise.all(
    Array.from({ length: count }).map(() =>
      replicate.run('black-forest-labs/flux-schnell', {
        input: { prompt: `Portrait cinématographique haute qualité. ${prompt}`, num_outputs: 1, aspect_ratio: '2:3', output_format: 'webp' },
      })
    )
  );

  return Promise.all(results.map(async (output: any, i: number) => {
    const url = Array.isArray(output) ? output[0] : output;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    return uploadBufferToB2(buf, storagePaths.characterPreview(jobId, i), 'image/webp');
  }));
}
```

---

## 13. Prompts Claude

### 13.1 Film classique

```typescript
// lib/prompts/scenario.ts
export const buildScenarioPrompt = (format: FilmFormat) => `
Tu es un scénariste pour AiFlex. Génère un scénario + composition Remotion.
Scènes : ${FORMAT_CONFIG[format].sceneCount} × 60 secondes = 1800 frames à 30fps
RÉPONSE : JSON STRICT uniquement, aucun texte en dehors.
{
  "title": "string",
  "synopsis": "string",
  "genre": "string",
  "composition": {
    "fps": 30,
    "totalDurationInFrames": number,
    "scenes": [{
      "id": "scene_1", "index": 0,
      "prompt": "Description COMPLÈTE pour Seedance : lieu, lumière, personnages (DESCRIPTION PHYSIQUE PRÉCISE à chaque scène), action, dialogues, caméra, ambiance",
      "duration": 1800,
      "transition": "cut|fade|dissolve",
      "subtitle": "string|null"
    }],
    "music": { "url": "", "volume": 0.12, "fadeOut": true }
  }
}`;
```

### 13.2 Série complète

```typescript
// lib/prompts/series.ts
export const buildSeriesPrompt = (episodeCount: number, format: FilmFormat) => `
Tu es un scénariste pour AiFlex. Génère une série complète de ${episodeCount} épisodes.
Chaque épisode : ${FORMAT_CONFIG[format].durationMinutes} minutes = ${FORMAT_CONFIG[format].sceneCount} scènes.
RÈGLES CRITIQUES :
- Chaque épisode se termine par un CLIFFHANGER fort et inattendu
- Les personnages ont une description physique IDENTIQUE dans tous les épisodes
- La narration progresse logiquement entre les épisodes
RÉPONSE : JSON STRICT uniquement.
{
  "seriesTitle": "string",
  "seriesSynopsis": "string",
  "genre": "string",
  "episodes": [{
    "episodeNumber": 1,
    "title": "string",
    "synopsis": "string",
    "cliffhanger": "string — description du cliffhanger final",
    "composition": { ...même structure que film classique... }
  }]
}`;
```

### 13.3 Suite avec contexte parent

```typescript
// lib/prompts/sequel.ts
// CLEF : ce prompt permet de générer la suite d'un film
// même si l'utilisateur n'en est pas le créateur original
export const buildSequelPrompt = (
  format: FilmFormat,
  parent: {
    title: string;
    synopsis: string;
    genre: string;
    characters: string;   // extraits du scénario parent
    lastEvent: string;    // dernier événement du film parent
  }
) => `
Tu es un scénariste pour AiFlex. Génère la SUITE du film "${parent.title}".

CONTEXTE HÉRITÉ — OBLIGATOIRE À RESPECTER :
- Synopsis original : ${parent.synopsis}
- Genre : ${parent.genre}
- Personnages principaux : ${parent.characters}
- Dernier événement connu : ${parent.lastEvent}

CONSIGNES :
- Respecte la continuité narrative et visuelle
- Les personnages ont la MÊME apparence physique que dans l'original
- Le ton et le style correspondent au film original
- La suite est autonome (compréhensible sans avoir vu l'original)
- Commence exactement là où le film précédent s'est terminé

Nombre de scènes : ${FORMAT_CONFIG[format].sceneCount}
RÉPONSE : JSON STRICT identique au format film classique.`;
```

### 13.4 Agent — Analyse formulaire

```typescript
// lib/prompts/agent.ts
export const buildAgentPrompt = (format: FilmFormat) => `
Tu es l'agent de création AiFlex. Analyse le formulaire utilisateur et génère scénario + descriptions personnages pour Flux.
RÉPONSE : JSON STRICT uniquement.
{
  "title": "string",
  "synopsis": "string",
  "genre": "string",
  "characters": [{
    "name": "string",
    "role": "protagoniste|antagoniste|secondaire",
    "description": "description physique TRÈS détaillée pour Seedance",
    "fluxPrompt": "prompt en anglais optimisé pour Flux : apparence, vêtements, expression, éclairage cinématographique"
  }],
  "composition": { ...même structure que film classique... }
}`;
```

---

## 14. Variables d'environnement

```env
# .env.local

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Seedance 1.5 Fast via Atlas Cloud
SEEDANCE_API_KEY=...
SEEDANCE_API_URL=https://api.atlascloud.ai/v1
SEEDANCE_WEBHOOK_SECRET=...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Backblaze B2
B2_KEY_ID=...
B2_APPLICATION_KEY=...
B2_BUCKET_NAME=aiflex-videos
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com

# Cloudflare CDN
NEXT_PUBLIC_CDN_URL=https://cdn.aiflex.ton-domaine.com

# Replicate (images personnages Flux)
REPLICATE_API_KEY=r8_...

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/aiflex

# Remotion
REMOTION_BUNDLE_URL=https://aiflex.ton-domaine.com/remotion-bundle/

# Resend (emails)
RESEND_API_KEY=re_...

# Firebase (Auth uniquement)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...

# App
NEXT_PUBLIC_APP_URL=https://aiflex.ton-domaine.com
NEXTAUTH_SECRET=...

# PWA — VAPID keys (générer avec : npx web-push generate-vapid-keys)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

---

## 15. Configuration Nginx

```nginx
server {
    listen 443 ssl;
    server_name aiflex.ton-domaine.com;

    ssl_certificate /etc/letsencrypt/live/aiflex.ton-domaine.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aiflex.ton-domaine.com/privkey.pem;

    client_max_body_size 5120M;  # uploads jusqu'à 5 GB

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

    # Timeout étendu pour Remotion (rendu peut prendre plusieurs heures)
    location /api/generate/render {
        proxy_pass http://localhost:3000;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Timeout étendu pour les gros uploads
    location /api/upload/file {
        proxy_pass http://localhost:3000;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

---

## 16. Installation des dépendances

```bash
# Remotion
npm install remotion @remotion/renderer @remotion/cli

# Backblaze B2 (API compatible S3)
npm install @aws-sdk/client-s3

# Stripe
npm install stripe @stripe/stripe-js

# ffmpeg wrapper
npm install fluent-ffmpeg
npm install --save-dev @types/fluent-ffmpeg

# Resend
npm install resend

# Cron (versements + publication hebdomadaire + agent)
npm install node-cron
npm install --save-dev @types/node-cron

# Upload multipart
npm install formidable
npm install --save-dev @types/formidable

# Replicate (images personnages)
npm install replicate

# PWA
npm install next-pwa web-push
npm install --save-dev @types/web-push sharp
npx web-push generate-vapid-keys  # une seule fois

# VPS
sudo apt install ffmpeg

# Migrations Prisma
npx prisma migrate dev --name aiflex_v7_complete
npx prisma generate

# Build Remotion
npx remotion bundle remotion/index.ts --out ./remotion-bundle
```

---

## 17. Ordre d'implémentation recommandé

1. **Migrer Prisma** → `npx prisma migrate dev --name aiflex_v7_complete`
2. **Ajouter role/credits/suspended sur User** → premier admin en SQL
3. **Créer types/film.ts** → tous les types + FORMAT_CONFIG + SEQUEL_PRICE + fonctions
4. **Créer middleware.ts** → protection /admin + /api/admin
5. **Créer lib/storage.ts** → Backblaze B2
6. **Configurer Cloudflare** → CNAME cdn.* en mode Proxy
7. **Créer lib/claude.ts** + **lib/prompts/** (scenario, series, sequel, agent)
8. **Créer lib/seedance.ts** → client Atlas Cloud Seedance 1.5 Fast
9. **Créer lib/stripe.ts** → client + Stripe Connect
10. **Créer lib/remotion-render.ts** → wrapper renderMedia + uploadToB2
11. **Créer lib/flux.ts** → images personnages Replicate
12. **Créer lib/upload.ts** → ffprobe + calcul tarifs
13. **Créer lib/mailer.ts** + **lib/notifications.ts**
14. **Créer lib/ads.ts** + **lib/payouts.ts** + **lib/agent.ts**
15. **Créer composants Remotion** → Film, Scene, Subtitle, Root + remotion.config.ts
16. **Créer API routes** :
    - `stripe/checkout` + `stripe/webhook`
    - `generate/scenario` → `generate/series` → `generate/clips` → `webhooks/seedance` → `generate/render`
    - `sequel/route.ts` ← génération suite sur film qui n'appartient pas au créateur
    - `films/[filmId]/sequels` + `films/[filmId]/disavow`
    - `upload/init` → `upload/file` → `upload/invite`
    - `agent/start` + `agent/validate` + `agent/reschedule` + `agent/cron-check`
    - `admin/review` + `admin/films` + `admin/users`
    - `views/route.ts`
    - `ads/serve` + `ads/impression`
    - `boost/route.ts` + `payouts/route.ts`
    - `push/subscribe`
17. **Connecter page create** → formulaire + mode express/assisté + scheduledAt + Stripe
18. **Créer page create/series**
19. **Créer page sequel/[filmId]** → accessible même si le film n'appartient pas à l'utilisateur
20. **Créer page agent/validate/[jobId]** → carrousel images + validation scénario
21. **Créer page upload**
22. **Créer GenerationProgress** → polling toutes les 10s
23. **Créer page watch/[filmId]** → VideoPlayer + AdPlayer + SequelButton + SequelTree
24. **Créer page watch/series/[seriesId]**
25. **Créer page watch/invite/[token]**
26. **Créer pages admin** → dashboard + reviews + users
27. **Créer page catalogue** → films + séries + boosts en premier
28. **Créer page account** → EarningsDashboard + RoyaltyDashboard
29. **Créer page advertise**
30. **Config PWA** → manifest.json + next.config.js + InstallPrompt + VAPID + push
31. **Configurer crons** :
    - 1er du mois minuit → /api/payouts
    - Chaque lundi 9h → /api/series/publish-scheduled
    - Toutes les 5 min → /api/agent/cron-check
32. **Config Nginx** + **Build Remotion bundle** sur VPS

---

## 18. Points d'attention critiques

**Suites**
- `allowSequels = false` par défaut → créateur doit EXPLICITEMENT activer
- La suite peut être générée par N'IMPORTE QUEL abonné, même si le film ne lui appartient pas
- Extraire les personnages depuis `composition.scenes[0].prompt` du film parent pour `buildSequelPrompt`
- `isDisavowed = false` dans toutes les requêtes catalogue

**Stockage**
- Firebase → UNIQUEMENT Auth. Supprimer toutes les références Firebase Storage dans le code existant
- CNAME Cloudflare en mode Proxy (orange cloud) → sinon bande passante B2 facturée
- Ne jamais exposer B2_APPLICATION_KEY côté client
- Nettoyer /tmp après chaque upload/render

**APIs vidéo**
- Seedance 1.5 Fast via Atlas Cloud → $0.022/sec → modèle par défaut pour toute génération automatisée
- Seedance 2 via Runway $95/mois → génération manuelle premium uniquement
- Remotion renderMedia() → VPS uniquement (pas Vercel), timeout 3600s, concurrency 4
- ffmpeg requis sur VPS → `sudo apt install ffmpeg`

**Admin**
- Premier admin → `UPDATE "User" SET role = 'admin' WHERE email = 'ton@email.com';`
- Films IA publics → jamais de review
- Uploads publics → TOUJOURS review admin
- Uploads privé cercle → jamais de review

**PWA**
- Vidéos MP4 → NetworkOnly dans Service Worker (jamais en cache)
- VAPID keys → générer une seule fois, ne jamais changer en production
- iOS → pas de bannière auto, afficher message "Safari → Partager → Sur l'écran d'accueil"

**Catalogue**
- Films IA : `visibility = "public"` ET `status = "ready"`
- Uploads : `visibility = "public"` ET `adminReviewStatus = "approved"`
- Films gratuits : `isFreeContent = true` (configurable admin uniquement)
- Films boostés en premier (triés par endAt DESC)

**Crons**
- Agent cron toutes les 5 min → éviter doublons avec `status = "scheduled" AND launchAt <= now()`
- Série hebdomadaire → générer tous les épisodes d'un coup, stocker en "scheduled"
- Versement créateur → $10 minimum, cumul mois suivant si en dessous
```
