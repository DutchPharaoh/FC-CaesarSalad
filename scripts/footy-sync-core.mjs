//
// De kern van de Footy-synchronisatie, zonder Node-specifieke dingen.
//
// Deze module gebruikt alleen fetch, URLSearchParams en atob, zodat hij zowel
// in Node draait (scripts/sync-footy-results.mjs) als op Cloudflare Workers
// (workers/footy-sync/src/index.js). Vandaar geen node:fs, geen process en
// geen Buffer: het lezen van omgevingsvariabelen en van de vertaaltabel doet
// de aanroeper, en die geeft alles mee aan syncFootyResults().
//
// Eigen wedstrijden worden bewust overgeslagen: die voer je in via
// "Programma & uitslagen", waarna de app ze zelf naar league_results
// synchroniseert (zie functions/api/matches.js).
//

// Publieke Firebase-web-API-sleutel van de Footy-app; staat ook gewoon in hun
// JavaScript-bundle. Geen geheim, wel overschrijfbaar mocht Footy 'm wisselen.
export const DEFAULT_FIREBASE_API_KEY = "AIzaSyAC8jStLY7SjLQ7LVEP_dpqsBx-ZL7GNzc";
export const DEFAULT_GRAPHQL_URL = "https://api.footy.eu/v1/graphql";
export const DEFAULT_SET_CLAIMS_URL = "https://europe-west1-footy-users.cloudfunctions.net/setHasuraClaims";
export const DEFAULT_APP_BASE_URL = "https://fccaesarsalad.nl";

// Alles waar de synchronisatie op stukloopt en wat de gebruiker moet lezen.
// De aanroeper vangt 'm op en bepaalt zelf of dat een exit-code of een
// mislukte Worker-run wordt.
export class SyncError extends Error {
  constructor(message) {
    super(message);
    this.name = "SyncError";
  }
}

// ---------------------------------------------------------------------------
// Namen vergelijken
// ---------------------------------------------------------------------------

// Zelfde gedachte als nameKey() in functions/api/_shared.js: hoofdletters,
// rand- en dubbele spaties en accenten mogen geen verschil maken. Zo blijft
// "Trust The Process FC" gelijk aan "Trust the process FC".
export function nameKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// De vertaaltabel komt als het ruwe object uit footy-team-aliases.json binnen
// (in Node ingelezen van schijf, in de Worker als import) en gaat er hier als
// genormaliseerde Map uit.
export function aliasMap(parsed) {
  const entries = Object.entries(parsed?.aliases || {});
  return new Map(entries.map(([footyName, appName]) => [nameKey(footyName), nameKey(appName)]));
}

// ---------------------------------------------------------------------------
// Footy: inloggen en bevragen
// ---------------------------------------------------------------------------

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* laat parsed null; de aanroeper meldt de ruwe tekst */
  }
  return { ok: response.ok, status: response.status, body: parsed, text };
}

// base64url-decode zonder Buffer, want die bestaat niet op Workers.
function decodeJwtPayload(token) {
  const segment = token.split(".")[1];
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(segment.length + ((4 - (segment.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function hasuraClaims(idToken) {
  try {
    return decodeJwtPayload(idToken)["https://hasura.io/jwt/claims"] || null;
  } catch {
    return null;
  }
}

async function footyLogin(config, debug) {
  const signIn = await postJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.firebaseApiKey}`,
    { email: config.email, password: config.password, returnSecureToken: true }
  );
  if (!signIn.ok || !signIn.body?.idToken) {
    throw new SyncError(
      `Inloggen bij Footy mislukt (${signIn.status}): ${signIn.body?.error?.message || signIn.text.slice(0, 200)}`
    );
  }

  const { idToken, refreshToken, localId } = signIn.body;
  if (hasuraClaims(idToken)) {
    debug("Hasura-claims zaten al in het verse token.");
    return { token: idToken, firebaseId: localId };
  }

  // Een gloednieuw account heeft de claims nog niet; Footy zet ze via deze
  // callable function en pas een ververst token draagt ze.
  debug("Geen Hasura-claims in het token; setHasuraClaims aanroepen.");
  const claims = await postJson(
    config.setClaimsUrl,
    { data: { uid: localId } },
    { authorization: `Bearer ${idToken}` }
  );
  if (!claims.ok) {
    throw new SyncError(`setHasuraClaims mislukte (${claims.status}): ${claims.text.slice(0, 200)}`);
  }

  const refreshed = await fetch(`https://securetoken.googleapis.com/v1/token?key=${config.firebaseApiKey}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  const refreshedBody = await refreshed.json().catch(() => null);
  const token = refreshedBody?.access_token || refreshedBody?.id_token;
  if (!token) throw new SyncError(`Token verversen mislukte (${refreshed.status}).`);

  return { token, firebaseId: localId };
}

async function gql(config, token, query, variables) {
  const result = await postJson(config.graphqlUrl, { query, variables }, { authorization: `Bearer ${token}` });
  if (!result.ok || result.body?.errors) {
    const detail = result.body?.errors?.map((e) => e.message).join("; ") || result.text.slice(0, 200);
    throw new SyncError(`Footy GraphQL-fout (${result.status}): ${detail}`);
  }
  return result.body.data;
}

const Q_PLAYER = `query SyncPlayer($firebaseId: String!) {
  players(where: {firebase_id: {_eq: $firebaseId}}) {
    id
    join_players_teams { team: teamByTeam { id name } }
  }
}`;

const Q_LEAGUES = `query SyncLeagues($teamId: uuid!) {
  leagues(
    where: {_and: [{published: {_eq: true}}, {status: {_neq: "finished"}}], matches: {_or: [{home_team: {_eq: $teamId}}, {away_team: {_eq: $teamId}}]}}
  ) { id name: display_name kick_off_date }
}`;

// Dezelfde filters als de "See all teams"-uitslagenpagina in de Footy-app:
// alleen gespeelde wedstrijden met een ingevulde stand, geen placeholders
// uit nog niet ingedeelde bekerrondes.
const Q_RESULTS = `query SyncResults($leagueId: uuid!, $currentDate: date!) {
  matches(
    where: {_and: [{league: {_eq: $leagueId}}, {date: {_lte: $currentDate}}, {placeholder_home_team: {_is_null: true}}, {placeholder_away_team: {_is_null: true}}, {home_score: {_is_null: false}}, {away_score: {_is_null: false}}]}
  ) {
    id
    date
    home_score
    away_score
    home_team: teamByHomeTeam { id name }
    away_team: team { id name }
  }
}`;

// ---------------------------------------------------------------------------
// De app: lezen en schrijven via /api
// ---------------------------------------------------------------------------

async function appRequest(config, method, path, body) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") headers["x-admin-token"] = config.adminToken;

  const response = await fetch(`${config.appBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* niet-JSON antwoord; hieronder gemeld met de ruwe tekst */
  }
  if (!response.ok) {
    const detail = parsed?.error || text.slice(0, 200);
    throw new Error(`${method} ${path} gaf ${response.status}: ${detail}`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Competitie en Footy-competitie aan elkaar knopen
// ---------------------------------------------------------------------------

function pickAppCompetition(competitions, wanted) {
  if (wanted) {
    const found = competitions.find((c) => String(c.id) === String(wanted))
      || competitions.find((c) => nameKey(c.name) === nameKey(wanted));
    if (!found) throw new SyncError(`APP_COMPETITION "${wanted}" komt niet overeen met een competitie in de app.`);
    return found;
  }

  const active = competitions.filter((c) => c.status === "actief");
  if (active.length === 0) {
    throw new SyncError("Geen actieve competitie in de app gevonden. Zet APP_COMPETITION om er zelf een te kiezen.");
  }
  if (active.length > 1) {
    throw new SyncError(
      `Meerdere actieve competities in de app (${active.map((c) => `${c.id}: ${c.name}`).join(", ")}). `
      + "Zet APP_COMPETITION op de juiste naam of id."
    );
  }
  return active[0];
}

// Namen lopen niet gelijk ("Competitie dinsdag 5v5 Herfst 2026" in de app,
// "FPU Dinsdag 5v5 Herfst 2026" bij Footy), dus vergelijken we op losse
// woorden: het seizoen, de dag en het jaar moeten overeenkomen. Bij twijfel
// stopt de synchronisatie liever dan de verkeerde competitie te vullen.
function scoreOverlap(a, b) {
  const tokens = (value) => new Set(nameKey(value).split(" ").filter((t) => t.length > 1));
  const left = tokens(a);
  let shared = 0;
  for (const token of tokens(b)) if (left.has(token)) shared += 1;
  return shared;
}

function pickFootyLeague(leagues, appCompetitionName, wanted, debug) {
  if (leagues.length === 0) throw new SyncError("Geen lopende Footy-competities gevonden voor dit account.");

  if (wanted) {
    const found = leagues.find((l) => l.id === wanted)
      || leagues.find((l) => nameKey(l.name) === nameKey(wanted))
      || leagues.find((l) => nameKey(l.name).includes(nameKey(wanted)));
    if (!found) {
      throw new SyncError(
        `FOOTY_LEAGUE "${wanted}" niet gevonden. Beschikbaar: ${leagues.map((l) => `${l.id} (${l.name})`).join(", ")}`
      );
    }
    return found;
  }

  if (leagues.length === 1) return leagues[0];

  const scored = leagues
    .map((league) => ({ league, score: scoreOverlap(league.name, appCompetitionName) }))
    .sort((a, b) => b.score - a.score);

  const [best, runnerUp] = scored;
  if (best.score < 2 || (runnerUp && runnerUp.score === best.score)) {
    throw new SyncError(
      `Kan niet bepalen welke Footy-competitie bij "${appCompetitionName}" hoort. `
      + `Zet FOOTY_LEAGUE. Beschikbaar: ${leagues.map((l) => `${l.id} (${l.name})`).join(", ")}`
    );
  }
  debug(`Footy-competitie gekozen op naamovereenkomst (${best.score} woorden gemeen).`);
  return best.league;
}

// ---------------------------------------------------------------------------
// Hoofdprogramma
// ---------------------------------------------------------------------------

// options:
//   email, password            — Footy-account (verplicht)
//   adminToken                 — nodig om te schrijven, leeg mag bij dryRun
//   appBaseUrl, appCompetition, footyLeague
//   firebaseApiKey, graphqlUrl, setClaimsUrl
//   aliases                    — Map uit aliasMap(), of leeg
//   dryRun, updateScores       — zelfde betekenis als de vlaggen van het script
//   onLog, onDebug             — voortgang; standaard doen ze niets
//
// Geeft een samenvatting terug in plaats van te printen, zodat de aanroeper
// bepaalt hoe het eruitziet.
export async function syncFootyResults(options = {}) {
  const config = {
    email: options.email,
    password: options.password,
    adminToken: options.adminToken || "",
    appBaseUrl: (options.appBaseUrl || DEFAULT_APP_BASE_URL).replace(/\/+$/, ""),
    appCompetition: options.appCompetition || "",
    footyLeague: options.footyLeague || "",
    firebaseApiKey: options.firebaseApiKey || DEFAULT_FIREBASE_API_KEY,
    graphqlUrl: options.graphqlUrl || DEFAULT_GRAPHQL_URL,
    setClaimsUrl: options.setClaimsUrl || DEFAULT_SET_CLAIMS_URL,
  };

  const dryRun = Boolean(options.dryRun);
  const updateScores = Boolean(options.updateScores);
  const aliases = options.aliases instanceof Map ? options.aliases : new Map();
  const log = options.onLog || (() => {});
  const debug = options.onDebug || (() => {});

  if (!config.email) throw new SyncError("FOOTY_EMAIL ontbreekt.");
  if (!config.password) throw new SyncError("FOOTY_PASSWORD ontbreekt.");
  if (!dryRun && !config.adminToken) {
    throw new SyncError("APP_ADMIN_TOKEN ontbreekt (nodig om te schrijven). Draai als proefrun om alleen te kijken.");
  }

  const { token, firebaseId } = await footyLogin(config, debug);
  log(`✓ Ingelogd bij Footy als ${config.email}`);

  const player = (await gql(config, token, Q_PLAYER, { firebaseId })).players[0];
  if (!player) throw new SyncError("Geen spelersprofiel gevonden bij dit Footy-account.");
  const ownFootyTeams = player.join_players_teams.map((t) => t.team);
  if (ownFootyTeams.length === 0) throw new SyncError("Dit Footy-account zit in geen enkel team.");

  const leagueMap = new Map();
  for (const team of ownFootyTeams) {
    for (const league of (await gql(config, token, Q_LEAGUES, { teamId: team.id })).leagues) {
      leagueMap.set(league.id, league);
    }
  }

  const competitions = await appRequest(config, "GET", "/api/competitions");
  const competition = pickAppCompetition(competitions, config.appCompetition);
  const league = pickFootyLeague([...leagueMap.values()], competition.name, config.footyLeague, debug);
  log(`✓ Footy "${league.name}" → app "${competition.name}" (competition_id ${competition.id})`);

  const today = new Date().toISOString().slice(0, 10);
  const footyMatches = (await gql(config, token, Q_RESULTS, { leagueId: league.id, currentDate: today })).matches;
  log(`✓ ${footyMatches.length} gespeelde wedstrijd(en) bij Footy`);

  const appTeams = await appRequest(config, "GET", `/api/teams?competition_id=${competition.id}`);
  const appResults = await appRequest(config, "GET", `/api/results?competition_id=${competition.id}`);

  // Twee teams die alleen in hoofdletters of spaties verschillen horen sinds
  // migratie 0007 niet meer voor te komen, maar een database van voor die
  // migratie kan ze nog hebben. Stilzwijgend de laatste kiezen zou een uitslag
  // aan het verkeerde team hangen, dus melden we het en stoppen we ermee.
  const teamsByKey = new Map();
  const duplicateTeams = [];
  for (const team of appTeams) {
    const key = nameKey(team.name);
    const earlier = teamsByKey.get(key);
    if (earlier) {
      duplicateTeams.push(`"${earlier.name}" (id ${earlier.id}) en "${team.name}" (id ${team.id})`);
      continue;
    }
    teamsByKey.set(key, team);
  }
  if (duplicateTeams.length) {
    throw new SyncError(
      "Deze teams hebben in de app dezelfde naam op hoofdletters en spaties na:\n  "
      + duplicateTeams.join("\n  ")
      + "\nVoeg ze eerst samen in de app; anders belandt een uitslag bij het verkeerde team."
    );
  }

  function findAppTeam(footyName) {
    const key = nameKey(footyName);
    return teamsByKey.get(aliases.get(key) ?? key) || null;
  }

  // Sleutel van een uitslag: datum + beide teams. Uitslagen zonder datum in de
  // app kunnen we niet betrouwbaar herkennen, die tellen niet als bestaand.
  const resultKey = (date, homeId, awayId) => `${String(date).slice(0, 10)}|${homeId}|${awayId}`;
  const existing = new Map();
  for (const row of appResults) {
    if (!row.match_date) continue;
    existing.set(resultKey(row.match_date, row.home_team_id, row.away_team_id), row);
  }

  const added = [];
  const updated = [];
  const scoreMismatches = [];
  const unmapped = new Map();
  const failures = [];
  let skippedOwn = 0;
  let alreadyPresent = 0;

  // Oudste eerst, zodat de log de speelrondes in volgorde laat zien.
  footyMatches.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  for (const match of footyMatches) {
    const homeName = match.home_team?.name;
    const awayName = match.away_team?.name;
    if (!homeName || !awayName) {
      debug(`Wedstrijd ${match.id} heeft geen twee teams; overgeslagen.`);
      continue;
    }

    const label = `${match.date}  ${homeName} ${match.home_score}-${match.away_score} ${awayName}`;
    const home = findAppTeam(homeName);
    const away = findAppTeam(awayName);

    if (!home) unmapped.set(nameKey(homeName), homeName);
    if (!away) unmapped.set(nameKey(awayName), awayName);
    if (!home || !away) continue;

    if (home.is_own_team || away.is_own_team) {
      skippedOwn += 1;
      debug(`Eigen wedstrijd overgeslagen: ${label}`);
      continue;
    }

    const found = existing.get(resultKey(match.date, home.id, away.id))
      || existing.get(resultKey(match.date, away.id, home.id));

    if (found) {
      // Thuis en uit kunnen omgedraaid in de app staan; vergelijk de score dan
      // ook omgedraaid, anders meldt de synchronisatie een verschil dat er niet is.
      const flipped = found.home_team_id !== home.id;
      const appHome = flipped ? found.away_goals : found.home_goals;
      const appAway = flipped ? found.home_goals : found.away_goals;

      if (appHome === match.home_score && appAway === match.away_score) {
        alreadyPresent += 1;
        continue;
      }

      scoreMismatches.push({ label, appHome, appAway });
      if (!updateScores) continue;

      if (dryRun) {
        updated.push(label);
        continue;
      }
      try {
        await appRequest(config, "PUT", `/api/results?id=${found.id}`, {
          match_date: found.match_date,
          home_team_id: found.home_team_id,
          away_team_id: found.away_team_id,
          home_goals: flipped ? match.away_score : match.home_score,
          away_goals: flipped ? match.home_score : match.away_score,
          competition_id: competition.id,
          phase: found.phase,
          group_name: found.group_name,
          round_name: found.round_name,
        });
        updated.push(label);
      } catch (err) {
        failures.push(`${label} — ${err.message}`);
      }
      continue;
    }

    if (dryRun) {
      added.push(label);
      continue;
    }

    try {
      await appRequest(config, "POST", "/api/results", {
        match_date: match.date,
        home_team_id: home.id,
        away_team_id: away.id,
        home_goals: match.home_score,
        away_goals: match.away_score,
        competition_id: competition.id,
        phase: "competitie",
      });
      added.push(label);
      // Meteen bijhouden, zodat een dubbele wedstrijd in dezelfde run niet
      // alsnog twee keer wordt toegevoegd.
      existing.set(resultKey(match.date, home.id, away.id), {
        id: null,
        match_date: match.date,
        home_team_id: home.id,
        away_team_id: away.id,
        home_goals: match.home_score,
        away_goals: match.away_score,
      });
    } catch (err) {
      failures.push(`${label} — ${err.message}`);
    }
  }

  return {
    dryRun,
    updateScores,
    competition,
    league,
    footyMatchCount: footyMatches.length,
    added,
    updated,
    alreadyPresent,
    skippedOwn,
    scoreMismatches,
    unmapped: [...unmapped.values()],
    failures,
  };
}

// Er is iets blijven liggen: een mislukte schrijfactie, een Footy-team zonder
// tegenhanger in de app, of een stand die afwijkt terwijl we niet mochten
// overschrijven. In Actions wordt dat rood, in de Worker een mislukte run —
// zo blijft een naamswijziging bij Footy niet weken onopgemerkt doorlopen.
export function hasProblems(result) {
  return Boolean(
    result.failures.length
    || result.unmapped.length
    || (result.scoreMismatches.length && !result.updateScores)
  );
}

// Dezelfde samenvatting voor Node en de Worker, als losse regels.
export function formatReport(result) {
  const lines = [""];
  if (result.dryRun) lines.push("— proefrun: er is niets weggeschreven —", "");

  if (result.added.length) {
    lines.push(`Toegevoegd (${result.added.length}):`);
    for (const line of result.added) lines.push(`  + ${line}`);
  } else {
    lines.push("Toegevoegd: geen nieuwe uitslagen.");
  }

  if (result.updated.length) {
    lines.push("", `Bijgewerkt (${result.updated.length}):`);
    for (const line of result.updated) lines.push(`  ~ ${line}`);
  }

  lines.push(
    "",
    `Stond al goed in de app: ${result.alreadyPresent}`
    + ` · eigen wedstrijden overgeslagen: ${result.skippedOwn}`
  );

  if (result.scoreMismatches.length && !result.updateScores) {
    lines.push(
      "",
      `! Afwijkende stand t.o.v. de app (${result.scoreMismatches.length}) — draai met --update-scores om te overschrijven:`
    );
    for (const m of result.scoreMismatches) lines.push(`  ! Footy: ${m.label} · app: ${m.appHome}-${m.appAway}`);
  }

  if (result.unmapped.length) {
    lines.push("", `! Deze Footy-teams hebben geen team met dezelfde naam in de app (${result.unmapped.length}):`);
    for (const name of result.unmapped) lines.push(`  ! "${name}"`);
    lines.push("  Hernoem het team in de app, of voeg de naam toe aan scripts/footy-team-aliases.json.");
  }

  if (result.failures.length) {
    lines.push("", `✖ Mislukt (${result.failures.length}):`);
    for (const line of result.failures) lines.push(`  ✖ ${line}`);
  }

  return lines;
}
