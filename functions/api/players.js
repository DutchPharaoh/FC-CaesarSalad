import { requireAdmin, json } from "./_shared.js";

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM players ORDER BY name ASC"
  ).all();
  return json(200, results.map((p) => ({ ...p, active: !!p.active })));
}

export async function onRequestPost({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const body = await request.json();
  const name = (body.name || "").trim();
  if (!name) return json(400, { error: "Naam is verplicht" });

  const row = await env.DB.prepare(
    "INSERT INTO players (name) VALUES (?) RETURNING *"
  ).bind(name).first();

  return json(201, { ...row, active: !!row.active });
}

export async function onRequestPut({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json(400, { error: "id ontbreekt" });

  const body = await request.json();
  const activeVal = body.active === undefined || body.active === null ? null : (body.active ? 1 : 0);

  const row = await env.DB.prepare(
    `UPDATE players
     SET name = COALESCE(?, name),
         active = COALESCE(?, active)
     WHERE id = ?
     RETURNING *`
  ).bind(body.name ?? null, activeVal, id).first();

  if (!row) return json(404, { error: "Speler niet gevonden" });
  return json(200, { ...row, active: !!row.active });
}

export async function onRequestDelete({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json(400, { error: "id ontbreekt" });

  await env.DB.prepare("DELETE FROM players WHERE id = ?").bind(id).run();
  return json(200, { deleted: true });
}
