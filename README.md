# FC Caesar Salad — TeamStats (Cloudflare-editie)

Programma, uitslagen, selectie, statistieken en stand van FC Caesar Salad. Draait volledig op Cloudflare: **Pages** voor hosting + Functions, **D1** (SQLite) als database.

## Wat is er anders dan de Netlify-versie?

- De database is nu **D1** (SQLite) in plaats van Netlify's Postgres — schema en queries zijn herschreven, functionaliteit is 1-op-1 hetzelfde.
- De API-functies staan nu in `functions/api/` (Cloudflare Pages Functions) in plaats van `netlify/functions/`.
- Geen `netlify.toml` meer — Cloudflare herkent `functions/api/*.js` automatisch als `/api/*`-routes, geen aparte redirect nodig.
- De frontend (`public/`) is ongewijzigd.
- Je huidige Netlify-data hoeft niet mee — dit is een schone start.

## Eenmalige setup

### 1. Zet de code op GitHub

```
cd fc-caesar-salad
git init
git add .
git commit -m "Initial commit: Cloudflare-editie"
```
Maak daarna een nieuwe (private) repository aan op github.com, en volg de instructies die GitHub toont om je lokale repo te koppelen en te pushen (`git remote add origin ...` + `git push -u origin main`).

### 2. Maak de D1-database aan

Installeer eerst de Wrangler CLI als je die nog niet hebt:
```
npm install -g wrangler
wrangler login
```

Maak de database aan:
```
wrangler d1 create fc-caesar-salad-db
```
Dit toont een `database_id`. **Kopieer die en plak 'm in `wrangler.toml`**, op de regel `database_id = "VERVANG_MET_JE_EIGEN_DATABASE_ID"`.

Zet het schema erop:
```
wrangler d1 execute fc-caesar-salad-db --remote --file=schema/schema.sql
```

### 3. Koppel het project aan Cloudflare Pages

In het Cloudflare-dashboard:
1. Ga naar **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. Kies je GitHub-repository
3. Build-instellingen: **Framework preset: None**, **Build command: (leeg laten)**, **Build output directory: `public`**
4. Klik op **Save and Deploy**

### 4. Koppel de D1-database aan het Pages-project

Na de eerste deploy (mag ook falen op dit punt, dat is prima):
1. Ga naar je Pages-project → **Settings** → **Bindings** → **Add** → **D1 database binding**
2. Variabelenaam: `DB`
3. Kies de database `fc-caesar-salad-db`
4. Sla op en **deploy het project opnieuw** (Deployments → laatste deploy → Retry deployment), anders wordt de binding niet actief

### 5. Zet je wachtwoord voor bewerken

1. Ga naar **Settings** → **Environment variables**
2. Voeg toe: naam `ADMIN_PASSWORD`, waarde naar keuze
3. Herdeploy opnieuw zodat de variabele actief wordt

### 6. Klaar

Je site draait op `https://fccaesarsalad.nl` (gekoppeld als custom domain aan het Cloudflare Pages-project). Open de site, klik op het hangslotje 🔒 rechtsboven, vul je wachtwoord in, en voeg FC Caesar Salad toe als team bij Stand (of laat de app dat automatisch doen zodra je de eerste gespeelde wedstrijd invoert).

## Lokaal testen

```
npm install
wrangler d1 execute fc-caesar-salad-db --local --file=schema/schema.sql
wrangler pages dev public
```
Dit draait de site + functions + een lokale D1-database op je eigen computer, meestal op `http://localhost:8788`. Voor lokale testen met het wachtwoord-slot: maak een bestand `.dev.vars` aan in de projectroot met daarin `ADMIN_PASSWORD=jouwwachtwoord`.

## Uitslagen van de andere teams automatisch ophalen

De stand klopt alleen als ook de wedstrijden van de andere teams in de app
staan. Die hoeven niet met de hand ingevoerd te worden:
`scripts/sync-footy-results.mjs` haalt ze op uit de Footy-app en zet ze via
`/api/results` in de database.

Eigen wedstrijden slaat het script bewust over — die voer je in via
"Programma & uitslagen", waarna de app ze zelf naar de stand doorrekent.

### Handmatig draaien

```
FOOTY_EMAIL=... FOOTY_PASSWORD=... APP_ADMIN_TOKEN=... \
  node scripts/sync-footy-results.mjs --dry-run
```

Laat `--dry-run` weg om echt weg te schrijven. Verder:

| Optie | Doet |
| --- | --- |
| `--dry-run` | Laat zien wat er zou gebeuren, schrijft niets weg (`APP_ADMIN_TOKEN` niet nodig) |
| `--update-scores` | Overschrijft een al ingevoerde uitslag als Footy een andere stand heeft |
| `--verbose` | Extra uitleg over welke competitie en wedstrijden gekozen zijn |

Omgevingsvariabelen:

| Variabele | Verplicht | Betekenis |
| --- | --- | --- |
| `FOOTY_EMAIL` / `FOOTY_PASSWORD` | ja | Inloggegevens van een Footy-account dat in het team zit |
| `APP_ADMIN_TOKEN` | ja (tenzij `--dry-run`) | Hetzelfde wachtwoord als `ADMIN_PASSWORD` in Cloudflare |
| `APP_BASE_URL` | nee | Standaard `https://fccaesarsalad.nl`; voor lokaal testen `http://localhost:8788` |
| `APP_COMPETITION` | nee | Naam of id van de competitie in de app; leeg = de enige actieve competitie |
| `FOOTY_LEAGUE` | nee | Naam of id van de competitie bij Footy; leeg = automatisch op naam gezocht |

Zonder `APP_COMPETITION` en `FOOTY_LEAGUE` zoekt het script zelf de actieve
competitie op en koppelt daar de Footy-competitie met de meest overeenkomende
naam aan ("Competitie dinsdag 5v5 Herfst 2026" ↔ "FPU Dinsdag 5v5 Herfst
2026"). Twijfelt het, dan stopt het met een melding in plaats van de verkeerde
competitie te vullen.

### Wekelijks automatisch

`.github/workflows/sync-footy-results.yml` draait dinsdagnacht en
woensdagochtend. De tweede run vangt op dat een scheidsrechter de stand pas de
volgende dag invoert; staat een uitslag er al in, dan doet het script niets.

Zet daarvoor eenmalig in de GitHub-repo onder **Settings** → **Secrets and
variables** → **Actions** deze *secrets*: `FOOTY_EMAIL`, `FOOTY_PASSWORD` en
`APP_ADMIN_TOKEN`. De optionele *variables* `APP_BASE_URL`, `APP_COMPETITION`
en `FOOTY_LEAGUE` kun je leeg laten.

Onder het tabblad **Actions** kun je 'm ook met de hand starten, met of zonder
proefrun.

### Als er een team niet gevonden wordt

Footy en de app schrijven een teamnaam niet altijd hetzelfde. Hoofdletters,
accenten en dubbele spaties negeert het script al; is het verschil groter
(bijv. "Noord CF" tegenover "Team Noord"), dan meldt het script dat en stopt de
run met een foutcode, zodat de workflow rood wordt. Los het op door het team in
de app te hernoemen, of door de naam toe te voegen aan
`scripts/footy-team-aliases.json`:

```json
{ "aliases": { "Noord CF": "Team Noord" } }
```

## Nieuwe wijzigingen later doorvoeren

Omdat de repo nu aan GitHub gekoppeld is: elke keer dat er een update is, hoef je alleen de gewijzigde bestanden te committen en te pushen (`git add . && git commit -m "..." && git push`) — Cloudflare bouwt en deployt daarna automatisch. Wijzigt het databaseschema, dan voer je het nieuwe SQL-bestand nog los uit met `wrangler d1 execute fc-caesar-salad-db --remote --file=...`.
