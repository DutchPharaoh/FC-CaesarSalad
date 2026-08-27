import { json, nameKey } from "./_shared.js";

// Alle tegenstanders die ooit zijn ingevoerd, over alle competities heen.
// Voedt de suggestielijst bij "wedstrijd toevoegen": zonder deze lijst zie je
// in een nieuwe competitie alleen de teams van díé competitie, typ je een
// terugkerende club opnieuw, en levert een afwijkende schrijfwijze stilletjes
// een aparte H2H-reeks op.
//
// Per genormaliseerde naam blijft één schrijfwijze over. SQLite geeft bij een
// MAX()-aggregaat de overige kolommen uit precies díé rij, dus dat is de
// spelling van de meest recente wedstrijd.
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(`
    SELECT opponent AS name, MAX(match_date) AS last_played
    FROM matches
    GROUP BY ${nameKey("opponent")}
    ORDER BY LOWER(opponent)
  `).all();

  return json(200, results ?? []);
}
