-- Eenmalige data-invoer: "Competitie dinsdag 5v5 Herfst 2026"
-- Los uit te voeren met:
--   wrangler d1 execute fc-caesar-salad-db --remote --file=schema/data/2026-competitie-dinsdag-5v5-herfst.sql
-- (of --local voor de lokale dev-database)
--
-- Maakt de competitie aan, alle teams (inclusief ons eigen team FC Caesar
-- Salad, gemarkeerd met is_own_team) en het volledige programma met de
-- juiste data/tijden uit het schema. match_date staat in UTC (ISO 8601),
-- net als de rest van de app opslaat — de tijden hieronder komen overeen
-- met de lokale (Europe/Amsterdam) tijden op de poster.

INSERT INTO competitions (name, type, status)
VALUES ('Competitie dinsdag 5v5 Herfst 2026', 'competitie', 'actief');

INSERT INTO teams (name, is_own_team, competition_id) VALUES
  ('FC Caesar Salad', 1, (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026')),
  ('Tettersheriffs', 0, (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026')),
  ('Kaasballen', 0, (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026')),
  ('Team Noord', 0, (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026')),
  ('Berk Weusten', 0, (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026')),
  ('Trust The Process FC', 0, (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026')),
  ('Herren 9', 0, (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026')),
  ('Moustache', 0, (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026')),
  ('Op Papier Sterk', 0, (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026')),
  ('Oudwijkers', 0, (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026'));

-- opponent = de tegenstander van FC Caesar Salad; thuis/uit maakt voor de
-- opslag niet uit (zie functions/api/matches.js: ons team wordt altijd als
-- "thuisteam" administratief bijgehouden, los van de werkelijke ligging).
INSERT INTO matches (match_date, opponent, status, competition_id, phase) VALUES
  ('2026-09-01T17:30:00.000Z', 'Tettersheriffs',       'gepland', (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026'), 'competitie'),
  ('2026-09-08T16:30:00.000Z', 'Kaasballen',            'gepland', (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026'), 'competitie'),
  ('2026-09-15T16:30:00.000Z', 'Team Noord',            'gepland', (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026'), 'competitie'),
  ('2026-09-22T16:30:00.000Z', 'Berk Weusten',          'gepland', (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026'), 'competitie'),
  ('2026-09-29T17:30:00.000Z', 'Trust The Process FC',  'gepland', (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026'), 'competitie'),
  ('2026-10-06T16:30:00.000Z', 'Herren 9',              'gepland', (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026'), 'competitie'),
  ('2026-10-13T16:30:00.000Z', 'Moustache',             'gepland', (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026'), 'competitie'),
  ('2026-10-20T16:30:00.000Z', 'Op Papier Sterk',       'gepland', (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026'), 'competitie'),
  ('2026-10-27T18:30:00.000Z', 'Oudwijkers',            'gepland', (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026'), 'competitie');
