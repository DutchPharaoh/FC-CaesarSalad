-- Veld waarop een wedstrijd gespeeld wordt (bijv. "Veld 5"). Optioneel: oude
-- wedstrijden/competities hebben dit simpelweg niet ingevuld (NULL) en tonen
-- het dan ook niet in de UI.
ALTER TABLE matches ADD COLUMN pitch TEXT;
