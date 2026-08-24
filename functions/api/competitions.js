import { requireAdmin, json } from "./_shared.js";

const TYPES = ["competitie", "toernooi"];
const STATUSES = ["actief", "afgesloten"];

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
  return json(200, results);
}

export async function onRequestPost({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const body = await request.json();
  const name = (body.name || "").trim();
  if (!name) return json(400, { error: "Naam is verplicht" });

  const type = TYPES.includes(body.type) ? body.type : "competitie";
  const status = STATUSES.includes(body.status) ? body.status : "actief";

  const row = await env.DB.prepare(
    "INSERT INTO competitions (name, type, status) VALUES (?, ?, ?) RETURNING *"
  ).bind(name, type, status).first();

  return json(201, row);
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

  const row = await env.DB.prepare(
    `UPDATE competitions
     SET name = COALESCE(?, name),
         type = COALESCE(?, type),
         status = COALESCE(?, status)
     WHERE id = ?
     RETURNING *`
  ).bind(name, type, status, id).first();

  if (!row) return json(404, { error: "Competitie niet gevonden" });
  return json(200, row);
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
