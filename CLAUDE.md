# Perfect Sunday

Free-to-play NFL pick'em. Full product spec: [docs/SPEC.md](docs/SPEC.md).
Hosting and Phase 1 decisions: [docs/superpowers/specs/2026-08-21-github-pages-deployment-design.md](docs/superpowers/specs/2026-08-21-github-pages-deployment-design.md).
Pre-launch to-do and priorities: [docs/TODO.md](docs/TODO.md).

## Supabase — hard boundary

This project uses **one** Supabase project:

- ref `vockiqvlijtkxvpdttya`
- `https://vockiqvlijtkxvpdttya.supabase.co`
- publishable key `sb_publishable_VrGb2daesMaOAJfIpCqLzg_eR-8JMcb`

**Never issue a Supabase call against any other project ref from this repo.**
In particular, ref `jurmecmiyvjmltaldhmf` ("Gymcon" / Gym Atlas) and ref
`ewjldvetqhdiwkfnsxax` (Gym Atlas dev) are a different product with live user
data. They are off limits here, read or write, no exceptions.

Enforcement is layered:

1. `.mcp.json` pins the `supabase` MCP server with `--project-ref=vockiqvlijtkxvpdttya`.
   A pinned server exposes no `list_projects` / `create_project` and cannot be
   redirected at call time.
2. The account-wide servers that could reach Gymcon no longer exist:
   `supabase-pat` was removed from `~/.claude.json`, and the
   `supabase@claude-plugins-official` plugin (whose MCP server is unpinned) is
   disabled in `~/.claude/settings.json`. Disabling the plugin also removes the
   `supabase:*` skills globally — that was a deliberate trade.
3. `.claude/settings.json` denies `mcp__plugin_supabase_supabase`,
   `mcp__supabase-pat`, and the claude.ai Supabase connector
   (`mcp__47cd472d-6cb7-4315-b4cd-e495177d159f`), so none of them silently
   reopens the hole in this repo.
4. This file.

**Known gap:** the claude.ai Supabase connector is account-level and is managed
in claude.ai connector settings, not in local config. It reconnects on its own
and its tool-name UUID may change, which would defeat the deny rule above. The
durable fix is to disconnect it in claude.ai. Until then, check `claude mcp list`
at session start and stop if a second Supabase server is present.

If a Supabase tool appears under any name other than `mcp__supabase__*`, stop
and report it rather than using it.

## Stack

- Next.js App Router, `output: 'export'` — static only. No middleware, no route
  handlers, no server actions, no `next/image` optimizer.
- Deployed to GitHub Pages at `https://saroldhand.github.io/perfect-sunday/`,
  so `basePath` comes from `NEXT_PUBLIC_BASE_PATH` and `trailingSlash` is true.
- Supabase for auth, data, and RLS. The publishable key ships in the build, so
  **RLS is the security model** — every table gets policies in the same
  migration that creates it, and every policy gets a negative-case test.

## Deferred — do not build yet

- **Google OAuth.** Phase 1 is magic link only. The Google button is built but
  flag-disabled; enabling it needs Google Cloud console setup the operator has
  not done. Do not add it back into the signup path.
- ~~Odds provider integration and the three scheduled Edge Functions (Phase 2).~~
  **Built 2026-08-24**, at the operator's request. Two of the three are not Edge
  Functions at all: `lock_week` and `score_week` are pure SQL, so they run on
  `pg_cron` (migration 0014). Only `sync-slate` calls out, so only it is a
  function. Lines come from nflverse and are labelled `nflverse-consensus`, not
  `fanduel` — no major book publishes a public odds API, and mislabelling the
  source would be grading people against a line they were never shown. Nothing
  is scheduled by default; see `supabase/OPERATIONS.md`.
- Groups, season standings view, live My Week screen (Phase 3).
- Custom domain. `SHARE_DOMAIN` stays the github.io URL until one is bought.

Current goal is a proof of concept to show a friend, not a public launch.
