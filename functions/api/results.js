import { requireAdmin, json } from "./_shared.js";

async function getOwnTeamId(env, competitionId) {
  const row = await env.DB.prepare(
    "SELECT id FROM teams WHERE is_own_team = 1 AND competition_id = ? LIMIT 1"
  ).bind(competitionId).first();
  return row ? row.id : null;
}

const TEAM_MATCH_CTE = `
  WITH team_matches AS (
    SELECT
      home_team_id AS team_id, home_goals AS gf, away_goals AS ga,
      CASE WHEN home_goals > away_goals THEN 1 ELSE 0 END AS win,
      CASE WHEN home_goals = away_goals THEN 1 ELSE 0 END AS draw,
      CASE WHEN home_goals < away_goals THEN 1 ELSE 0 END AS loss
    FROM league_results
    WHERE competition_id = ? AND phase != 'knockout' AND group_name IS ?
    UNION ALL
    SELECT
      away_team_id AS team_id, away_goals AS gf, home_goals AS ga,
      CASE WHEN away_goals > home_goals THEN 1 ELSE 0 END AS win,
      CASE WHEN away_goals = home_goals THEN 1 ELSE 0 END AS draw,
      CASE WHEN away_goals < home_goals THEN 1 ELSE 0 END AS loss
    FROM league_results
    WHERE competition_id = ? AND phase != 'knockout' AND group_name IS ?
  )
`;

const STANDINGS_SELECT = `
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
  FROM team_matches tm
  JOIN teams t ON t.id = tm.team_id
  GROUP BY t.id
  ORDER BY points DESC, goal_diff DESC, goals_for DESC, t.name ASC
`;

// Zonder groep (gewone competitie) tellen ook teams zonder wedstrijden mee
// (bijv. net toegevoegd), daarom hier een LEFT JOIN vanuit alle teams i.p.v.
// vanuit de gespeelde wedstrijden.
const STANDINGS_SELECT_ALL_TEAMS = `
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
  WHERE t.competition_id = ?
  GROUP BY t.id
  ORDER BY points DESC, goal_diff DESC, goals_for DESC, t.name ASC
`;

async function standingsForGroup(env, competitionId, groupName) {
  const sql = groupName === null
    ? `${TEAM_MATCH_CTE}${STANDINGS_SELECT_ALL_TEAMS}`
    : `${TEAM_MATCH_CTE}${STANDINGS_SELECT}`;
  const binds = groupName === null
    ? [competitionId, null, competitionId, null, competitionId]
    : [competitionId, groupName, competitionId, groupName];
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return results.map((r) => ({ ...r, is_own_team: !!r.is_own_team }));
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const competitionId = url.searchParams.get("competition_id");
  if (!competitionId) return json(400, { error: "competition_id is verplicht" });

  if (url.searchParams.get("standings") === "true") {
    const { results: groupRows } = await env.DB.prepare(
      `SELECT DISTINCT group_name FROM league_results WHERE competition_id = ? AND phase != 'knockout'`
    ).bind(competitionId).all();

    const groupNames = groupRows.map((g) => g.group_name);
    if (groupNames.length === 0) groupNames.push(null); // geen uitslagen: toon alsnog de (lege) hoofdtabel

    const groups = await Promise.all(
      groupNames.map(async (groupName) => ({
        group_name: groupName,
        standings: await standingsForGroup(env, competitionId, groupName),
      }))
    );

    groups.sort((a, b) => {
      if (a.group_name === b.group_name) return 0;
      if (a.group_name === null) return -1;
      if (b.group_name === null) return 1;
      return a.group_name.localeCompare(b.group_name);
    });

    return json(200, groups);
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
     WHERE r.competition_id = ?
     ORDER BY r.match_date DESC, r.id DESC`
  ).bind(competitionId).all();
  return json(200, results);
}

export async function onRequestPost({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const body = await request.json();
  const { match_date, home_team_id, away_team_id, home_goals, away_goals, competition_id, phase, group_name, round_name } = body;
  if (!home_team_id || !away_team_id || home_goals == null || away_goals == null) {
    return json(400, { error: "Beide teams en de score zijn verplicht" });
  }
  if (!competition_id) return json(400, { error: "competition_id is verplicht" });
  if (String(home_team_id) === String(away_team_id)) {
    return json(400, { error: "Thuis- en uitteam moeten verschillend zijn" });
  }

  const { results: teamsInCompetition } = await env.DB.prepare(
    "SELECT id FROM teams WHERE competition_id = ? AND id IN (?, ?)"
  ).bind(competition_id, home_team_id, away_team_id).all();
  if (teamsInCompetition.length !== 2) {
    return json(400, { error: "Beide teams moeten bij deze competitie horen" });
  }

  const ownTeamId = await getOwnTeamId(env, competition_id);
  if (ownTeamId != null && (String(home_team_id) === String(ownTeamId) || String(away_team_id) === String(ownTeamId))) {
    return json(400, { error: "Eigen wedstrijden voer je in via 'Programma & uitslagen' — dat wordt hier automatisch verwerkt" });
  }

  const row = await env.DB.prepare(
    `INSERT INTO league_results (match_date, home_team_id, away_team_id, home_goals, away_goals, competition_id, phase, group_name, round_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  ).bind(match_date || null, home_team_id, away_team_id, home_goals, away_goals, competition_id, phase || "competitie", group_name ?? null, round_name ?? null).first();

  return json(201, row);
}

export async function onRequestPut({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json(400, { error: "id ontbreekt" });

  const body = await request.json();
  const { match_date, home_team_id, away_team_id, home_goals, away_goals, competition_id, phase, group_name, round_name } = body;

  if (home_team_id && away_team_id && String(home_team_id) === String(away_team_id)) {
    return json(400, { error: "Thuis- en uitteam moeten verschillend zijn" });
  }

  if (home_team_id || away_team_id) {
    const existing = await env.DB.prepare("SELECT competition_id, home_team_id, away_team_id FROM league_results WHERE id = ?").bind(id).first();
    const effectiveCompetitionId = competition_id || existing?.competition_id;

    const { results: teamsInCompetition } = await env.DB.prepare(
      "SELECT id FROM teams WHERE competition_id = ? AND id IN (?, ?)"
    ).bind(effectiveCompetitionId, home_team_id || existing?.home_team_id, away_team_id || existing?.away_team_id).all();
    if (teamsInCompetition.length !== 2) {
      return json(400, { error: "Beide teams moeten bij deze competitie horen" });
    }

    const ownTeamId = await getOwnTeamId(env, effectiveCompetitionId);
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
         away_goals = COALESCE(?, away_goals),
         phase = COALESCE(?, phase),
         group_name = ?,
         round_name = ?
     WHERE id = ?
     RETURNING *`
  ).bind(
    match_date || null, home_team_id ?? null, away_team_id ?? null, home_goals ?? null, away_goals ?? null,
    phase ?? null, group_name ?? null, round_name ?? null, id
  ).first();

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
