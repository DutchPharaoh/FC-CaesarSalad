-- Teams krijgen een eigen group_name, bijgehouden vanuit de app zodra een
-- wedstrijd/uitslag met fase "groep" wordt opgeslagen (ook als de eigen
-- wedstrijd nog gepland is). Zo kan de stand een team + tegenstander al
-- laten zien met 0 gespeeld, zonder te hoeven wachten op een uitslag.
ALTER TABLE teams ADD COLUMN group_name TEXT;
