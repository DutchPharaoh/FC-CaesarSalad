#!/usr/bin/env node
//
// Haalt de uitslagen van de andere teams uit de Footy-app op en zet ze in de
// database van deze app, via de bestaande /api/results-route.
//
//   node scripts/sync-footy-results.mjs --dry-run
//   node scripts/sync-footy-results.mjs
//
// Het echte werk staat in scripts/footy-sync-core.mjs, dat ook door de
// Cloudflare Worker in workers/footy-sync/ wordt gebruikt. Dit bestand leest
// alleen de vlaggen, de omgevingsvariabelen en de vertaaltabel, en print de
// samenvatting. Zie README.md voor de benodigde omgevingsvariabelen.
//
// De workflow in GitHub Actions draait dit nog als handmatige noodknop; de
// automatische synchronisatie loopt via de Worker.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { syncFootyResults, aliasMap, formatReport, hasProblems, SyncError } from "./footy-sync-core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const UPDATE_SCORES = args.has("--update-scores");
const VERBOSE = args.has("--verbose");

for (const arg of args) {
  if (!["--dry-run", "--update-scores", "--verbose"].includes(arg)) {
    fail(`Onbekende optie: ${arg}\nGebruik: node scripts/sync-footy-results.mjs [--dry-run] [--update-scores] [--verbose]`);
  }
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(2);
}

// Ontbreekt het bestand, dan zijn er simpelweg geen aliassen.
function loadAliases() {
  try {
    return aliasMap(JSON.parse(readFileSync(join(HERE, "footy-team-aliases.json"), "utf8")));
  } catch (err) {
    if (err.code === "ENOENT") return new Map();
    throw err;
  }
}

let result;
try {
  result = await syncFootyResults({
    email: process.env.FOOTY_EMAIL,
    password: process.env.FOOTY_PASSWORD,
    adminToken: process.env.APP_ADMIN_TOKEN,
    appBaseUrl: process.env.APP_BASE_URL,
    // Beide optioneel: zonder deze twee zoekt de synchronisatie zelf de
    // actieve competitie in de app en de bijbehorende Footy-competitie erbij.
    appCompetition: process.env.APP_COMPETITION,
    footyLeague: process.env.FOOTY_LEAGUE,
    firebaseApiKey: process.env.FOOTY_FIREBASE_API_KEY,
    graphqlUrl: process.env.FOOTY_GRAPHQL_URL,
    setClaimsUrl: process.env.FOOTY_SET_CLAIMS_URL,
    aliases: loadAliases(),
    dryRun: DRY_RUN,
    updateScores: UPDATE_SCORES,
    onLog: (line) => console.log(line),
    onDebug: (line) => {
      if (VERBOSE) console.log("   ·", line);
    },
  });
} catch (err) {
  if (err instanceof SyncError) fail(err.message);
  throw err;
}

for (const line of formatReport(result)) console.log(line);

// Rood in GitHub Actions zodra er iets is blijven liggen: zo blijft een
// naamswijziging bij Footy niet weken onopgemerkt doorlopen.
if (hasProblems(result)) process.exit(1);
