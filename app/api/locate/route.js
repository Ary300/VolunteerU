/* ==========================================================================
   /api/locate, a point to the town it's in (reverse geocoding).

   GET ?lat=<number>&lng=<number>
     returns { ok, data: { town, state, zip } | null, error }

   Used when a visitor taps "Use my location" on Discover or the landing page:
   the browser gives a point and the lists search by town, so the point is
   turned into one here. The US Census coordinates lookup answers with the
   incorporated place (or census-designated place), the state and the ZIP
   area for a point. It needs no key and has no per-second limit, and it is
   called from the server so the browser never talks to it.

   The point is rounded to about 100 m before it is looked up or cached, so a
   town lookup never needs a precise location. "Nothing there" (a point
   outside the US) is a 200 with data: null. Upstream failures come back as a
   502 with a short error code, never the upstream's own message.
   ========================================================================== */

export const runtime = 'nodejs';

const USER_AGENT = 'VolunteerU/1.0 (https://www.volunteeruapp.com)';
const CENSUS = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';
const LAYERS = 'Incorporated Places,Census Designated Places,States,2020 Census ZIP Code Tabulation Areas';
const UPSTREAM_TIMEOUT_MS = 9000;
const DAY_S = 86400;
const CACHE_MAX = 500;
const RATE_WINDOW_MS = 60_000;
// Lookups that reach the Census per IP per minute. A visitor needs one.
const RATE_MAX = 20;

function reply(status, data, error = null) {
  const headers = status === 200 ? { 'Cache-Control': 'public, max-age=86400' } : status === 429 ? { 'Retry-After': '30' } : {};
  return Response.json({ ok: status === 200, data, error }, { status, headers });
}

/* ---- memory cache and per-IP limit ----------------------------------------- */

const cache = new Map();
function cachePut(key, value) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

const hits = new Map();
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

/* ---- the lookup -------------------------------------------------------------- */

/** "Indianapolis city (balance)" -> "Indianapolis", "Carmel city" -> "Carmel". */
function placeName(raw) {
  return String(raw || '')
    .replace(/\(balance\)/i, '')
    .replace(/\s+(city|town|village|borough|CDP|municipality)\s*$/i, '')
    .replace(/\s+(city|town|village|borough|CDP|municipality)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

const first = (g, layer) => (g && Array.isArray(g[layer]) && g[layer][0]) || null;

async function census(lat, lng) {
  const u = new URL(CENSUS);
  u.searchParams.set('x', String(lng));
  u.searchParams.set('y', String(lat));
  u.searchParams.set('benchmark', 'Public_AR_Current');
  u.searchParams.set('vintage', 'Current_Current');
  u.searchParams.set('layers', LAYERS);
  u.searchParams.set('format', 'json');
  const res = await fetch(u.toString(), {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    next: { revalidate: DAY_S },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`census status ${res.status}`);
  const body = await res.json();
  const g = body && body.result && body.result.geographies;
  const st = first(g, 'States');
  if (!st) return null;
  const place = first(g, 'Incorporated Places') || first(g, 'Census Designated Places');
  const zcta = first(g, '2020 Census ZIP Code Tabulation Areas');
  const zip = zcta && /^\d{5}$/.test(String(zcta.ZCTA5 || zcta.BASENAME || '')) ? String(zcta.ZCTA5 || zcta.BASENAME) : '';
  return {
    town: place ? placeName(place.BASENAME || place.NAME) : '',
    state: /^[A-Z]{2}$/.test(String(st.STUSAB || '')) ? st.STUSAB : '',
    zip,
  };
}

/* ---- handler ------------------------------------------------------------------ */

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  // Plain decimal degrees only: Number() alone would also take "0x10", "1e2" or " 5 ".
  const DEG = /^-?\d{1,3}(\.\d{1,10})?$/;
  const rawLat = searchParams.get('lat') || '';
  const rawLng = searchParams.get('lng') || '';
  const lat = DEG.test(rawLat) ? Number(rawLat) : NaN;
  const lng = DEG.test(rawLng) ? Number(rawLng) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return reply(400, null, 'bad_point');
  }
  const rlat = Math.round(lat * 1000) / 1000;
  const rlng = Math.round(lng * 1000) / 1000;
  const key = `${rlat},${rlng}`;
  if (cache.has(key)) return reply(200, cache.get(key));
  if (overLimit(clientIp(request))) return reply(429, null, 'rate_limited');
  try {
    const hit = await census(rlat, rlng);
    cachePut(key, hit);
    return reply(200, hit);
  } catch (err) {
    console.error('[api/locate] lookup failed', key, err && err.message);
    return reply(502, null, 'upstream');
  }
}
