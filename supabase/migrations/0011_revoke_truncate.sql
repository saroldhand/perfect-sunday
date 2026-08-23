-- TRUNCATE is not filtered by row-level security. A role holding it can empty
-- a table outright regardless of policy, so the careful per-row rules on picks
-- would count for nothing. PostgREST exposes no route to TRUNCATE today, which
-- is the only reason this was not already a hole — that is a property of the
-- API layer, not of the database, and is the wrong thing to depend on.
--
-- No client role has any use for it.

revoke truncate on all tables in schema public from anon, authenticated;
