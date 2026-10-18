/* ==========================================================================
   geo.js, addresses as points, for the maps.

   geocode(address)        { lat, lng, label } or null, via /api/geocode.
                           Answers are kept in localStorage for a month and
                           a lookup already in flight is shared, so a map that
                           redraws never asks twice.
   nonprofitSpot(ein)      the same for a nonprofit, from its IRS street address
                           (/api/nonprofits?ein=), or null.
   distanceMiles(a, b)     great-circle distance between two { lat, lng }.
   directionsHref(...)     a Google Maps directions link to a point or address.
   searchHref(address)     a Google Maps search link for an address.
   storedPoint(listing)    a listing's own lat/lng when it has valid ones.
   ========================================================================== */

const STORE_PREFIX = 'vu-geo:';
const NP_PREFIX = 'vu-geo-np:';
const KEEP_MS = 30 * 24 * 3600 * 1000;
// A miss is kept for a day only: the address may be fixed, or the geocoder was busy.
const KEEP_MISS_MS = 24 * 3600 * 1000;
const EARTH_MILES = 3958.8;
const PO_BOX = /\bP\.?\s*O\.?\s*BOX\b/i;

const memory = new Map(); // key -> { at, v }
const inflight = new Map(); // key -> Promise

/** One key per address, so " 12 Elm St,  Carmel." and "12 elm st, carmel" match. */
export function addressKey(address) {
  return String(address || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/[.,;\s]+$/, '');
}

function validPoint(p) {
  return Boolean(p) && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

function readStore(key) {
  const mem = memory.get(key);
  if (mem) return mem;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.at !== 'number') return null;
    memory.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

function writeStore(key, v) {
  const entry = { at: Date.now(), v };
  memory.set(key, entry);
  try {
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* storage full or blocked: the in-memory copy still serves this page */
  }
}

function fresh(entry) {
  if (!entry) return false;
  const age = Date.now() - entry.at;
  return entry.v ? age < KEEP_MS : age < KEEP_MISS_MS;
}

/** A cached answer: a point, null for a known miss, or undefined when not looked up yet. */
export function cachedGeocode(address) {
  const k = addressKey(address);
  if (k.length < 3) return null;
  const entry = readStore(STORE_PREFIX + k);
  return fresh(entry) ? entry.v : undefined;
}

/**
 * Runs `load` once per key: a fresh cached answer comes back at once, a lookup
 * in flight is shared, and only definite answers (a point or "not found") are
 * cached. A network or server failure resolves to null without caching.
 */
function once(key, load) {
  const entry = readStore(key);
  if (fresh(entry)) return Promise.resolve(entry.v);
  if (inflight.has(key)) return inflight.get(key);
  const p = load()
    .then((res) => {
      if (res.definite) writeStore(key, res.value);
      return res.value;
    })
    .catch(() => null)
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const RETRIES = 3;

/** The geocode route, waiting and asking again when it says to slow down (429). */
async function fetchGeocode(text) {
  for (let i = 0; ; i += 1) {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(text)}`);
    if (res.status !== 429 || i >= RETRIES) return res;
    const after = Number(res.headers.get('Retry-After')) || 5;
    await new Promise((r) => setTimeout(r, Math.min(30, after) * 1000));
  }
}

/**
 * The point for a free-text address, or null when it can't be found (or the
 * geocoder can't be reached right now).
 * @param {string} address
 * @returns {Promise<{lat:number,lng:number,label:string}|null>}
 */
export function geocode(address) {
  const text = String(address || '').replace(/\s+/g, ' ').trim();
  const k = addressKey(text);
  if (k.length < 3 || text.length > 200 || typeof window === 'undefined') return Promise.resolve(null);
  return once(STORE_PREFIX + k, async () => {
    const res = await fetchGeocode(text);
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok || !body || !body.ok) return { definite: false, value: null };
    const d = body.data;
    if (d && validPoint(d)) return { definite: true, value: { lat: d.lat, lng: d.lng, label: String(d.label || text) } };
    return { definite: true, value: null };
  });
}

/**
 * Where a nonprofit is, from the street address on its IRS record.
 * @param {number|string} ein
 * @returns {Promise<{lat:number,lng:number,label:string,address:string}|null>}
 */
export function nonprofitSpot(ein) {
  const id = String(ein || '').replace(/\D/g, '');
  if (!/^\d{6,9}$/.test(id) || typeof window === 'undefined') return Promise.resolve(null);
  return once(NP_PREFIX + id, async () => {
    const res = await fetch(`/api/nonprofits?ein=${id}`);
    if (res.status === 404) return { definite: true, value: null };
    if (!res.ok) return { definite: false, value: null };
    const body = await res.json();
    const o = (body && body.organization) || {};
    const line = [o.address, o.city, [o.state, o.zip].filter(Boolean).join(' ')].map((x) => String(x || '').trim()).filter(Boolean).join(', ');
    if (!o.address || !line) return { definite: true, value: null };
    // A PO box is a mail drop, not a place: don't spend geocoder lookups on it.
    if (PO_BOX.test(o.address)) return { definite: true, value: null };
    const p = await geocode(line);
    // A geocoder outage isn't a verdict on the address: try again next time.
    if (!p) return { definite: cachedGeocode(line) === null, value: null };
    return { definite: true, value: { ...p, address: line } };
  });
}

/** A listing's stored coordinates, or null. */
export function storedPoint(listing) {
  if (!listing || listing.lat === null || listing.lat === undefined || listing.lng === null || listing.lng === undefined) return null;
  const p = { lat: Number(listing.lat), lng: Number(listing.lng) };
  return validPoint(p) ? p : null;
}

/** Miles between two points along the earth's surface. */
export function distanceMiles(a, b) {
  if (!validPoint(a) || !validPoint(b)) return NaN;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Google Maps directions to a point, or to an address.
 *   directionsHref(39.97, -86.12)  directionsHref('425 E Main St, Carmel, IN')
 */
export function directionsHref(latOrAddress, lng) {
  const dest = typeof latOrAddress === 'number' && Number.isFinite(latOrAddress) && Number.isFinite(lng)
    ? `${latOrAddress},${lng}`
    : String(latOrAddress || '').trim();
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

/** A Google Maps search for an address. */
export function searchHref(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(address || '').trim())}`;
}
