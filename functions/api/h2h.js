import { json, nameKey } from "./_shared.js";

// Onderlinge balans tegen één tegenstander, over alle competities heen.
//
// De tegenstander is in `matches` een vrij tekstveld en teams staan per
// competitie apart in `teams` (dat hoort zo: een stand is per competitie).
// Voor de H2H is `teams` dus niet nodig — alle eigen wedstrijden staan al in
// `matches` met opponent + goals_for/goals_against.
//
// Namen worden vergeleken op een genormaliseerde sleutel (zie nameKey in
// _shared.js), want dezelfde club wordt tussen seizoenen net anders getypt.

// Alleen gespeelde wedstrijden mét uitslag tellen mee; de aanstaande
// wedstrijd zelf valt daar dus vanzelf buiten.
const sameOpponent = (alias = "") => {
  const col = alias ? `${alias}.` : "";
  return `${col}status = 'gespeeld'
    AND ${col}goals_for IS NOT NULL AND ${col}goals_against IS NOT NULL
    AND ${nameKey(col + "opponent")} = ${nameKey("?")}`;
};

export async function onRequestGet({ request, env }) {
  const opponent = new URL(request.url).searchParams.get("opponent");
  if (!opponent || !opponent.trim()) {
    return json(400, { error: "opponent is verplicht" });
  }

  const totals = await env.DB.prepare(`
    SELECT
      COUNT(*) AS played,
      SUM(CASE WHEN goals_for > goals_against THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN goals_for = goals_against THEN 1 ELSE 0 END) AS draws,
      SUM(CASE WHEN goals_for < goals_against THEN 1 ELSE 0 END) AS losses,
      SUM(goals_for) AS goals_for,
      SUM(goals_against) AS goals_against
    FROM matches
    WHERE ${sameOpponent()}
  `).bind(opponent).first();

  const { results: recent } = await env.DB.prepare(`
    SELECT m.match_date, m.goals_for, m.goals_against, c.name AS competition_name
    FROM matches m
    LEFT JOIN competitions c ON c.id = m.competition_id
    WHERE ${sameOpponent("m")}
    ORDER BY m.match_date DESC
    LIMIT 3
  `).bind(opponent).all();

  return json(200, {
    opponent: opponent.trim(),
    played: totals?.played ?? 0,
    wins: totals?.wins ?? 0,
    draws: totals?.draws ?? 0,
    losses: totals?.losses ?? 0,
    goals_for: totals?.goals_for ?? 0,
    goals_against: totals?.goals_against ?? 0,
    recent: recent ?? [],
  });
}
