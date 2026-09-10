//
// Cloudflare Worker die de Footy-uitslagen op vaste momenten ophaalt.
//
// De planning staat in wrangler.toml. GitHub Actions kan hetzelfde werk doen
// via scripts/sync-footy-results.mjs, maar die schedule-trigger levert runs
// soms uren te laat af; deze Worker is de automatische route en Actions blijft
// als handmatige noodknop staan.
//
// Secrets zet je met `wrangler secret put <naam>` (zie README.md).
//

import {
  syncFootyResults,
  aliasMap,
  formatReport,
  hasProblems,
  SyncError,
} from "../../../scripts/footy-sync-core.mjs";

// Wrangler bundelt dit JSON-bestand mee; de Worker heeft geen bestandssysteem.
import aliasData from "../../../scripts/footy-team-aliases.json";

// Zowel de cron als de handmatige fetch komen hier uit.
async function run(env, { dryRun = false, updateScores = false } = {}) {
  const lines = [];
  const record = (line) => {
    lines.push(line);
    console.log(line);
  };

  const result = await syncFootyResults({
    email: env.FOOTY_EMAIL,
    password: env.FOOTY_PASSWORD,
    adminToken: env.APP_ADMIN_TOKEN,
    appBaseUrl: env.APP_BASE_URL,
    // Beide optioneel: zonder deze twee zoekt de synchronisatie zelf de
    // actieve competitie in de app en de bijbehorende Footy-competitie erbij.
    appCompetition: env.APP_COMPETITION,
    footyLeague: env.FOOTY_LEAGUE,
    firebaseApiKey: env.FOOTY_FIREBASE_API_KEY,
    graphqlUrl: env.FOOTY_GRAPHQL_URL,
    setClaimsUrl: env.FOOTY_SET_CLAIMS_URL,
    aliases: aliasMap(aliasData),
    dryRun,
    updateScores,
    onLog: record,
    onDebug: (line) => console.log("   ·", line),
  });

  for (const line of formatReport(result)) record(line);
  return { result, lines };
}

export default {
  // Draait op de momenten uit wrangler.toml.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const { result } = await run(env);
        // Gooien maakt de run zichtbaar mislukt in het Cloudflare-dashboard, zodat
        // een naamswijziging bij Footy niet weken onopgemerkt doorloopt.
        if (hasProblems(result)) {
          throw new Error("Synchronisatie klaar, maar er is iets blijven liggen — zie de log hierboven.");
        }
      } catch (err) {
        console.error(err instanceof SyncError ? `✖ ${err.message}` : err);
        throw err;
      }
    })());
  },

  // Handmatig aanroepen kan ook, mits je het token meestuurt. Zonder
  // SYNC_TRIGGER_TOKEN is deze ingang dicht; de cron werkt dan gewoon.
  async fetch(request, env) {
    const url = new URL(request.url);
    const expected = env.SYNC_TRIGGER_TOKEN;
    const offered = request.headers.get("x-sync-token") || url.searchParams.get("token") || "";

    if (!expected || offered !== expected) {
      return new Response("Niet toegestaan.\n", { status: 403 });
    }

    try {
      const { result, lines } = await run(env, {
        dryRun: url.searchParams.get("dry_run") === "true",
        updateScores: url.searchParams.get("update_scores") === "true",
      });
      return new Response(`${lines.join("\n")}\n`, {
        status: hasProblems(result) ? 500 : 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    } catch (err) {
      const message = err instanceof SyncError ? err.message : String(err);
      return new Response(`✖ ${message}\n`, {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  },
};
