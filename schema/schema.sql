-- FC Caesar Salad — D1 (SQLite) schema
-- Fris opgezet: geen historie/migraties uit de oude Postgres-database nodig.

CREATE TABLE players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Eén rij per competitie of toernooi. Teams, wedstrijden en uitslagen
-- horen bij precies één competitie, zodat er tussen seizoenen/toernooien
-- geschakeld kan worden zonder dat data door elkaar loopt.
CREATE TABLE competitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'competitie', -- 'competitie' | 'toernooi'
  status TEXT NOT NULL DEFAULT 'actief', -- 'actief' | 'afgesloten'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_own_team INTEGER NOT NULL DEFAULT 0,
  competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
  group_name TEXT, -- bijgehouden vanuit de app zodra een wedstrijd/uitslag
                    -- met fase "groep" wordt opgeslagen (ook al gepland)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name, competition_id)
);

-- home_team_id/away_team_id verwijzen bewust zonder FK-constraint naar
-- teams(id): de app beheert die relatie zelf (zie teams.js), zodat een team
-- kan worden opgeschoond zonder impliciete cascade-verrassingen bij
-- toekomstige schemawijzigingen aan teams.
CREATE TABLE league_results (
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

CREATE TABLE matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_date TEXT NOT NULL,
  opponent TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'gepland',
  goals_for INTEGER,
  goals_against INTEGER,
  opponent_own_goals INTEGER NOT NULL DEFAULT 0,
  unknown_goals INTEGER NOT NULL DEFAULT 0,
  mvp_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  league_result_id INTEGER REFERENCES league_results(id) ON DELETE SET NULL,
  competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
  phase TEXT NOT NULL DEFAULT 'competitie', -- 'competitie' | 'groep' | 'knockout'
  group_name TEXT,
  round_name TEXT,
  pitch TEXT, -- bijv. "Veld 5"; optioneel, oude wedstrijden hebben dit niet
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Aanmeldingen via de publieke "Aanmelden"-pagina: naam + unit, alleen
-- zichtbaar in de app als je ontgrendeld bent.
CREATE TABLE signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE player_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  yellow_cards INTEGER NOT NULL DEFAULT 0,
  red_cards INTEGER NOT NULL DEFAULT 0,
  -- Aantal helften als keeper: 0, 1 (halve wedstrijd) of 2 (hele wedstrijd).
  keeper_halves INTEGER NOT NULL DEFAULT 0,
  UNIQUE(match_id, player_id)
);

CREATE INDEX idx_matches_date ON matches(match_date);
CREATE INDEX idx_stats_match ON player_stats(match_id);
CREATE INDEX idx_stats_player ON player_stats(player_id);
CREATE INDEX idx_league_results_home ON league_results(home_team_id);
CREATE INDEX idx_league_results_away ON league_results(away_team_id);
CREATE INDEX idx_teams_competition ON teams(competition_id);
CREATE INDEX idx_matches_competition ON matches(competition_id);
CREATE INDEX idx_league_results_competition ON league_results(competition_id);
