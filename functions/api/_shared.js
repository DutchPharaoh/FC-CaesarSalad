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
