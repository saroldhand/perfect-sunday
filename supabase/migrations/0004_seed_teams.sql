-- Reference data for all 32 clubs. primary_color holds each club's true primary
-- brand colour; several of them (Raiders black, Bears navy, Browns brown) are
-- near-black and will not read as an accent against the #0B0D10 page
-- background, so the UI applies a luminance floor at render time rather than
-- this table storing a doctored value.

insert into public.teams (abbr, name, primary_color) values
  ('BUF', 'Buffalo Bills',        '#00338D'),
  ('MIA', 'Miami Dolphins',       '#008E97'),
  ('NE',  'New England Patriots', '#002244'),
  ('NYJ', 'New York Jets',        '#125740'),
  ('BAL', 'Baltimore Ravens',     '#241773'),
  ('CIN', 'Cincinnati Bengals',   '#FB4F14'),
  ('CLE', 'Cleveland Browns',     '#311D00'),
  ('PIT', 'Pittsburgh Steelers',  '#FFB612'),
  ('HOU', 'Houston Texans',       '#03202F'),
  ('IND', 'Indianapolis Colts',   '#002C5F'),
  ('JAX', 'Jacksonville Jaguars', '#006778'),
  ('TEN', 'Tennessee Titans',     '#0C2340'),
  ('DEN', 'Denver Broncos',       '#FB4F14'),
  ('KC',  'Kansas City Chiefs',   '#E31837'),
  ('LV',  'Las Vegas Raiders',    '#000000'),
  ('LAC', 'Los Angeles Chargers', '#0080C6'),
  ('DAL', 'Dallas Cowboys',       '#003594'),
  ('NYG', 'New York Giants',      '#0B2265'),
  ('PHI', 'Philadelphia Eagles',  '#004C54'),
  ('WAS', 'Washington Commanders','#5A1414'),
  ('CHI', 'Chicago Bears',        '#0B162A'),
  ('DET', 'Detroit Lions',        '#0076B6'),
  ('GB',  'Green Bay Packers',    '#203731'),
  ('MIN', 'Minnesota Vikings',    '#4F2683'),
  ('ATL', 'Atlanta Falcons',      '#A71930'),
  ('CAR', 'Carolina Panthers',    '#0085CA'),
  ('NO',  'New Orleans Saints',   '#D3BC8D'),
  ('TB',  'Tampa Bay Buccaneers', '#D50A0A'),
  ('ARI', 'Arizona Cardinals',    '#97233F'),
  ('LAR', 'Los Angeles Rams',     '#003594'),
  ('SF',  'San Francisco 49ers',  '#AA0000'),
  ('SEA', 'Seattle Seahawks',     '#002244')
on conflict (abbr) do update
  set name = excluded.name,
      primary_color = excluded.primary_color;
