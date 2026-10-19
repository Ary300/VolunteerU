/* ==========================================================================
   /api/nonprofits/places, where many nonprofits are, in one request.

   GET ?eins=351405179,350868107,...   up to 100 EINs (6 to 9 digits, or 12-3456789)
   GET ?eins=...&fast=1                 the batch geocoder only, for about 3 seconds at most;
                                        the rest come back in `retry`
   200 { places: { <ein>: { lat, lng, address } }, missing: [ein], retry: [ein] }

   For each EIN: the street address on its IRS record (ProPublica's
   organizations/<ein>.json, six at a time), then every address in ONE call
   to the US Census batch geocoder. Addresses it can't match are tried again
   without the suite number, then one at a time with the Census one-line
   geocoder, then with OpenStreetMap Nominatim (a few per request, a second
   apart, lib/geocoders.js).

   The browser asks with fast=1 first, so most dots land in about a second,
   then asks again without it for whatever came back in `retry`.

   Every lookup is shared by EIN across requests and keeps running after a
   request gives up on it: a fast pass that runs out of time leaves its batch
   going, and the full pass right behind it waits on that same batch instead
   of starting another. Whatever lands later goes into the cache, so the
   browser's next ask finds it. No request waits more than about 9 seconds,
   and a Nominatim call that can't start within 6 seconds of the request
   (the queue is one a second for the whole server) is left for the next ask.

   `missing` are orgs that can't be placed: no street address, a PO box (a
   mail drop, not a place), or no geocoder could match it. `retry` are orgs
   this request couldn't finish (an upstream was slow or down, or the
   Nominatim allowance ran out); asking again shortly can place them.

   Answers are kept per EIN in memory here (an LRU). A response with nothing
   left to retry is cacheable at the edge for a week; one with orgs to retry
   for a minute, then served stale while the edge fetches a fuller one. The
   upstream hosts are fixed; an EIN is only ever a path segment of digits.
   ========================================================================== */

import { UPSTREAM } from '../../../../lib/propublica.js';
import { censusBatch, census, nominatim, USER_AGENT } from '../../../../lib/geocoders.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_EINS = 100;
const DETAIL_CONCURRENCY = 6;
const ONE_LINE_CONCURRENCY = 4;
const NOMINATIM_PER_REQUEST = 4;
const FAST_BUDGET_MS = 3000; // fast pass: what the batch geocoder hasn't placed by then goes in `retry`
const BATCH_WAIT_MS = 6000; // full pass: how long to wait on a batch geocode (one already running counts)
const FULL_BUDGET_MS = 9000; // full pass: past this, what's still looking goes in `retry`
const NOMINATIM_BUDGET_MS = 6000; // a Nominatim call whose turn comes later than this waits for the next request
const DETAIL_TIMEOUT_MS = 8000;
const DETAIL_REVALIDATE_S = 86400;
const HIT_KEEP_MS = 7 * 86400 * 1000;
const MISS_KEEP_MS = 86400 * 1000;
const CACHE_MAX = 5000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 1500; // EINs per IP per window that need an upstream
const PO_BOX = /\b(P\.?\s*O\.?\s*BOX|POST\s+OFFICE\s+BOX|BOX\s+\d+$)/i;
const SUITE = /\s+(?:(?:STE|SUITE|UNIT|APT|RM|ROOM|FL|FLOOR|BLDG|DEPT|LOT|SPC)\b\.?\s*[\w-]*|#\s*[\w-]+)\s*$/i;
const CARE_OF = /^\s*(C\/O|CARE OF|ATTN:?|ATTENTION:?)\s/i;
const DIRECTIONS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'PO']);

/* ---- per-EIN memory cache (insertion-ordered Map, oldest dropped first) ------ */

const cache = new Map(); // ein -> { at, v: {lat,lng,address} | null }

function cached(ein, now = Date.now()) {
  const e = cache.get(ein);
  if (!e) return undefined;
  if (now - e.at > (e.v ? HIT_KEEP_MS : MISS_KEEP_MS)) {
    cache.delete(ein);
    return undefined;
  }
  cache.delete(ein);
  cache.set(ein, e);
  return e.v;
}

function remember(ein, v) {
  cache.delete(ein);
  cache.set(ein, { at: Date.now(), v });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

/* ---- per-IP limit ------------------------------------------------------------ */

const hits = new Map(); // ip -> [{ t, n }]

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
}

function overLimit(ip, n, now = Date.now()) {
  const recent = (hits.get(ip) || []).filter((h) => now - h.t < RATE_WINDOW_MS);
  const used = recent.reduce((s, h) => s + h.n, 0);
  if (used + n > RATE_MAX) {
    hits.set(ip, recent);
    return true;
  }
  hits.set(ip, [...recent, { t: now, n }]);
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return false;
}

/* ---- helpers --------------------------------------------------------------------- */

/**
 * "351405179" from "35-1405179", "351405179" or "035..."; '' when it isn't an
 * EIN. Leading zeros dropped, the way search rows carry them. Six to nine
 * digits, the same rule /api/nonprofits?ein= keeps.
 */
function canonEin(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!/^(?:\d{2}-\d{7}|\d{6,9})$/.test(s)) return '';
  const n = String(Number(s.replace('-', '')));
  return n.length >= 6 ? n : '';
}

/** Runs `fn` over `items`, at most `n` at a time. */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/** "3001 N WHITE RIVER PKWY" -> "3001 N White River Pkwy". Only the letter case changes. */
function tidy(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[a-z0-9]+/gi, (w) => {
      const up = w.toUpperCase();
      if (DIRECTIONS.has(up)) return up;
      if (/^\d+(st|nd|rd|th)$/i.test(w)) return w.toLowerCase();
      if (/\d/.test(w)) return up; // "B3", "100A"
      return w[0].toUpperCase() + w.slice(1);
    });
}

/** The street address on an org's IRS record, or a status when there isn't one to place. */
async function irsAddress(ein) {
  let res;
  try {
    res = await fetch(`${UPSTREAM}/organizations/${ein}.json`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      next: { revalidate: DETAIL_REVALIDATE_S },
      signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[api/nonprofits/places] detail fetch failed', ein, err && err.name);
    return { status: 'retry' };
  }
  if (res.status === 404) return { status: 'missing' };
  if (!res.ok) {
    console.error('[api/nonprofits/places] detail upstream status', ein, res.status);
    return { status: 'retry' };
  }
  let data;
  try {
    data = await res.json();
  } catch {
    return { status: 'retry' };
  }
  const o = (data && data.organization) || {};
  const street = String(o.address || '').replace(/\s+/g, ' ').trim();
  const city = String(o.city || '').trim();
  const state = String(o.state || '').trim();
  const zip = String(o.zipcode || '').slice(0, 5);
  if (!street || !city || !state || PO_BOX.test(street)) return { status: 'missing' };
  const address = `${tidy(street)}, ${tidy(city)}, ${state.toUpperCase()}${zip ? ` ${zip}` : ''}`;
  return { status: 'ok', row: { id: ein, street, city, state, zip, label: address }, address };
}

const oneLine = (r, street = r.street) => `${street}, ${r.city}, ${r.state}${r.zip ? ` ${r.zip}` : ''}`;

/** The street a geocoder can match: no "C/O Jane Doe" or "ATTN" lead-in, no suite or unit. */
function plainStreet(street) {
  let s = String(street || '');
  if (CARE_OF.test(s)) s = s.replace(/^[^\d]*/, ''); // "C/O BRIAN MYERS 12407 BITTERN CIR" -> "12407 BITTERN CIR"
  return s.replace(SUITE, '').trim();
}

/* ---- lookups shared across requests --------------------------------------------- */

const TIMEOUT = Symbol('timeout');
const ERROR = Symbol('error');
const RETRY = Symbol('retry');

/** `promise`'s value, or TIMEOUT when it hasn't settled by `deadline` (ms since the epoch). */
function by(promise, deadline) {
  const ms = deadline - Date.now();
  if (ms <= 0) return Promise.resolve(TIMEOUT);
  let t;
  const late = new Promise((resolve) => {
    t = setTimeout(() => resolve(TIMEOUT), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(t));
}

const pointFor = (p, label) => ({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6, address: label });

const batchRuns = new Map(); // ein -> Promise<point|null>, rejecting when the batch couldn't be asked
const BATCH_MISS_KEEP_MS = 30 * 60 * 1000;
const batchMissed = new Map(); // ein -> when both batch passes last said "no match"

/** Both batch passes said "no match" lately, so the next request can go straight to the one-at-a-time geocoders. */
function batchSaidNo(id, now = Date.now()) {
  const at = batchMissed.get(id);
  if (at === undefined) return false;
  if (now - at <= BATCH_MISS_KEEP_MS) return true;
  batchMissed.delete(id);
  return false;
}

function noteBatchMiss(id) {
  batchMissed.delete(id);
  batchMissed.set(id, Date.now());
  while (batchMissed.size > CACHE_MAX) batchMissed.delete(batchMissed.keys().next().value);
}

/**
 * Each row's answer from the Census batch geocoder, as a promise per id. Rows
 * already in a running batch (another request's) share it; the rest go out in
 * one new batch. A match is remembered as soon as it lands, even when every
 * request that asked has stopped waiting.
 */
function batchFor(rows) {
  const fresh = rows.filter((r) => !batchRuns.has(r.id));
  if (fresh.length) {
    const run = censusBatch(fresh);
    run.catch((err) => console.error('[api/nonprofits/places] census batch failed', err && err.message));
    fresh.forEach((r) => {
      const p = run.then((m) => m.get(r.id) || null);
      const done = () => batchRuns.delete(r.id);
      p.then((pt) => {
        if (pt) remember(r.id, pointFor(pt, r.label));
        done();
      }, done);
      batchRuns.set(r.id, p);
    });
  }
  return new Map(rows.map((r) => [r.id, batchRuns.get(r.id)]));
}

/** Per id: a point, null (no match), ERROR (couldn't ask) or TIMEOUT (still running at `deadline`). */
async function batchStage(rows, deadline) {
  const runs = batchFor(rows);
  const out = new Map();
  await Promise.all(
    rows.map(async (r) => {
      try {
        out.set(r.id, await by(runs.get(r.id), deadline));
      } catch {
        out.set(r.id, ERROR);
      }
    })
  );
  return out;
}

/** The same rows with the suite or "C/O" lead-in taken off, for those where that changes anything. */
const plainRows = (rows) => rows.map((r) => ({ ...r, street: plainStreet(r.street) })).filter((r, i) => r.street && r.street !== rows[i].street);

/** One batch for the plain streets, matches only; nothing when it fails or runs past `deadline`. */
async function plainStage(rows, deadline) {
  const plain = plainRows(rows);
  if (!plain.length) return new Map();
  const run = censusBatch(plain);
  run
    .then((m) => plain.forEach((r) => m.get(r.id) && remember(r.id, pointFor(m.get(r.id), r.label))))
    .catch((err) => console.error('[api/nonprofits/places] census batch (plain streets) failed', err && err.message));
  const m = await by(run, deadline).catch(() => TIMEOUT);
  return m === TIMEOUT ? new Map() : m;
}

const slowRuns = new Map(); // ein -> Promise<point|null|RETRY>

/**
 * One address the batch couldn't match: the Census one-line geocoder (it
 * settles the batch's ties), then Nominatim when `useNominatim`. Resolves a
 * point, null when every geocoder was asked and none matched, or RETRY when
 * that can't be told yet. Shared by id, and remembered when it settles.
 */
function slowPlace(r, useNominatim, nominatimBy) {
  if (slowRuns.has(r.id)) return slowRuns.get(r.id);
  const q = oneLine(r, plainStreet(r.street) || r.street);
  const run = (async () => {
    let reached = false;
    try {
      const p = await census(q);
      reached = true;
      if (p) return p;
    } catch {
      /* the one-line geocoder is down; Nominatim may still answer */
    }
    if (!useNominatim) return RETRY;
    try {
      return await nominatim(q, { deadline: nominatimBy });
    } catch (err) {
      // Skipped for time, or neither geocoder could be asked: not a verdict on the address.
      return err && err.skipped ? RETRY : reached ? null : RETRY;
    }
  })();
  slowRuns.set(r.id, run);
  run.then((p) => {
    slowRuns.delete(r.id);
    if (p === RETRY) return;
    remember(r.id, p ? pointFor(p, r.label) : null);
  });
  return run;
}

/**
 * Points for address rows. Returns { found: Map<id, point>, retry: Set<id> }:
 * ids in neither were looked up everywhere and matched nowhere. `fast` stops
 * after the batch geocoder (and at FAST_BUDGET_MS): what it hasn't placed goes
 * to `retry` for a second request, so most dots don't wait on the hard ones.
 */
async function placeRows(rows, started, fast, timing = []) {
  const found = new Map();
  const retry = new Set();
  const t0 = Date.now();
  const batchBy = fast ? t0 + FAST_BUDGET_MS : Math.min(started + FULL_BUDGET_MS, t0 + BATCH_WAIT_MS);

  // 1. Everyone in one Census batch (or the one already running for them),
  // except rows both batch passes already turned down a moment ago.
  const skip = new Set(rows.filter((r) => batchSaidNo(r.id)).map((r) => r.id));
  const ask = rows.filter((r) => !skip.has(r.id));
  const first = await batchStage(ask, batchBy);
  first.forEach((v, id) => {
    if (v && typeof v === 'object') found.set(id, v);
  });

  // 2. Misses with a suite number or a "C/O" lead-in, again without it.
  const noMatch = ask.filter((r) => first.get(r.id) === null);
  (await plainStage(noMatch, batchBy)).forEach((p, id) => found.set(id, p));
  noMatch.filter((r) => !found.has(r.id)).forEach((r) => noteBatchMiss(r.id));
  timing.push(`batch;dur=${Date.now() - t0}`);

  const left = rows.filter((r) => !found.has(r.id));
  if (fast) {
    left.forEach((r) => retry.add(r.id));
    return { found, retry };
  }

  // 3. One at a time: the one-line geocoder, then Nominatim for a few.
  const fullBy = started + FULL_BUDGET_MS;
  const nominatimBy = started + NOMINATIM_BUDGET_MS;
  let nominatimLeft = NOMINATIM_PER_REQUEST;
  await pool(left, ONE_LINE_CONCURRENCY, async (r) => {
    const useNominatim = nominatimLeft > 0;
    if (useNominatim) nominatimLeft -= 1;
    const p = await by(slowPlace(r, useNominatim, nominatimBy), fullBy);
    if (p === TIMEOUT || p === RETRY) retry.add(r.id);
    else if (p) found.set(r.id, p);
  });
  timing.push(`one;dur=${Date.now() - t0}`);
  return { found, retry };
}

function fail(error, status, headers = {}) {
  return Response.json({ error }, { status, headers });
}

/* ---- handler ------------------------------------------------------------------- */

export async function GET(request) {
  const started = Date.now();
  const { searchParams } = new URL(request.url);
  const fast = searchParams.get('fast') === '1';
  const raw = String(searchParams.get('eins') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!raw.length) return fail('missing_eins', 400);
  if (raw.length > MAX_EINS) return fail('too_many', 400);
  const eins = [...new Set(raw.map(canonEin))];
  if (eins.some((e) => !e)) return fail('bad_ein', 400);

  const places = {};
  const missing = [];
  const retry = [];
  const todo = [];
  eins.forEach((ein) => {
    const v = cached(ein);
    if (v === undefined) todo.push(ein);
    else if (v) places[ein] = v;
    else missing.push(ein);
  });

  if (todo.length && overLimit(clientIp(request), todo.length)) return fail('rate_limited', 429, { 'Retry-After': '60' });

  const timing = [];
  if (todo.length) {
    const t1 = Date.now();
    const records = await pool(todo, DETAIL_CONCURRENCY, async (ein) => ({ ein, ...(await irsAddress(ein)) }));
    const rows = [];
    const label = new Map();
    records.forEach((r) => {
      if (r.status === 'retry') retry.push(r.ein);
      else if (r.status === 'missing') {
        missing.push(r.ein);
        remember(r.ein, null);
      } else {
        rows.push(r.row);
        label.set(r.ein, r.address);
      }
    });
    timing.push(`irs;dur=${Date.now() - t1}`);
    const t2 = Date.now();
    const { found, retry: later } = await placeRows(rows, started, fast, timing);
    timing.push(`geocode;dur=${Date.now() - t2}`);
    rows.forEach(({ id }) => {
      const p = found.get(id);
      if (p) {
        const v = { lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6, address: label.get(id) };
        places[id] = v;
        remember(id, v);
      } else if (later.has(id)) retry.push(id);
      else {
        missing.push(id);
        remember(id, null);
      }
    });
  }

  // With orgs left to retry, the edge keeps this a minute and then serves it
  // stale while it fetches a fuller answer, so a cold instance's first, partial
  // answer doesn't hold the URL for long and a busy URL is never uncached.
  const cacheControl = retry.length ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400' : 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400';
  // Server-Timing shows where a cold request spends its time (IRS records vs geocoding).
  return Response.json({ places, missing, retry }, { headers: { 'Cache-Control': cacheControl, 'Server-Timing': [...timing, `total;dur=${Date.now() - started}`].join(', ') } });
}
