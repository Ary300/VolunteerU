/* ==========================================================================
   /api/nonprofits, nonprofit search and detail.
   Server-side proxy to ProPublica's Nonprofit Explorer (public IRS data). The
   upstream API sends no CORS headers, so the browser can't call it directly.

   GET ?q=&city=&state=&ntee=&page=   search, returns { organizations, total, page, pages, capped }
   GET ?ein=                          one organization, returns { organization }
   GET ?ein=&links=1                  the same, plus how to volunteer with them:
                                      website, volunteerUrl, phone, phoneTel,
                                      linkSource ('irs990' | 'wikidata' | '')
                                      from lib/nonprofitLinks.js. Only the
                                      nonprofit page asks for this; map dots and
                                      saved rows use the plain, faster ?ein=.

   GET ?ein=&links=1&fresh=1          the same, looking again when the last
                                      lookup failed (lookupFailed: true says so).

   GET ?around=<lat>,<lng>            the neighborhood names around a point
                                      (OpenStreetMap), returns { city, areas },
                                      so a list can also search "Broad Ripple"
                                      for a visitor standing there.

   links=1 and around= reach slow upstreams (IRS filings, websites,
   Nominatim), so lookups that aren't already cached count toward a per-IP
   limit (lib/rateLimit.js). Over it, the answer is a 429 with
   { error: 'rate_limited' } and Retry-After; the pages carry on without
   the links or the neighborhood names.

   `city` turns the search into required terms ("+food +carmel"), which
   ProPublica matches against the name and the city, so a town's own
   nonprofits come back without guessing. `capped` is true when ProPublica's
   10,000-result ceiling cut the count, so the page can say so.

   The proxy only runs the search it was asked for. It never swaps in a broader
   search when nothing matches, so a count of 0 means 0 and the page can say so.
   Errors come back with a non-200 status and { error } so the client can tell
   "nothing matched" apart from "the search is down".
   ========================================================================== */

import { UPSTREAM, PAGE_SIZE, MAX_PAGE, MAX_RESULTS, composeQuery, searchRow, fetchOrganization } from '../../../lib/propublica.js';
import { nonprofitLinks, peekLinks } from '../../../lib/nonprofitLinks.js';
import { nominatimReverse } from '../../../lib/geocoders.js';
import { rateLimiter, clientIp } from '../../../lib/rateLimit.js';

export const runtime = 'nodejs';

const HEADERS = { 'User-Agent': 'VolunteerU/1.0 (https://www.volunteeruapp.com)' };
const CITY_RX = /^[A-Za-z][A-Za-z .'-]{0,59}$/;

function fail(error, status, headers = {}) {
  return Response.json({ error }, { status, headers });
}

/* Uncached lookups per IP per minute. A map view warms the links for up to
   16 dots and a page opens a few more; neighborhood names are asked once per
   spot. */
const linksOverLimit = rateLimiter({ max: 60 });
const areasOverLimit = rateLimiter({ max: 20 });
const RETRY_AFTER_S = '30';
const limited = () => fail('rate_limited', 429, { 'Retry-After': RETRY_AFTER_S });
// The longest a neighborhood lookup waits for its turn in the Nominatim queue.
const AREA_QUEUE_MS = 2500;

/* A day at the edge: IRS records and websites change rarely. An answer a
   failed source left incomplete keeps only as long as the server's own cache. */
const DETAIL_CACHE = 'public, s-maxage=86400, stale-while-revalidate=604800';
const FAILED_CACHE = 'public, s-maxage=120';

/** The fields the browser gets; the e-file ids stay on the server. */
function publicOrg(o) {
  const { efileId: _id, efileForm: _form, ...rest } = o;
  return rest;
}

async function orgDetail(ein, { withLinks = false, fresh = false, ip = '' } = {}) {
  // Only a lookup that would go out to the IRS filing and the website counts.
  if (withLinks && !peekLinks(ein, { fresh }) && linksOverLimit(ip)) return limited();
  const r = await fetchOrganization(ein);
  if (r.status === 'not_found') return fail('not_found', 404);
  if (r.status !== 'ok') return fail(r.error || 'upstream', 502);
  if (!withLinks) return Response.json({ organization: publicOrg(r.organization) }, { headers: { 'Cache-Control': DETAIL_CACHE } });
  const links = await nonprofitLinks(r.organization, { fresh });
  const organization = { ...publicOrg(r.organization), ...links };
  return Response.json({ organization }, { headers: { 'Cache-Control': links.lookupFailed ? FAILED_CACHE : DETAIL_CACHE } });
}

async function search({ q, city, state, ntee, page }) {
  const u = new URL(`${UPSTREAM}/search.json`);
  const query = composeQuery(q, city);
  if (query) u.searchParams.set('q', query);
  if (state) u.searchParams.set('state[id]', state);
  if (ntee) u.searchParams.set('ntee[id]', ntee);
  if (page) u.searchParams.set('page', String(page));

  let res;
  try {
    // Identical searches are cached for an hour; this data barely changes.
    res = await fetch(u.toString(), { headers: HEADERS, next: { revalidate: 3600 } });
  } catch (err) {
    console.error('[api/nonprofits] search fetch failed', u.search, err);
    return fail('fetch_failed', 502);
  }
  // ProPublica answers a search with no matches (or a page past the end) with a 404.
  if (res.status === 404) return Response.json({ organizations: [], total: 0, page, pages: 0, capped: false });
  if (!res.ok) {
    console.error('[api/nonprofits] search upstream status', u.search, res.status);
    return fail('upstream', 502);
  }
  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error('[api/nonprofits] search bad JSON', u.search, err);
    return fail('upstream', 502);
  }
  const organizations = (data.organizations || []).map(searchRow);
  const total = Number(data.total_results) || organizations.length;
  const pages = Math.min(Number(data.num_pages) || Math.ceil(total / PAGE_SIZE), MAX_PAGE + 1);
  return Response.json({ organizations, total, page, pages, capped: total >= MAX_RESULTS });
}

/* ---- neighborhoods around a point ------------------------------------------ */

const AREA_CACHE = new Map(); // "39.87,-86.14" -> { at, v }
const AREA_CACHE_MAX = 500;
const AREA_KEEP_MS = 7 * 24 * 3600 * 1000;
const AREA_NAME_RX = /^[A-Za-z][A-Za-z .'-]{1,40}$/;

async function areasAround(raw, ip) {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(raw);
  const lat = m ? Number(m[1]) : NaN;
  const lng = m ? Number(m[2]) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return fail('bad_point', 400);
  // About a kilometer: a neighborhood never needs a precise point.
  const rlat = Math.round(lat * 100) / 100;
  const rlng = Math.round(lng * 100) / 100;
  const key = `${rlat},${rlng}`;
  const hit = AREA_CACHE.get(key);
  if (hit && Date.now() - hit.at < AREA_KEEP_MS) return Response.json(hit.v, { headers: { 'Cache-Control': DETAIL_CACHE } });
  if (areasOverLimit(ip)) return limited();
  let r;
  try {
    // A busy queue (geocoding for everyone) skips this rather than holding the request.
    r = await nominatimReverse(rlat, rlng, { deadline: Date.now() + AREA_QUEUE_MS });
  } catch (err) {
    if (err && err.skipped) return fail('busy', 503, { 'Retry-After': '5' });
    console.error('[api/nonprofits] reverse lookup failed', key, err && err.message);
    return fail('upstream', 502);
  }
  const city = r && AREA_NAME_RX.test(r.city) ? r.city : '';
  const names = r ? [r.neighbourhood, r.quarter, r.suburb, r.hamlet] : [];
  const areas = [];
  for (const n of names) {
    if (!n || !AREA_NAME_RX.test(n) || n.toLowerCase() === city.toLowerCase()) continue;
    if (!areas.some((a) => a.toLowerCase() === n.toLowerCase())) areas.push(n);
  }
  const v = { city, areas: areas.slice(0, 2) };
  AREA_CACHE.delete(key);
  AREA_CACHE.set(key, { at: Date.now(), v });
  while (AREA_CACHE.size > AREA_CACHE_MAX) AREA_CACHE.delete(AREA_CACHE.keys().next().value);
  return Response.json(v, { headers: { 'Cache-Control': DETAIL_CACHE } });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const around = searchParams.get('around');
  if (around !== null) return areasAround(around.slice(0, 60), clientIp(request));

  const einRaw = searchParams.get('ein');
  if (einRaw !== null) {
    const ein = einRaw.trim().replace(/\D/g, '');
    if (!/^\d{6,9}$/.test(ein)) return fail('bad_ein', 400);
    return orgDetail(ein, { withLinks: searchParams.get('links') === '1', fresh: searchParams.get('fresh') === '1', ip: clientIp(request) });
  }

  const q = (searchParams.get('q') || '').trim().slice(0, 120);
  const cityRaw = (searchParams.get('city') || '').trim().replace(/\s+/g, ' ');
  const stateRaw = (searchParams.get('state') || '').trim().toUpperCase();
  const nteeRaw = (searchParams.get('ntee') || '').trim();
  const pageRaw = parseInt(searchParams.get('page') || '0', 10);

  const city = CITY_RX.test(cityRaw) ? cityRaw : '';
  const state = /^[A-Z]{2}$/.test(stateRaw) ? stateRaw : '';
  const ntee = /^([1-9]|10)$/.test(nteeRaw) ? nteeRaw : '';
  const page = Number.isFinite(pageRaw) ? Math.min(Math.max(pageRaw, 0), MAX_PAGE) : 0;

  if (!q && !city && !state && !ntee) return fail('missing_query', 400);
  return search({ q, city, state, ntee, page });
}
