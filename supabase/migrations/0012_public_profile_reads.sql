-- The weekly leaderboard is public: a friend opens a shared link and sees the
-- standings without an account. Entries are already anon-readable
-- (entries_select_public), but profiles are not, so a signed-out visitor would
-- see a board of scores with no names on it.
--
-- The policy grants the rows. RLS is deny-by-default, so nothing is visible
-- without it. The column grant narrows which columns come back, which RLS
-- cannot express — the same two-part mechanism that stops a user marking their
-- own picks correct.
--
-- The cost, stated rather than buried: this makes every display name
-- world-readable and enumerable by anyone holding the publishable key, which
-- ships in the build. There is no email, password, or personal data in
-- profiles, but a display name is a handle a person chose. That is the
-- deliberate price of a board that works without an account.

create policy profiles_select_public on public.profiles
  for select to anon using (true);

revoke select on public.profiles from anon;
grant select (id, display_name, avatar_url) on public.profiles to anon;
