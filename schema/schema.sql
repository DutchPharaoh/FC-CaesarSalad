-- FC Caesar Salad — D1 (SQLite) schema
-- Fris opgezet: geen historie/migraties uit de oude Postgres-database nodig.

CREATE TABLE players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_own_team INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE league_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_date TEXT,
  home_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  home_goals INTEGER NOT NULL,
  away_goals INTEGER NOT NULL,
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
  UNIQUE(match_id, player_id)
);

CREATE INDEX idx_matches_date ON matches(match_date);
CREATE INDEX idx_stats_match ON player_stats(match_id);
CREATE INDEX idx_stats_player ON player_stats(player_id);
CREATE INDEX idx_league_results_home ON league_results(home_team_id);
CREATE INDEX idx_league_results_away ON league_results(away_team_id);
