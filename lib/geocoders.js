/* ==========================================================================
   geocoders.js, the free geocoders the server routes call. Server code only:
   /api/geocode (one address) and /api/nonprofits/places (many nonprofits).

   censusBatch(rows)   up to 1,000 addresses in one request to the US Census
                       batch geocoder. Map of id -> { lat, lng, label } for
                       the matches; ids it couldn't place are left out.
   census(q)           the Census one-line geocoder, a point or null.
   nominatim(q)        OpenStreetMap Nominatim biased toward central Indiana,
                       a point or null. Their policy allows one request a
                       second with a descriptive User-Agent, so every call in
                       this server process waits its turn in one queue.

   The upstream hosts are fixed here; nothing a visitor sends ever becomes
   part of a host name. Each throws on a network or upstream failure so the
   caller can tell "no match" from "couldn't ask".
   ========================================================================== */

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const CENSUS_ONE = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const CENSUS_BATCH = 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch';
const BENCHMARK = 'Public_AR_Current';
export const USER_AGENT = 'VolunteerU/1.0 (https://www.volunteeruapp.com)';
const HEADERS = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
// Central Indiana, left,top,right,bottom. A bias only (bounded=0).
const VIEWBOX = '-86.6,40.3,-85.7,39.6';
const DAY_S = 86400;
const TIMEOUT_MS = 8000;
const BATCH_TIMEOUT_MS = 20000;
const NOMINATIM_GAP_MS = 1000;
const BATCH_MAX = 1000;

const inRange = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

function upstreamError(label, status) {
  return Object.assign(new Error(`${label} status ${status}`), { upstream: true });
}

async function getJson(url, label) {
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: DAY_S }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw upstreamError(label, res.status);
  return res.json();
}

/* ---- Nominatim: one call at a time, a second apart -------------------------- */

let queue = Promise.resolve();
let lastCall = 0;

/**
 * Runs `fn` in its turn in the one queue. With a `deadline` (ms since the
 * epoch), a call whose turn would start after it is skipped and throws an
 * error with `skipped: true`, so a busy queue can't hold a request hostage.
 */
function throttled(fn, deadline = Infinity) {
  const run = queue.then(async () => {
    const wait = lastCall + NOMINATIM_GAP_MS - Date.now();
    if (Date.now() + Math.max(0, wait) > deadline) throw Object.assign(new Error('nominatim queue busy'), { skipped: true });
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

/**
 * @param {string} q
 * @param {{ deadline?: number }} [opts] skip (throw, `skipped: true`) when the queue can't reach this call by then
 * @returns {Promise<{lat:number,lng:number,label:string}|null>}
 */
export async function nominatim(q, { deadline = Infinity } = {}) {
  const u = new URL(NOMINATIM);
  u.searchParams.set('format', 'json');
  u.searchParams.set('limit', '1');
  u.searchParams.set('countrycodes', 'us');
  u.searchParams.set('viewbox', VIEWBOX);
  u.searchParams.set('bounded', '0');
  u.searchParams.set('q', q);
  const data = await throttled(() => getJson(u.toString(), 'nominatim'), deadline);
  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  return inRange(lat, lng) ? { lat, lng, label: String(hit.display_name || q).slice(0, 200) } : null;
}

/**
 * The named places around a point from Nominatim's reverse lookup, at
 * street level: { neighbourhood, suburb, quarter, hamlet, city, state }
 * with '' for what it doesn't name. Shares the one-a-second queue.
 * @param {{ deadline?: number }} [opts] skip (throw, `skipped: true`) when the queue can't reach this call by then
 * @returns {Promise<Record<string,string>|null>}
 */
export async function nominatimReverse(lat, lng, { deadline = Infinity } = {}) {
  if (!inRange(lat, lng)) return null;
  const u = new URL('https://nominatim.openstreetmap.org/reverse');
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('zoom', '16');
  u.searchParams.set('addressdetails', '1');
  u.searchParams.set('lat', String(lat));
  u.searchParams.set('lon', String(lng));
  const data = await throttled(() => getJson(u.toString(), 'nominatim reverse'), deadline);
  const a = data && data.address && typeof data.address === 'object' ? data.address : null;
  if (!a) return null;
  const pickText = (k) => (typeof a[k] === 'string' ? a[k].trim().slice(0, 60) : '');
  return {
    neighbourhood: pickText('neighbourhood'),
    suburb: pickText('suburb'),
    quarter: pickText('quarter'),
    hamlet: pickText('hamlet'),
    city: pickText('city') || pickText('town') || pickText('village'),
    state: pickText('state'),
  };
}

/* ---- US Census ---------------------------------------------------------------- */

/** @returns {Promise<{lat:number,lng:number,label:string}|null>} */
export async function census(q) {
  const u = new URL(CENSUS_ONE);
  u.searchParams.set('address', q);
  u.searchParams.set('benchmark', BENCHMARK);
  u.searchParams.set('format', 'json');
  const data = await getJson(u.toString(), 'census');
  const hit = data && data.result && Array.isArray(data.result.addressMatches) ? data.result.addressMatches[0] : null;
  if (!hit || !hit.coordinates) return null;
  const lat = Number(hit.coordinates.y);
  const lng = Number(hit.coordinates.x);
  return inRange(lat, lng) ? { lat, lng, label: String(hit.matchedAddress || q).slice(0, 200) } : null;
}

/** One CSV field: quotes and line breaks dropped, so a value can't spill into the next. */
const csvField = (v) => `"${String(v == null ? '' : v).replace(/["\r\n]/g, ' ').trim()}"`;

/** Splits one line of the Census answer, which quotes every field. */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Many addresses in one request.
 * @param {Array<{id:string,street:string,city:string,state:string,zip:string}>} rows
 * @returns {Promise<Map<string,{lat:number,lng:number,label:string}>>}
 */
export async function censusBatch(rows) {
  const found = new Map();
  if (!rows.length) return found;
  const csv = rows
    .slice(0, BATCH_MAX)
    .map((r) => [r.id, r.street, r.city, r.state, r.zip].map(csvField).join(','))
    .join('\n');
  const form = new FormData();
  form.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'addresses.csv');
  form.append('benchmark', BENCHMARK);
  const res = await fetch(CENSUS_BATCH, {
    method: 'POST',
    body: form,
    headers: { 'User-Agent': USER_AGENT },
    cache: 'no-store',
    signal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
  });
  if (!res.ok) throw upstreamError('census batch', res.status);
  const text = await res.text();
  text.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    // id, input address, Match|No_Match|Tie, Exact|Non_Exact, matched address, "lon,lat", tiger id, side
    const f = parseCsvLine(line);
    if (f[2] !== 'Match' || !f[5]) return;
    const [lng, lat] = f[5].split(',').map(Number);
    if (inRange(lat, lng)) found.set(f[0], { lat, lng, label: String(f[4] || f[1] || '').slice(0, 200) });
  });
  return found;
}
