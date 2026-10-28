-- Eenmalige data-invoer: finales van "Competitie dinsdag 5v5 Herfst 2026",
-- zoals Footy ze heeft ingedeeld. Vereist migratie 0008. Los uit te voeren met:
--   wrangler d1 execute fc-caesar-salad-db --remote --file=schema/data/2026-competitie-dinsdag-5v5-herfst-finals.sql
-- (Kan ook met de hand in de app: competitie bewerken → Finales.)

UPDATE competitions
SET finals = '[{"name":"Hoofdklasse Finals","date":"2026-11-12","from":1,"to":3,"color":"roze"},{"name":"1e Klasse Finals","date":"2026-11-11","from":4,"to":6,"color":"blauw"},{"name":"2e Klasse Finals","date":"2026-11-09","from":7,"to":10,"color":"groen"}]'
WHERE name = 'Competitie dinsdag 5v5 Herfst 2026';
