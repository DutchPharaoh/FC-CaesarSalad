import { requireAdmin, json } from "./_shared.js";

const OWN_TEAM_NAME = "FC Caesar Salad";

// Zorgt dat er altijd precies één team als "ons team" bestaat, zonder dat
// daar iets voor hoeft te worden ingesteld.
async function ensureOwnTeam(env) {
  const flagged = await env.DB.prepare(
    "SELECT * FROM teams WHERE is_own_team = 1 LIMIT 1"
  ).first();
  if (flagged) return flagged;

  const byName = await env.DB.prepare(
    "SELECT * FROM teams WHERE LOWER(name) = LOWER(?) LIMIT 1"
  ).bind(OWN_TEAM_NAME).first();
  if (byName) {
    return env.DB.prepare(
      "UPDATE teams SET is_own_team = 1 WHERE id = ? RETURNING *"
    ).bind(byName.id).first();
  }

  return env.DB.prepare(
    "INSERT INTO teams (name, is_own_team) VALUES (?, 1) RETURNING *"
  ).bind(OWN_TEAM_NAME).first();
}

// Houdt de competitie-uitslag (league_results) voor een eigen wedstrijd
// automatisch in sync met de score/status die bij "Programma & uitslagen"
// is ingevoerd. Ons team staat altijd als "thuisteam" — technische keuze,
// heeft geen invloed op de berekende stand.
async function syncLeagueResult(env, match) {
  const isPlayed = match.status === "gespeeld" && match.goals_for != null && match.goals_against != null;

  if (!isPlayed) {
    if (match.league_result_id) {
      await env.DB.prepare("DELETE FROM league_results WHERE id = ?").bind(match.league_result_id).run();
      await env.DB.prepare("UPDATE matches SET league_result_id = NULL WHERE id = ?").bind(match.id).run();
    }
    return;
  }

  const ownTeam = await ensureOwnTeam(env);

  let opponentTeam = await env.DB.prepare(
    "SELECT * FROM teams WHERE LOWER(name) = LOWER(?) LIMIT 1"
  ).bind(match.opponent).first();
  if (!opponentTeam) {
    opponentTeam = await env.DB.prepare(
      "INSERT INTO teams (name) VALUES (?) RETURNING *"
    ).bind(match.opponent).first();
  }

  const matchDateOnly = match.match_date ? match.match_date.slice(0, 10) : null;

  if (match.league_result_id) {
    await env.DB.prepare(
      `UPDATE league_results
       SET match_date = ?, home_team_id = ?, away_team_id = ?, home_goals = ?, away_goals = ?
       WHERE id = ?`
    ).bind(matchDateOnly, ownTeam.id, opponentTeam.id, match.goals_for, match.goals_against, match.league_result_id).run();
  } else {
    const newResult = await env.DB.prepare(
      `INSERT INTO league_results (match_date, home_team_id, away_team_id, home_goals, away_goals)
       VALUES (?, ?, ?, ?, ?) RETURNING *`
    ).bind(matchDateOnly, ownTeam.id, opponentTeam.id, match.goals_for, match.goals_against).first();
    await env.DB.prepare("UPDATE matches SET league_result_id = ? WHERE id = ?").bind(newResult.id, match.id).run();
  }
}

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM matches ORDER BY match_date ASC"
  ).all();
  return json(200, results);
}

export async function onRequestPost({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const body = await request.json();
  const { match_date, opponent, status, goals_for, goals_against, mvp_player_id, opponent_own_goals } = body;
  if (!match_date || !opponent || !opponent.trim()) {
    return json(400, { error: "Datum en tegenstander zijn verplicht" });
  }

  const match = await env.DB.prepare(
    `INSERT INTO matches (match_date, opponent, status, goals_for, goals_against, mvp_player_id, opponent_own_goals)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
  ).bind(
    match_date, opponent.trim(), status || "gepland",
    goals_for ?? null, goals_against ?? null, mvp_player_id ?? null, opponent_own_goals ?? 0
  ).first();

  await syncLeagueResult(env, match);
  const fresh = await env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(match.id).first();
  return json(201, fresh);
}

export async function onRequestPut({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json(400, { error: "id ontbreekt" });

  const body = await request.json();
  const { match_date, opponent, status, goals_for, goals_against, mvp_player_id, opponent_own_goals } = body;

  const match = await env.DB.prepare(
    `UPDATE matches
     SET match_date = COALESCE(?, match_date),
         opponent = COALESCE(?, opponent),
         status = COALESCE(?, status),
         goals_for = ?,
         goals_against = ?,
         mvp_player_id = ?,
         opponent_own_goals = ?
     WHERE id = ?
     RETURNING *`
  ).bind(
    match_date ?? null, opponent ?? null, status ?? null,
    goals_for ?? null, goals_against ?? null, mvp_player_id ?? null, opponent_own_goals ?? 0,
    id
  ).first();

  if (!match) return json(404, { error: "Wedstrijd niet gevonden" });

  await syncLeagueResult(env, match);
  const fresh = await env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(match.id).first();
  return json(200, fresh);
}

export async function onRequestDelete({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json(400, { error: "id ontbreekt" });

  const existing = await env.DB.prepare("SELECT league_result_id FROM matches WHERE id = ?").bind(id).first();
  await env.DB.prepare("DELETE FROM matches WHERE id = ?").bind(id).run();
  if (existing?.league_result_id) {
    await env.DB.prepare("DELETE FROM league_results WHERE id = ?").bind(existing.league_result_id).run();
  }
  return json(200, { deleted: true });
}
