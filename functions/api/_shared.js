// Simpele gedeelde-wachtwoord check voor schrijf-acties (POST/PUT/DELETE).
// Het wachtwoord staat als omgevingsvariabele ADMIN_PASSWORD in Cloudflare
// (Pages project -> Settings -> Environment variables) en wordt nooit naar
// de browser gestuurd. Bestanden die met een underscore beginnen worden
// door Cloudflare Pages Functions automatisch overgeslagen als route.

export function requireAdmin(request, env) {
  const expected = env.ADMIN_PASSWORD;

  if (!expected) {
    return { ok: false, status: 500, error: "ADMIN_PASSWORD is niet ingesteld op de server" };
  }

  const provided = request.headers.get("x-admin-token");
  if (!provided || provided !== expected) {
    return { ok: false, status: 401, error: "Niet gemachtigd om te bewerken" };
  }

  return { ok: true };
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Vergelijksleutel voor tegenstandersnamen. Dezelfde club wordt tussen
// seizoenen net anders getypt ("Trust the Process FC" vs "Trust The Process
// FC"); zo vallen hoofdletters, randspaties en dubbele spaties samen. Drie
// geneste REPLACEs plakken ook langere reeksen spaties tot één samen (elke
// ronde halveert een reeks).
const collapseSpaces = (expr) => `REPLACE(${expr}, '  ', ' ')`;

export const nameKey = (expr) =>
  collapseSpaces(collapseSpaces(collapseSpaces(`LOWER(TRIM(${expr}))`)));

// JS-tegenhanger van nameKey() voor vergelijkingen buiten SQL om, bijv. om te
// zien of een hernoeming alleen de schrijfwijze verandert. Dit collapst álle
// witruimte in één keer (\s+) waar de SQL-variant drie REPLACE-rondes op
// spaties doet; voor teamnamen komt dat op hetzelfde neer.
export const normalizeName = (name) =>
  String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
