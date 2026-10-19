'use client';

/* ==========================================================================
   WebNonprofits.jsx, nonprofit search from IRS records (ProPublica proxy at
   /api/nonprofits). Each row opens the nonprofit's own page,
   /nonprofits/<ein>. Hidden when Discover is set to student projects only.

   Rows are NonprofitRow (name, then "cause · City, ST"), in two columns on
   wide screens. No logo or initials: we don't have their logos. The IRS
   source line is said once per section, never per row.

   What it searches:
   - a typed name, the town from Where (as required terms, so "food" near
     Carmel finds Carmel organizations with "food" in the name) and the
     state; picked causes narrow it by their IRS (NTEE) group
   - with no name but a town, every IRS record for that town
   - with neither, a cause keyword in the state, or the whole state
   When a town has no IRS records at all (a made-up or misspelled name), the
   list says so and covers the state instead.

   The full list pages through every match, 25 at a time, up to ProPublica's
   ceiling of 10,000, and says so when a search hits it. The count is the
   API's own total. Coming back from a nonprofit page restores the rows
   already loaded and the scroll position.

   Near the visitor (an `origin` point from lib/location.js), each row says
   how far away it is and the list runs nearest first, a name search too.
   ProPublica can't search by distance, so a town list with no name loads a
   bigger first pool (up to 100 records) and, when the visitor is in that
   town, also searches the names of the neighborhoods around them ("Broad
   Ripple"), then orders the pool by the distance to each street address
   (lib/nonprofitPlaces.js). Rows already on screen keep their place when
   "Show more" adds the next ones.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { S } from '../lib/style.js';
import { C, F } from '../lib/tokens.js';
import { parseState } from '../lib/listings.js';
import { isVolunteerPlace } from '../lib/nonprofitRules.js';
import { SkeletonRows, Button } from './ui.jsx';
import NonprofitRow from './vu/NonprofitRow.jsx';
import { useNonprofitPlace, useNonprofitPlaces, setMapHover, canonEin } from '../lib/nonprofitPlaces.js';
import { distanceMiles } from '../lib/geo.js';
import { milesLabel } from '../lib/location.js';

const PAGE = 25; // rows per step, ProPublica's page size
const PREVIEW_POOL = 25; // first page rows a short preview picks from
const MAX_RESULTS = 10000; // ProPublica's ceiling on one search
const NEAR_POOL_PAGES = 4; // pages a nearest-first town list loads before sorting (100 records)
const NEAR_EXTRA_MAX = 4; // neighborhood searches added to a nearest-first list
const NEAR_HOLD_MS = 4000; // longest the list waits for addresses before showing its order
const NEAR_SETTLED = 0.9; // share of the pool placed (or known unplaceable) that counts as ready
const NO_EINS = [];

/* Search words for a cause chip when there's no name and no town to search by. */
const CAUSE_KEYWORD = {
  'Food & hunger': 'food bank', Education: 'education', Homelessness: 'homeless shelter',
  Environment: 'conservation', Animals: 'animal rescue', Civic: 'community',
  Health: 'health', Seniors: 'senior', Arts: 'arts', 'Disaster relief': 'disaster relief',
};

/* A name word that finds a cause inside a town when its IRS group is broad
   (human services covers food banks, shelters and youth sports alike). */
const CAUSE_WORD = { 'Food & hunger': 'food', Homelessness: 'homeless', Seniors: 'senior', 'Disaster relief': 'disaster', Animals: 'animal' };

/* ProPublica's NTEE major groups, used to narrow a name or town search by cause. */
const CAUSE_NTEE = {
  Arts: '1', Education: '2', Environment: '3', Animals: '3', Health: '4',
  'Food & hunger': '5', Homelessness: '5', Seniors: '5', 'Disaster relief': '5', Civic: '7',
};
const NTEE_GROUP = { 1: 'arts and culture', 2: 'education', 3: 'environment and animals', 4: 'health', 5: 'human services', 7: 'community benefit' };

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'Washington, DC', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii',
  ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
const STATE_NAME_SET = new Set(Object.values(STATE_NAMES).map((n) => n.toLowerCase()));

export function stateName(abbr) {
  return STATE_NAMES[abbr] || abbr || '';
}

export function titleCase(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Of|The|And|For|In|At|To)\b/g, (w, _m, i) => (i === 0 ? w : w.toLowerCase()));
}

export function formatCount(n) {
  if (n >= MAX_RESULTS) return '10,000+';
  return Number(n || 0).toLocaleString('en-US');
}

/** The cause as a row reads it: "Food and hunger", or '' for the catch-all. */
export function causeText(cause) {
  const c = String(cause || '').trim();
  if (!c || c === 'Nonprofit') return '';
  return c.replace(/\s*&\s*/g, ' and ');
}

/** "Food and hunger, Indianapolis, IN" under a nonprofit's name. */
export function nonprofitSub(o) {
  return [causeText(o.cause), titleCase(o.city), o.state].filter(Boolean).join(', ');
}

/** "Indianapolis, IN", or '' when the record has neither. */
export function placeText(o) {
  return [titleCase(o.city), o.state].filter(Boolean).join(', ');
}

/** The nonprofit's own page. */
export function nonprofitHref(o) {
  return `/nonprofits/${encodeURIComponent(String((o && o.ein) || ''))}`;
}

/* A web search for the org's own website and volunteer page. Only ever a
   small last-resort link on the nonprofit page, never the row's click. */
export function siteSearchUrl(o) {
  const terms = [titleCase(o.name), titleCase(o.city), o.state, 'volunteer'].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(terms)}`;
}

/**
 * The town in a Where value: "Carmel, IN" -> "Carmel", "Carmel 46032" ->
 * "Carmel". A state, a ZIP or "Online" alone has no town, so it's ''.
 */
export function cityOf(near) {
  let s = String(near || '').replace(/\b\d{5}(?:-\d{4})?\b/g, ' ').split(',')[0].replace(/\s+/g, ' ').trim();
  const tail = /\s+([A-Za-z]{2})$/.exec(s);
  if (tail && STATE_NAMES[tail[1].toUpperCase()]) s = s.slice(0, tail.index).trim();
  if (!s || s.length > 60) return '';
  if (STATE_NAMES[s.toUpperCase()] && s.length === 2) return '';
  if (STATE_NAME_SET.has(s.toLowerCase())) return '';
  if (/^(online|remote|virtual|anywhere|everywhere)$/i.test(s)) return '';
  if (!/^[A-Za-z][A-Za-z .'-]*$/.test(s)) return '';
  return s;
}

/* ---- near the visitor ----------------------------------------------------------- */

/* Neighborhood names around a point, from /api/nonprofits?around=, kept for
   the tab's session per rounded point. When the lookup is refused (429, the
   per-IP limit, or 503, a busy queue) or fails, the list goes ahead with the
   town alone and the next search asks again. */
const AREAS = new Map(); // "39.87,-86.14" -> { city, areas } | Promise
const AREAS_WAIT_MS = 2500;

const pointKey = (lat, lng) => (Number.isFinite(lat) && Number.isFinite(lng) ? `${Math.round(lat * 100) / 100},${Math.round(lng * 100) / 100}` : '');

function loadAreas(key) {
  if (AREAS.has(key)) return Promise.resolve(AREAS.get(key));
  const p = fetch(`/api/nonprofits?around=${encodeURIComponent(key)}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch((err) => {
      console.warn('[nonprofits] neighborhoods failed', err && err.message);
      return null;
    })
    .then((d) => {
      const v = {
        city: d && typeof d.city === 'string' ? d.city : '',
        areas: d && Array.isArray(d.areas) ? d.areas.filter((a) => typeof a === 'string' && cityOf(a)).slice(0, 2) : [],
      };
      if (d) AREAS.set(key, v);
      else AREAS.delete(key);
      return v;
    });
  AREAS.set(key, p);
  return p;
}

/**
 * { city, areas } around the point, or null while it's being looked up (at
 * most AREAS_WAIT_MS; after that the list goes ahead without them).
 */
function useAreasAround(key) {
  const known = key && AREAS.get(key);
  const [got, setGot] = useState(() => (known && !(known instanceof Promise) ? { key, v: known } : null));
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    const late = setTimeout(() => alive && setGot((g) => (g && g.key === key ? g : { key, v: { city: '', areas: [] } })), AREAS_WAIT_MS);
    loadAreas(key).then((v) => alive && setGot({ key, v }));
    return () => {
      alive = false;
      clearTimeout(late);
    };
  }, [key]);
  if (!key) return { city: '', areas: [] };
  return got && got.key === key ? got.v : null;
}

/**
 * Orders orgs nearest to `origin` first, by their street addresses
 * (lib/nonprofitPlaces.js); ones that can't be placed keep their order at the
 * end. `miles(o)` is "2.7 mi", or '' when there's no distance. `ready` turns
 * true once most of them are placed. With no origin it changes nothing.
 * @param {Array<{ein:number|string}>} orgs
 * @param {{lat:number,lng:number}|null} origin
 */
export function useNearestFirst(orgs, origin) {
  const lat = origin ? Number(origin.lat) : NaN;
  const lng = origin ? Number(origin.lng) : NaN;
  const on = Number.isFinite(lat) && Number.isFinite(lng);
  const eins = useMemo(() => (on ? (orgs || []).map((o) => o.ein) : NO_EINS), [orgs, on]);
  const { places, missing } = useNonprofitPlaces(eins);
  return useMemo(() => {
    const list = orgs || [];
    if (!on) return { rows: list, miles: () => '', ready: true };
    const from = { lat, lng };
    const dist = new Map();
    list.forEach((o) => {
      const p = places.get(canonEin(o.ein));
      if (p) dist.set(o.ein, distanceMiles(from, p));
    });
    const rows = list
      .map((o, i) => ({ o, i, d: dist.has(o.ein) && Number.isFinite(dist.get(o.ein)) ? dist.get(o.ein) : Infinity }))
      .sort((a, b) => a.d - b.d || a.i - b.i)
      .map((x) => x.o);
    const ids = new Set(eins.map(canonEin));
    const settled = [...ids].filter((id) => places.has(id) || missing.has(id)).length;
    return {
      rows,
      miles: (o) => (dist.has(o.ein) ? milesLabel(dist.get(o.ein)) : ''),
      ready: !ids.size || settled / ids.size >= NEAR_SETTLED,
    };
  }, [orgs, on, lat, lng, places, missing, eins]);
}

/* A full page navigation cancels in-flight fetches with "Failed to fetch".
   That's routine, so it isn't logged as a search failure. The last
   back/forward press is kept so a list only jumps back to its old scroll
   position when the visitor came back to it. */
let unloading = false;
let lastPop = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    unloading = true;
  });
  window.addEventListener('pageshow', () => {
    unloading = false;
  });
  window.addEventListener('popstate', () => {
    lastPop = Date.now();
  });
}
const RESTORE_WINDOW_MS = 8000;

function isCancelled(err, signal) {
  return unloading || (signal && signal.aborted) || (err && err.name === 'AbortError');
}

/* Loaded results by search, kept for this tab's session so Back from a
   nonprofit page shows the same rows instead of starting over. */
const CACHE = new Map();
const CACHE_MAX = 12;
function remember(key, entry) {
  CACHE.delete(key);
  CACHE.set(key, entry);
  while (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
}

/* Discover link for "See all nonprofits". Opens Discover's Nonprofits tab. */
function discoverHref({ q, near, causes }) {
  const params = new URLSearchParams();
  const term = String(q || '').trim();
  const where = String(near || '').replace(/\b\d{5}(?:-\d{4})?\b/g, '').replace(/\s+/g, ' ').trim();
  if (term) params.set('q', term);
  if (where) params.set('near', where);
  if ((causes || []).length) params.set('causes', causes.join('|'));
  params.set('view', 'nonprofits');
  return `/discover?${params.toString()}`;
}

/** One upstream request. Throws on failure so callers can tell it from "0 found". */
async function fetchSearch({ q, city, state, ntee, page }, signal) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (city) params.set('city', city);
  if (state) params.set('state', state);
  if (ntee) params.set('ntee', ntee);
  if (page) params.set('page', String(page));
  const res = await fetch(`/api/nonprofits?${params.toString()}`, { signal });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || !data || data.error) throw new Error((data && data.error) || `status ${res.status}`);
  return data;
}

/**
 * The searches for the current inputs (one per cause group, at most 4).
 * `areas` are neighborhood names to search in the town as well; those come
 * back marked `extra` (first page only, left out of the count).
 */
function buildQueries({ q, causes, state, city, areas = [] }) {
  const term = String(q || '').trim();
  const list = (causes || []).slice(0, 4);
  const ntees = Array.from(new Set(list.map((c) => CAUSE_NTEE[c]).filter(Boolean)));
  if (term || city) {
    const base = { q: term, city, state };
    const main = ntees.length ? ntees.map((ntee) => ({ ...base, ntee })) : [base];
    const extra = term || !city ? [] : areas.flatMap((a) => (ntees.length ? ntees : ['']).map((ntee) => ({ q: a, city, state, ...(ntee ? { ntee } : {}), extra: true })));
    const words = term || !city ? [] : Array.from(new Set(list.map((c) => CAUSE_WORD[c]).filter(Boolean))).slice(0, 2);
    return [...main, ...words.map((w) => ({ q: w, city, state, extra: true })), ...extra.slice(0, NEAR_EXTRA_MAX)];
  }
  if (list.length) return list.map((c) => ({ q: CAUSE_KEYWORD[c] || c, state }));
  if (state) return [{ state }];
  return [];
}

/* Round-robin merge so two cause searches share the top of the list. */
function interleave(lists) {
  const out = [];
  const seen = new Set();
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const l of lists) {
      const o = l[i];
      if (o && !seen.has(o.ein)) {
        seen.add(o.ein);
        out.push(o);
      }
    }
  }
  return out;
}

/** A list entry from one search's first page. A neighborhood search ("extra") is never paged. */
function listFrom(query, data) {
  const orgs = data.organizations || [];
  const pages = query.extra ? 1 : orgs.length ? Number(data.pages) || 1 : 0;
  return { query, orgs, page: 0, pages, total: Number(data.total) || 0, capped: Boolean(data.capped) };
}

/** Pages 1..n-1 of each list that has them, appended in place of a "Show more". */
async function loadPool(lists, pagesEach, signal) {
  const want = [];
  lists.forEach((l, i) => {
    if (l.query.extra) return;
    for (let p = 1; p < Math.min(pagesEach, l.pages); p++) want.push({ i, p });
  });
  if (!want.length) return lists;
  const settled = await Promise.allSettled(want.map((w) => fetchSearch({ ...lists[w.i].query, page: w.p }, signal)));
  return lists.map((l, i) => {
    let orgs = l.orgs;
    let page = l.page;
    want.forEach((w, k) => {
      const r = settled[k];
      // Pages are added in order; one that failed stops the run, so "Show more" picks up from there.
      if (w.i !== i || page + 1 !== w.p || r.status !== 'fulfilled') return;
      orgs = [...orgs, ...(r.value.organizations || [])];
      page = w.p;
    });
    return { ...l, orgs, page };
  });
}

const IDLE = { status: 'idle', lists: [], broadened: '', moreError: false };

/**
 * `limit` caps the list for a preview: only that many rows, no paging, and a
 * "See all" action instead. The action is a link to Discover's Nonprofits tab,
 * or `onSeeAll` when the caller switches tabs itself (Discover). A preview
 * with no name to search leaves out records that clearly can't take a teen
 * volunteer (lib/nonprofitRules.js); its count and "See all" stay the full total.
 * `area` ({ city, state }) is searched when there's nothing else to go on.
 * `onCount({ total, state, city, capped, broadened })` reports the total.
 * `onResults(orgs)` hands the shown rows to a caller (Discover's map dots).
 * `mapNotes` is for a list beside a map: each row says "Not on the map" when
 * its address can't be placed, and hovering or focusing a row lights its dot
 * (lib/nonprofitPlaces.js).
 */
export default function WebNonprofits({ q = '', near = '', causes = [], kind = 'all', heading = '', limit: cap = 0, area = null, origin = null, onClear, onCount, onResults, onSeeAll, id, mapNotes = false }) {
  const [allStates, setAllStates] = useState(false);
  const preview = Number(cap) > 0 ? Math.floor(Number(cap)) : 0;
  const [nonce, setNonce] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const causeKey = (causes || []).join('|');
  const hidden = kind === 'student';
  const term = String(q || '').trim();
  const typedCity = cityOf(near);
  const homeState = parseState(near);
  // The default area (Indianapolis) stands in whenever nothing names a
  // place, a picked cause included: "Food and hunger" means food nonprofits
  // there, not in every state.
  const useArea = !term && !typedCity && !homeState && area && area.city && area.state;
  const city = useArea ? String(area.city) : typedCity;
  const state = allStates ? '' : useArea ? String(area.state) : homeState;
  // Nearest first whenever the visitor's point is known, a typed name
  // included: the rows say how far each one is, so they run in that order.
  // Only a list with no name typed also loads the bigger town pool and the
  // neighborhood searches, since a name search is already narrow.
  const oLat = origin ? Number(origin.lat) : NaN;
  const oLng = origin ? Number(origin.lng) : NaN;
  const hasOrigin = Number.isFinite(oLat) && Number.isFinite(oLng);
  const nearSort = hasOrigin;
  const nearPool = hasOrigin && !term;
  const around = useAreasAround(nearPool && city ? pointKey(oLat, oLng) : '');
  const areas = around && around.city && city && around.city.toLowerCase() === city.toLowerCase() ? around.areas : [];
  const queries = around === null ? [] : buildQueries({ q: term, causes, state, city, areas: nearPool ? areas : [] });
  const waitingAreas = around === null;
  const poolPages = nearPool && city ? NEAR_POOL_PAGES : 1;
  const queryKey = JSON.stringify({ queries, preview, poolPages });

  const cached = CACHE.get(queryKey);
  const [result, setResult] = useState(() => (cached ? cached.result : IDLE));
  const [limit, setLimit] = useState(() => (cached ? cached.limit : PAGE));
  // The search whose results are on screen. Restored from the cache, it
  // skips the fetch (StrictMode's second effect pass included).
  const fetchKey = `${queryKey}#${hidden ? 1 : 0}#${nonce}`;
  const shownKey = useRef(cached && cached.result.status === 'done' ? fetchKey : '');
  const restoreY = useRef(cached && cached.restore && Date.now() - lastPop < RESTORE_WINDOW_MS ? cached.scrollY : null);

  // A new search starts back inside the student's own state.
  useEffect(() => {
    setAllStates(false);
  }, [term, near, causeKey]);

  useEffect(() => {
    let alive = true;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const signal = ctrl ? ctrl.signal : undefined;
    if (shownKey.current === fetchKey) return undefined;
    if (waitingAreas && !hidden) {
      setResult((r) => ({ ...r, status: 'loading' }));
      return undefined;
    }
    if (hidden || !queries.length) {
      setResult(IDLE);
      return undefined;
    }
    setResult((r) => ({ ...r, status: 'loading' }));
    setLimit(PAGE);
    const run = async (qs) => {
      const settled = await Promise.allSettled(qs.map((x) => fetchSearch({ ...x, page: 0 }, signal)));
      return settled;
    };
    const mainQs = queries.filter((x) => !x.extra);
    const extraQs = queries.filter((x) => x.extra);
    const t = setTimeout(async () => {
      const [first, extraSettled] = await Promise.all([run(mainQs), run(extraQs)]);
      let settled = first;
      if (!alive || isCancelled(null, signal)) return;
      let used = mainQs;
      let broadened = '';
      const ok = () => settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      // A town with no IRS records at all (a made-up or misspelled name): say
      // so and cover the state instead. A real town where only the name or
      // cause found nothing keeps its honest empty result.
      let townEmpty = false;
      if (city && ok().length === settled.length && ok().every((d) => !Number(d.total))) {
        if (!term && used.length === 1 && !used[0].ntee) townEmpty = true;
        else {
          try {
            const probe = await fetchSearch({ city, state, page: 0 }, signal);
            townEmpty = !Number(probe.total);
          } catch (err) {
            if (!alive || isCancelled(err, signal)) return;
            townEmpty = false;
          }
        }
      }
      if (townEmpty) {
        const wider = buildQueries({ q: term, causes, state, city: '' });
        if (wider.length) {
          settled = await run(wider);
          if (!alive || isCancelled(null, signal)) return;
          used = wider;
          broadened = city;
        }
      }
      if (!ok().length) {
        if (settled.some((r) => r.status === 'rejected' && isCancelled(r.reason, signal))) return;
        settled.forEach((r) => r.status === 'rejected' && console.error('[nonprofits] search failed', r.reason));
        setResult({ ...IDLE, status: 'error' });
        return;
      }
      let lists = settled.map((r, i) => (r.status === 'fulfilled' ? listFrom(used[i], r.value) : null)).filter(Boolean);
      if (poolPages > 1) lists = await loadPool(lists, poolPages, signal);
      if (!alive || isCancelled(null, signal)) return;
      // Neighborhood searches only count when the town itself was searched.
      const extras = broadened ? [] : extraSettled.map((r, i) => (r.status === 'fulfilled' ? listFrom(extraQs[i], r.value) : null)).filter(Boolean);
      lists = [...extras, ...lists];
      shownKey.current = fetchKey;
      setResult({ status: 'done', lists, broadened, moreError: false });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
      if (ctrl) ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  const all = useMemo(() => interleave(result.lists.map((l) => l.orgs)), [result.lists]);
  const counted = result.lists.filter((l) => !l.query.extra);
  const total = counted.reduce((a, l) => a + l.total, 0);
  const capped = counted.some((l) => l.capped) || total >= MAX_RESULTS;
  const more = counted.some((l) => l.page + 1 < l.pages);
  const nearest = useNearestFirst(all, hasOrigin ? { lat: oLat, lng: oLng } : null);
  // A cause search runs on the IRS group (human services holds food banks
  // and youth sports alike), so records filed under the picked cause itself
  // come first, nearest first within each part.
  const ranked = useMemo(() => {
    const list = nearSort ? nearest.rows : all;
    const picked = new Set(causes || []);
    if (!picked.size) return list;
    return [...list.filter((o) => picked.has(o.cause)), ...list.filter((o) => !picked.has(o.cause))];
    // causeKey stands in for causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearSort, nearest.rows, all, causeKey]);
  // Rows already shown keep their place when "Show more" adds the next ones.
  const [frozen, setFrozen] = useState(() => (cached && cached.frozen) || []);
  const [frozenFor, setFrozenFor] = useState(queryKey);
  if (frozenFor !== queryKey) {
    setFrozenFor(queryKey);
    setFrozen((cached && cached.frozen) || []);
  }
  const ordered = useMemo(() => {
    if (!nearSort || !frozen.length) return ranked;
    const byEin = new Map(ranked.map((o) => [o.ein, o]));
    const head = frozen.map((e) => byEin.get(e)).filter(Boolean);
    const seen = new Set(head.map((o) => o.ein));
    return [...head, ...ranked.filter((o) => !seen.has(o.ein))];
  }, [ranked, frozen, nearSort]);
  const pickFrom = preview && !term ? (nearSort ? ordered : ordered.slice(0, PREVIEW_POOL)).filter(isVolunteerPlace) : ordered;
  const rows = pickFrom.slice(0, preview || limit);
  const rowsKey = rows.map((o) => o.ein).join(',');
  // The map gets every nonprofit the search loaded, even when the list
  // under it is a short preview, so each one in the area is a dot.
  const mapRows = preview ? pickFrom : rows;
  const mapKey = mapRows.map((o) => o.ein).join(',');
  // A nearest-first list waits (briefly) for the addresses before it shows an order.
  const [holdOver, setHoldOver] = useState(false);
  useEffect(() => {
    setHoldOver(false);
    if (!nearSort || result.status !== 'done') return undefined;
    const t = setTimeout(() => setHoldOver(true), NEAR_HOLD_MS);
    return () => clearTimeout(t);
  }, [nearSort, result.status, queryKey]);
  const holding = nearSort && result.status === 'done' && !nearest.ready && !holdOver && !frozen.length;
  const searchedCity = result.broadened ? '' : city;

  // Keep what's loaded for Back from a nonprofit page.
  useEffect(() => {
    if (result.status !== 'done') return;
    const prev = CACHE.get(queryKey);
    remember(queryKey, { result, limit, frozen, scrollY: prev ? prev.scrollY : 0, restore: false });
  }, [result, limit, frozen, queryKey]);

  // Back from a nonprofit page: return to the row the visitor left from.
  useEffect(() => {
    const y = restoreY.current;
    if (y === null || result.status !== 'done' || typeof window === 'undefined') return undefined;
    const go = () => {
      restoreY.current = null;
      window.scrollTo(0, y);
    };
    const raf = window.requestAnimationFrame(() => window.requestAnimationFrame(go));
    const late = setTimeout(go, 250);
    return () => {
      window.cancelAnimationFrame(raf);
      clearTimeout(late);
    };
  }, [result.status]);

  useEffect(() => {
    if (!onCount) return;
    onCount(hidden || result.status !== 'done' ? null : { total, state, city: searchedCity, capped, broadened: result.broadened });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.status, total, hidden, state, searchedCity, capped, result.broadened]);

  useEffect(() => {
    if (!onResults) return;
    onResults(hidden || result.status !== 'done' ? [] : mapRows);
    // mapKey stands in for mapRows (a new order is a new key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.status, mapKey, hidden]);

  function leaving() {
    if (typeof window === 'undefined') return;
    const entry = CACHE.get(queryKey);
    if (entry) remember(queryKey, { ...entry, scrollY: window.scrollY, restore: true });
  }

  async function loadMore() {
    if (loadingMore) return;
    if (nearSort) setFrozen(rows.map((o) => o.ein));
    // Rows already fetched are shown first; the next upstream pages come after.
    if (all.length >= limit + PAGE || (!more && all.length > limit)) {
      setLimit((l) => l + PAGE);
      return;
    }
    const lists = result.lists;
    const idx = lists.map((l, i) => (!l.query.extra && l.page + 1 < l.pages ? i : -1)).filter((i) => i >= 0);
    setLoadingMore(true);
    const settled = await Promise.allSettled(idx.map((i) => fetchSearch({ ...lists[i].query, page: lists[i].page + 1 })));
    setLoadingMore(false);
    if (unloading) return;
    if (!settled.some((r) => r.status === 'fulfilled')) {
      setResult((r) => ({ ...r, moreError: true }));
      return;
    }
    setResult((r) => ({
      ...r,
      moreError: settled.some((s) => s.status === 'rejected'),
      lists: r.lists.map((l, i) => {
        const k = idx.indexOf(i);
        const s = k >= 0 ? settled[k] : null;
        if (!s || s.status !== 'fulfilled') return l;
        const got = s.value.organizations || [];
        return { ...l, orgs: [...l.orgs, ...got], page: l.page + 1, pages: got.length ? Number(s.value.pages) || l.pages : l.page + 1 };
      }),
    }));
    setLimit((l) => l + PAGE);
  }

  if (hidden) return null;
  if (!queries.length) {
    // A preview with nothing to search by is left out; the full list asks for a search.
    if (!onClear || preview) return null;
    return (
      <Section id={id} title={heading || 'Nonprofits'}>
        <Notice title="Search nonprofits by name or cause" body="Type a name or a cause above, or enter a town or ZIP to see the nonprofits there." />
      </Section>
    );
  }

  const whereText = searchedCity ? ` in ${searchedCity}` : state ? ` in ${stateName(state)}` : '';
  const title = heading || (term ? `Nonprofits for “${term}”${whereText}` : `Nonprofits${whereText || ' in every state'}`);
  const sourcePlace = searchedCity ? `${searchedCity}, ${stateName(state) || state}` : state ? stateName(state) : '';
  const done = result.status === 'done' && rows.length > 0;
  // A town preview that found nothing has nothing to say, so it's left out.
  if (preview && !term && result.status === 'done' && !rows.length) return null;
  const seeAllLabel = total ? `See all ${formatCount(total)}` : 'See all nonprofits';
  const seeAll = !preview || !done ? null : onSeeAll ? (
    <button type="button" onClick={onSeeAll} className="vu-link-ul" style={S(`flex:none;background:none;border:0;padding:0;cursor:pointer;font:500 14px/1.3 ${F.body};color:${C.ink}`)}>
      {seeAllLabel}
    </button>
  ) : (
    <Link href={discoverHref({ q, near: useArea ? `${area.city}, ${area.state}` : near, causes })} className="vu-link-ul" style={S(`flex:none;font:500 14px/1.3 ${F.body};color:${C.ink}`)}>
      {seeAllLabel}
    </Link>
  );
  const groups = Array.from(new Set(result.lists.map((l) => l.query.ntee).filter(Boolean))).map((n) => NTEE_GROUP[n]).filter(Boolean);
  const notes = !done
    ? []
    : [
        `From IRS nonprofit records${sourcePlace ? ` for ${sourcePlace}` : ''}, through ProPublica.`,
        groups.length ? `The cause filter uses the IRS ${groups.join(' and ')} ${groups.length > 1 ? 'groups' : 'group'}.` : '',
      ].filter(Boolean);

  return (
    <Section id={id} title={title} action={seeAll} notes={notes}>
      {result.broadened && result.status === 'done' ? (
        <p role="status" style={S(`margin:8px 0 0;font:500 14px/1.45 ${F.body};color:${C.ink}`)}>
          No IRS records list {result.broadened}, so these are from {state ? `all of ${stateName(state)}` : 'every state'}. Check the spelling in Where, or try a nearby town.
        </p>
      ) : null}
      {result.status === 'loading' || result.status === 'idle' || holding ? (
        <div style={S('padding-top:8px')} aria-busy="true" aria-label="Searching nonprofits">
          <SkeletonRows n={3} h={56} />
        </div>
      ) : result.status === 'error' ? (
        <Notice
          alert
          title="Nonprofit search is down right now"
          body="Opportunities on VolunteerU still work. Try again in a minute."
          action="Try again"
          onAction={() => setNonce((n) => n + 1)}
        />
      ) : !rows.length ? (
        <Notice
          title={term ? `Nothing for “${term}”${whereText}` : `No nonprofits found${whereText}`}
          body={state ? 'Try a shorter word, or search every state.' : 'Try a shorter word or a different spelling.'}
          action={state ? 'Search all states' : onClear ? 'Clear search' : ''}
          onAction={state ? () => setAllStates(true) : onClear}
        />
      ) : (
        <>
          {!preview ? (
            <p aria-live="polite" style={S(`margin:14px 0 0;font:400 13px/1.45 ${F.body};color:${C.ink2}`)}>
              Showing <b style={S(`font-weight:600;color:${C.ink};font-variant-numeric:tabular-nums`)}>{rows.length.toLocaleString('en-US')}</b> of{' '}
              <b style={S(`font-weight:600;color:${C.ink};font-variant-numeric:tabular-nums`)}>{formatCount(total)}</b>
              {nearSort ? ', closest to you first' : ''}
              {capped ? '. Pick a town or cause to narrow these down.' : ''}
            </p>
          ) : null}
          <ul className="vu-np-grid" style={S('list-style:none;margin:12px 0 0;padding:0')}>
            {rows.map((o) => (
              <li key={o.ein} style={S('min-width:0')}>
                {mapNotes ? (
                  <MappedRow o={o} miles={nearest.miles(o)} onClick={leaving} />
                ) : (
                  <NonprofitRow name={titleCase(o.name)} parts={[causeText(o.cause), placeText(o), nearest.miles(o)]} href={nonprofitHref(o)} onClick={leaving} />
                )}
              </li>
            ))}
          </ul>
          {!preview && (more || all.length > limit) ? (
            <div style={S('margin-top:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap')}>
              <Button size="sm" onClick={loadMore} busy={loadingMore}>
                {loadingMore ? 'Loading nonprofits' : result.moreError ? 'Try again' : `Show ${Math.min(PAGE, Math.max(total, all.length) - rows.length) || PAGE} more`}
              </Button>
              {result.moreError ? (
                <span role="alert" style={S(`font:400 13px/1.45 ${F.body};color:${C.emberDeep}`)}>
                  More nonprofits didn&apos;t load. Check your connection and try again.
                </span>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Section>
  );
}

/** A row beside the map: notes when the org has no spot on it and lights its dot on hover. */
function MappedRow({ o, miles = '', onClick }) {
  const spot = useNonprofitPlace(o.ein);
  return (
    <NonprofitRow
      name={titleCase(o.name)}
      parts={[causeText(o.cause), placeText(o), miles]}
      href={nonprofitHref(o)}
      onClick={onClick}
      note={spot === 'missing' ? 'Not on the map' : ''}
      onHover={(on) => setMapHover(on ? o.ein : null)}
    />
  );
}

function Section({ id, title, action, notes = [], children }) {
  return (
    <section id={id} aria-label={title} style={S('min-width:0;scroll-margin-top:24px')}>
      <div className="vu-sec-head">
        <h2 style={S(`margin:0;min-width:0;font:650 22px/1.15 ${F.display};letter-spacing:-0.02em;color:${C.ink};overflow-wrap:anywhere`)}>{title}</h2>
        {action || null}
      </div>
      {notes.map((n) => (
        <p key={n} style={S(`margin:6px 0 0;font:400 13px/1.45 ${F.body};color:${C.ink2}`)}>{n}</p>
      ))}
      {children}
    </section>
  );
}

export function Notice({ title, body, action, onAction, alert }) {
  return (
    <div role={alert ? 'alert' : undefined} style={S(`margin-top:12px;padding:20px 0 4px;border-top:1px solid ${C.line}`)}>
      <div style={S(`font:600 16px/1.3 ${F.body};color:${C.ink}`)}>{title}</div>
      <div style={S(`margin-top:4px;font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>{body}</div>
      {action && onAction ? (
        <div style={S('margin-top:14px')}>
          <Button size="sm" icon={alert ? 'refresh' : undefined} onClick={onAction}>
            {action}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** "81-0717306". */
export function formatEin(ein) {
  const s = String(ein || '').padStart(9, '0');
  return `${s.slice(0, 2)}-${s.slice(2)}`;
}

/** "$174,811", exact, as the filing reports it. */
export function formatMoney(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}
