# AIflex — Guide de déploiement

Checklist actionable, copy-paste-ready. À utiliser avec [RUNBOOK.md](RUNBOOK.md)
(incidents) et `npm run preflight` (validation automatique).

---

## 0. Avant de commencer

```bash
# Verifie tout ce que la prod attend
npm run preflight
# 0 MISSING → green light. >0 → corrige avant de continuer.
```

---

## 1. Premier déploiement

### 1.1 Provisionner les services managés

| Service              | Recommandation                         | Variables produites              |
| -------------------- | -------------------------------------- | -------------------------------- |
| Postgres + pgvector  | Supabase / Neon / RDS (avec extension) | `DATABASE_URL`                   |
| Redis (BullMQ)       | Upstash Redis / Railway / managed      | `REDIS_URL`                      |
| Rate-limit distribué | Upstash Redis (REST)                   | `UPSTASH_REDIS_REST_URL` + token |
| Stockage S3          | Cloudflare R2 / Backblaze B2 / AWS S3  | `S3_*`                           |
| Email transactionnel | Resend / Postmark / SES                | `RESEND_API_KEY`                 |
| Observabilité        | Sentry                                 | `SENTRY_DSN`                     |
| Bucket backups       | S3 séparé du bucket runtime, no delete | `BACKUP_BUCKET`                  |

### 1.2 Générer les secrets cryptographiques

```bash
# Token HMAC (reset password / email verify / 2FA challenge)
echo "AIFLEX_TOKEN_SECRET=$(openssl rand -hex 32)"

# Local storage signing key (fallback dev/preview)
echo "AIFLEX_LOCAL_STORAGE_SECRET=$(openssl rand -hex 32)"

# Cron auth + trusted proxy
echo "CRON_SECRET=$(openssl rand -hex 32)"
echo "TRUSTED_PROXY_SECRET=$(openssl rand -hex 32)"

# Health endpoint detail token
echo "HEALTH_DETAIL_TOKEN=$(openssl rand -hex 24)"
```

Stocke-les dans le secret manager (Vault / AWS Secrets Manager / k8s
Secret), JAMAIS dans git.

### 1.3 Récupérer les fingerprints cert (pinning)

```bash
for HOST in api.stripe.com appleid.apple.com api.yoti.com; do
  PIN=$(openssl s_client -connect $HOST:443 -servername $HOST </dev/null 2>/dev/null \
    | openssl x509 -outform DER \
    | openssl dgst -sha256 -hex \
    | awk '{print $2}')
  echo "$HOST → $PIN"
done
```

Mets-les dans `STRIPE_CERT_PINS_SHA256`, `APPLE_CERT_PINS_SHA256`,
`YOTI_CERT_PINS_SHA256`. Format CSV pour rotation.

### 1.4 Schéma DB

```bash
DATABASE_URL="postgresql://..." npx prisma migrate deploy
# Inclut la migration pgvector HNSW + matviews analytics
```

### 1.5 Migrer depuis la JSON DB (si tu as un dev existant)

```bash
DATABASE_URL="postgresql://..." \
DB_PROVIDER=prisma \
npx tsx scripts/migrate-json-to-postgres.ts
```

### 1.6 Déployer

```bash
# Compose
docker compose -f docker-compose.production.yml \
  --env-file .env.production up -d --build

# k8s — appliquer un manifeste équivalent (web Deployment + worker
# Deployment + cron CronJob, partageant la même image, AIFLEX_ROLE
# différent par déploiement)
```

### 1.7 Smoke test

```bash
curl -fsS https://aiflex.app/api/health             # 200 minimal
curl -fsS https://aiflex.app/api/health?strict=1    # 200 si tout est vert
curl -fsS -H "Authorization: Bearer $HEALTH_DETAIL_TOKEN" \
  "https://aiflex.app/api/health?strict=1&verbose=1" | jq
```

---

## 2. Rolling deploy

```bash
# 1. preflight contre la prod (sans down)
ENV_FILE=.env.production npm run preflight

# 2. Build + push image
docker build -t aiflex:$GIT_SHA .
docker push registry/aiflex:$GIT_SHA

# 3. Migrate (idempotent — utilise migration-lock pour éviter race)
docker run --rm --env-file .env.production aiflex:$GIT_SHA \
  npx prisma migrate deploy

# 4. Rollout web (un pod à la fois, healthcheck doit passer)
kubectl set image deployment/web web=registry/aiflex:$GIT_SHA
kubectl rollout status deployment/web

# 5. Rollout worker
kubectl set image deployment/worker worker=registry/aiflex:$GIT_SHA
kubectl rollout status deployment/worker

# 6. Cron — singleton, restart force
kubectl set image deployment/cron cron=registry/aiflex:$GIT_SHA
kubectl rollout status deployment/cron
```

---

## 3. Rollback

```bash
# Web only
kubectl rollout undo deployment/web

# Tout (web + worker + cron)
for D in web worker cron; do kubectl rollout undo deployment/$D; done

# Si la migration a cassé : restore depuis le dernier snapshot
./scripts/backup-db.sh verify   # confirme l'intégrité
# puis suivre RUNBOOK.md §6 pour le restore
```

---

## 4. Opérations courantes

### 4.1 Scaler les workers

```bash
# Compose
docker compose -f docker-compose.production.yml up -d --scale worker=4

# k8s
kubectl scale deployment/worker --replicas=4
```

JOB_CONCURRENCY × replicas = capacité totale. Ajuste selon les coûts
provider IA (chaque slot tient 1 génération en vol).

### 4.2 Activer un kill-switch

```bash
# Stop la génération immédiatement (sans redeploy si k8s)
kubectl set env deployment/web FEATURE_GENERATION_KILL=1
kubectl set env deployment/worker FEATURE_GENERATION_KILL=1
# Annuler:
kubectl set env deployment/web FEATURE_GENERATION_KILL-
```

Switches : `FEATURE_<UPLOADS|GENERATION|PAYOUTS|TIPS|SIGNUPS|COMMENTS>_KILL`.

### 4.3 Rotation d'un secret (AIFLEX_TOKEN_SECRET)

```bash
# Génère le nouveau
NEW=$(openssl rand -hex 32)

# Phase 1 — double secret pendant 1h (durée max d'un token reset)
kubectl set env deployment/web AIFLEX_TOKEN_SECRET="$NEW,$OLD"
kubectl set env deployment/worker AIFLEX_TOKEN_SECRET="$NEW,$OLD"
kubectl rollout status deployment/web
sleep 3700  # 1h + marge

# Phase 2 — drop l'ancien
kubectl set env deployment/web AIFLEX_TOKEN_SECRET="$NEW"
kubectl set env deployment/worker AIFLEX_TOKEN_SECRET="$NEW"
```

### 4.4 Ajouter Upstash (multi-instance rate-limit)

```bash
# 1. créer la base sur upstash.com
# 2. injecter les vars
kubectl set env deployment/web \
  UPSTASH_REDIS_REST_URL="https://xxx.upstash.io" \
  UPSTASH_REDIS_REST_TOKEN="xxx"
# Le code détecte automatiquement et bascule.
# 3. preflight pour confirmer
npx tsx scripts/preflight.ts
```

### 4.5 Backup manuel + restore test

```bash
# Snapshot ad-hoc
./scripts/backup-db.sh snapshot

# Verify auto-quotidien (à scheduler dans cron système)
BACKUP_VERIFY_DATABASE="postgresql://verify:verify@localhost/verify" \
  ./scripts/backup-db.sh verify
```

---

## 5. Topologie de référence

```
                ┌──────────────┐
                │  Cloudflare  │  (WAF L7, anti-DDoS, TLS)
                └──────┬───────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
   ┌────────┐                    ┌────────┐
   │ web×N  │                    │ web×N  │   (HTTP only, AIFLEX_ROLE=web)
   └───┬────┘                    └───┬────┘
       │                             │
       └─────────────┬───────────────┘
                     ▼
              ┌─────────────┐
              │ Postgres    │   (managed, pgvector activé)
              │ + pgbouncer │
              └─────────────┘
                     ▲
        ┌────────────┴──────────┐
        │                       │
  ┌──────────┐            ┌──────────┐
  │ worker×N │            │   cron   │   (1 seul pod cron — singleton)
  └──────────┘            └──────────┘
        │                       │
        ▼                       ▼
   ┌────────┐              ┌────────┐
   │ Redis  │              │  S3    │   (BullMQ + Upstash REST + storage)
   └────────┘              └────────┘
```

---

## 6. Variables d'environnement minimum prod

Voir `npm run preflight` pour la liste exhaustive avec validation. Le
strict minimum :

```bash
# Core
NODE_ENV=production
APP_URL=https://aiflex.app
DATABASE_URL=postgresql://...?pgbouncer=true&connection_limit=1
DB_PROVIDER=prisma

# Secrets (générés en §1.2)
AIFLEX_TOKEN_SECRET=...
AIFLEX_LOCAL_STORAGE_SECRET=...
CRON_SECRET=...
TRUSTED_PROXY_SECRET=...
HEALTH_DETAIL_TOKEN=...

# Topology
AIFLEX_ROLE=web|worker|cron

# Storage + queue
S3_BUCKET=...
S3_REGION=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_ENDPOINT=...                     # R2/B2 only
REDIS_URL=redis://...
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# AI providers (au moins UN moderation provider requis)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...                # optionnel
FAL_KEY=...                          # vidéo

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_ALLOWED_IPS=                  # CSV optionnel (def-in-depth)

# OAuth (chaque provider est all-or-nothing)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# ... idem GITHUB_, APPLE_

# Cert pinning (recommandé)
STRIPE_CERT_PINS_SHA256=...
APPLE_CERT_PINS_SHA256=...
YOTI_CERT_PINS_SHA256=...

# Backup
BACKUP_BUCKET=s3://aiflex-backups
BACKUP_GPG_RECIPIENT=ops@aiflex.app
BACKUP_RETENTION_DAYS=30

# Observabilité
SENTRY_DSN=...
NEXT_PUBLIC_SENTRY_DSN=...

# Hardening optionnel
CSP_ENFORCE=1
WAF_DISABLED=                        # vide = WAF actif (défaut)
ADDITIONAL_ALLOWED_ORIGINS=          # CSV pour origines CSRF supplémentaires
SSRF_ALLOWED_HOSTS=                  # CSV de hosts allowlist supplémentaires
```

---

## 7. Voir aussi

- [RUNBOOK.md](RUNBOOK.md) — incidents, kill-switches, restore PITR
- `npm run preflight` — validation automatique
- `npm run worker` — lance un worker en local
- `scripts/backup-db.sh {snapshot|verify|wal-archive}` — backup PITR
