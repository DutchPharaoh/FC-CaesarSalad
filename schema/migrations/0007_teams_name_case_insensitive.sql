-- Teamnamen niet langer hoofdlettergevoelig binnen een competitie.
--
-- UNIQUE(name, competition_id) in schema.sql vergelijkt letterlijk, dus
-- "Trust The Process FC" en "Trust the process FC" konden naast elkaar
-- bestaan als twee teams. In de stand leverde dat twee halve regels op, en
-- scripts/sync-footy-results.mjs kon een uitslag aan de verkeerde van de twee
-- hangen.
--
-- Deze index gebruikt dezelfde normalisatie als nameKey() in
-- functions/api/_shared.js: kleine letters, geen rand- en geen dubbele
-- spaties (elke REPLACE halveert een reeks spaties, drie rondes is ruim
-- genoeg voor de namen die we tegenkomen). De oude UNIQUE-constraint blijft
-- gewoon staan; die is hiermee een strengere deelverzameling geworden.
--
-- Draait alleen als er nog geen namen zijn die hierdoor botsen. Zijn die er
-- wel, dan faalt deze migratie met "UNIQUE constraint failed" — hernoem of
-- verwijder dan eerst het dubbele team in de app en draai 'm opnieuw.
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_name_nocase
  ON teams (
    competition_id,
    REPLACE(REPLACE(REPLACE(LOWER(TRIM(name)), '  ', ' '), '  ', ' '), '  ', ' ')
  );
