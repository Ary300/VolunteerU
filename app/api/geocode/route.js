/* ==========================================================================
   /api/geocode, an address to a point on the map.

   GET ?q=<address>   returns { ok, data: { lat, lng, label } | null, error }

   Free geocoders only (lib/geocoders.js), called from the server so the
   browser never needs a key and the upstream usage rules are kept in one place:
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

import { nominatim, census } from '../../../lib/geocoders.js';

export const runtime = 'nodejs';

const CACHE_MAX = 500;
const RATE_WINDOW_MS = 60_000;
// Lookups that reach an upstream, per IP per minute. The Nominatim queue
// already caps real upstream traffic at one a second; this only stops one
// client from filling that queue for everyone. Nonprofit dots no longer come
// through here (/api/nonprofits/places places them in one batch).
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
