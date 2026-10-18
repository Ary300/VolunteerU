/* ==========================================================================
   /api/geocode, an address to a point on the map.

   GET ?q=<address>   returns { ok, data: { lat, lng, label } | null, error }

   Free geocoders only, called from the server so the browser never needs a key
   and the upstream usage rules are kept in one place:
     1. OpenStreetMap Nominatim, biased toward central Indiana. Their policy asks
        for a descriptive User-Agent and at most one request a second, so every
        Nominatim call goes through one queue.
     2. The US Census one-line address geocoder, when Nominatim finds nothing.
   An address that starts with a place name ("Carmel Clay Public Library, 425
   E Main St, Carmel, IN") is tried whole, then without the name.

   Answers are cached in memory and in Next's fetch cache for a day. Only
   lookups that would reach an upstream count toward the per-IP limit, so a
   page that redraws its map doesn't use it up. "Nothing found" is a 200 with
   data: null. Upstream failures come back as a 502 with a short error code,
   never the upstream's own message.
   ========================================================================== */

export const runtime = 'nodejs';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const HEADERS = { 'User-Agent': 'VolunteerU/1.0 (student project; www.volunteeruapp.com)', Accept: 'application/json' };
// Central Indiana, left,top,right,bottom. A bias only (bounded=0).
const VIEWBOX = '-86.6,40.3,-85.7,39.6';
const DAY_S = 86400;
const UPSTREAM_TIMEOUT_MS = 8000;
const NOMINATIM_GAP_MS = 1000;
const CACHE_MAX = 500;
const RATE_WINDOW_MS = 60_000;
// Lookups that reach an upstream, per IP per minute. The Nominatim queue
// already caps real upstream traffic at one a second; this only stops one
// client from filling that queue for everyone. A cold Discover page can need
// 25 or so (its listings plus up to 20 nonprofits).
const RATE_MAX = 90;
const Q_MIN = 3;
const Q_MAX = 200;

/* ---- envelope ------------------------------------------------------------- */

function reply(status, data, error = null) {
  const headers = status === 200 ? { 'Cache-Control': 'public, max-age=3600' } : status === 429 ? { 'Retry-After': '10' } : {};
  return Response.json({ ok: status === 200, data, error }, { status, headers });
}

/* ---- memory cache (insertion-ordered Map, oldest dropped first) ------------ */

const cache = new Map();

function cacheGet(key) {
  if (!cache.has(key)) return undefined;
  const v = cache.get(key);
  cache.delete(key);
  cache.set(key, v); // most recently used goes to the end
  return v;
}

function cachePut(key, value) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

/* ---- per-IP limit ----------------------------------------------------------- */

const hits = new Map(); // ip -> timestamps in the current window

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
}

function overLimit(ip, now = Date.now()) {
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    hits.set(ip, recent);
    return true;
  }
  hits.set(ip, [...recent, now]);
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return false;
}

/* ---- Nominatim queue: one call at a time, a second apart ------------------- */

let queue = Promise.resolve();
let lastCall = 0;

function throttled(fn) {
  const run = queue.then(async () => {
    const wait = lastCall + NOMINATIM_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

async function getJson(url, label) {
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: DAY_S }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!res.ok) throw Object.assign(new Error(`${label} status ${res.status}`), { upstream: true });
  return res.json();
}

const inRange = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

async function nominatim(q) {
  const u = new URL(NOMINATIM);
  u.searchParams.set('format', 'json');
  u.searchParams.set('limit', '1');
  u.searchParams.set('countrycodes', 'us');
  u.searchParams.set('viewbox', VIEWBOX);
  u.searchParams.set('bounded', '0');
  u.searchParams.set('q', q);
  const data = await throttled(() => getJson(u.toString(), 'nominatim'));
  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  return inRange(lat, lng) ? { lat, lng, label: String(hit.display_name || q).slice(0, 200) } : null;
}

async function census(q) {
  const u = new URL(CENSUS);
  u.searchParams.set('address', q);
  u.searchParams.set('benchmark', 'Public_AR_Current');
  u.searchParams.set('format', 'json');
  const data = await getJson(u.toString(), 'census');
  const hit = data && data.result && Array.isArray(data.result.addressMatches) ? data.result.addressMatches[0] : null;
  if (!hit || !hit.coordinates) return null;
  const lat = Number(hit.coordinates.y);
  const lng = Number(hit.coordinates.x);
  return inRange(lat, lng) ? { lat, lng, label: String(hit.matchedAddress || q).slice(0, 200) } : null;
}

/** "Carmel Clay Public Library, 425 E Main St, Carmel, IN" -> "425 E Main St, Carmel, IN"; '' when there's no leading name. */
function withoutPlaceName(q) {
  const parts = q.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3 || /\d/.test(parts[0])) return '';
  return parts.slice(1).join(', ');
}

/**
 * Tries each geocoder in turn. Returns a point, null when every geocoder
 * answered with no match, or throws when none of them could be reached.
 */
async function lookup(q) {
  const street = withoutPlaceName(q);
  const attempts = [() => nominatim(q), ...(street ? [() => nominatim(street)] : []), () => census(street || q)];
  let reached = false;
  let lastErr = null;
  for (const attempt of attempts) {
    try {
      const hit = await attempt();
      reached = true;
      if (hit) return hit;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!reached) throw lastErr || new Error('no geocoder reachable');
  return null;
}

/* ---- handler ---------------------------------------------------------------- */

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = String(searchParams.get('q') || '').replace(/\s+/g, ' ').trim();
  if (q.length < Q_MIN || q.length > Q_MAX) return reply(400, null, 'bad_query');

  const key = q.toLowerCase();
  const known = cacheGet(key);
  if (known !== undefined) return reply(200, known);

  if (overLimit(clientIp(request))) return reply(429, null, 'rate_limited');

  try {
    const hit = await lookup(q);
    cachePut(key, hit);
    return reply(200, hit);
  } catch (err) {
    console.error('[api/geocode] lookup failed', q, err && err.message);
    return reply(502, null, 'upstream');
  }
}
