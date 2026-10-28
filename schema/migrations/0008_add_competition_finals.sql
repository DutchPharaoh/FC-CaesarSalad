-- Eindtoernooien ("finals") na een competitie. Footy deelt de eindstand op in
-- vakken met elk een eigen kleur, finale en speeldatum, bijv. plek 1-3 naar de
-- hoofdklasse-finale op donderdag, 4-6 naar de 1e klasse op woensdag.
--
-- Opgeslagen als JSON-lijst, want het aantal vakken verschilt per competitie:
--   [{"name": "Hoofdklasse Finals", "date": "2026-11-12", "from": 1, "to": 3, "color": "roze"}, …]
--
-- Optioneel: NULL (oudere competities, of een nieuwe waar Footy de finales nog
-- niet heeft bekendgemaakt) betekent dat de stand er gewoon uitziet als altijd.
ALTER TABLE competitions ADD COLUMN finals TEXT;
