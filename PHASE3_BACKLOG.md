# Phase 3 — Items reportés (backlog explicite)

Les items ci-dessous étaient au programme V8 Phase 3 mais ont été
**volontairement reportés** pendant l'implémentation initiale parce qu'ils
nécessitent soit du déploiement infra externe, soit un refactor invasif.
Ils ne bloquent ni le launch, ni la collecte de revenus.

---

## V8 §B7.2 — Queue persistante BullMQ + Redis

**Ce qui existe** : `lib/job-queue.ts` (in-memory), `lib/agent.ts` qui orchestre
ses jobs séquentiellement avec persistance d'état dans `GenerationJob`.

**Ce qui manque** :
- Migration des fonctions `enqueue*` vers BullMQ.
- Worker process séparé (`scripts/worker.ts`) consommant la queue.
- Dashboard admin `bull-board` monté sur `/admin/queues`.

**Pré-requis avant migration** :
- Provisionner Redis sur le VPS (`sudo apt install redis-server` + persistence AOF).
- `npm i bullmq ioredis @types/ioredis`.
- Variable d'env `REDIS_URL=redis://localhost:6379`.

**Coût technique de la migration** :
~2 jours. Réécrire `orchestrateGeneration` comme handler de queue, ajouter
mécanique de retries+DLQ, mettre à jour le cron `/api/agent/cron-check` pour
juste réveiller la queue.

**À déclencher quand** : > 50 jobs/heure de génération **OU** un crash a perdu
des jobs en cours.

---

## V8 §B7.3 — CDN signed URLs (Cloudflare Worker)

**Ce qui existe** : `lib/storage.ts` → `signedContentUrl()` qui délègue à la
S3 presign. Suffisant pour les buckets B2 publics.

**Ce qui manque** :
- Worker Cloudflare déployé sur `cdn.aiflex.com` qui vérifie un HMAC propre,
  indépendant de la signature S3 (besoin pour les buckets vraiment privés).
- Token de 4h renouvelé par le lecteur via `/api/films/[id]/cdn-token`.

**Pré-requis** : compte Cloudflare avec Workers payant (~$5/mo), bucket B2
en mode privé (perte de la bande passante gratuite — gros impact financier
pour le stream public), CI Wrangler.

**À déclencher quand** : un partenaire B2B exige du contenu strictement
non-partageable, ou abus massif détecté de hotlinking.

---

## V8 §B7.5 — Staging + CI/CD GitHub Actions

**Ce qui manque** :
- Workflow `.github/workflows/staging.yml` : push sur `staging` →
  `pnpm typecheck && pnpm test && pnpm e2e:install && pnpm e2e && deploy via SSH`.
- Workflow `production.yml` : push sur `main` → mêmes étapes + déploiement
  prod après approbation manuelle.
- Secrets : `STAGING_SSH_KEY`, `PROD_SSH_KEY`, `STAGING_HOST`, `PROD_HOST`.

**Pré-requis** : choisir l'orchestrateur de déploiement (Docker Compose,
PM2, Nomad). On ne veut pas figer l'infra sans avoir le hosting.

**À déclencher quand** : la première équipe d'au moins 2 devs travaille sur
le projet OU la première vague d'utilisateurs arrive.

---

## V8 §23.4 — Régénération partielle de scène

**Ce qui existe** : modèle Prisma `SceneVersion` (déjà créé), mais pas l'API
ni l'UI.

**Ce qui manque** :
- `POST /api/projects/[id]/scenes/[idx]/regenerate` qui crée une nouvelle
  `SceneVersion` (pour pouvoir revert), appelle `submitSceneVideo` puis
  `persistVideoWithAiWatermark`, met à jour `composition.scenes[idx].clipUrl`.
- UI dans `VideoEditor.tsx` : bouton "Régénérer cette scène" + diff visuel.

**Coût technique** : ~1 jour, mais demande de re-tester le pipeline complet
sur un projet existant — risque de casser des films en prod.

**À déclencher quand** : retour utilisateur explicite "j'aimerais corriger la
scène 5 sans tout refaire".

---

## V8 §B6.1 — Affiliation programme (au-delà du parrainage simple)

**Ce qui existe** : modèle Prisma `ReferralLink` (vide d'API et UI).

**Ce qui manque** :
- `/dashboard/affiliate` : génération du lien, dashboard de tracking, seuil
  de versement $50.
- Cookie tracking 30j sur les visites entrantes.
- Reporting clic / conversion / commission lifetime.

**À déclencher quand** : on veut activer un canal influenceur explicite.

---

## Note générale

Tous ces items sont **prêts au démarrage** : leurs pré-requis sont
documentés, les modèles Prisma existent ou sont identifiés, et les hooks
d'intégration dans le code actuel sont en place (par ex. `captureError` est
déjà appelé partout, un Sentry manager n'a qu'à se brancher).
