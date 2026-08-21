-- RLS policies. auth.uid() is wrapped in a scalar subquery throughout so the
-- planner evaluates it once per statement rather than once per row.

-- Helper: group membership is checked from inside group_members' own policies,
-- which would recurse. security definer breaks the cycle.
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group_id and m.user_id = auth.uid()
  );
$$;

-- Helper: the status of the week a game belongs to.
create or replace function public.game_week_status(p_game_id uuid)
returns public.week_status
language sql
security definer
set search_path = ''
stable
as $$
  select w.status
  from public.games g
  join public.weeks w on w.id = g.week_id
  where g.id = p_game_id;
$$;

-- profiles: readable by any signed-in user (leaderboards show display names).
-- A user may create and edit only their own row, and may never delete one.
create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Reference and slate data: world-readable so a shared link can show the games
-- before the visitor signs up. Writes are service-role only, which bypasses RLS,
-- so no write policy is defined.
create policy teams_select_public on public.teams
  for select to anon, authenticated using (true);

create policy weeks_select_public on public.weeks
  for select to anon, authenticated using (true);

create policy games_select_public on public.games
  for select to anon, authenticated using (true);

create policy entries_select_public on public.entries
  for select to anon, authenticated using (true);

-- picks: the security-critical table.
-- Own picks are always visible to their owner. Everyone else sees a pick only
-- once its week has locked, which is what stops users copying each other.
create policy picks_select_own on public.picks
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy picks_select_after_lock on public.picks
  for select to anon, authenticated
  using (public.game_week_status(game_id) in ('locked', 'scored'));

-- Writes only to your own picks, and only while the week is open.
create policy picks_insert_own_while_open on public.picks
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.game_week_status(game_id) = 'open'
  );

create policy picks_update_own_while_open on public.picks
  for update to authenticated
  using (
    (select auth.uid()) = user_id
    and public.game_week_status(game_id) = 'open'
  )
  with check (
    (select auth.uid()) = user_id
    and public.game_week_status(game_id) = 'open'
  );

create policy picks_delete_own_while_open on public.picks
  for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and public.game_week_status(game_id) = 'open'
  );

-- RLS cannot express column-level rules, so the grading columns are withheld
-- at the privilege layer instead. Without this a user could mark their own
-- picks correct.
revoke update on public.picks from authenticated;
grant update (moneyline_pick, spread_pick) on public.picks to authenticated;

-- groups: visible to members only; managed by the owner.
create policy groups_select_member on public.groups
  for select to authenticated
  using (public.is_group_member(id));

create policy groups_insert_own on public.groups
  for insert to authenticated with check ((select auth.uid()) = owner_id);

create policy groups_update_owner on public.groups
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy group_members_select_comember on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));

create policy group_members_insert_self on public.group_members
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy group_members_delete_self on public.group_members
  for delete to authenticated using ((select auth.uid()) = user_id);
