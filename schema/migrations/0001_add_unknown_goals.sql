-- Voegt de mogelijkheid toe om doelpunten niet aan een specifieke speler
-- toe te wijzen (bijv. als niet goed is bijgehouden wie scoorde).
ALTER TABLE matches ADD COLUMN unknown_goals INTEGER NOT NULL DEFAULT 0;
