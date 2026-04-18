# AIflex

AI-generated video streaming and creator platform — think Netflix + TikTok + AI co-creation. Creators generate films, series, and sequels via AI pipelines; viewers watch, comment, and support creators through subscriptions, ads, and sequel commissions.

Built with **Next.js 15 (App Router)**, **TypeScript**, **Prisma + PostgreSQL**, **Tailwind**, **Anthropic Claude** (narrative + moderation), **OpenAI** (Whisper ASR + embeddings + TTS), and **Fal AI / Seedance** (video generation).

---

## Quickstart

```bash
# 1. Install deps
npm install

# 2. Copy env template and fill in required keys
cp .env.local.example .env.local
#   Required at minimum: DATABASE_URL, SESSION_SECRET, ADMIN_EMAIL
#   Optional (enables features): ANTHROPIC_API_KEY, OPENAI_API_KEY, STRIPE_*, B2_*

# 3. Generate Prisma client and apply migrations
npm run prisma:generate
npm run prisma:migrate

# 4. Launch dev server
npm run dev
# → http://localhost:3000
```

The admin account is seeded on first boot. If `ADMIN_PASSWORD` is unset, a random 24-char password is generated and logged once to stderr — copy it from the boot log, sign in at `/admin`, and change it immediately.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15 App Router, React 18, TypeScript 5.6 |
| Styling | Tailwind 3.4 + custom design tokens (`flex-bg`, `flex-accent`, etc.) + `next-themes` (dark mode default) |
| Data | Prisma 5.22 + PostgreSQL |
| AI — text | Anthropic Claude (narrative generation, moderation, agent) |
| AI — audio/embed | OpenAI Whisper (ASR), embeddings, TTS |
| AI — video | Fal AI / Seedance (image + video generation pipeline) |
| Storage | Backblaze B2 + Cloudflare CDN (public delivery) |
| Payments | Stripe (subscriptions, Connect payouts) |
| Auth | Custom session cookies (httpOnly, SameSite, HMAC tokens), 2FA TOTP |
| Jobs | `node-cron` (5 min agent check, weekly series, monthly payouts) |
| i18n | 7 languages (fr default, en, es, it, pt, zh, ko) via cookie-based locale |
| Testing | Vitest (unit + integration) + Playwright (e2e) |
| CI | GitHub Actions (typecheck + build + e2e) |

---

## Architecture

```
app/            Next.js App Router — pages + API routes
  api/           REST endpoints (auth, projects, admin, stripe webhook, agent, etc.)
  (public pages) landing, watch, studio, dashboard, admin, legal, …

components/     React components (UI, features)
  ui/            Shared primitives (Button, Input, Modal, …)

lib/            Server-side utilities
  auth.ts        Session + password hashing + 2FA
  tokens.ts      HMAC-SHA256 timing-safe token signing
  ai-client.ts   Unified Anthropic + OpenAI routing
  moderation.ts  Prompt moderation gate (called before every generation)
  server-db.ts   Prisma wrapper + admin bootstrap
  stripe.ts      Webhook signature verification + subscription helpers
  i18n.ts        Locale detection + translations
  schemas/       Zod validation schemas (shared client/server)

prisma/         Schema + migrations
middleware.ts   Rate limiting, auth gates, CSRF, security headers
scripts/        cron.ts, backup-db.sh, payouts-preview.ts
tests/          Vitest unit + integration
e2e/            Playwright specs
```

---

## Scripts

```bash
npm run dev              # Next dev server
npm run build            # Production build
npm run start            # Start prod server
npm run typecheck        # tsc --noEmit
npm run lint             # next lint
npm run format           # Prettier write
npm run format:check     # Prettier check (CI)
npm test                 # Vitest run
npm run test:watch       # Vitest watch mode
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
npm run e2e              # Playwright e2e
npm run cron             # Run cron jobs locally (tsx scripts/cron.ts)
npm run backup:db        # Database backup script
npm run payouts:preview  # Preview monthly creator payouts
npm run prisma:generate  # Regenerate Prisma client
npm run prisma:migrate   # Apply migrations (dev)
```

---

## AI provider responsibilities

| Provider | Responsibility |
|---|---|
| **Anthropic Claude** | Text generation (scenarios, series, sequels), moderation, agent orchestration |
| **OpenAI** | Whisper (audio transcription for subtitles), text embeddings (semantic search), TTS voiceover |
| **Fal AI / Seedance** | Image and video synthesis (frame generation) |

Both Anthropic and OpenAI are required for the full feature set. You can run without either, but some features will degrade (no moderation without Anthropic, no subtitles/voiceover/embeddings without OpenAI).

---

## Security notes

- **Session cookies** : `httpOnly`, `SameSite=strict`, `Secure` in prod. Tokens signed with HMAC-SHA256 (timing-safe).
- **2FA** : TOTP + backup codes, required for admin role.
- **Rate limiting** : path-specific limits enforced in [middleware.ts](middleware.ts) (signup 3/window, auth 10/window, video gen 5/window).
- **CSRF** : `SameSite=strict` + Origin header check on state-changing routes.
- **Stripe webhook** : HMAC signature verification with 5-minute timestamp tolerance (anti-replay).
- **Cron endpoints** : require `x-cron-secret` header AND IP in `CRON_ALLOWED_IPS` whitelist.
- **API keys** : read exclusively from `process.env.*` — never stored in DB.
- **Admin bootstrap** : random 24-char password generated on first boot if `ADMIN_PASSWORD` unset; admin forced to rotate password before first action.

---

## Product specs

- `AIFLEX_CLAUDE_CODE_BRIEF_V8.md` — current product brief (V8, extends V7)
- `AIFLEX_CLAUDE_CODE_BRIEF_V7.md` — base reference
- `IMPLEMENTATION_PLAN.md` — phased rollout plan
- `PHASE3_BACKLOG.md` — Phase 3 backlog (BullMQ, Sentry, PostHog)
- `.claude/CLAUDE.md` — behavioral guidelines for Claude Code sessions on this repo

---

## Contributing

1. Create a branch: `git checkout -b feat/your-feature`
2. `npm run typecheck && npm run lint && npm test` must pass before commit.
3. Commits are auto-formatted by `husky` + `lint-staged` (pre-commit hook).
4. Open a PR — CI runs typecheck, build, and Playwright e2e.

---

## License

Private. All rights reserved.
