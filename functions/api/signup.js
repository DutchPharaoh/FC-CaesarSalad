import { requireAdmin, json } from "./_shared.js";

export async function onRequestGet({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const { results } = await env.DB.prepare(
    "SELECT * FROM signups ORDER BY created_at DESC"
  ).all();
  return json(200, results);
}

export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const name = (body.name || "").trim();
  const unit = (body.unit || "").trim();
  if (!name || !unit) return json(400, { error: "Naam en unit zijn verplicht" });
  if (name.length > 200 || unit.length > 200) return json(400, { error: "Naam of unit is te lang" });

  const row = await env.DB.prepare(
    "INSERT INTO signups (name, unit) VALUES (?, ?) RETURNING *"
  ).bind(name, unit).first();

  return json(201, row);
}

export async function onRequestDelete({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json(400, { error: "id ontbreekt" });

  await env.DB.prepare("DELETE FROM signups WHERE id = ?").bind(id).run();
  return json(200, { deleted: true });
}
