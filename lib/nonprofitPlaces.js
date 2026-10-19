/* ==========================================================================
   nonprofitPlaces.js, where listed nonprofits are, for the map and the rows
   beside it. Browser code.

   useNonprofitPlaces(eins)  { places: Map<ein, {lat,lng,address}>, missing:
                             Set<ein>, loading: boolean } for a list of EINs.
                             EINs nobody has asked about yet are fetched from
                             /api/nonprofits/places, 100 at a time, in one
                             request per burst of asks: a fast pass (the
                             batch geocoder) and then a slower one for the
                             few hard addresses.
   useNonprofitPlace(ein)    one org: a point, 'missing' (no street address
                             to place: a PO box, or no geocoder matched it),
                             or 'pending' while it's being looked up. A list
                             row can use it for its "Not on the map" note.

   The map and the list point at each other through two tiny shared values,
   so neither needs the other's props:
     setMapHover(ein|null) / useMapHover()   a list row is hovered or focused
     setMapPick(ein|null) / useMapPick()     a dot on the map is open
   useRowHoverLink() (the map installs it) sets the hover from any
   NonprofitRow link on the page, so rows light their dots with no wiring.

   Answers are kept per EIN in memory and in localStorage (a month for a
   point, a day for "missing"); storage can be blocked, and then memory alone
   serves the page.
   ========================================================================== */

import { useEffect, useMemo, useSyncExternalStore } from 'react';

const ROUTE = '/api/nonprofits/places';
const STORE_KEY = 'vu-np-place:';
const KEEP_MS = 30 * 24 * 3600 * 1000;
const KEEP_MISS_MS = 24 * 3600 * 1000;
const BATCH = 100;
const GATHER_MS = 30; // asks this close together share one request
const RETRY_MS = [2000, 6000, 15000]; // an unsettled org is asked three more times, then left pending
const PENDING = 'pending';
const MISSING = 'missing';

const known = new Map(); // ein -> {lat,lng,address} | null
const asking = new Set(); // eins in a request right now, or queued for one
const tries = new Map(); // ein -> retry rounds used
let queued = new Set();
let timer = null;
let version = 0;
const listeners = new Set();

function emit() {
  version += 1;
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const getVersion = () => version;
const getServerVersion = () => 0;

/**
 * "351405179" from 351405179, "35-1405179" or "035..."; '' when it isn't an
 * EIN. The same rule as /api/nonprofits/places, so a list never holds a value
 * that would make the route turn the whole request away.
 */
export function canonEin(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!/^(?:\d{2}-\d{7}|\d{1,9})$/.test(s)) return '';
  const n = String(Number(s.replace('-', '')));
  return n.length >= 6 ? n : '';
}

const validPoint = (p) => Boolean(p) && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

/** A stored answer: a point, null for a known miss, undefined when not asked yet. */
function lookupStored(ein) {
  if (known.has(ein)) return known.get(ein);
  try {
    const raw = window.localStorage.getItem(STORE_KEY + ein);
    if (!raw) return undefined;
    const e = JSON.parse(raw);
    if (!e || typeof e.at !== 'number') return undefined;
    const age = Date.now() - e.at;
    if (e.v ? age > KEEP_MS : age > KEEP_MISS_MS) return undefined;
    const v = e.v && validPoint(e.v) ? { lat: e.v.lat, lng: e.v.lng, address: String(e.v.address || '') } : null;
    known.set(ein, v);
    return v;
  } catch {
    return undefined;
  }
}

function store(ein, v) {
  known.set(ein, v);
  try {
    window.localStorage.setItem(STORE_KEY + ein, JSON.stringify({ at: Date.now(), v }));
  } catch {
    /* storage full or blocked: memory still serves this page */
  }
}

/**
 * One request for up to BATCH orgs. `fast` asks for the batch geocoder only
 * (most dots in about a second); what it can't place is asked again at once
 * without it, and anything still unsettled after that a couple more times.
 */
async function fetchChunk(eins, fast) {
  // Sorted, so the same set of orgs is the same URL (and an edge cache hit).
  const list = [...eins].sort();
  let body = null;
  try {
    const res = await fetch(`${ROUTE}?eins=${list.join(',')}${fast ? '&fast=1' : ''}`);
    if (res.ok) body = await res.json();
    else console.warn('[nonprofitPlaces] places route status', res.status);
  } catch (err) {
    console.warn('[nonprofitPlaces] places route failed', err && err.message);
  }
  const later = [];
  if (!body || typeof body !== 'object') {
    later.push(...list);
  } else {
    const places = body.places && typeof body.places === 'object' ? body.places : {};
    const missing = new Set(Array.isArray(body.missing) ? body.missing.map(canonEin) : []);
    list.forEach((ein) => {
      const p = places[ein];
      if (p && validPoint(p)) store(ein, { lat: p.lat, lng: p.lng, address: String(p.address || '') });
      else if (missing.has(ein)) store(ein, null);
      else later.push(ein);
    });
  }
  const settled = list.filter((ein) => !later.includes(ein));
  settled.forEach((ein) => asking.delete(ein));
  if (settled.length) emit();
  if (!later.length) return;
  if (fast && body) {
    fetchChunk(later, false);
    return;
  }
  const wait = later.filter((ein) => (tries.get(ein) || 0) < RETRY_MS.length);
  // Out of tries: these stay pending (no dot, no note); a reload asks again.
  later.filter((ein) => !wait.includes(ein)).forEach((ein) => asking.delete(ein));
  if (!wait.length) return;
  const round = Math.max(...wait.map((ein) => tries.get(ein) || 0));
  wait.forEach((ein) => tries.set(ein, (tries.get(ein) || 0) + 1));
  setTimeout(() => fetchChunk(wait, false), RETRY_MS[Math.min(round, RETRY_MS.length - 1)]);
}

function flush() {
  timer = null;
  const all = [...queued];
  queued = new Set();
  for (let i = 0; i < all.length; i += BATCH) fetchChunk(all.slice(i, i + BATCH), true);
}

/** Queues lookups for EINs with no answer yet. */
function ask(eins) {
  if (typeof window === 'undefined') return;
  let added = false;
  eins.forEach((ein) => {
    if (!ein || asking.has(ein) || lookupStored(ein) !== undefined) return;
    asking.add(ein);
    queued.add(ein);
    added = true;
  });
  if (added && !timer) timer = setTimeout(flush, GATHER_MS);
}

/** One org's place right now: a point, 'missing', or 'pending'. */
export function placeOf(ein) {
  const id = canonEin(ein);
  if (!id || typeof window === 'undefined') return PENDING;
  const v = lookupStored(id);
  if (v === undefined) return PENDING;
  return v || MISSING;
}

/**
 * @param {Array<string|number>} eins
 * @returns {{ places: Map<string,{lat:number,lng:number,address:string}>, missing: Set<string>, loading: boolean }}
 */
export function useNonprofitPlaces(eins) {
  const ids = useMemo(() => [...new Set((eins || []).map(canonEin).filter(Boolean))], [eins]);
  const key = ids.join(',');
  const v = useSyncExternalStore(subscribe, getVersion, getServerVersion);

  useEffect(() => {
    ask(ids);
    // key stands in for ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useMemo(() => {
    const places = new Map();
    const missing = new Set();
    let loading = false;
    if (typeof window !== 'undefined') {
      ids.forEach((ein) => {
        const p = lookupStored(ein);
        if (p) places.set(ein, p);
        else if (p === null) missing.add(ein);
        else loading = true;
      });
    }
    return { places, missing, loading };
    // v is the store's version: a new answer recomputes this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, v]);
}

/**
 * One org: its point, 'missing', or 'pending'. Asks for it when nobody has.
 * @param {string|number} ein
 */
export function useNonprofitPlace(ein) {
  const id = canonEin(ein);
  useSyncExternalStore(subscribe, getVersion, getServerVersion);
  useEffect(() => {
    if (id) ask([id]);
  }, [id]);
  return placeOf(id);
}

/* ---- map <-> list link ---------------------------------------------------------- */

function sharedValue() {
  let value = null;
  const subs = new Set();
  return {
    set(next) {
      const v = next == null ? null : canonEin(next) || null;
      if (v === value) return;
      value = v;
      subs.forEach((fn) => fn());
    },
    get: () => value,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

const hover = sharedValue();
const pick = sharedValue();
const serverNull = () => null;

/** A list row is hovered or focused (its dot lights up); null when it leaves. */
export const setMapHover = (ein) => hover.set(ein);
export const useMapHover = () => useSyncExternalStore(hover.subscribe, hover.get, serverNull);
/** A dot's popup is open on the map (its row can light up); null when it closes. */
export const setMapPick = (ein) => pick.set(ein);
export const useMapPick = () => useSyncExternalStore(pick.subscribe, pick.get, serverNull);

/**
 * Lights a nonprofit's dot while its list row is hovered or focused, for
 * rows drawn by NonprofitRow (a.vu-np linking to /nonprofits/<ein>), without
 * the row needing to know about the map. Links inside the map itself don't
 * count. Installed by the map while it's on the page.
 */
export function useRowHoverLink() {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const rowEin = (t) => {
      const a = t && typeof t.closest === 'function' ? t.closest('a.vu-np[href^="/nonprofits/"]') : null;
      if (!a || a.closest('.vu-dmap')) return null;
      let seg = String(a.getAttribute('href') || '').split(/[/?#]/)[2] || '';
      try {
        seg = decodeURIComponent(seg);
      } catch {
        /* a stray % stays as typed */
      }
      return canonEin(seg) || null;
    };
    const over = (e) => hover.set(rowEin(e.target));
    const leave = () => hover.set(null);
    document.addEventListener('pointerover', over, { passive: true });
    document.addEventListener('focusin', over);
    document.addEventListener('focusout', leave);
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('focusin', over);
      document.removeEventListener('focusout', leave);
      document.documentElement.removeEventListener('pointerleave', leave);
      hover.set(null);
    };
  }, []);
}
