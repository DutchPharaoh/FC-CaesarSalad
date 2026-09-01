-- Bijhouden wie er gekeept heeft, en of dat een halve of een hele wedstrijd
-- was: we wisselen soms per helft van keeper. Geteld in helften (0, 1 of 2),
-- zodat er niets met halve getallen hoeft te gebeuren en "hele wedstrijd"
-- gewoon twee helften is.
--
-- Zo is in de statistieken te zien waarom iemand na veel wedstrijden weinig
-- gescoord heeft: die stond in de goal.
ALTER TABLE player_stats ADD COLUMN keeper_halves INTEGER NOT NULL DEFAULT 0;
