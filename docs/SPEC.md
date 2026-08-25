# Perfect Sunday — Build Spec

A free-to-play NFL pick'em game. Every week you pick the **moneyline** and the **spread** for every game on the slate. Get all of them right and you win the prize. Nobody will.

This document is the handoff brief for implementation. It covers the concept, the math behind the prize, the stack, the data model, the scoring pipeline, the screens, the visual direction, and the build order.

---

## 1. Concept

- Free to enter, no payment, no deposit, no wagering.
- Each NFL week, the user must pick **every game on the slate**. Partial entries are blocked — an entry is not submitted, scored, or ranked unless all 32 picks are in before lock. Picks still autosave as they're made, so a user can come back across several sessions, but an incomplete set at Thursday 4PM ET simply doesn't count for that week.
- Two picks per game:
  - **Moneyline** — which team wins outright.
  - **Spread** — which team covers.
- A perfect week (all moneylines + all spreads correct) wins the prize, initially $1,000, fronted by the operators.
- Season-long leaderboard tracks cumulative correct picks so people who bust in Week 1 still have a reason to come back.

The engagement model is Beat the Streak (MLB): the jackpot is functionally unwinnable, but the near-miss is the product. "You had 29 of 32 going into Sunday night" is the thing people screenshot and send to their group chat.

---

## 2. Prize risk math

A typical NFL week has ~16 games, so a full entry is **32 picks**.

| Format | Assumed hit rate | Odds of a perfect week |
|---|---|---|
| Spread only | 50% (coin flip) | ~1 in 65,536 |
| Spread only | 53% (sharp bettor) | ~1 in 25,800 |
| Moneyline only | 66% (favorites win outright) | ~1 in 771 |
| **Moneyline + spread** | **66% / 53%** | **~1 in 19,900,000** |
| Spread + over/under | 53% / 53% | ~1 in 665,500,000 |

**Moneyline + spread is the chosen format.** Reasoning:

- Moneyline picks feel *winnable* — most users will get 12–14 of 16 right, which is psychologically rewarding and keeps them engaged.
- The spread layer is what makes it hard, and it's the layer that produces heartbreak near-misses.
- ~1 in 20 million per entry means even at 10,000 weekly entries across an 18-week season, expected payouts are under $10. The prize is safe.
- Over/unders were considered and rejected: they push odds to ~1 in 665 million, which is *needlessly* unwinnable and makes the game feel like a lottery rather than a skill contest. They also double the tap count per game, which hurts completion rate.

Keep these constants configurable so the prize can be raised later without a code change.

**Multiple winners split the prize evenly.** If three people go perfect, that's $333.33 each, not $3,000. This caps operator liability at exactly the posted prize regardless of entry volume, and it needs to be stated plainly in the Official Rules — split-vs-duplicate is one of the things sweepstakes rules are required to spell out.

---

## 3. Stack

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- **Backend / DB / Auth:** Supabase (Postgres, Auth, Row Level Security, Edge Functions)
- **Hosting:** Vercel
- **Odds + scores feed:** **FanDuel lines**, pulled just after midnight ET once Monday Night Football is final. FanDuel does not publish a public odds API, so source these through an aggregator that carries FanDuel as a named bookmaker — The Odds API exposes a `bookmakers=fanduel` filter and is the recommended route. Abstract the whole thing behind a single `lib/oddsProvider.ts` module so the aggregator can be swapped without touching the rest of the app.

Store which book the line came from on the `games` row. If FanDuel is unavailable for a given game, do **not** silently substitute another book — an entry graded against a line the user never saw is the worst possible failure mode here.

Mobile is the primary target — most picks will be made on a phone. Build mobile-first; desktop is the secondary layout, not the other way around. A native iOS app is a later phase, so keep business logic in Supabase (RPC functions / Edge Functions) rather than in the Next.js layer where possible.

---

## 4. Data model

All tables live in the `public` schema with RLS enabled.

### `profiles`
Extends Supabase `auth.users`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | FK → `auth.users.id` |
| `display_name` | text | Unique, shown on leaderboards |
| `avatar_url` | text | Nullable |
| `terms_version` | text | Version string of the rules they accepted, e.g. `2026-08-01` |
| `terms_accepted_at` | timestamptz | |
| `created_at` | timestamptz | |

RLS: anyone authenticated can read; users can only update their own row.

Store the accepted version string, not a boolean. If the rules change mid-season you need to know who agreed to what, and a boolean can't tell you.

### `teams`
Reference data for the context shown on each pick card. Refreshed by `sync-slate` each week.

| Column | Type | Notes |
|---|---|---|
| `abbr` | text PK | e.g. `CIN` |
| `name` | text | Full name |
| `primary_color` | text | Hex, used for the accent bar on tap targets |
| `wins` / `losses` / `ties` | int | Current season record |
| `ppg` | numeric | Points per game |
| `papg` | numeric | Points allowed per game |
| `updated_through_week` | int | So stale stats are detectable |

Publicly readable, service-role writable only.

### `weeks`
Controls the entry window. Do not derive this from game times — it needs to be manually lockable.

**Entry window is fixed: picks open Tuesday and lock Thursday at 4:00 PM Eastern.** The whole slate locks at once, including Sunday and Monday games. Store `locks_at` in UTC but compute it from `America/New_York` so it tracks the DST shift in early November — a hardcoded UTC offset will be an hour wrong for the back half of the season.

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `season` | int | e.g. 2026 |
| `week_number` | int | 1–18 |
| `locks_at` | timestamptz | Thursday 4:00 PM ET, computed from `America/New_York` |
| `status` | enum | `upcoming` / `open` / `locked` / `scored` |

### `games`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `week_id` | int | FK → `weeks.id` |
| `external_id` | text | Provider's game ID, for feed reconciliation |
| `home_team` | text | Team abbreviation, e.g. `CIN` |
| `away_team` | text | |
| `kickoff_at` | timestamptz | |
| `spread` | numeric | Home team's line, e.g. `-3.5`. Negative = home favored |
| `moneyline_home` | int | American odds |
| `moneyline_away` | int | |
| `home_score` | int | Nullable until final |
| `away_score` | int | Nullable until final |
| `status` | enum | `scheduled` / `in_progress` / `final` |

**Lock the spread at week open.** Once `weeks.status` flips to `locked`, `spread` must never be rewritten by the feed, or you'll retroactively change what people picked against.

Use half-point spreads wherever the provider offers them to avoid pushes. If a whole-number spread produces a push, count it as **correct** for the user — generous, and it avoids arguments.

### `picks`
One row per user per game.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | FK → `profiles.id` |
| `game_id` | uuid | FK → `games.id` |
| `moneyline_pick` | text | Team abbreviation |
| `spread_pick` | text | Team abbreviation |
| `moneyline_correct` | boolean | Null until scored |
| `spread_correct` | boolean | Null until scored |
| `created_at` / `updated_at` | timestamptz | |

Unique constraint on `(user_id, game_id)`.

RLS is the critical piece here: **users can only read their own picks until `weeks.status = 'locked'`.** After lock, picks become publicly readable so friends can compare. Writes are only permitted while the parent week is `open`.

### `entries`
Denormalized per-user-per-week summary. This is what powers the leaderboard — don't recompute from `picks` on page load.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `week_id` | int | |
| `picks_made` | int | |
| `picks_possible` | int | `games in week × 2` |
| `correct_count` | int | |
| `is_complete` | boolean | Did they pick every game |
| `is_alive` | boolean | Still perfect so far this week |
| `is_perfect` | boolean | Set at final scoring |

Unique constraint on `(user_id, week_id)`.

### `groups` and `group_members`
Private friend leagues.

`groups`: `id`, `name`, `join_code` (short, uppercase, unique), `owner_id`, `created_at`.

`group_members`: `group_id`, `user_id`, `joined_at`. Composite PK.

Users can belong to multiple groups. A group leaderboard is just an `entries` query filtered by member IDs.

### `season_standings`
A **materialized view** summing `entries` per user per season: total correct, weeks played, best week, perfect weeks. Refresh it at the end of the scoring job, not on read.

Sort order: total correct descending, then **weeks played descending** as the tiebreak, then earliest signup. Since incomplete weeks never produce an entry row, weeks played is a clean measure of how often someone actually showed up — the tiebreak rewards consistency over a hot streak.

---

## 5. Scoring pipeline

Three scheduled Supabase Edge Functions:

1. **`sync-slate`** — runs at 12:00 AM ET Tuesday, after Monday Night Football goes final. Pulls the upcoming week's games, FanDuel spreads, and FanDuel moneylines. Creates the `weeks` row and `games` rows. Sets week status to `open` **only if every game on the slate has a complete line**.

   FanDuel often doesn't post full Week N+1 numbers the instant MNF ends, so this will sometimes come back short. Handle it: retry hourly until the slate is complete, and leave the week in `upcoming` until it is. Never open a week with partial lines and never publish a placeholder number — a line that changes after someone picks against it is a broken promise.

2. **`lock-week`** — runs Thursday at 4:00 PM ET. Flips week status to `locked`. Freezes lines. Creates `entries` rows **only for users with a complete set of 32 picks**. Incomplete pickers get no entry row and don't appear on that week's leaderboard at all; their orphaned `picks` rows stay in the table for their own history view but are never scored.

3. **`score-games`** — runs every 10 minutes from first kickoff through Monday night. For each game now `final`:
   - Set `moneyline_correct` — did the picked team win outright. Ties: both picks count correct.
   - Set `spread_correct` — apply `spread` to the home score, compare. Pushes count correct.
   - Recompute affected `entries`: bump `correct_count`, set `is_alive = false` on any miss.
   - When every game in the week is final: set `is_perfect`, flip week to `scored`, refresh `season_standings`.

Scoring must be **idempotent** — the job will re-run over already-final games and must not double-count.

Winner detection is a flag, not an automatic payout. If `is_perfect` is ever true, alert the operators and handle the prize manually.

---

## 6. Screens

### Make Picks (the core screen)
**One game at a time, full screen.** The user sees a single game card, makes both picks, and the deck advances to the next game. Sixteen cards, done in about ninety seconds. This beats a long scroll because it removes the choice of where to look — every screen asks exactly one thing, and finishing feels like progress rather than paperwork.

**The card.** Each team gets a horizontal band with:

- Team abbreviation, set large in the condensed display face — the thing the eye lands on.
- Record, PPG, and points allowed per game, in the muted utility face beneath. Three numbers, no more.
- A 3px left border in the team's primary color.

Below the two bands, two rows of tap targets:

- **Moneyline** — pick the winner. Show each side's American odds.
- **Spread** — pick who covers. Show each side's line, e.g. `CIN -3.5` / `BAL +3.5`.

Present the stats flat, with no highlighting of which team is "better." Any visual nudge toward a side is the app making the pick, and users will notice and resent it when it's wrong.

**Advancing.** The card advances automatically about 250ms after both picks are made — long enough to see the selection register, short enough to feel fast. Swipe left/right also works for people who want to move manually, but **do not make swipe the pick gesture.** Swiping to choose a side is the Tinder pattern and it's wrong here: there are two independent decisions per game, mis-swipes are easy, and an accidental pick in a must-be-perfect contest is infuriating. Swipe navigates; taps decide.

**Back button.** Persistent, top-left, and it returns to the previous card with both picks still selected and changeable. Also allow tapping any dot on the progress indicator to jump straight to that game.

**Progress.** A slim segmented bar across the top — sixteen segments, filled as each game is completed. Under it, `Game 7 of 16` and the countdown to Thursday 4:00 PM ET lock.

**Review screen.** After the last card, show all sixteen games as a compact scrollable summary: matchup, both picks, one line each. Tap any row to jump back and change it. This step is not optional — partial entries are blocked, so the user needs one unambiguous place to confirm all 32 picks are in before the **Lock in picks** button is enabled. The confirmation state that follows leads with Share.

Picks autosave to Supabase as they're made, so a user can close the tab at game 9 and resume there.

Games that have already kicked off render disabled and dimmed with the pick shown.

**Waiting-for-lines state.** If the week is still `upcoming` because FanDuel hasn't posted the full slate, this screen shows the waiting state instead of the cards: a headline like **"Week 4 lines drop Tuesday morning"**, the sub-line "FanDuel hasn't posted every game yet. Check back in the morning," and the user's season standing underneath so the screen isn't a dead end. Offer a one-tap "Text me when picks open" toggle. Poll or subscribe via Realtime so the cards appear without a manual refresh.

### My Week (live)
Same card layout, but each pick is now green, red, or pending. A prominent header: **"You're 18 of 20 — still alive"** or **"Busted in the 1pm window."** This is the screen people sit on during Sunday afternoon, so it should update live via Supabase Realtime.

### Leaderboard
Tabs: **This Week**, **Season**, **My Groups**.

This Week and Season show the top 25 publicly, plus a pinned row showing the current user's own rank wherever they sit. My Groups shows the same data scoped to a group, with a join-by-code input and a share sheet for the code.

### My Picks / History
Week selector, showing past weeks with the full card grid and results. Season summary at the top: total correct, best week, current rank.

### Onboarding
Target: **under 20 seconds, two taps for most people.**

1. **Continue with Google** as the primary, visually dominant action, via Supabase Auth's Google OAuth provider. Email magic link sits below it as a secondary option — no passwords anywhere in the product, which removes password reset, strength rules, and a whole class of support requests.
2. **Display name**, prefilled from the Google profile so most users just tap through. Validate uniqueness inline, suggest an alternative on collision rather than throwing an error.
3. Land directly on Make Picks. A group code can be entered later from the Leaderboard tab — don't put it in the signup path, it's a step most people don't need.

**Terms acceptance** happens on the same screen as the display name, as a single required checkbox: "I agree to the Official Rules and Terms." Both link out and open in place without losing signup state. The checkbox must be unchecked by default and the continue button disabled until it's ticked — pre-ticked consent isn't valid consent in several jurisdictions.

On acceptance, write `terms_version` and `terms_accepted_at` to the profile. If the rules are ever updated, re-prompt on next sign-in with a short diff of what changed rather than silently rolling the version.

Don't ask for anything else. No age gate beyond what the rules require, no marketing opt-in, no onboarding tour. Someone arriving from a group text should be picking games before they reconsider.

---

## 7. Sharing and mobile

Sharing is not a Phase 3 nice-to-have. It is the growth engine, and it should be built into the core loop from the first version. The model is Wordle and Daily Dozen: a result you can paste straight into a group text, that renders correctly in iMessage without an image, and that means nothing to someone who hasn't played — which is exactly what makes them ask what it is.

### The share payload

Plain text with an emoji grid. **No image generation, no hosting, no permissions, no load time.** Text pastes into iMessage, WhatsApp, Slack, and Instagram DMs identically and always works.

Results share:

```
Perfect Sunday — Week 3
🟩🟩🟩🟩🟥🟩🟩🟩
🟩🟩🟩🟩🟩🟩🟩🟩  moneyline
🟩🟩🟥🟩🟩🟩🟩🟩
🟩🟩🟩🟩🟩🟥🟩🟩  spread
29/32 — busted in the 4:25
perfectsunday.app
```

Rules for the grid: eight squares per line so it never wraps on a narrow phone. Moneyline block first, spread block second. Games in kickoff order, so two people comparing grids are looking at the same games in the same positions — that's what makes "which one did you miss?" work. Use ⬜ for games not yet played so a mid-Sunday share still reads correctly.

Picks share (pre-lock) is different: it is *not* the grid. A results grid is self-evident — green and red squares carry their own drama — but a pre-lock grid of team abbreviations means nothing to a first-time recipient, and the picks share is the one most likely to land in front of someone who has never played. It reads as one plain line per game with the real numbers, framed by the stakes, so every line is something a recipient can argue with — and the argument is the growth loop. *(Amended 2026-08-25; the original spec had the picks share reuse the grid shape.)*

```
Perfect Sunday — Week 3
My 32 picks. Every one has to hit.
Perfect week wins $1,000.

DAL @ NYG — NYG +3.5 · Over 45.5
NYJ @ BUF — BUF -9.5 · Under 38.5
…one line per game, kickoff order…

Fade me or beat me. Free to play:
perfectsunday.app
```

### Where the share button lives

- **After locking in picks** — the confirmation state's primary action is Share, not Done.
- **On My Week**, persistently, so a live share is one tap during the games.
- **On the busted state**, most prominently of all. A near-miss is the most shareable moment the product has and the copy should lean into it: "29 of 32. Show someone."

Use the Web Share API (`navigator.share`) where available so it opens the native iOS share sheet directly into Messages. Fall back to clipboard copy with a "Copied" toast on desktop.

Every share includes the bare domain. No UTM parameters, no tracking links — they look like spam in a group chat and get stripped or ignored.

### Mobile specifics

Assume every user is one-handed on a phone, and that a meaningful share of them arrive from a link in a group text.

- Tap targets minimum 44×44pt. The pick buttons should be considerably bigger than that — a full card row each.
- Nothing depends on hover. Selected state must be legible from arm's length.
- The sticky footer respects `env(safe-area-inset-bottom)` so it clears the home indicator.
- Whole week fits in one continuous scroll with no pagination and no horizontal scroll.
- Ship a web app manifest and icons so "Add to Home Screen" produces something that looks native. This is most of the value of an app at none of the cost, and it should happen in Phase 1.
- A shared link opens straight to the relevant screen, not a marketing page. If the visitor isn't signed in, show the week's games behind a lightweight sign-up prompt — let them see what they'd be playing before asking for an email.

---

## 8. Visual direction

Dark by default. Sports products read better dark, and it lets the result states carry the color without competing with the chrome.

**Palette** — build these as Tailwind CSS variables:

| Token | Value | Use |
|---|---|---|
| `bg` | `#0B0D10` | Page background |
| `surface` | `#15181D` | Cards |
| `surface-raised` | `#1E232A` | Selected pick state |
| `border` | `#272D35` | Hairlines |
| `text` | `#F2F4F7` | Primary |
| `text-muted` | `#8A929E` | Lines, labels, timestamps |
| `accent` | `#F5C518` | Brand — buttons, active states, the "still alive" flame |
| `correct` | `#2FBF71` | Correct pick only |
| `wrong` | `#E5484D` | Wrong pick only |

**Green and red are reserved exclusively for pick outcomes.** Never use them for buttons, links, or decoration. Their only job is to mean right or wrong, and that meaning has to stay uncontaminated.

**Type:** a condensed grotesque for team abbreviations and numbers — team codes should be set large, bold, and tight, because they're the thing the eye scans. Something like Archivo Condensed or Oswald for display, Inter for body and UI. Numbers should be tabular so lines and scores don't jitter.

**Surface treatment:** flat. No gradients, no drop shadows, no glassmorphism. Depth comes from the background/surface value gap and hairline borders only. Border radius consistent at 12px on cards, 8px on tap targets.

**Motion:** almost none, with one exception. Pick selection gets a fast 120ms state change, nothing fancy. But when a card resolves during a live week, it flips to green or red with a single brief pulse. That's the signature moment of the product — the whole app exists so people can watch that happen 32 times. Everything else stays still so it lands. Respect `prefers-reduced-motion`.

**Team marks:** real team logos make the product feel legitimate immediately, but NFL marks are licensed and you should not ship them without clearing it. Ship on **team wordmarks in the condensed display face, with each team's primary color as a 3px left border on its tap target.** This looks deliberate rather than like a placeholder, and it sidesteps the licensing question entirely.

**Copy:** plain and active. "Lock in picks," not "Submit entry." The empty state before Week 1 says what to do, not that there's nothing here. A busted week says "Busted — 27 of 32" and immediately shows the season standing, because that's the reason to come back.

---

## 9. Legal

Not a blocker for a friends-and-family test, but handle before any public launch:

- Free entry with no purchase necessary keeps this a **sweepstakes**, not gambling — but sweepstakes law is state-by-state and some states have registration and bonding requirements above certain prize values.
- Publish **Official Rules** before anyone can enter: eligibility, entry period, how a winner is determined, tie-breaking, prize value, odds disclosure, sponsor identity.
- Run the entity through the LLC and get a lawyer to review the rules before scaling past the friend group or taking sponsor money.
- Never accept payment for entries, and never make the prize contingent on entry volume.

Put a link to the rules in the footer from day one, and keep the per-user acceptance record (`terms_version`, `terms_accepted_at`) — if a prize is ever disputed, proof that the winner agreed to a specific version of the rules is the thing you'll want.

---

## 10. Build order

**Phase 1 — playable**
Supabase project, schema, RLS policies. Google OAuth + magic link, display name, terms gate. Manual slate entry via SQL. The one-card-at-a-time pick deck with autosave, back navigation, and the review screen. Manual scoring. Web app manifest and Add to Home Screen. Text share of picks.

**Phase 2 — automated**
FanDuel line pull via aggregator. The three scheduled functions and the waiting-for-lines state. My Week live screen. Weekly leaderboard. Emoji-grid results share. Thursday-morning nudge to anyone with an incomplete set — with partial entries blocked, this is the highest-value retention feature in the build.

**Phase 3 — social**
Groups and join codes. Season leaderboard and materialized view. My Picks history. Group-chat-friendly group invite flow.

**Phase 4 — scale**
Sponsor slots. Prize escalation. React Native / iOS app against the same Supabase backend.

---

## Open decisions

- Which aggregator carries FanDuel lines most cheaply at expected volume. The Odds API is the working assumption; confirm pricing before Phase 2.

Holiday handling is decided: `weeks.locks_at` defaults to Thursday 4:00 PM ET, but `sync-slate` must override it to 30 minutes before the earliest kickoff whenever a game on the slate starts before 4:00 PM ET. This catches Thanksgiving (12:30 ET), the Christmas Day slate, and any Saturday-heavy late-season week where the schedule shifts. The lock time is always displayed to the user rather than assumed, so an early lock never surprises anyone.
