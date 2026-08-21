# Perfect Sunday — Hosting & Phase 1 Design

Companion to [SPEC.md](../../SPEC.md). SPEC.md defines the product; this
document records the decisions that differ from it and the Phase 1 build
shape. Where the two conflict, this document wins.

## 1. Decisions that override SPEC.md

| SPEC.md says | We are doing | Why |
|---|---|---|
| Hosting: Vercel | **GitHub Pages** | Operator preference. Free, no new account. |
| Next.js App Router (SSR implied) | Next.js App Router with `output: 'export'` | Pages serves static files only. Same codebase moves to Vercel later by deleting one config line. |
| Domain `perfectsunday.app` | `saroldhand.github.io/perfect-sunday` | No domain purchased yet. |

Nothing else in SPEC.md changes. Data model, scoring rules, screens,
palette, and build order stand as written.

## 2. Hosting

- Repo: `saroldhand/perfect-sunday`, **public** (private repos need Pages Pro).
- Deploy: GitHub Actions → `actions/upload-pages-artifact` → `actions/deploy-pages`.
- Live URL: `https://saroldhand.github.io/perfect-sunday/`

### The basePath problem

Project Pages serve from a subpath, so every asset and route needs the
`/perfect-sunday` prefix. Hardcoding it makes the later domain move a
find-and-replace across the codebase, so it is read from the environment
instead:

```js
// next.config.mjs
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
export default {
  output: 'export',
  basePath,
  trailingSlash: true,          // Pages resolves /route/ to /route/index.html
  images: { unoptimized: true }, // no image optimizer on static export
}
```

CI sets `NEXT_PUBLIC_BASE_PATH=/perfect-sunday`. Buying a domain later means
clearing that one variable, not editing code.

`trailingSlash: true` is not optional. Without it Pages 404s on every nested
route.

### Static-export constraints

These are the things that will silently break if ignored:

- No `middleware.ts`, no route handlers, no server actions, no `next/image`
  optimizer. All logic is client-side or in Supabase.
- Every route must be statically knowable at build time. Dynamic segments need
  `generateStaticParams`. Phase 1 avoids dynamic routes entirely — the week is
  a query param or client state, not a path segment.
- No SSR means a brief unauthenticated flash on first paint while the Supabase
  client rehydrates the session from `localStorage`. Handled with a skeleton
  state, not a spinner.

## 3. Supabase

- Project ref `vockiqvlijtkxvpdttya`, region `us-west-2`, Postgres 17.
- URL: `https://vockiqvlijtkxvpdttya.supabase.co`
- Publishable key: `sb_publishable_VrGb2daesMaOAJfIpCqLzg_eR-8JMcb`

Both values are baked into the static build and are public by design. RLS is
the only thing standing between a user and someone else's data, which means
**RLS policies are the security model, not a formality.** Every table ships
with RLS enabled and policies written in the same migration that creates it.

The service-role key never appears in the frontend. Anything needing it runs
as an Edge Function.

### Auth: magic link first, Google later

SPEC.md §6 makes Google OAuth the dominant action. Google OAuth requires a
Google Cloud console project, a consent screen, and an authorized redirect URI
— all operator work in a browser, which is exactly the hands-off time we are
trying to avoid in Phase 1.

**Phase 1 ships email magic link only.** Zero configuration, works immediately.
The sign-in screen is built with the Google button already laid out and
disabled behind a feature flag, so enabling it later is flipping the flag after
the operator completes the Google console steps once.

Supabase redirect allowlist needs `https://saroldhand.github.io/perfect-sunday/**`
before magic links resolve.

Auth callback is a static page at `/auth/callback/` that reads the code from
the URL and calls `exchangeCodeForSession`, then redirects to the pick deck.

## 4. Sharing

SPEC.md §7 puts `perfectsunday.app` in the share payload. Until a domain
exists, that line is a single exported constant:

```ts
export const SHARE_DOMAIN = 'saroldhand.github.io/perfect-sunday'
```

Everything else about the share format — eight squares per line, moneyline
block first, kickoff order, `⬜` for unplayed — is unchanged.

## 5. Phase 1 scope

Backend first, so the operator can be hands-off while the frontend is built.

1. **Migration 1 — schema.** All eight tables from SPEC.md §4, the three enums
   (`week_status`, `game_status`), constraints, and indexes.
2. **Migration 2 — RLS.** Policies per table. The critical one: `picks` are
   readable only by their owner until the parent week is `locked`, writable
   only while it is `open`.
3. **Migration 3 — seed.** `teams` reference data (32 rows) and one real week
   of games with lines, entered manually per SPEC.md Phase 1.
4. **Frontend.** Next.js scaffold, dark tokens from SPEC.md §8, magic-link
   auth, display-name + terms gate, the one-card-at-a-time pick deck with
   autosave, back navigation, review screen, text share of picks.
5. **PWA.** Manifest and icons scoped to the basePath so Add to Home Screen
   produces a working app.
6. **CI.** Build and deploy on push to `main`.

Scoring in Phase 1 is manual — a SQL script the operator runs, not the
`score-games` Edge Function. The three scheduled functions are Phase 2.

## 6. Testing

- **RLS policies get tests.** For each policy, a test asserting the negative
  case: user B cannot read user A's picks before lock, and can after. This is
  the one place where a bug is a data breach rather than a glitch.
- **Scoring logic gets tests** — spread application, push-counts-as-correct,
  tie-counts-as-correct, idempotency on re-run.
- Pick-deck interaction is covered by Playwright against the local dev server.

## 7. Risks

| Risk | Mitigation |
|---|---|
| RLS gap exposes picks pre-lock, letting users copy | Negative-case tests per policy; `get_advisors` run after each migration |
| basePath wrong → assets 404 on Pages, works locally | CI builds with the real basePath; smoke-test the deployed URL, not just localhost |
| Public repo exposes the build | Intended. Only publishable keys ship; service-role stays in Supabase |
| Supabase free tier pauses after 7 days idle | Known. Acceptable for friends-and-family; note it before any real week |

## 8. Not in Phase 1

Odds provider integration, the three Edge Functions, groups, season
standings materialized view, live My Week screen, emoji-grid results share,
Google OAuth, custom domain.
