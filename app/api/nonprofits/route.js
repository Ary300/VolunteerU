/* ==========================================================================
   /api/nonprofits, nonprofit search and detail.
   Server-side proxy to ProPublica's Nonprofit Explorer (public IRS data). The
   upstream API sends no CORS headers, so the browser can't call it directly.

   GET ?q=&state=&ntee=&page=   search, returns { organizations, total, page, pages }
   GET ?ein=                    one organization, returns { organization }

   The proxy only runs the search it was asked for. It never swaps in a broader
   search when nothing matches, so a count of 0 means 0 and the page can say so.
   Errors come back with a non-200 status and { error } so the client can tell
   "nothing matched" apart from "the search is down".
   ========================================================================== */

export const runtime = 'nodejs';

const UPSTREAM = 'https://projects.propublica.org/nonprofits/api/v2';
const HEADERS = { 'User-Agent': 'VolunteerU (nonprofit search)' };
const PAGE_SIZE = 25; // ProPublica's fixed page size
const MAX_PAGE = 39; // ProPublica stops paging past 40 pages

// NTEE major-code first letter -> a cause label.
const NTEE_CAUSE = {
  A: 'Arts', B: 'Education', C: 'Environment', D: 'Animals',
  E: 'Health', F: 'Health', G: 'Health', H: 'Health',
  I: 'Civic', J: 'Human services', K: 'Food & hunger', L: 'Homelessness',
  M: 'Disaster relief', N: 'Recreation', O: 'Youth', P: 'Human services',
  Q: 'International', R: 'Civic', S: 'Civic', T: 'Civic', U: 'Civic',
  V: 'Civic', W: 'Civic', X: 'Religion', Y: 'Membership', Z: 'Nonprofit',
};

function causeFromNtee(code) {
  if (!code) return 'Nonprofit';
  return NTEE_CAUSE[String(code)[0].toUpperCase()] || 'Nonprofit';
}

function profileUrl(ein) {
  return `https://projects.propublica.org/nonprofits/organizations/${ein}`;
}

function fail(error, status) {
  return Response.json({ error }, { status });
}

async function orgDetail(ein) {
  let res;
  try {
    res = await fetch(`${UPSTREAM}/organizations/${ein}.json`, { headers: HEADERS, next: { revalidate: 86400 } });
  } catch (err) {
    console.error('[api/nonprofits] detail fetch failed', ein, err);
    return fail('fetch_failed', 502);
  }
  if (res.status === 404) return fail('not_found', 404);
  if (!res.ok) {
    console.error('[api/nonprofits] detail upstream status', ein, res.status);
    return fail('upstream', 502);
  }
  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error('[api/nonprofits] detail bad JSON', ein, err);
    return fail('upstream', 502);
  }
  const o = data.organization || {};
  if (!o.ein) return fail('not_found', 404);
  const f = (data.filings_with_data || [])[0] || null;
  // Revenue comes from the latest filed return when there is one, otherwise
  // from the IRS master file, which carries the most recent reported amount.
  const revenue = f && f.totrevenue != null ? f.totrevenue : (o.revenue_amount ?? null);
  const taxPeriod = o.tax_period ? String(o.tax_period).slice(0, 4) : '';
  return Response.json({
    organization: {
      ein: o.ein,
      name: o.name || '',
      cause: causeFromNtee(o.ntee_code),
      nteeCode: o.ntee_code || '',
      address: o.address || '',
      city: o.city || '',
      state: o.state || '',
      zip: o.zipcode ? String(o.zipcode).replace(/-0000$/, '') : '',
      is501c3: String(o.subsection_code) === '3',
      rulingYear: o.ruling_date ? String(o.ruling_date).slice(0, 4) : '',
      revenue: typeof revenue === 'number' ? revenue : null,
      revenueYear: f && f.tax_prd_yr ? String(f.tax_prd_yr) : taxPeriod,
      url: profileUrl(o.ein),
    },
  });
}

async function search({ q, state, ntee, page }) {
  const u = new URL(`${UPSTREAM}/search.json`);
  if (q) u.searchParams.set('q', q);
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
  // ProPublica answers a search with no matches with a 404.
  if (res.status === 404) return Response.json({ organizations: [], total: 0, page, pages: 0 });
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
  const organizations = (data.organizations || []).map((o) => ({
    ein: o.ein,
    name: o.name || '',
    city: o.city || '',
    state: o.state || '',
    cause: causeFromNtee(o.ntee_code),
    url: profileUrl(o.ein),
  }));
  const total = Number(data.total_results) || organizations.length;
  const pages = Math.min(Number(data.num_pages) || Math.ceil(total / PAGE_SIZE), MAX_PAGE + 1);
  return Response.json({ organizations, total, page, pages });
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
  const stateRaw = (searchParams.get('state') || '').trim().toUpperCase();
  const nteeRaw = (searchParams.get('ntee') || '').trim();
  const pageRaw = parseInt(searchParams.get('page') || '0', 10);

  const state = /^[A-Z]{2}$/.test(stateRaw) ? stateRaw : '';
  const ntee = /^([1-9]|10)$/.test(nteeRaw) ? nteeRaw : '';
  const page = Number.isFinite(pageRaw) ? Math.min(Math.max(pageRaw, 0), MAX_PAGE) : 0;

  if (!q && !state && !ntee) return fail('missing_query', 400);
  return search({ q, state, ntee, page });
}
