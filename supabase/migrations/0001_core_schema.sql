-- Perfect Sunday core schema. RLS is enabled on every table here with no
-- policies, which denies all access by default. Policies land in 0002.

create type public.week_status as enum ('upcoming', 'open', 'locked', 'scored');
create type public.game_status as enum ('scheduled', 'in_progress', 'final');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null unique,
  avatar_url text,
  terms_version text,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint profiles_display_name_len
    check (char_length(display_name) between 2 and 24)
);

create table public.teams (
  abbr text primary key,
  name text not null,
  primary_color text not null,
  wins int not null default 0,
  losses int not null default 0,
  ties int not null default 0,
  ppg numeric(4, 1),
  papg numeric(4, 1),
  updated_through_week int,
  constraint teams_abbr_fmt
    check (abbr = upper(abbr) and char_length(abbr) between 2 and 4),
  constraint teams_color_fmt
    check (primary_color ~ '^#[0-9A-Fa-f]{6}$')
);

create table public.weeks (
  id int generated always as identity primary key,
  season int not null,
  week_number int not null,
  locks_at timestamptz not null,
  status public.week_status not null default 'upcoming',
  created_at timestamptz not null default now(),
  unique (season, week_number),
  constraint weeks_week_number_range check (week_number between 1 and 18)
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  week_id int not null references public.weeks (id) on delete cascade,
  external_id text,
  home_team text not null references public.teams (abbr),
  away_team text not null references public.teams (abbr),
  kickoff_at timestamptz not null,
  spread numeric(4, 1),
  moneyline_home int,
  moneyline_away int,
  line_source text,
  home_score int,
  away_score int,
  status public.game_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  constraint games_teams_differ check (home_team <> away_team),
  unique (week_id, external_id)
);

create table public.picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  moneyline_pick text references public.teams (abbr),
  spread_pick text references public.teams (abbr),
  moneyline_correct boolean,
  spread_correct boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_id)
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_id int not null references public.weeks (id) on delete cascade,
  picks_made int not null default 0,
  picks_possible int not null default 0,
  correct_count int not null default 0,
  is_complete boolean not null default false,
  is_alive boolean not null default true,
  is_perfect boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_id)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint groups_join_code_fmt
    check (join_code = upper(join_code) and char_length(join_code) between 4 and 8)
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index games_week_id_idx on public.games (week_id);
create index games_kickoff_at_idx on public.games (kickoff_at);
create index picks_user_id_idx on public.picks (user_id);
create index picks_game_id_idx on public.picks (game_id);
create index entries_week_id_idx on public.entries (week_id);
create index entries_user_id_idx on public.entries (user_id);
create index group_members_user_id_idx on public.group_members (user_id);
create index groups_owner_id_idx on public.groups (owner_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger picks_set_updated_at
  before update on public.picks
  for each row execute function public.set_updated_at();

create trigger entries_set_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.weeks enable row level security;
alter table public.games enable row level security;
alter table public.picks enable row level security;
alter table public.entries enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
