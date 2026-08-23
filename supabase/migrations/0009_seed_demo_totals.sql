-- Totals for the demo slate. Invented like the spreads were — line_source is
-- already 'demo' on every one of these rows. Half-points throughout so a
-- combined score can never land exactly on the number.

update public.games g
set total = v.total, over_odds = v.over_odds, under_odds = v.under_odds
from (values
  ('2025-18-CAR-TB',  44.5, -110, -110),
  ('2025-18-SEA-SF',  42.5, -105, -115),
  ('2025-18-NO-ATL',  41.5, -110, -110),
  ('2025-18-CLE-CIN', 47.5, -115, -105),
  ('2025-18-GB-MIN',  43.5, -110, -110),
  ('2025-18-DAL-NYG', 45.5, -110, -110),
  ('2025-18-TEN-JAX', 40.5, -105, -115),
  ('2025-18-IND-HOU', 44.5, -110, -110),
  ('2025-18-NYJ-BUF', 38.5, -115, -105),
  ('2025-18-DET-CHI', 48.5, -110, -110),
  ('2025-18-MIA-NE',  41.5, -110, -110),
  ('2025-18-WAS-PHI', 46.5, -105, -115),
  ('2025-18-LAC-DEN', 39.5, -110, -110),
  ('2025-18-KC-LV',   42.5, -110, -110),
  ('2025-18-ARI-LAR', 47.5, -115, -105),
  ('2025-18-BAL-PIT', 44.5, -110, -110)
) as v (external_id, total, over_odds, under_odds)
where g.external_id = v.external_id;
