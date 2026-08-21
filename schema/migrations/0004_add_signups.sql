-- Aanmeldingen via de publieke "Aanmelden"-pagina: naam + unit, alleen
-- zichtbaar in de app als je ontgrendeld bent.
CREATE TABLE signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
