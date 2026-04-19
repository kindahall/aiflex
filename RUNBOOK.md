# AIflex — Runbook DR & incident

Document opérationnel. Procédures à exécuter en cas d'incident, de
compromission soupçonnée ou de désastre. Garde-le sous la main et
imprimé.

---

## 0. Tableau de bord rapide

| Symptôme                                    | Premier réflexe             |
| ------------------------------------------- | --------------------------- |
| Fuite de secret (clé Stripe / DB / token)   | §1 — Rotation d'urgence     |
| Compte admin compromis                      | §2 — Verrouillage admin     |
| CSAM signalé / publié                       | §3 — Quarantaine + escalade |
| Webhook Stripe en erreur en boucle          | §4 — Triage Stripe          |
| Run-away génération IA / facture qui grimpe | §5 — Kill-switch IA         |
| Base Postgres KO                            | §6 — Restore PITR           |
| Worker pod OOM ou en boucle                 | §7 — Worker isolé           |
| WAF bloque du trafic légitime               | §8 — Bypass WAF temporaire  |

---

## 1. Rotation d'urgence d'un secret

Tous les secrets sont lus via `lib/secrets.ts` (env par défaut) avec un
cache 5 min. Token-secret accepte une liste `current,previous` pour les
rotations sans coupure.

### 1.1 Token HMAC (`AIFLEX_TOKEN_SECRET`)

```bash
NEW=$(openssl rand -hex 32)
# Phase 1 : double secret pour ne pas casser les tokens en vol
export AIFLEX_TOKEN_SECRET="$NEW,$OLD"
# redéployer
# attendre 1h (TTL des tokens password-reset)
# Phase 2 : ne garder que le nouveau
export AIFLEX_TOKEN_SECRET="$NEW"
# redéployer
```

### 1.2 Stripe webhook (`STRIPE_WEBHOOK_SECRET`)

- Crée un nouveau secret dans Stripe → Developers → Webhooks
- Mets-le en env, redéploie
- Stripe accepte les deux pendant 24h, retire l'ancien après

### 1.3 Token de session — purge totale

Si tu soupçonnes un vol massif de cookies :

```sql
DELETE FROM "Session";
```

Tous les utilisateurs devront se reconnecter. Communique en avance.

### 1.4 Clés OAuth provider

- Révoque l'app OAuth chez Google/GitHub/Apple
- Recrée l'app, mets à jour `*_CLIENT_ID` + `*_CLIENT_SECRET`
- Redéploie

---

## 2. Verrouillage admin

```sql
-- 1. Suspendre tous les comptes admin sauf le tien
UPDATE "User" SET suspended = true
WHERE role = 'admin' AND email != '<ton-email>';

-- 2. Forcer logout des admins
DELETE FROM "Session"
WHERE "userId" IN (SELECT id FROM "User" WHERE role = 'admin');

-- 3. Inspecter l'audit log
SELECT * FROM "AdminAuditLog"
ORDER BY "createdAt" DESC LIMIT 200;
```

Suite : ouvrir un ticket, faire un bilan, ré-activer un par un avec
nouveau mot de passe + 2FA forcée.

---

## 3. CSAM (zero-tolerance)

Pipeline auto :

- 2 reports CSAM distincts → quarantaine auto (`published=false`,
  `adminReviewStatus=pending_review`)
- 1 report CSAM → flagged uniquement (anti-DOS)

Action manuelle si CSAM confirmé :

```sql
-- 1. Hide
UPDATE "Project" SET published = false, status = 'rejected',
                     "adminReviewStatus" = 'rejected', "isDisavowed" = true
WHERE id = '<projectId>';

-- 2. Suspendre l'auteur
UPDATE "User" SET suspended = true
WHERE id = (SELECT "ownerId" FROM "Project" WHERE id = '<projectId>');
```

Procédure légale :

1. Préserver les preuves : ne PAS supprimer le fichier S3, marquer
   `legal_hold` dans la metadata du bucket.
2. Signaler à PHAROS (FR) et au NCMEC CyberTipline (US) sous 24h.
3. Ne pas notifier le suspect.

---

## 4. Triage Stripe

```bash
# Forcer la re-livraison d'un événement
stripe events resend <evt_xxx>

# Désactiver les payouts en attendant l'enquête
export FEATURE_PAYOUTS_KILL=1
# redéployer
```

Vérifier l'idempotence : la table `processedEvents` côté code est en
RAM. Pour vraiment dédup en multi-instance, un Redis-backed dedup est
nécessaire (TODO).

---

## 5. Kill-switch IA / runaway

```bash
# Stop la génération immédiate
export FEATURE_GENERATION_KILL=1
# Stop les uploads tant qu'on enquête
export FEATURE_UPLOADS_KILL=1
# redéployer
```

Inspecter la consommation :

```sql
SELECT provider, operation, COUNT(*) AS calls,
       SUM("costMicroUsd") / 1e6 AS usd
FROM "AiCostEntry"
WHERE "createdAt" > NOW() - INTERVAL '1 hour'
GROUP BY provider, operation
ORDER BY usd DESC;
```

Si un user spécifique drive le pic :

```sql
UPDATE "User" SET suspended = true WHERE id = '<userId>';
```

---

## 6. Restore PITR

Stratégie en place :

- `scripts/backup-db.sh snapshot` toutes les heures (cron système)
- `scripts/backup-db.sh verify` quotidien
- `scripts/backup-db.sh wal-archive` continu (si configuré)

Restore complet :

```bash
# 1. Récupérer le snapshot
aws s3 cp s3://aiflex-backups/backups/aiflex_<STAMP>.dump.gpg .
gpg --decrypt aiflex_<STAMP>.dump.gpg > restore.dump

# 2. Vérifier le checksum
aws s3 cp s3://aiflex-backups/backups/aiflex_<STAMP>.dump.sha256 -
sha256sum restore.dump  # doit matcher

# 3. Restore dans une base neuve
createdb aiflex_restore
pg_restore --no-owner --no-privileges --jobs=4 \
  --dbname=postgresql://.../aiflex_restore restore.dump

# 4. Si PITR actif (wal-archive) — rejouer jusqu'au timestamp désiré
# Voir Postgres recovery.conf / restore_command
```

RPO actuel : 1h (snapshot horaire) sans WAL, 1 min avec
`wal-archive`. RTO : ~30 min pour restore + warmup.

---

## 7. Worker isolé

Le worker tourne dans un process séparé (`AIFLEX_ROLE=worker tsx
scripts/worker.ts`). Si OOM ou stuck :

```bash
# Inspecter via Sentry / logs (filter `kind:worker.*`)
# Tuer + redémarrer (le supervisor relance automatiquement)
systemctl restart aiflex-worker

# Si la queue est polluée par un job toxique
redis-cli -u $REDIS_URL DEL bullmq:video-generation:*

# Reaper auto : tout job pending > 1h est marqué error par cronAdvanceAllJobs
```

---

## 8. Bypass WAF temporaire

Le WAF applicatif (`lib/waf.ts`) bloque les patterns SQLi/XSS/SSTI/etc.
Si un faux positif paralyse une opé :

```bash
export WAF_DISABLED=1
# redéployer
```

Inspecter ensuite les logs (`grep "applicative"`), ajouter le path
faux-positif à `ALLOWLIST_PATHS` dans `lib/waf.ts`, retirer
`WAF_DISABLED`.

---

## 9. Indicateurs à surveiller en permanence

- Sentry : taux d'erreur > 0.5%
- `/api/health?strict=1&verbose=1` (header `Authorization: Bearer
$HEALTH_DETAIL_TOKEN`) : tous les checks `ok`
- Grafana / Loki : `level=error` sur la dernière heure
- Coût IA quotidien : query `AiCostEntry` (§5 ci-dessus)
- File BullMQ : `bullmq:*:wait` queue length

---

## 10. Contacts d'astreinte

- Ops on-call : … (à remplir par l'opérateur)
- Légal / DPO : …
- Stripe support : dashboard.stripe.com → Support
- Anthropic / OpenAI / fal.ai : tickets (lien dashboard provider)
- Hébergeur : …
