import { requireAdmin, json, nameKey, normalizeName } from "./_shared.js";

// Teamnamen zijn binnen een competitie niet hoofdlettergevoelig: naast
// UNIQUE(name, competition_id) bewaakt de index idx_teams_name_nocase ook
// varianten die alleen in hoofdletters of spaties verschillen (zie
// schema/migrations/0007_teams_name_case_insensitive.sql). Beide leveren
// dezelfde SQLite-fout op.
const DUPLICATE_NAME_ERROR = "Er bestaat al een team met deze naam (hoofdletters tellen niet mee)";

const isDuplicateName = (err) => String(err?.message || "").includes("UNIQUE");

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
    if (isDuplicateName(err)) return json(409, { error: DUPLICATE_NAME_ERROR });
    throw err;
  }
}

// Hernoemen raakt twee plekken. De stand rekent op teams.id (via
// league_results), dus die blijft bij een hernoeming vanzelf ongemoeid: punten,
// doelsaldo en uitslagen horen bij het team, niet bij de naam. Maar in
// `matches` staat de tegenstander als vrij tekstveld (matches.opponent), en
// daar hangen het programma, de tegenstander-suggesties (opponents.js) en de
// onderlinge balans (h2h.js) aan. Blijft dat veld op de oude naam staan, dan
// toont het programma de oude naam en maakt matches.js bij de eerstvolgende
// wijziging een tweede team aan onder de nieuwe naam — precies de dubbele
// halve regel in de stand die migratie 0007 wilde voorkomen.
//
// Daarom hernoemt deze route beide in één batch (D1 draait die als transactie).
async function competitionsUsingName(env, name) {
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT competition_id FROM teams
      WHERE ${nameKey("name")} = ${nameKey("?")} AND competition_id IS NOT NULL
     UNION
     SELECT DISTINCT competition_id FROM matches
      WHERE ${nameKey("opponent")} = ${nameKey("?")} AND competition_id IS NOT NULL`
  ).bind(name, name).all();
  return (results ?? []).map((r) => r.competition_id);
}

// Competities waar een ánder team de nieuwe naam al draagt. Daar kan niet
// hernoemd worden (UNIQUE per competitie); die slaan we over en melden we
// terug in plaats van de hele hernoeming te laten klappen.
async function competitionsWithNameClash(env, newName, teamId) {
  const { results } = await env.DB.prepare(
    `SELECT t.competition_id AS id, c.name AS competition_name
     FROM teams t
     LEFT JOIN competitions c ON c.id = t.competition_id
     WHERE ${nameKey("t.name")} = ${nameKey("?")} AND t.id <> ?`
  ).bind(newName, teamId).all();
  return results ?? [];
}

async function renameTeam(env, team, newName, allCompetitions) {
  // Alleen een andere schrijfwijze van dezelfde naam kan nooit botsen met de
  // unieke index — de clash-check zou dan juist elke andere competitie
  // onterecht overslaan.
  const spellingOnly = normalizeName(newName) === normalizeName(team.name);
  const allClashes = spellingOnly ? [] : await competitionsWithNameClash(env, newName, team.id);

  if (allClashes.some((c) => String(c.id) === String(team.competition_id))) {
    return { error: DUPLICATE_NAME_ERROR };
  }

  const candidates = allCompetitions
    ? await competitionsUsingName(env, team.name)
    : [team.competition_id];
  const wanted = [...new Set([String(team.competition_id), ...candidates.map(String)])];

  // Alleen botsingen in competities die we hier ook echt zouden aanraken zijn
  // een overslaan waard; de rest gaat deze hernoeming niets aan.
  const skipped = allClashes.filter((c) => wanted.includes(String(c.id)));
  const blocked = new Set(skipped.map((c) => String(c.id)));
  const targets = wanted.filter((id) => !blocked.has(id));

  const placeholders = targets.map(() => "?").join(", ");
  const [teamsUpdate, matchesUpdate] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE teams SET name = ?
       WHERE ${nameKey("name")} = ${nameKey("?")} AND competition_id IN (${placeholders})`
    ).bind(newName, team.name, ...targets),
    env.DB.prepare(
      `UPDATE matches SET opponent = ?
       WHERE ${nameKey("opponent")} = ${nameKey("?")} AND competition_id IN (${placeholders})`
    ).bind(newName, team.name, ...targets),
  ]);

  return {
    renamed_teams: teamsUpdate?.meta?.changes ?? 0,
    renamed_matches: matchesUpdate?.meta?.changes ?? 0,
    skipped_competitions: skipped.map((c) => c.competition_name).filter(Boolean),
  };
}

export async function onRequestPut({ request, env }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json(400, { error: "id ontbreekt" });

  const team = await env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(id).first();
  if (!team) return json(404, { error: "Team niet gevonden" });

  const body = await request.json();
  const wantsRename = body.name !== undefined && body.name !== null;
  const newName = wantsRename ? String(body.name).trim() : null;
  if (wantsRename && !newName) return json(400, { error: "Teamnaam is verplicht" });

  let rename = null;
  if (wantsRename && newName !== team.name) {
    try {
      rename = await renameTeam(env, team, newName, !!body.all_competitions);
    } catch (err) {
      if (isDuplicateName(err)) return json(409, { error: DUPLICATE_NAME_ERROR });
      throw err;
    }
    if (rename.error) return json(409, { error: rename.error });
  }

  if (body.is_own_team !== undefined && body.is_own_team !== null) {
    await env.DB.prepare("UPDATE teams SET is_own_team = ? WHERE id = ?")
      .bind(body.is_own_team ? 1 : 0, id).run();
  }

  const row = await env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(id).first();
  return json(200, {
    ...row,
    is_own_team: !!row.is_own_team,
    renamed_matches: rename?.renamed_matches ?? 0,
    renamed_competitions: rename?.renamed_teams ?? 0,
    skipped_competitions: rename?.skipped_competitions ?? [],
  });
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
