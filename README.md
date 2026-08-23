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

## Nieuwe wijzigingen later doorvoeren

Omdat de repo nu aan GitHub gekoppeld is: elke keer dat er een update is, hoef je alleen de gewijzigde bestanden te committen en te pushen (`git add . && git commit -m "..." && git push`) — Cloudflare bouwt en deployt daarna automatisch. Wijzigt het databaseschema, dan voer je het nieuwe SQL-bestand nog los uit met `wrangler d1 execute fc-caesar-salad-db --remote --file=...`.
