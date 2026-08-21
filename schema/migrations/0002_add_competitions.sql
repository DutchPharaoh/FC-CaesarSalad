-- Introduceert competities/toernooien: teams, wedstrijden en uitslagen
-- horen voortaan bij precies één competitie, zodat je kan wisselen tussen
-- bijv. de lopende competitie en een los mini-toernooi (met groepsfase en
-- knockout). Bestaande data schuift naar een nieuwe, afgesloten
-- "Competitie 1" zodat er niets verloren gaat.
--
-- Let op de volgorde hieronder: D1 voert dit hele bestand als één batch uit
-- met foreign_keys=ON, en staat niet toe dat binnen die batch uit te
-- schakelen. league_results.home_team_id/away_team_id hadden origineel
-- "ON DELETE CASCADE" naar teams — als teams verderop herbouwd wordt (nodig
-- om de UNIQUE-constraint op naam per-competitie te maken i.p.v. globaal),
-- zou een kale "DROP TABLE teams" daardoor impliciet alle uitslagen
-- wegvagen. Daarom wordt league_results eerst herbouwd zónder FK naar
-- teams (de app beheert die relatie toch al zelf), voordat teams wordt
-- aangepast.

CREATE TABLE competitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'competitie', -- 'competitie' | 'toernooi'
  status TEXT NOT NULL DEFAULT 'actief', -- 'actief' | 'afgesloten'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO competitions (name, type, status) VALUES ('Competitie 1', 'competitie', 'afgesloten');

-- Bewaar de matches -> league_results koppeling: het herbouwen van
-- league_results hieronder (DROP + RENAME) triggert matches.league_result_id
-- se "ON DELETE SET NULL", dus die koppeling moet na afloop hersteld worden.
CREATE TABLE _match_league_backup AS
  SELECT id AS match_id, league_result_id FROM matches WHERE league_result_id IS NOT NULL;

CREATE TABLE league_results_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_date TEXT,
  home_team_id INTEGER NOT NULL,
  away_team_id INTEGER NOT NULL,
  home_goals INTEGER NOT NULL,
  away_goals INTEGER NOT NULL,
  competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
  phase TEXT NOT NULL DEFAULT 'competitie', -- 'competitie' | 'groep' | 'knockout'
  group_name TEXT,
  round_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (home_team_id <> away_team_id)
);
INSERT INTO league_results_new (id, match_date, home_team_id, away_team_id, home_goals, away_goals, competition_id, created_at)
  SELECT id, match_date, home_team_id, away_team_id, home_goals, away_goals,
    (SELECT id FROM competitions WHERE name = 'Competitie 1'), created_at
  FROM league_results;
DROP TABLE league_results;
ALTER TABLE league_results_new RENAME TO league_results;

UPDATE matches SET league_result_id = (
  SELECT b.league_result_id FROM _match_league_backup b WHERE b.match_id = matches.id
) WHERE id IN (SELECT match_id FROM _match_league_backup);
DROP TABLE _match_league_backup;

-- teams.name was globaal uniek; dat moet nu per competitie, want bijv. het
-- eigen team komt straks in elke competitie voor. Nu veilig te herbouwen
-- (DROP + RENAME), want league_results verwijst er niet meer met CASCADE
-- naar (zie hierboven).
CREATE TABLE teams_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_own_team INTEGER NOT NULL DEFAULT 0,
  competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name, competition_id)
);
INSERT INTO teams_new (id, name, is_own_team, competition_id, created_at)
  SELECT id, name, is_own_team, (SELECT id FROM competitions WHERE name = 'Competitie 1'), created_at FROM teams;
DROP TABLE teams;
ALTER TABLE teams_new RENAME TO teams;

ALTER TABLE matches ADD COLUMN competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE;
ALTER TABLE matches ADD COLUMN phase TEXT NOT NULL DEFAULT 'competitie';
ALTER TABLE matches ADD COLUMN group_name TEXT;
ALTER TABLE matches ADD COLUMN round_name TEXT;
UPDATE matches SET competition_id = (SELECT id FROM competitions WHERE name = 'Competitie 1');

CREATE INDEX idx_teams_competition ON teams(competition_id);
CREATE INDEX idx_matches_competition ON matches(competition_id);
CREATE INDEX idx_league_results_competition ON league_results(competition_id);
