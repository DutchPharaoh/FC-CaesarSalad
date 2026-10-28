/* Service worker van FC Caesar Salad.
 *
 * Doel: de app opent ook zonder (goed) bereik en toont dan de laatst geladen
 * gegevens. Een nieuwe deploy moet wél meteen zichtbaar zijn, dus:
 *
 * - App-bestanden en API-GET's: netwerk eerst, cache als terugval. Elk
 *   geslaagd antwoord wordt bewaard. Duurt het netwerk te lang en hebben we
 *   een kopie, dan krijg je die kopie (handig bij één streepje langs het veld).
 * - Lettertypes van Google: cache eerst, ze veranderen nooit.
 * - Schrijfacties (POST/PUT/DELETE) en de aanmeldingen (alleen voor beheer)
 *   gaan altijd gewoon naar het netwerk en worden nooit bewaard.
 *
 * Verhoog VERSION alleen als de cache-opbouw zelf verandert; voor gewone
 * deploys is dat niet nodig.
 */
const VERSION = "v1";
const APP_CACHE = `app-${VERSION}`;
const FONT_CACHE = `fonts-${VERSION}`;
const NETWORK_TIMEOUT_MS = 4000;

const PRECACHE = [
  "/",
  "/app.js",
  "/style.css",
  "/logo.jpeg",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== APP_CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/signup")) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, "/"));
    return;
  }

  event.respondWith(networkFirst(req));
});

async function networkFirst(req, fallbackKey) {
  const cache = await caches.open(APP_CACHE);
  // App-bestanden worden met ?v=… opgevraagd; die versie maakt voor de
  // terugval niet uit. API-antwoorden verschillen wél per querystring.
  const isApi = new URL(req.url).pathname.startsWith("/api/");
  const matchOpts = isApi ? {} : { ignoreSearch: true };

  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  });

  const cached = await cache.match(fallbackKey || req, matchOpts);
  if (!cached) return network;

  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS));
  const res = await Promise.race([network.catch(() => null), timeout]);
  if (res) return res;
  return markFromCache(cached);
}

async function cacheFirst(req) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone()).catch(() => {});
  return res;
}

// Laat de app weten dat dit een bewaarde kopie is (zie api() in app.js).
function markFromCache(res) {
  const headers = new Headers(res.headers);
  headers.set("X-From-SW-Cache", "1");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
