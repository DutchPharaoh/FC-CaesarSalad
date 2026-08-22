import { requireAdmin, json } from "./_shared.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const matchId = url.searchParams.get("match_id");
  const summary = url.searchParams.get("summary");

  if (summary === "true") {
    // Zonder competition_id (all-time): alle competities/toernooien samen.
    // Spelers zijn altijd globaal (niet per competitie), dus blijven ze met
    // een LEFT JOIN zichtbaar, ook als ze in de gekozen competitie nog geen
    // statistieken hebben.
    const competitionId = url.searchParams.get("competition_id") || null;

    // W/G/V van een speler = uitslag van de wedstrijden waarbij hij/zij
    // aanwezig was (een player_stats-rij bestaat) — die wedstrijden zijn
    // altijd al "gespeeld" (statistieken worden anders juist opgeruimd).
    const leaderboard = await env.DB.prepare(
      `SELECT
         p.id, p.name,
         COALESCE(SUM(s.goals), 0) AS goals,
         COALESCE(SUM(s.assists), 0) AS assists,
         COALESCE(SUM(s.yellow_cards), 0) AS yellow_cards,
         COALESCE(SUM(s.red_cards), 0) AS red_cards,
         COUNT(s.match_id) AS matches_played,
         COALESCE(SUM(CASE WHEN m.goals_for > m.goals_against THEN 1 ELSE 0 END), 0) AS wins,
         COALESCE(SUM(CASE WHEN m.goals_for = m.goals_against THEN 1 ELSE 0 END), 0) AS draws,
         COALESCE(SUM(CASE WHEN m.goals_for < m.goals_against THEN 1 ELSE 0 END), 0) AS losses,
         (SELECT COUNT(*) FROM matches m WHERE m.mvp_player_id = p.id AND (? IS NULL OR m.competition_id = ?)) AS mvp_count
       FROM players p
       LEFT JOIN player_stats s ON s.player_id = p.id
         AND s.match_id IN (SELECT id FROM matches WHERE ? IS NULL OR competition_id = ?)
       LEFT JOIN matches m ON m.id = s.match_id
       GROUP BY p.id
       ORDER BY goals DESC, matches_played DESC, mvp_count DESC, p.name ASC`
    ).bind(competitionId, competitionId, competitionId, competitionId).all();

    const record = await env.DB.prepare(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'gespeeld') AS played,
         COUNT(*) FILTER (WHERE status = 'gespeeld' AND goals_for > goals_against) AS wins,
         COUNT(*) FILTER (WHERE status = 'gespeeld' AND goals_for = goals_against) AS draws,
         COUNT(*) FILTER (WHERE status = 'gespeeld' AND goals_for < goals_against) AS losses,
         COALESCE(SUM(goals_for) FILTER (WHERE status = 'gespeeld'), 0) AS goals_for,
         COALESCE(SUM(goals_against) FILTER (WHERE status = 'gespeeld'), 0) AS goals_against
       FROM matches
       WHERE ? IS NULL OR competition_id = ?`
    ).bind(competitionId, competitionId).first();

    return json(200, { leaderboard: leaderboard.results, record });
  }

  if (matchId) {
    const { results } = await env.DB.prepare(
      `SELECT s.*, p.name
       FROM player_stats s
       JOIN players p ON p.id = s.player_id
       WHERE s.match_id = ?
       ORDER BY p.name ASC`
    ).bind(matchId).all();
    return json(200, results);
  }

  return json(400, { error: "match_id of summary=true is verplicht" });
}

export async function onRequestPost({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const body = await request.json();
  const { match_id, player_id, goals, assists, yellow_cards, red_cards } = body;
  if (!match_id || !player_id) return json(400, { error: "match_id en player_id zijn verplicht" });

  const row = await env.DB.prepare(
    `INSERT INTO player_stats (match_id, player_id, goals, assists, yellow_cards, red_cards)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (match_id, player_id) DO UPDATE SET
       goals = excluded.goals,
       assists = excluded.assists,
       yellow_cards = excluded.yellow_cards,
       red_cards = excluded.red_cards
     RETURNING *`
  ).bind(match_id, player_id, goals || 0, assists || 0, yellow_cards || 0, red_cards || 0).first();

  return json(200, row);
}

export async function onRequestDelete({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json(400, { error: "id ontbreekt" });

  await env.DB.prepare("DELETE FROM player_stats WHERE id = ?").bind(id).run();
  return json(200, { deleted: true });
}
