# Perfect Sunday — Email canonicalization at profile creation

Design for stopping one person from holding several entries by signing up with
aliases of a single mailbox. Companion to [SPEC.md](../../SPEC.md). Where this
document and SPEC.md conflict, this one wins.

Migration number: **0017**. Nothing here changes the auth flow — sign-in stays
magic link, unchanged.

## 1. Why now

The prize is a perfect week and entry is free, so a user with five addresses
holds five lottery tickets. The cheapest way to get them is not five Gmail
accounts, it is one:

```
sam@gmail.com   sam+1@gmail.com   sam+week2@gmail.com   s.a.m@gmail.com
```

Gmail delivers all four to the same inbox. It costs nothing, takes seconds, and
needs no setup. That is the entire realistic threat for a proof of concept, and
it is closable server-side without touching how anyone signs in.

Two things this deliberately does **not** try to be:

- It is not a defence against someone registering genuinely new mailboxes. That
  needs an identity with a real-world cost attached — a phone number — and is a
  separate, much larger piece of work.
- It is not a fraud control. A perfect week across `games × 2` picks is roughly
  a 1-in-2²⁸ event. Duplicate entries barely move the odds the prize is ever
  paid. What they wreck is **leaderboard integrity** — the board is the product,
  and a board with one person on it four times is not worth reading.

Sizing the harm that way is what argues for this fix over the expensive ones.

## 2. Decisions

| Question | Decision | Cost accepted |
|---|---|---|
| Where is it enforced? | **At `profiles` insert**, by trigger. | Junk `auth.users` rows still accumulate for blocked signups. See §3. |
| Where is the canonical form kept? | **`private.email_identities`**, a new table. Never on `profiles`. | One more table. Preserves 0012's stated invariant — see §6. |
| Plaintext or hash? | **Salted SHA-256.** Salt generated at migration time, stored in the database, never in the repo. | The table is not human-readable, so operator debugging needs a query, not a glance. |
| Strip `+tag`? | **On every domain.** | A domain where two real people differ only by a `+tag` would be falsely merged. Vanishingly rare; recoverable per §9. |
| Strip dots? | **Gmail and Googlemail only.** | Misses any other provider that ignores dots. No provider in common use does. |
| Existing duplicates? | **Grandfathered, not evicted.** | Anyone who already doubled up keeps both accounts. |

## 3. Why `profiles` insert is the right chokepoint

Both `picks.user_id` and `entries.user_id` are foreign keys to
`public.profiles (id)` (`0001_core_schema.sql:66,79`). So a user with no profile
row cannot store a pick — **the database refuses it**, regardless of what the
client does. `landingRoute` sending a profile-less user to `/welcome`
(`src/lib/profile.ts:29`) is the UI reflection of a constraint that already
holds underneath.

That makes profile creation as strong an enforcement point as signup itself,
and it has one decisive advantage: it is **reachable from a migration alone**.
No dashboard access, no auth hook configuration, no Edge Function, no server.
Given the project is a static export with no backend, that matters.

The accepted cost: a blocked user still leaves an `auth.users` row behind, since
Supabase creates the account before they ever reach `/welcome`. Those rows are
inert — no profile, no picks, no entry, invisible to every screen. They are
litter, not a hole. Sweeping them is optional operator hygiene.

## 4. The migration

All functions live in `private`, following the precedent set by 0003: PostgREST
exposes `public` only, so nothing here is reachable as an RPC endpoint. Every
function sets `search_path = ''` and schema-qualifies its references, matching
the same migration's hardening.

No extensions are required. `sha256()` and `gen_random_uuid()` are both core
Postgres, so this does not depend on `pgcrypto` being enabled.

**This SQL has been run.** Every statement in §4 was applied to a scratch
PostgreSQL 16 cluster against a stand-in for the `auth.users` and
`public.profiles` shapes this repo defines, and the whole of §8 was executed
against it. Results are recorded in §8. What that does *not* cover is
Supabase-specific behaviour — PostgREST error mapping (§5) and the state of the
live database (§4.5).

### 4.1 Canonicalization

```sql
create or replace function private.canonical_email(p_email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  addr        text := lower(btrim(p_email));
  local_part  text;
  domain_part text;
  at_pos      int;
begin
  if addr is null or addr = '' or position('@' in addr) = 0 then
    return null;
  end if;

  -- Split on the LAST '@'. The local part may legally contain one; the domain
  -- may not.
  at_pos := length(addr) - position('@' in reverse(addr)) + 1;
  if at_pos < 2 or at_pos = length(addr) then
    return null;
  end if;

  local_part  := substring(addr from 1 for at_pos - 1);
  domain_part := substring(addr from at_pos + 1);

  if domain_part = 'googlemail.com' then
    domain_part := 'gmail.com';
  end if;

  -- Everything from the first '+' is a user-chosen tag, not part of the address.
  if position('+' in local_part) > 0 then
    local_part := split_part(local_part, '+', 1);
  end if;

  -- Gmail ignores dots in the local part. Other providers do not.
  if domain_part = 'gmail.com' then
    local_part := replace(local_part, '.', '');
  end if;

  if local_part = '' then
    return null;
  end if;

  return local_part || '@' || domain_part;
end;
$$;
```

Lowercasing the local part is technically stricter than RFC 5321, which permits
case-sensitive local parts. No mail provider in use treats them that way, and
the alternative — letting `Sam@` and `sam@` be different entries — is exactly
the hole being closed.

### 4.2 Storage

```sql
create table private.identity_salt (
  id   boolean primary key default true,
  salt text not null,
  constraint identity_salt_single_row check (id)
);

insert into private.identity_salt (salt)
values (gen_random_uuid()::text || gen_random_uuid()::text)
on conflict (id) do nothing;

create table private.email_identities (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email_hash text not null unique,
  created_at timestamptz not null default now()
);

alter table private.identity_salt    enable row level security;
alter table private.email_identities enable row level security;

revoke all on table private.identity_salt    from anon, authenticated;
revoke all on table private.email_identities from anon, authenticated;
```

Neither table gets a policy. RLS is deny-by-default, so with none defined
nothing is readable — and because they sit in `private`, PostgREST has no route
to them in the first place. Both belts are deliberate.

`on delete cascade` means deleting a user frees their canonical address for
re-registration. There is no self-serve account deletion in the app and
`profiles` has no delete policy, so this is an operator-only action — and it is
the behaviour you want when an operator removes an account in error.

### 4.3 Hash

```sql
create or replace function private.email_hash(p_email text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  canonical text := private.canonical_email(p_email);
  s         text;
begin
  if canonical is null then
    return null;
  end if;
  select salt into s from private.identity_salt limit 1;
  return pg_catalog.encode(pg_catalog.sha256((s || canonical)::bytea), 'hex');
end;
$$;
```

**What the salt buys, stated honestly.** It defeats a precomputed lookup and it
stops anyone holding the table alone from testing "is this person playing?"
against a candidate list. It does **not** defend against a full database
compromise, because the salt lives in the same database. The load-bearing
control is that the table is unreachable through PostgREST; the hash is
insurance on top of it.

**Never rotate the salt.** These hashes are a uniqueness key, not a credential.
Rotating invalidates every stored value at once and silently reopens the hole.

### 4.4 Trigger

```sql
create or replace function private.claim_email_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  addr text;
  hash text;
begin
  select u.email into addr from auth.users u where u.id = new.id;

  if addr is null or addr = '' then
    raise exception 'no email address on the account creating this profile'
      using errcode = 'PS002';
  end if;

  hash := private.email_hash(addr);
  if hash is null then
    raise exception 'unusable email address' using errcode = 'PS002';
  end if;

  begin
    insert into private.email_identities (user_id, email_hash)
    values (new.id, hash);
  exception
    when unique_violation then
      raise exception 'an account already exists for this email address'
        using errcode = 'PS001';
  end;

  return new;
end;
$$;

create trigger profiles_claim_email_identity
  before insert on public.profiles
  for each row execute function private.claim_email_identity();
```

The email is read from `auth.users` rather than from the JWT claim, so the check
cannot be influenced by anything the client sends.

**The custom SQLSTATE is load-bearing.** A plain unique violation would surface
as `23505`, which `createProfile` already maps to `"TAKEN"` — a duplicate email
would render as "display name taken" and be impossible to debug. `PS001` and
`PS002` are in a class Postgres does not use, so they pass through cleanly.

`PS002` covers a profile created by an account with no usable email. It cannot
happen on the magic-link path, where an email is mandatory. It exists so that
adding phone or OAuth signup later fails loudly instead of silently skipping the
check.

### 4.5 Backfill

Backfill after the constraint exists, tolerating collisions rather than failing:

```sql
insert into private.email_identities (user_id, email_hash)
select p.id, private.email_hash(u.email)
from public.profiles p
join auth.users u on u.id = p.id
where private.email_hash(u.email) is not null
on conflict do nothing;
```

Then find who was grandfathered:

```sql
select p.display_name, p.id
from public.profiles p
left join private.email_identities e on e.user_id = p.id
where e.user_id is null;
```

Every name this returns is an existing account that collides with another
existing account. They keep working — the trigger only fires on insert. Decide
per name whether to leave it, and note that removing one frees that address.

> **Unverified.** This session could not query the live database (see §11), so
> how many existing accounts collide is unknown. Run the second query
> immediately after the migration and read the result before assuming zero.

## 5. Client changes

Two files, both small. Neither is required for the migration to work — they
exist so the failure reads as a sentence instead of a Postgres string.

**`src/lib/profile.ts`** — `createProfile` currently maps `23505` to `"TAKEN"`.
Add the new code alongside it:

```ts
if (error.code === "PS001") throw new Error("DUPLICATE_EMAIL");
if (error.code === "23505") throw new Error("TAKEN");
```

**`src/app/welcome/page.tsx`** — `submit` branches on `"TAKEN"` already
(`:82`). Add a sibling branch that routes `"DUPLICATE_EMAIL"` to `setError`
rather than to the display-name status line, since it is not a name problem:

> There is already an account for this email address. Sign in with the address
> you used the first time.

That wording is deliberate. It does not explain the aliasing rule — someone
determined will work it out, and everyone else just reads a sentence that makes
sense.

**Verify before relying on it:** that `error.code` arrives as `"PS001"` through
PostgREST and supabase-js. PostgREST returns the SQLSTATE in the response body's
`code` field, so it should. If it does not, match on the message string instead
and keep the message text stable.

**Do not port the canonicalization to TypeScript.** A second implementation for
a friendlier pre-check will drift from the first, and the drift will always
favour the attacker. The database is the only place this rule exists.

## 6. Why not a column on `profiles`

Migration 0012 made `profiles` world-readable and justified it in the file:

> There is no email, password, or personal data in profiles, but a display name
> is a handle a person chose. That is the deliberate price of a board that works
> without an account.

Putting a canonical email on that table — hashed or not — makes that sentence
false and leaks whether a given address plays, to anyone holding the publishable
key. The separate table in `private` keeps 0012's claim accurate, which matters
because it is the stated basis for the public leaderboard.

## 7. Deployment order

`supabase/OPERATIONS.md` records the rule and the incident behind it: migrations
are applied by hand, the frontend deploys automatically on push to `main`, and
**the frontend always wins the race.**

This change is safe in both directions, which is unusual — but the order still
matters:

1. **Apply 0017 first.** The deployed client does not know `PS001`, so a blocked
   duplicate falls through to `throw new Error(error.message)` and shows the raw
   database message. Ugly, correct, not fatal.
2. **Merge the client change second.** Before the migration exists, the new
   branch is simply never taken.

Enforcement begins the moment the migration lands, so apply it when you can
merge the client soon after — not weeks before.

## 8. Testing

New file `supabase/tests/identity.sql`, following the style of `rls.sql`: each
test sets a role and a JWT claim, asserts the deny case, and rolls back.

**All of the following were run and passed** on PostgreSQL 16.13 against the
§4 SQL. The table below is the specification; it is also the record of a green
run. Re-running it against Supabase is still worth doing, since the harness
stubbed `auth.users` rather than using the real one.

| # | Test | Expect |
|---|---|---|
| 1 | `canonical_email` over a case table | see below |
| 2 | Second profile from `sam+1@gmail.com` after `sam@gmail.com` | ERROR `PS001` |
| 3 | Second profile from `s.a.m@gmail.com` after `sam@gmail.com` | ERROR `PS001` |
| 4 | Second profile from a genuinely different address | PASS |
| 5 | `authenticated` reads `private.email_identities` | ERROR 42501 |
| 6 | `anon` reads `private.email_identities` | ERROR 42501 |
| 7 | `authenticated` reads `private.identity_salt` | ERROR 42501 |
| 8 | Profile created by an account with **no** email | ERROR `PS002` |
| 9 | Duplicate **display name** still reports `23505`, not `PS001` | ERROR 23505 |
| 10 | After §9's delete, the previously blocked user can register | PASS |

Tests 5–7 are the ones that must never be dropped. They are what keep §6 true.

Test 9 earns its place: it is the assertion that the two failure modes
`/welcome` has to tell apart stay distinguishable. Without the custom SQLSTATE
of §4.4 a duplicate email would surface as `23505` and render as “display name
taken”. It passed on the run above.

Canonicalization cases for test 1:

| Input | Expected |
|---|---|
| `sam@gmail.com` | `sam@gmail.com` |
| `SAM@Gmail.com` | `sam@gmail.com` |
| `s.a.m@gmail.com` | `sam@gmail.com` |
| `sam+week3@gmail.com` | `sam@gmail.com` |
| `s.am+x@googlemail.com` | `sam@gmail.com` |
| `s.a.m@fastmail.com` | `s.a.m@fastmail.com` — dots kept off Gmail |
| `sam+x@fastmail.com` | `sam@fastmail.com` — tag stripped everywhere |
| `sam` | `null` |
| `@gmail.com` | `null` |
| `sam@` | `null` |

Test 4 exists to catch an over-eager future edit to the rules. Without it, a
canonicalizer that collapsed everything to one value would pass every other test
in the table.

## 9. When it gets someone wrong

Two real people on one unusual domain whose addresses differ only by a `+tag`
will collide. The second sees the §5 message and cannot proceed.

The fix needs no migration and no code — delete their row, which frees the
address:

```sql
delete from private.email_identities
where email_hash = private.email_hash('the-address-that-was-blocked@example.com');
```

This is worth a short entry in `supabase/OPERATIONS.md` under the manual steps,
since the operator hitting it will not have this document open.

## 10. Out of scope

- **Disposable-domain blocklist.** The natural follow-on: a domain table checked
  by the same trigger, closing temp-mail services. Deliberately separate — it
  carries an ongoing maintenance burden this does not.
- **Before User Created auth hook.** Would reject at signup with a cleaner error
  and stop the junk `auth.users` rows of §3. Needs dashboard configuration, and
  the docs note the user is not yet in Postgres when it fires, so the unique
  constraint here would remain the real guard regardless. Additive later, not a
  replacement.
- **Invite codes.** Considered and rejected on 2026-08-26: they wall off exactly
  the share loop SPEC.md is built around (`:283`, `:302`, `:317`), and the
  obvious workaround — carrying a code in the shared link — collides with the
  deliberate no-tracking-links rule at `:306`.
- **Phone / SMS signup.** The only thing that raises the cost of a *new*
  identity. Assessed 2026-08-26: small code change, but gated on an SMS provider
  and US A2P 10DLC carrier registration. Revisit before a public launch.
- **VoIP line-type detection.** Needs a server-side lookup this architecture has
  nowhere to put.

## 11. Known issues this work does not fix

- **Fresh mailboxes still work.** A new Gmail account defeats this entirely. The
  bar moves from seconds to minutes, not to impossible.
- **Disposable inboxes still work**, until the blocklist in §10 exists.
- **Two people sharing one address cannot both play.** A real couple with one
  shared mailbox is indistinguishable from one person with two tabs. Accepted;
  recoverable per §9.
- **The `auth.users` litter of §3** accumulates with no cleanup job.
- **Never run against *this* database.** The SQL is tested (§4, §8), but only
  on a scratch PostgreSQL 16 cluster with stubbed `auth.users` and `profiles`
  tables. The pinned Supabase MCP server (`.mcp.json`, ref
  `vockiqvlijtkxvpdttya`) was not usable in the session that wrote this: the
  only Supabase server present was an unpinned account-level one exposing
  `list_projects` / `create_project`, which CLAUDE.md requires stopping on, and
  the pinned entry invokes `cmd /c npx`, which cannot start outside Windows. So
  **how many existing accounts collide is unknown** — run §4.5's report query
  and read it before assuming zero.
