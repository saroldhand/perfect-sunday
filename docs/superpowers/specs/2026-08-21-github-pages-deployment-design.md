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
| Format: moneyline + spread | **Over/under + spread** | Operator decision, 2026-08-21. Reverses SPEC.md §2, which rejected over/unders. The cost is real and is recorded rather than hidden: a perfect week moves from roughly 1 in 20 million to roughly **1 in 665 million**, and the layer that made the game feel winnable — moneylines hit ~66%, so most users got 12–14 of 16 — is the layer that was removed. The prize is correspondingly cheaper to underwrite. |

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

Everything else about the share format — eight per line, kickoff order, `⬜`
for unplayed — is unchanged, except that the first block is now the over/under
rather than the moneyline. Totals share as `O` and `U` rather than the words:
eight of "OVER" across is far past the width of an iMessage bubble, and a text
share that wraps defeats the point.

## 5. Phase 1 scope

Backend first, so the operator can be hands-off while the frontend is built.

1. **Migration 1 — schema.** All eight tables from SPEC.md §4 and the two enums
   (`week_status`, `game_status`), plus constraints and indexes. `groups` and
   `group_members` are created now even though the group UI is Phase 3 — an
   empty table costs nothing and a later migration against live pick data does.
   `season_standings` is Phase 3, since a materialized view over one week of
   entries has nothing to summarize.
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

Scoring in Phase 1 is manual, but not a loose script: `lock_week`,
`set_final_score` and `score_week` live in the `private` schema, which
PostgREST does not expose, so the same functions the operator runs by hand are
what Phase 2's Edge Functions will call on a timer. The runbook is
[supabase/OPERATIONS.md](../../../supabase/OPERATIONS.md).

### Status as of 2026-08-21

All six Phase 1 items are built and deployed. Verified in production by a real
signed-in user: a complete 32-pick entry saved, with the grading columns
untouched — the column grant held.

What is deliberately still fake: every line is invented and stamped
`line_source = 'demo'`, kickoff dates are shifted forward so the slate is
pickable, and team records are unseeded (the card hides the stat line rather
than printing `0-0-0`). What is deliberately still inert: "Lock in picks" is a
confirmation step, not a state change — the week's real lock is `lock_week`.

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
