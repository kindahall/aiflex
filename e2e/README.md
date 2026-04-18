# AIflex — Tests end-to-end (Playwright)

Smoke tests qui vérifient les parcours critiques sans toucher au pipeline IA
(Anthropic + fal.ai). Utilisable en local et en CI sans aucune clé externe.

## Prérequis

```bash
npm install --save-dev @playwright/test
npm run e2e:install
```

La deuxième commande installe le binaire Chromium dans
`~/Library/Caches/ms-playwright` (≈ 250 Mo). En CI, GitHub Actions le met
en cache automatiquement (voir `.github/workflows/ci.yml`).

## Lancer les tests

```bash
npm run e2e         # headless, console
npm run e2e:ui      # interface graphique Playwright pour debugger
```

Le `webServer` de `playwright.config.ts` démarre `npm run dev`
automatiquement sur `http://localhost:3000`. Si tu as déjà un serveur qui
tourne, il sera réutilisé.

## Couverture actuelle

| Spec | Couvre |
|---|---|
| `auth.spec.ts` | signup, dashboard, logout, forgot-password |
| `browse.spec.ts` | home, search, filtres, watch catalogue, pages légales, healthcheck |

## Ce qui n'est PAS testé (volontaire)

- `/api/concept`, `/api/scenario`, `/api/scenes`, `/api/scene-video` →
  dépendent d'`ANTHROPIC_API_KEY` et `FAL_KEY`. À ajouter en suite
  séparée `ai.spec.ts` une fois les clés branchées, avec `test.skip()` si
  les env vars manquent.
- Email verification end-to-end → pas de clic sur lien email parce qu'on
  utilise le provider console-only en dev. Le banner de vérification est
  testé, mais pas le `/verify-email?token=...` qui demanderait de
  scraper la console serveur.
- Lecture vidéo réelle d'un film user → pas de vidéo Seedance sans clé.

## Notes

- Les tests utilisent des emails uniques (`test+TIMESTAMP@aiflex.local`)
  donc la base JSON s'accumule au fil des runs. Acceptable en dev ; en
  CI on lance contre une DB éphémère (à brancher avec 1.1 Postgres).
- Aucun mock — les tests parlent à la vraie API. C'est lent mais
  fidèle.
