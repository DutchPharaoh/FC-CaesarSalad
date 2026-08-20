import { requireAdmin, json } from "./_shared.js";

async function getOwnTeamId(env) {
  const row = await env.DB.prepare("SELECT id FROM teams WHERE is_own_team = 1 LIMIT 1").first();
  return row ? row.id : null;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  if (url.searchParams.get("standings") === "true") {
    const { results } = await env.DB.prepare(
      `WITH team_matches AS (
         SELECT
           home_team_id AS team_id, home_goals AS gf, away_goals AS ga,
           CASE WHEN home_goals > away_goals THEN 1 ELSE 0 END AS win,
           CASE WHEN home_goals = away_goals THEN 1 ELSE 0 END AS draw,
           CASE WHEN home_goals < away_goals THEN 1 ELSE 0 END AS loss
         FROM league_results
         UNION ALL
         SELECT
           away_team_id AS team_id, away_goals AS gf, home_goals AS ga,
           CASE WHEN away_goals > home_goals THEN 1 ELSE 0 END AS win,
           CASE WHEN away_goals = home_goals THEN 1 ELSE 0 END AS draw,
           CASE WHEN away_goals < home_goals THEN 1 ELSE 0 END AS loss
         FROM league_results
       )
       SELECT
         t.id, t.name, t.is_own_team,
         COALESCE(COUNT(tm.team_id), 0) AS played,
         COALESCE(SUM(tm.win), 0) AS wins,
         COALESCE(SUM(tm.draw), 0) AS draws,
         COALESCE(SUM(tm.loss), 0) AS losses,
         COALESCE(SUM(tm.gf), 0) AS goals_for,
         COALESCE(SUM(tm.ga), 0) AS goals_against,
         COALESCE(SUM(tm.gf) - SUM(tm.ga), 0) AS goal_diff,
         COALESCE(SUM(tm.win) * 3 + SUM(tm.draw), 0) AS points
       FROM teams t
       LEFT JOIN team_matches tm ON tm.team_id = t.id
       GROUP BY t.id
       ORDER BY points DESC, goal_diff DESC, goals_for DESC, t.name ASC`
    ).all();
    return json(200, results.map((r) => ({ ...r, is_own_team: !!r.is_own_team })));
  }

  const { results } = await env.DB.prepare(
    `SELECT
       r.*,
       ht.name AS home_team_name,
       at.name AS away_team_name,
       m.id AS synced_match_id
     FROM league_results r
     JOIN teams ht ON ht.id = r.home_team_id
     JOIN teams at ON at.id = r.away_team_id
     LEFT JOIN matches m ON m.league_result_id = r.id
     ORDER BY r.match_date DESC, r.id DESC`
  ).all();
  return json(200, results);
}

export async function onRequestPost({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const body = await request.json();
  const { match_date, home_team_id, away_team_id, home_goals, away_goals } = body;
  if (!home_team_id || !away_team_id || home_goals == null || away_goals == null) {
    return json(400, { error: "Beide teams en de score zijn verplicht" });
  }
  if (String(home_team_id) === String(away_team_id)) {
    return json(400, { error: "Thuis- en uitteam moeten verschillend zijn" });
  }

  const ownTeamId = await getOwnTeamId(env);
  if (ownTeamId != null && (String(home_team_id) === String(ownTeamId) || String(away_team_id) === String(ownTeamId))) {
    return json(400, { error: "Eigen wedstrijden voer je in via 'Programma & uitslagen' — dat wordt hier automatisch verwerkt" });
  }

  const row = await env.DB.prepare(
    `INSERT INTO league_results (match_date, home_team_id, away_team_id, home_goals, away_goals)
     VALUES (?, ?, ?, ?, ?) RETURNING *`
  ).bind(match_date || null, home_team_id, away_team_id, home_goals, away_goals).first();

  return json(201, row);
}

export async function onRequestPut({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json(400, { error: "id ontbreekt" });

  const body = await request.json();
  const { match_date, home_team_id, away_team_id, home_goals, away_goals } = body;

  if (home_team_id && away_team_id && String(home_team_id) === String(away_team_id)) {
    return json(400, { error: "Thuis- en uitteam moeten verschillend zijn" });
  }

  if (home_team_id || away_team_id) {
    const ownTeamId = await getOwnTeamId(env);
    if (ownTeamId != null && (String(home_team_id) === String(ownTeamId) || String(away_team_id) === String(ownTeamId))) {
      return json(400, { error: "Eigen wedstrijden bewerk je via 'Programma & uitslagen'" });
    }
  }

  const row = await env.DB.prepare(
    `UPDATE league_results
     SET match_date = ?,
         home_team_id = COALESCE(?, home_team_id),
         away_team_id = COALESCE(?, away_team_id),
         home_goals = COALESCE(?, home_goals),
         away_goals = COALESCE(?, away_goals)
     WHERE id = ?
     RETURNING *`
  ).bind(match_date || null, home_team_id ?? null, away_team_id ?? null, home_goals ?? null, away_goals ?? null, id).first();

  if (!row) return json(404, { error: "Uitslag niet gevonden" });
  return json(200, row);
}

export async function onRequestDelete({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json(400, { error: "id ontbreekt" });

  await env.DB.prepare("DELETE FROM league_results WHERE id = ?").bind(id).run();
  return json(200, { deleted: true });
}
