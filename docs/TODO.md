# Pre-launch to-do — getting Perfect Sunday ready to share

Written 2026-08-27. **Week 1 locks Wednesday 9 September, 7:50 PM ET** — thirteen
days out — so this is ordered by that calendar, not by theme. The goal is not
more features; it is that the loop that already exists — pick, share, sweat,
compare, return — runs without a stumble for someone who arrived from a group
text and will not give it a second chance.

Product philosophy, restated so every item below is judged against it: easy to
play, easy to follow, easy to share. Anything that does not serve one of those
three waits.

---

## Where we stand

The build is further along than "proof of concept" suggests. Done and solid:

- **The whole 2026 season is loaded.** Migration 0015 seeds 18 weeks and 272
  games with kickoffs and lock times, including the three early-lock weeks
  (1, 12, 18). Lines are the only thing filled weekly, and `sync-slate` +
  `private.apply_week_lines` do that with the right guardrails: a week opens
  only when every game has a complete line, and a locked week's numbers can
  never be rewritten. The manual SQL fallback is documented in
  [supabase/OPERATIONS.md](../supabase/OPERATIONS.md).
- **Auth and onboarding**: magic link, display-name gate with inline
  availability, un-preticked terms checkbox, versioned acceptance.
- **The core loop**: card deck with autosave and review, hub billboard for every
  week state, My Week with the glance strip, the week board with a last-scored
  fallback.
- **Sharing**: readable per-game picks share pre-lock, emoji results grid after,
  native share sheet with clipboard fallback.
- **Security**: RLS with negative-case tests, scoring functions in the
  unexposed `private` schema, anon writes revoked, idempotent lock/score jobs
  with tests.
- **PWA + deploys**: manifest and icons ship; push to `main` publishes to Pages.

What follows is what stands between this and handing the link out.

---

## 1. The sign-in email (blocker, and the first domino is a domain)

Two separate problems hide in "the magic email is from Supabase", and the rate
limit is the worse one:

1. **The built-in sender is rate-limited to a couple of emails per hour.** It
   exists for development only. The exact failure mode is the launch moment
   itself: the link lands in a group chat, four friends tap it inside ten
   minutes, and the third one gets an error instead of an email. This is a hard
   blocker regardless of branding.
2. **Branding.** The email comes from `noreply@mail.app.supabase.io` with a
   stock template. For a product that spreads by trust between friends, the
   first email needs to say Perfect Sunday.

The fix is one chain, in order:

- [ ] **Buy the domain.** This is the keystone: a custom SMTP sender needs a
      domain to verify (SPF/DKIM — you cannot send branded mail from
      `github.io`), and the same purchase upgrades every share message from
      `saroldhand.github.io/perfect-sunday` to something a stranger will
      actually type. One purchase, two payoffs. `SHARE_DOMAIN` in
      `src/lib/constants.ts` and `basePath` in `.env.production` are the only
      code touchpoints, both deliberately one-liners.
- [ ] **Pick an email provider and verify the domain.** Resend's free tier
      (100/day, 3,000/month) covers the friends phase several times over;
      Postmark and SES are fine too. Verify DKIM/SPF on the new domain.
- [ ] **Point Supabase at it.** Dashboard → Auth → SMTP settings: host,
      credentials, and a sender like `Perfect Sunday <signin@perfectsunday.app>`.
- [ ] **Raise the auth email rate limits** (Dashboard → Auth → Rate Limits) —
      the low defaults stop applying once custom SMTP is configured, but the
      configured numbers should be set deliberately with a signup wave in mind.
- [ ] **Rewrite the magic-link template** in the product's voice. Subject on
      the order of "Your Perfect Sunday sign-in link"; body short, one button,
      no boilerplate. Include `{{ .Token }}` — see the next item.

### Add code entry alongside the link (strongly recommended)

The magic link has a known failure the callback page already apologises for:
PKCE requires the link to open in the same browser that requested it. On a
phone that is routinely false — the request comes from Safari but the tap in
Gmail opens elsewhere, and an installed Add-to-Home-Screen app has its own
storage, so the link signs in Safari instead of the app the user is standing
in. Our best onboarding path (install the PWA) currently makes our sign-in
path less reliable.

The robust fix is the 6-digit code: `signInWithOtp` already sends one in
`{{ .Token }}`, and `verifyOtp({ email, token, type: "email" })` completes
sign-in **in the app the user is already in** — no browser hop at all.

- [ ] On the "Check your email" state, add a code field: "or type the 6-digit
      code from the email." Keep the link for desktop, where it works well.

This is the single biggest smoothness fix available for onboarding. (Google
OAuth stays deferred per CLAUDE.md — the code path removes most of the pain
OAuth would have solved.)

---

## 2. Season setup — done in the repo, verify it in the project

The schedule work is finished; what remains is confirming the live database
matches the repo and switching the machinery on. (The Supabase MCP server was
unreachable from the session that wrote this doc, so none of this could be
checked against production — treat every box as unverified.)

- [ ] **Verify migrations 0013–0016 are applied** to `vockiqvlijtkxvpdttya`.
      There is no migrations table; OPERATIONS.md shows the
      information-schema probe. In particular `weeks` must hold the 18
      2026 rows and `games` the 272.
- [ ] **Deploy `sync-slate`** (`supabase functions deploy sync-slate`) and run
      it once by hand against Week 1 to see `updated / missing / opened` come
      back sane.
- [ ] **Schedule the three jobs** — this is a pre-sharing must, not a
      convenience. Today nothing is scheduled, so a Thursday the operator is
      busy means the week never locks and picks stay editable during the games,
      which breaks the contest's one promise. Per OPERATIONS.md:
      `lock-due-weeks` and `score-due-weeks` every 10 minutes, `sync-slate`
      hourly. All three are idempotent and cheap when idle.
- [ ] **Close the demo week before Week 1 opens** — the 2025 Week 18 demo is
      still `open`, and an open week beats every upcoming one, so until the
      cutover the app shows the demo. One `update` per OPERATIONS.md.
- [ ] **Fill Week 1's lines** when they're ready (sync-slate will do it on the
      hour once scheduled; the manual VALUES fallback exists for corrections).
      Sanity-check the slate-completeness query before relying on the
      auto-open.
- [ ] **Tell the friends the real deadline.** Week 1 locks *Wednesday* Sep 9,
      7:50 PM ET, not the usual Thursday. The app shows it, but the invite
      message should say it too — a friend who assumes Thursday misses the
      whole first week, and the first week is the whole pitch.

Weekly cadence thereafter (the "fill in the lines weekly" rhythm):

| When | What | Who does it |
|---|---|---|
| Tue | Lines land, week auto-opens | `sync-slate` hourly; verify `missing = 0` |
| Thu 4 PM ET | Week locks, entries created | `lock-due-weeks` cron; spot-check |
| Sun–Mon | Scores in, picks graded | see §3 — automate or enter by hand |
| Tue | Team stats refresh, winner check | manual SQL per OPERATIONS.md |

---

## 3. Sunday has to move on its own (the biggest remaining build)

Two gaps together mean the product's signature moment — a pick flipping green
or red while you watch — currently never happens:

1. **Nothing marks games final.** `sync-slate` fetches lines, not results;
   `score_due_weeks` grades only what `set_final_score` has been fed by hand.
   Grading happens whenever the operator types box scores, which in practice
   means Monday, which means the Sunday sweat — the reason the product exists —
   is spent staring at a static screen.
2. **The client never refetches.** `WeekProvider` loads once per visit; the
   only intervals in the app tick clocks. A user sitting on My Week during the
   4:25 window sees nothing change until they hard-refresh.

Both need fixing; neither is large:

- [ ] **`sync-scores`** — a sibling Edge Function on the `sync-slate` pattern
      (fetch → normalise → call a service-role-only SQL door; the
      `sync_apply_week_lines` grant pattern is the template, and
      `set_final_score` + `score_week` already exist and are idempotent). Two
      candidate feeds: ESPN's public scoreboard JSON (updates live, unofficial
      but ubiquitous) or nflverse (already trusted here for lines, but results
      land after the games, not during). For live Sundays it has to be the
      former, polled every ~10 minutes during game windows; nflverse can stay
      as the Monday-night backstop. *Fallback if this slips past Week 1: the
      operator enters scores Sunday evening per OPERATIONS.md — the game still
      works, the magic is just delayed.*
- [x] **Client auto-refresh** — done 2026-08-27. Refetch on `visibilitychange`,
      plus a poll whose cadence follows what is in motion (`lib/refresh.ts`):
      60s with games in flight, 5 min while waiting on lines / the lock / the
      scoring sweep, none once scored. A failed load retries on the idle tick.
      A pick resolving on screen now pulses once as it flips green or red —
      the moment §8 of the SPEC calls the signature.

---

## 4. Small blockers before the link goes out

- [ ] **Privacy policy.** We collect email addresses and there is no privacy
      page. One static page in the rules' style — what's collected (email,
      display name, picks), what it's for, that it's never sold, how to get
      deleted — linked in the footer next to Official Rules. Required before
      asking strangers-of-friends for their email.
- [ ] **Decide the prize number for real.** The share text and the rules both
      promise "$1,000". That promise goes out in the very first share. If the
      operator isn't genuinely prepared to pay it during the friends phase,
      lower it *now* — changing it after people have played a week is far
      worse than a smaller number. (It's a constant by design; one line.)
- [ ] **Auth URL configuration check.** Dashboard → Auth → URL Configuration:
      Site URL `https://saroldhand.github.io/perfect-sunday/` and the redirect
      allowlist covering `/auth/callback/` — and both revisited the day the
      custom domain cuts over, or every magic link breaks at once.
- [ ] **Link unfurl.** The share URL currently unfurls bare — `layout.tsx` has
      no Open Graph tags. iMessage and WhatsApp render OG cards; a dark card
      with the wordmark and "Free NFL pick'em — a perfect week wins $1,000" is
      the difference between a link that looks like a product and one that
      looks like a phishing test. `metadata.openGraph` + one static 1200×630
      image. Small, high leverage.

---

## 5. Addictiveness backlog — build during Weeks 1–3, in this order

Ranked by retention-per-effort; none block the first share.

1. **Thursday-morning nudge email** to anyone with an incomplete set. SPEC
   calls this the highest-value retention feature in the build, and it's
   right: partial entries are blocked, so an unfinished deck is a lost week
   and a lost habit. Needs §1's email infrastructure (another reason it's
   first); then it's a pg_cron query + provider send. Respect the obvious
   opt-out.
2. ~~**Season leaderboard.**~~ **Built 2026-08-27** — a Season tab on the
   board, summing every scored week per player with the SPEC §4 tiebreak
   (weeks played). No `season_standings` view after all: entries are already
   publicly readable and a season is a few hundred rows, so the aggregation
   is client-side in `lib/season.ts`, tested without a database. The view can
   exist later if scale ever says otherwise.
3. **"Lines are open" moment.** The Tuesday open currently happens silently.
   Cheapest version: the same email plumbing as the nudge. This is the
   top-of-week habit hook.
4. **Public slate for link visitors.** SPEC §7 wants a shared link to show the
   week's games behind a lightweight sign-up prompt. Today a visitor gets the
   sign-in screen with the line ticker — decent, but the full slate with real
   numbers is the pitch. Watch whether invited friends convert first; build
   only if they stall.
5. **My Picks history.** Once three-plus weeks exist people will want their
   season at a glance. Phase 3 as planned.

---

## 6. Deliberately not now

Held per the no-feature-bloat principle; revisit only when reality demands:

- **Groups / join codes** — while there's one friend group, the global board
  *is* the group board. Build when a second circle joins.
- **Google OAuth** — console setup still undone; §1's code entry removes most
  of the pain it would solve. Revisit if onboarding data says otherwise.
- **Realtime subscriptions** — polling is enough at this scale; revisit at
  hundreds of concurrent Sunday users.
- **Native app, sponsor slots, prize escalation** — Phase 4.
- **Lawyered rules + sponsor identity** — the draft with its honest "private
  test" banner is fine for friends-of-friends. The moment the link is posted
  anywhere public (group text ≠ public; Twitter/Reddit = public), SPEC §9
  applies: reviewed Official Rules, eligibility/age/state exclusions, named
  sponsor. Do not cross that line without this.

---

## 7. Housekeeping

- [ ] **SPEC drift.** SPEC.md still describes the moneyline+spread format,
      Vercel hosting, and FanDuel-sourced lines; the product is over/under +
      spread (migration 0007), GitHub Pages, and nflverse-consensus. Future
      sessions read SPEC as gospel — annotate the changed sections the way
      §7's share amendment already is, rather than rewriting history.
- [ ] **Backups & advisors.** Confirm the Supabase plan's backup story before
      real users' picks exist, and run the dashboard's security/performance
      advisors once against the final schema.

---

## Suggested order of work

| # | Item | Size | When |
|---|---|---|---|
| 1 | Domain + SMTP + template + rate limits (§1) | M | This week |
| 2 | Code-entry sign-in (§1) | S–M | This week |
| 3 | Schedule the three jobs + deploy sync-slate (§2) | S | This week |
| 4 | Privacy page, prize decision, OG tags, URL config (§4) | S each | This week |
| 5 | ~~Client auto-refresh (§3)~~ | S | Done 2026-08-27 |
| 6 | `sync-scores` (§3) | M | Before Sep 13, manual fallback exists |
| 7 | Demo cutover + Week 1 lines + invite copy (§2) | S | Sep 8–9 |
| 8 | Nudge email, ~~season board~~ (done), lines-open email (§5) | M | Weeks 1–3 |

Sizes: S ≤ half a day, M = a day or two.
