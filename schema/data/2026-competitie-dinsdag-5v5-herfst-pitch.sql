-- Vult het veldnummer in voor de wedstrijden van "Competitie dinsdag 5v5
-- Herfst 2026", zoals op het originele programma-overzicht stond.
-- Los uit te voeren nadat de "pitch"-kolom is toegevoegd (migratie
-- schema/migrations/0005_add_match_pitch.sql, wordt bij een gewone deploy
-- niet automatisch uitgevoerd — dus eerst die migratie draaien):
--   wrangler d1 execute fc-caesar-salad-db --remote --file=schema/migrations/0005_add_match_pitch.sql
--   wrangler d1 execute fc-caesar-salad-db --remote --file=schema/data/2026-competitie-dinsdag-5v5-herfst-pitch.sql

UPDATE matches SET pitch = 'Veld 6'
WHERE opponent = 'Tettersheriffs'
  AND competition_id = (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026');

UPDATE matches SET pitch = 'Veld 5'
WHERE opponent = 'Kaasballen'
  AND competition_id = (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026');

UPDATE matches SET pitch = 'Veld 4'
WHERE opponent = 'Team Noord'
  AND competition_id = (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026');

UPDATE matches SET pitch = 'Veld 5'
WHERE opponent = 'Berk Weusten'
  AND competition_id = (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026');

UPDATE matches SET pitch = 'Veld 5'
WHERE opponent = 'Trust The Process FC'
  AND competition_id = (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026');

UPDATE matches SET pitch = 'Veld 6'
WHERE opponent = 'Herren 9'
  AND competition_id = (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026');

UPDATE matches SET pitch = 'Veld 6'
WHERE opponent = 'Moustache'
  AND competition_id = (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026');

UPDATE matches SET pitch = 'Veld 6'
WHERE opponent = 'Op Papier Sterk'
  AND competition_id = (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026');

UPDATE matches SET pitch = 'Veld 6'
WHERE opponent = 'Oudwijkers'
  AND competition_id = (SELECT id FROM competitions WHERE name = 'Competitie dinsdag 5v5 Herfst 2026');
