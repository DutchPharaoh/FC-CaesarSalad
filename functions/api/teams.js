import { requireAdmin, json } from "./_shared.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const competitionId = url.searchParams.get("competition_id");
  if (!competitionId) return json(400, { error: "competition_id is verplicht" });

  const { results } = await env.DB.prepare(
    "SELECT * FROM teams WHERE competition_id = ? ORDER BY is_own_team DESC, name ASC"
  ).bind(competitionId).all();
  return json(200, results.map((t) => ({ ...t, is_own_team: !!t.is_own_team })));
}

export async function onRequestPost({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const body = await request.json();
  const name = (body.name || "").trim();
  if (!name) return json(400, { error: "Teamnaam is verplicht" });
  if (!body.competition_id) return json(400, { error: "competition_id is verplicht" });

  try {
    const row = await env.DB.prepare(
      "INSERT INTO teams (name, is_own_team, competition_id) VALUES (?, ?, ?) RETURNING *"
    ).bind(name, body.is_own_team ? 1 : 0, body.competition_id).first();
    return json(201, { ...row, is_own_team: !!row.is_own_team });
  } catch (err) {
    if (String(err.message || "").includes("UNIQUE")) {
      return json(409, { error: "Er bestaat al een team met deze naam" });
    }
    throw err;
  }
}

export async function onRequestPut({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json(400, { error: "id ontbreekt" });

  const body = await request.json();
  const ownVal = body.is_own_team === undefined || body.is_own_team === null ? null : (body.is_own_team ? 1 : 0);

  const row = await env.DB.prepare(
    `UPDATE teams
     SET name = COALESCE(?, name),
         is_own_team = COALESCE(?, is_own_team)
     WHERE id = ?
     RETURNING *`
  ).bind(body.name ?? null, ownVal, id).first();

  if (!row) return json(404, { error: "Team niet gevonden" });
  return json(200, { ...row, is_own_team: !!row.is_own_team });
}

export async function onRequestDelete({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json(400, { error: "id ontbreekt" });

  // Verwijder eerst de eigen wedstrijden die via een uitslag aan dit team
  // gekoppeld waren, dan de uitslagen zelf (geen DB-cascade hiervoor, zie
  // schema.sql), en pas dan het team.
  await env.DB.prepare(
    `DELETE FROM matches
     WHERE league_result_id IN (
       SELECT id FROM league_results WHERE home_team_id = ? OR away_team_id = ?
     )`
  ).bind(id, id).run();
  await env.DB.prepare(
    "DELETE FROM league_results WHERE home_team_id = ? OR away_team_id = ?"
  ).bind(id, id).run();

  await env.DB.prepare("DELETE FROM teams WHERE id = ?").bind(id).run();
  return json(200, { deleted: true });
}
