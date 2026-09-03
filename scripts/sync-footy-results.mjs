#!/usr/bin/env node
//
// Haalt de uitslagen van de andere teams uit de Footy-app op en zet ze in de
// database van deze app, via de bestaande /api/results-route.
//
//   node scripts/sync-footy-results.mjs --dry-run
//   node scripts/sync-footy-results.mjs
//
// Werkt zonder browser: de Footy-app praat met een Hasura GraphQL-API achter
// Firebase-authenticatie, en dat doet dit script ook. Zie README.md voor de
// benodigde omgevingsvariabelen en het GitHub Actions-schema.
//
// Eigen wedstrijden worden bewust overgeslagen: die voer je in via
// "Programma & uitslagen", waarna de app ze zelf naar league_results
// synchroniseert (zie functions/api/matches.js).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

// Publieke Firebase-web-API-sleutel van de Footy-app; staat ook gewoon in hun
// JavaScript-bundle. Geen geheim, wel overschrijfbaar mocht Footy 'm wisselen.
const FIREBASE_API_KEY = process.env.FOOTY_FIREBASE_API_KEY
  || "AIzaSyAC8jStLY7SjLQ7LVEP_dpqsBx-ZL7GNzc";
const FOOTY_GRAPHQL_URL = process.env.FOOTY_GRAPHQL_URL || "https://api.footy.eu/v1/graphql";
const SET_CLAIMS_URL = process.env.FOOTY_SET_CLAIMS_URL
  || "https://europe-west1-footy-users.cloudfunctions.net/setHasuraClaims";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const UPDATE_SCORES = args.has("--update-scores");
const VERBOSE = args.has("--verbose");

for (const arg of args) {
  if (!["--dry-run", "--update-scores", "--verbose"].includes(arg)) {
    fail(`Onbekende optie: ${arg}\nGebruik: node scripts/sync-footy-results.mjs [--dry-run] [--update-scores] [--verbose]`);
  }
}

const CONFIG = {
  email: required("FOOTY_EMAIL"),
  password: required("FOOTY_PASSWORD"),
  appBaseUrl: (process.env.APP_BASE_URL || "https://fccaesarsalad.nl").replace(/\/+$/, ""),
  adminToken: process.env.APP_ADMIN_TOKEN || "",
  // Beide optioneel: zonder deze twee zoekt het script zelf de actieve
  // competitie in de app en de bijpassende Footy-competitie erbij.
  footyLeague: process.env.FOOTY_LEAGUE || "",
  appCompetition: process.env.APP_COMPETITION || "",
};

if (!DRY_RUN && !CONFIG.adminToken) {
  fail("APP_ADMIN_TOKEN ontbreekt (nodig om te schrijven). Gebruik --dry-run om alleen te kijken.");
}

function required(name) {
  const value = process.env[name];
  if (!value) fail(`${name} ontbreekt.`);
  return value;
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(2);
}

function log(...parts) {
  console.log(...parts);
}

function debug(...parts) {
  if (VERBOSE) console.log("   ·", ...parts);
}

// ---------------------------------------------------------------------------
// Namen vergelijken
// ---------------------------------------------------------------------------

// Zelfde gedachte als nameKey() in functions/api/_shared.js: hoofdletters,
// rand- en dubbele spaties en accenten mogen geen verschil maken. Zo blijft
// "Trust The Process FC" gelijk aan "Trust the process FC".
function nameKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function loadAliases() {
  const path = join(HERE, "footy-team-aliases.json");
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return new Map();
    throw err;
  }

  const parsed = JSON.parse(raw);
  const entries = Object.entries(parsed.aliases || {});
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

function hasuraClaims(idToken) {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
    return payload["https://hasura.io/jwt/claims"] || null;
  } catch {
    return null;
  }
}

async function footyLogin() {
  const signIn = await postJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    { email: CONFIG.email, password: CONFIG.password, returnSecureToken: true }
  );
  if (!signIn.ok || !signIn.body?.idToken) {
    fail(`Inloggen bij Footy mislukt (${signIn.status}): ${signIn.body?.error?.message || signIn.text.slice(0, 200)}`);
  }

  const { idToken, refreshToken, localId } = signIn.body;
  if (hasuraClaims(idToken)) {
    debug("Hasura-claims zaten al in het verse token.");
    return { token: idToken, firebaseId: localId };
  }

  // Een gloednieuw account heeft de claims nog niet; Footy zet ze via deze
  // callable function en pas een ververst token draagt ze.
  debug("Geen Hasura-claims in het token; setHasuraClaims aanroepen.");
  const claims = await postJson(SET_CLAIMS_URL, { data: { uid: localId } }, { authorization: `Bearer ${idToken}` });
  if (!claims.ok) {
    fail(`setHasuraClaims mislukte (${claims.status}): ${claims.text.slice(0, 200)}`);
  }

  const refreshed = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  const refreshedBody = await refreshed.json().catch(() => null);
  const token = refreshedBody?.access_token || refreshedBody?.id_token;
  if (!token) fail(`Token verversen mislukte (${refreshed.status}).`);

  return { token, firebaseId: localId };
}

async function gql(token, query, variables) {
  const result = await postJson(FOOTY_GRAPHQL_URL, { query, variables }, { authorization: `Bearer ${token}` });
  if (!result.ok || result.body?.errors) {
    const detail = result.body?.errors?.map((e) => e.message).join("; ") || result.text.slice(0, 200);
    fail(`Footy GraphQL-fout (${result.status}): ${detail}`);
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

async function appRequest(method, path, body) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") headers["x-admin-token"] = CONFIG.adminToken;

  const response = await fetch(`${CONFIG.appBaseUrl}${path}`, {
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

function pickAppCompetition(competitions) {
  if (CONFIG.appCompetition) {
    const wanted = CONFIG.appCompetition;
    const found = competitions.find((c) => String(c.id) === String(wanted))
      || competitions.find((c) => nameKey(c.name) === nameKey(wanted));
    if (!found) fail(`APP_COMPETITION "${wanted}" komt niet overeen met een competitie in de app.`);
    return found;
  }

  const active = competitions.filter((c) => c.status === "actief");
  if (active.length === 0) fail("Geen actieve competitie in de app gevonden. Zet APP_COMPETITION om er zelf een te kiezen.");
  if (active.length > 1) {
    fail(
      `Meerdere actieve competities in de app (${active.map((c) => `${c.id}: ${c.name}`).join(", ")}). `
      + "Zet APP_COMPETITION op de juiste naam of id."
    );
  }
  return active[0];
}

// Namen lopen niet gelijk ("Competitie dinsdag 5v5 Herfst 2026" in de app,
// "FPU Dinsdag 5v5 Herfst 2026" bij Footy), dus vergelijken we op losse
// woorden: het seizoen, de dag en het jaar moeten overeenkomen. Bij twijfel
// stopt het script liever dan de verkeerde competitie te vullen.
function scoreOverlap(a, b) {
  const tokens = (value) => new Set(nameKey(value).split(" ").filter((t) => t.length > 1));
  const left = tokens(a);
  let shared = 0;
  for (const token of tokens(b)) if (left.has(token)) shared += 1;
  return shared;
}

function pickFootyLeague(leagues, appCompetitionName) {
  if (leagues.length === 0) fail("Geen lopende Footy-competities gevonden voor dit account.");

  if (CONFIG.footyLeague) {
    const wanted = CONFIG.footyLeague;
    const found = leagues.find((l) => l.id === wanted)
      || leagues.find((l) => nameKey(l.name) === nameKey(wanted))
      || leagues.find((l) => nameKey(l.name).includes(nameKey(wanted)));
    if (!found) {
      fail(`FOOTY_LEAGUE "${wanted}" niet gevonden. Beschikbaar: ${leagues.map((l) => `${l.id} (${l.name})`).join(", ")}`);
    }
    return found;
  }

  if (leagues.length === 1) return leagues[0];

  const scored = leagues
    .map((league) => ({ league, score: scoreOverlap(league.name, appCompetitionName) }))
    .sort((a, b) => b.score - a.score);

  const [best, runnerUp] = scored;
  if (best.score < 2 || (runnerUp && runnerUp.score === best.score)) {
    fail(
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

const { token, firebaseId } = await footyLogin();
log(`✓ Ingelogd bij Footy als ${CONFIG.email}`);

const player = (await gql(token, Q_PLAYER, { firebaseId })).players[0];
if (!player) fail("Geen spelersprofiel gevonden bij dit Footy-account.");
const ownFootyTeams = player.join_players_teams.map((t) => t.team);
if (ownFootyTeams.length === 0) fail("Dit Footy-account zit in geen enkel team.");

const leagueMap = new Map();
for (const team of ownFootyTeams) {
  for (const league of (await gql(token, Q_LEAGUES, { teamId: team.id })).leagues) {
    leagueMap.set(league.id, league);
  }
}

const competitions = await appRequest("GET", "/api/competitions");
const competition = pickAppCompetition(competitions);
const league = pickFootyLeague([...leagueMap.values()], competition.name);
log(`✓ Footy "${league.name}" → app "${competition.name}" (competition_id ${competition.id})`);

const today = new Date().toISOString().slice(0, 10);
const footyMatches = (await gql(token, Q_RESULTS, { leagueId: league.id, currentDate: today })).matches;
log(`✓ ${footyMatches.length} gespeelde wedstrijd(en) bij Footy`);

const appTeams = await appRequest("GET", `/api/teams?competition_id=${competition.id}`);
const appResults = await appRequest("GET", `/api/results?competition_id=${competition.id}`);

const aliases = loadAliases();
const teamsByKey = new Map(appTeams.map((team) => [nameKey(team.name), team]));

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
    // ook omgedraaid, anders meldt het script een verschil dat er niet is.
    const flipped = found.home_team_id !== home.id;
    const appHome = flipped ? found.away_goals : found.home_goals;
    const appAway = flipped ? found.home_goals : found.away_goals;

    if (appHome === match.home_score && appAway === match.away_score) {
      alreadyPresent += 1;
      continue;
    }

    scoreMismatches.push({ label, found, appHome, appAway });
    if (!UPDATE_SCORES) continue;

    if (DRY_RUN) {
      updated.push(label);
      continue;
    }
    try {
      await appRequest("PUT", `/api/results?id=${found.id}`, {
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

  if (DRY_RUN) {
    added.push(label);
    continue;
  }

  try {
    await appRequest("POST", "/api/results", {
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

// ---------------------------------------------------------------------------
// Samenvatting
// ---------------------------------------------------------------------------

log("");
if (DRY_RUN) log("— proefrun (--dry-run): er is niets weggeschreven —\n");

if (added.length) {
  log(`Toegevoegd (${added.length}):`);
  for (const line of added) log(`  + ${line}`);
} else {
  log("Toegevoegd: geen nieuwe uitslagen.");
}

if (updated.length) {
  log(`\nBijgewerkt (${updated.length}):`);
  for (const line of updated) log(`  ~ ${line}`);
}

log(
  `\nStond al goed in de app: ${alreadyPresent}`
  + ` · eigen wedstrijden overgeslagen: ${skippedOwn}`
);

if (scoreMismatches.length && !UPDATE_SCORES) {
  log(`\n! Afwijkende stand t.o.v. de app (${scoreMismatches.length}) — draai met --update-scores om te overschrijven:`);
  for (const m of scoreMismatches) log(`  ! Footy: ${m.label} · app: ${m.appHome}-${m.appAway}`);
}

if (unmapped.size) {
  log(`\n! Deze Footy-teams hebben geen team met dezelfde naam in de app (${unmapped.size}):`);
  for (const name of unmapped.values()) log(`  ! "${name}"`);
  log("  Hernoem het team in de app, of voeg de naam toe aan scripts/footy-team-aliases.json.");
}

if (failures.length) {
  log(`\n✖ Mislukt (${failures.length}):`);
  for (const line of failures) log(`  ✖ ${line}`);
}

// Rood in GitHub Actions zodra er iets is blijven liggen: zo blijft een
// naamswijziging bij Footy niet weken onopgemerkt doorlopen.
if (failures.length || unmapped.size || (scoreMismatches.length && !UPDATE_SCORES)) {
  process.exit(1);
}
