-- Supabase grants ALL on every public table to anon and authenticated by
-- default, and RLS is what narrows it. That worked — an anonymous UPDATE of
-- the grading columns is already blocked, because picks has no write policy
-- for anon — but it left the column-level protection resting on a single
-- layer. If anyone ever adds a permissive anon write policy, the table grant
-- would silently be wide open underneath it.
--
-- A signed-out visitor has no reason to write anything: they read teams,
-- weeks, games, entries, and locked picks, and that is all.

revoke insert, update, delete, truncate on all tables in schema public from anon;

-- Same reasoning for the tables authenticated has no business writing.
-- Reference and slate data is service-role only; entries are written by the
-- scoring functions, never by a client.
revoke insert, update, delete, truncate on public.teams from authenticated;
revoke insert, update, delete, truncate on public.weeks from authenticated;
revoke insert, update, delete, truncate on public.games from authenticated;
revoke insert, update, delete, truncate on public.entries from authenticated;
