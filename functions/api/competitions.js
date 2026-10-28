import { requireAdmin, json } from "./_shared.js";

const TYPES = ["competitie", "toernooi"];
const STATUSES = ["actief", "afgesloten"];
// Kleurnamen; de echte kleuren staan in style.css (.finals-color--…).
const FINAL_COLORS = ["roze", "blauw", "groen", "goud", "zilver", "brons", "paars", "oranje"];
const MAX_FINALS = 8;

// Valideert de finales uit het formulier (zie schema/migrations/0008). Geeft
// de JSON-tekst voor de database terug, of null bij een lege lijst.
function parseFinals(input) {
  if (input == null) return { value: null };
  if (!Array.isArray(input)) return { error: "Finales moeten een lijst zijn" };
  if (input.length > MAX_FINALS) return { error: `Maximaal ${MAX_FINALS} finales` };

  const finals = [];
  for (const f of input) {
    const name = String(f?.name || "").trim().slice(0, 60);
    const from = Number(f?.from);
    const to = Number(f?.to);
    const date = f?.date ? String(f.date) : null;
    if (!name) return { error: "Elke finale heeft een naam nodig" };
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > 99) {
      return { error: `Ongeldige plekken bij "${name}"` };
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: `Ongeldige datum bij "${name}"` };
    finals.push({ name, date, from, to, color: FINAL_COLORS.includes(f?.color) ? f.color : FINAL_COLORS[0] });
  }
  return { value: finals.length ? JSON.stringify(finals) : null };
}

// finals staat als tekst in de database; de app krijgt een lijst (of null).
function withFinals(row) {
  if (!row) return row;
  let finals = null;
  try { finals = row.finals ? JSON.parse(row.finals) : null; } catch {}
  return { ...row, finals };
}

// Draait migratie 0008 nog niet, dan is er geen kolom om in op te slaan.
function finalsColumnError(err) {
  return /no such column: finals|has no column named finals/i.test(String(err?.message))
    ? json(500, { error: "De database mist de kolom voor finales. Voer migratie 0008 uit (zie README)." })
    : null;
}

// Sorteert op de laatst gespeelde wedstrijddatum binnen de competitie
// (over league_results én matches heen), niet op wanneer de competitie is
// aangemaakt — anders springt een later toegevoegde, maar allang gespeelde
// competitie (bijv. met terugwerkende kracht ingevoerde uitslagen) ten
// onrechte bovenaan. Competities zonder speeldata (net aangemaakt, nog
// leeg) blijven bovenaan staan, gesorteerd op aanmaakdatum.
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT c.*, (
       SELECT MAX(d) FROM (
         SELECT substr(match_date, 1, 10) AS d FROM league_results WHERE competition_id = c.id AND match_date IS NOT NULL
         UNION ALL
         SELECT substr(match_date, 1, 10) AS d FROM matches WHERE competition_id = c.id AND match_date IS NOT NULL
       )
     ) AS last_match_date
     FROM competitions c
     ORDER BY (last_match_date IS NULL) DESC, last_match_date DESC, c.created_at DESC, c.id DESC`
  ).all();
  return json(200, results.map(withFinals));
}

export async function onRequestPost({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const body = await request.json();
  const name = (body.name || "").trim();
  if (!name) return json(400, { error: "Naam is verplicht" });

  const type = TYPES.includes(body.type) ? body.type : "competitie";
  const status = STATUSES.includes(body.status) ? body.status : "actief";

  const finals = parseFinals(body.finals);
  if (finals.error) return json(400, { error: finals.error });

  // Zonder finales de kolom niet noemen, zodat aanmaken ook werkt zolang
  // migratie 0008 nog niet gedraaid heeft.
  const stmt = finals.value
    ? env.DB.prepare("INSERT INTO competitions (name, type, status, finals) VALUES (?, ?, ?, ?) RETURNING *")
        .bind(name, type, status, finals.value)
    : env.DB.prepare("INSERT INTO competitions (name, type, status) VALUES (?, ?, ?) RETURNING *")
        .bind(name, type, status);

  let row;
  try {
    row = await stmt.first();
  } catch (err) {
    const res = finalsColumnError(err);
    if (res) return res;
    throw err;
  }

  return json(201, withFinals(row));
}

export async function onRequestPut({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json(400, { error: "id ontbreekt" });

  const body = await request.json();
  const name = body.name != null ? body.name.trim() : null;
  const type = body.type != null ? (TYPES.includes(body.type) ? body.type : null) : null;
  const status = body.status != null ? (STATUSES.includes(body.status) ? body.status : null) : null;

  // finals alleen aanpassen als het formulier ze meestuurt (ook een lege
  // lijst: dan worden ze gewist).
  const updateFinals = body.finals !== undefined;
  const finals = parseFinals(body.finals);
  if (finals.error) return json(400, { error: finals.error });

  const stmt = updateFinals
    ? env.DB.prepare(
        `UPDATE competitions
         SET name = COALESCE(?, name),
             type = COALESCE(?, type),
             status = COALESCE(?, status),
             finals = ?
         WHERE id = ?
         RETURNING *`
      ).bind(name, type, status, finals.value, id)
    : env.DB.prepare(
        `UPDATE competitions
         SET name = COALESCE(?, name),
             type = COALESCE(?, type),
             status = COALESCE(?, status)
         WHERE id = ?
         RETURNING *`
      ).bind(name, type, status, id);

  let row;
  try {
    row = await stmt.first();
  } catch (err) {
    const res = finalsColumnError(err);
    if (res) return res;
    throw err;
  }

  if (!row) return json(404, { error: "Competitie niet gevonden" });
  return json(200, withFinals(row));
}

export async function onRequestDelete({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json(400, { error: "id ontbreekt" });

  // Cascadeert via FK's naar teams, wedstrijden, uitslagen en statistieken.
  await env.DB.prepare("DELETE FROM competitions WHERE id = ?").bind(id).run();
  return json(200, { deleted: true });
}
