-- Uitslagen speelronde 1 (dinsdag 1 september 2026) van "Competitie dinsdag
-- 5v5 Herfst 2026" — alleen de wedstrijden van de andere teams.
--
-- Tettersheriffs 7 - 14 FC Caesar Salad staat er bewust NIET bij: die
-- wedstrijd wordt via "Programma & uitslagen" ingevoerd en daar automatisch
-- naar league_results gesynchroniseerd (zie functions/api/matches.js).
--
-- Los uit te voeren met:
--   wrangler d1 execute fc-caesar-salad-db --remote --file=schema/data/2026-competitie-dinsdag-5v5-herfst-uitslagen-2026-09-01.sql
-- (of --local voor de lokale dev-database)
--
-- LET OP: het team heet hieronder "Noord CF", zoals op de uitslagenpagina.
-- In de oorspronkelijke seed staat het als "Team Noord" — hernoem het team
-- eerst in de app, anders wordt die ene wedstrijd overgeslagen. De eerste
-- query hieronder controleert dat vooraf.
--
-- match_date is een kale datum (YYYY-MM-DD), net zoals de app 'm opslaat
-- voor uitslagen — daardoor vallen deze rijen onder dezelfde datumkop als
-- onze eigen wedstrijd.
--
-- Teams worden op naam opgezocht, maar met TRIM + COLLATE NOCASE: een
-- afwijkende hoofdletter of een spatie aan het eind laat een wedstrijd
-- anders stilzwijgend wegvallen.
--
-- De NOT EXISTS-guard maakt het bestand herhaalbaar: een tweede keer
-- draaien voegt niets dubbel toe (en zou anders de stand verdubbelen).

-- 1. Controle vooraf: hoort GEEN regels te tonen. Komt hier een naam uit,
--    dan bestaat dat team (nog) niet onder die naam in de competitie en zou
--    de INSERT die wedstrijd stilzwijgend overslaan.
SELECT 'ONTBREEKT: ' || v.naam AS controle_vooraf
FROM (
            SELECT 'Op Papier Sterk' AS naam
  UNION ALL SELECT 'Noord CF'
  UNION ALL SELECT 'Oudwijkers'
  UNION ALL SELECT 'Berk Weusten'
  UNION ALL SELECT 'Herren 9'
  UNION ALL SELECT 'Trust The Process FC'
  UNION ALL SELECT 'Kaasballen'
  UNION ALL SELECT 'Moustache'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM teams t
  WHERE t.competition_id = (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026')
    AND TRIM(t.name) = v.naam COLLATE NOCASE
);

-- 2. De uitslagen zelf.
INSERT INTO league_results (match_date, home_team_id, away_team_id, home_goals, away_goals, competition_id, phase, group_name, round_name)
SELECT u.match_date, thuis.id, uit.id, u.home_goals, u.away_goals, c.id, 'competitie', NULL, NULL
FROM (
            SELECT '2026-09-01' AS match_date, 'Op Papier Sterk' AS home, 'Noord CF'             AS away,  3 AS home_goals, 27 AS away_goals
  UNION ALL SELECT '2026-09-01',               'Oudwijkers',              'Berk Weusten',                12,               7
  UNION ALL SELECT '2026-09-01',               'Herren 9',                'Trust The Process FC',        13,               6
  UNION ALL SELECT '2026-09-01',               'Kaasballen',              'Moustache',                    9,              11
) u
JOIN competitions c ON c.name = 'Competitie dinsdag 5v5 Herfst 2026'
JOIN teams thuis ON thuis.competition_id = c.id AND TRIM(thuis.name) = u.home COLLATE NOCASE
JOIN teams uit   ON uit.competition_id   = c.id AND TRIM(uit.name)   = u.away COLLATE NOCASE
WHERE NOT EXISTS (
  SELECT 1 FROM league_results r
  WHERE r.competition_id = c.id
    AND r.match_date = u.match_date
    AND r.home_team_id = thuis.id
    AND r.away_team_id = uit.id
);

-- 3. Controle achteraf: hoort 5 regels te tonen (4 hierboven + onze eigen
--    wedstrijd, mits die al is ingevoerd).
SELECT r.match_date, thuis.name AS thuis, r.home_goals, r.away_goals, uit.name AS uit
FROM league_results r
JOIN teams thuis ON thuis.id = r.home_team_id
JOIN teams uit   ON uit.id   = r.away_team_id
WHERE r.competition_id = (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026')
  AND r.match_date = '2026-09-01'
ORDER BY r.id;
