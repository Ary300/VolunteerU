/* ==========================================================================
   /api/nonprofits, nonprofit search and detail.
   Server-side proxy to ProPublica's Nonprofit Explorer (public IRS data). The
   upstream API sends no CORS headers, so the browser can't call it directly.

   GET ?q=&city=&state=&ntee=&page=   search, returns { organizations, total, page, pages, capped }
   GET ?ein=                          one organization, returns { organization }

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

export const runtime = 'nodejs';

const HEADERS = { 'User-Agent': 'VolunteerU (nonprofit search)' };
const CITY_RX = /^[A-Za-z][A-Za-z .'-]{0,59}$/;

function fail(error, status) {
  return Response.json({ error }, { status });
}

async function orgDetail(ein) {
  const r = await fetchOrganization(ein);
  if (r.status === 'not_found') return fail('not_found', 404);
  if (r.status !== 'ok') return fail(r.error || 'upstream', 502);
  return Response.json({ organization: r.organization });
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

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const einRaw = searchParams.get('ein');
  if (einRaw !== null) {
    const ein = einRaw.trim().replace(/\D/g, '');
    if (!/^\d{6,9}$/.test(ein)) return fail('bad_ein', 400);
    return orgDetail(ein);
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
