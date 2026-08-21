import { requireAdmin, json } from "./_shared.js";

const TYPES = ["competitie", "toernooi"];
const STATUSES = ["actief", "afgesloten"];

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM competitions ORDER BY created_at DESC, id DESC"
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
