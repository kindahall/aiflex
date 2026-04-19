# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Security posture — état au 2026-04-19

Audit sécurité senior terminé et remédié (51 findings originaux, 36/36 fixes
code vérifiés post-remédiation, 15/16 reliquats déjà mitigés par code
pré-existant, 1 reportée). Commits : `7512f14` `cda96e7` `7e0c98f` `5966f3c`
`7acd8f5` sur `main`.

### Patterns sécurité en place — respecter impérativement

**IDs exposés côté client**

- Jamais `Math.random()`. Utiliser [`secureIdSuffix()`](../lib/server-db.ts)
  (96 bits CSPRNG, base64url) ou `crypto.randomUUID()`.

**Appels sortants avec URL contrôlée par user/agent**

- Toujours `await assertSafeOutboundUrl(url)` depuis
  [`lib/safe-fetch.ts`](../lib/safe-fetch.ts) avant le `fetch` / `fal.subscribe`
  / API provider. Déjà appliqué aux 5 pipelines IA (face-swap, instant-id,
  seedance, lip-sync). Tout nouveau provider externe **doit** le faire.

**Endpoints admin**

- `requireAdmin()` de [`lib/auth.ts`](../lib/auth.ts), jamais
  `requireUser() + if(role !== "admin")`. Le pattern manuel est une
  régression — il a déjà été retiré de 4 routes, ne pas le réintroduire.
- Pour les PATCH admin, whitelist explicite des champs mutables (pattern
  `ADMIN_MUTABLE_KEYS` dans
  [`app/api/admin/projects/[id]/route.ts`](../app/api/admin/projects/[id]/route.ts)).
  Jamais `delete body.id; update(body)`.

**IP client**

- `getTrustedClientIp(req)` de [`lib/client-ip.ts`](../lib/client-ip.ts) —
  jamais le X-Forwarded-For brut (spoofable sans `TRUSTED_PROXY_SECRET`).

**Logs d'audit fire-and-forget**

- `swallowAndReport(scope)` de
  [`lib/observability.ts`](../lib/observability.ts) au lieu de
  `.catch(() => {})`. Les 30+ `.catch(() => {})` restants sont non-critiques
  (notifications, analytics) mais à migrer au passage.

**Modération / Yoti / CSP / cron**

- Fail-closed en prod via flags explicites :
  - `MODERATION_ENFORCE=1` (défaut: on en prod via `mustFailClosed()`)
  - `AGE_VERIFICATION_ENFORCE=1` (Yoti)
  - `CSP_ENFORCE=0` pour opt-out (enforce par défaut en prod)
  - `CRON_ALLOWLIST_OPTIONAL=1` pour opt-out (allowlist obligatoire en prod)

**Tokens stateless**

- `signToken(sub, purpose, ttl, { bind })` +
  `verifyToken(token, purpose, { expectedBind })` dans
  [`lib/tokens.ts`](../lib/tokens.ts). Bind sur un `fingerprintState()` de
  l'état serveur mutable → single-use par rotation, sans store de révocation.

**Backup codes TOTP**

- Stockage hashé (`sha256$` prefix) via `hashBackupCode()` dans
  [`lib/totp.ts`](../lib/totp.ts). `verifyBackupCode()` accepte encore le
  plaintext legacy — ne pas le retirer tant que des users actifs n'ont pas
  régénéré leurs codes.

**SSRF / outbound guards**

- Timeout `fal.subscribe` → `withFalTimeout` dans
  [`lib/seedance.ts`](../lib/seedance.ts) (4 min par défaut,
  `FAL_SUBSCRIBE_TIMEOUT_MS`).
- Graceful shutdown worker → [`lib/worker-init.ts`](../lib/worker-init.ts)
  (SIGTERM/SIGINT, 25s).

**Sentry**

- Scrubber secrets en place sur
  [`sentry.server.config.ts`](../sentry.server.config.ts) et
  [`sentry.edge.config.ts`](../sentry.edge.config.ts). Si tu ajoutes un
  nouveau pattern de secret (nouveau provider API), ajouter sa regex dans
  `SECRET_PATTERNS`.

### Follow-ups hors périmètre audit initial

- **FAIB-04 — i18n error codes** : tous les `{ error: "Erreur serveur" }`
  hardcodés en français. Refacto global à planifier.
- **noUncheckedIndexedAccess** : 122 violations TS si activé. Refacto par
  domaine.
- **FAIB-01 restants** : ~25 `.catch(() => {})` dans les routes non-admin
  (notifications, likes, thumbnails) à migrer vers `swallowAndReport`.
- **Secret Manager** : env vars OK au boot, mais AWS/GCP Secret Manager
  serait mieux pour la rotation.
- **Profile.timezone** persisté côté DB (au lieu de
  `PARENTAL_CURFEW_TZ_OFFSET_MINUTES` global) — nécessite migration Prisma.
- **Sweep job S3/R2** pour les orphelins hors canonical paths post-delete
  user.

### Rapport d'audit complet

Plan d'audit initial + résultats dans
[`~/.claude/plans/audit-professionnel-complet-kind-sky.md`](/Users/Artisaul/.claude/plans/audit-professionnel-complet-kind-sky.md).
