/* ==========================================================================
   /api/nonprofits, real nonprofit search, no AI.
   Server-side proxy to ProPublica's Nonprofit Explorer (public IRS 990 data).
   Proxied here because the upstream API sends no CORS headers, so the browser
   cannot call it directly. Returns normalized cards: real registered nonprofits
   by name/keyword, state and cause. Nothing is generated, every row is a real
   organization with an EIN you can look up.
   ========================================================================== */

export const runtime = 'nodejs';

// NTEE major-code first letter -> a human cause label.
const NTEE_CAUSE = {
  A: 'Arts', B: 'Education', C: 'Environment', D: 'Animals',
  E: 'Health', F: 'Health', G: 'Health', H: 'Health',
  I: 'Civic', J: 'Human services', K: 'Food & hunger', L: 'Homelessness',
  M: 'Disaster relief', N: 'Recreation', O: 'Youth', P: 'Human services',
  Q: 'International', R: 'Civic', S: 'Civic', T: 'Civic', U: 'Civic',
  V: 'Civic', W: 'Civic', X: 'Community', Y: 'Membership', Z: 'Nonprofit',
};

function causeFromNtee(code) {
  if (!code) return 'Nonprofit';
  return NTEE_CAUSE[String(code)[0].toUpperCase()] || 'Nonprofit';
}

async function orgDetail(ein) {
  const u = `https://projects.propublica.org/nonprofits/api/v2/organizations/${ein}.json`;
  try {
    const res = await fetch(u, {
      headers: { 'User-Agent': 'VolunteerU (nonprofit discovery)' },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return Response.json({ error: 'upstream' }, { status: 200 });
    const data = await res.json();
    const o = data.organization || {};
    const f = (data.filings_with_data || [])[0] || {};
    return Response.json({
      organization: {
        ein: o.ein,
        name: o.name,
        cause: causeFromNtee(o.ntee_code),
        nteeCode: o.ntee_code || '',
        address: o.address || '',
        city: o.city || '',
        state: o.state || '',
        zip: o.zipcode || '',
        is501c3: String(o.subsection_code) === '3',
        rulingYear: o.ruling_date ? String(o.ruling_date).slice(0, 4) : '',
        filingYear: f.tax_prd_yr || null,
        revenue: f.totrevenue ?? null,
        assets: f.totassetsend ?? null,
        url: `https://projects.propublica.org/nonprofits/organizations/${o.ein}`,
      },
    });
  } catch {
    return Response.json({ error: 'fetch_failed' }, { status: 200 });
  }
}

/* One ProPublica search. Returns a mapped array of orgs, or null on upstream
   error so the caller can distinguish "no matches" from "request failed". */
async function runSearch({ q = '', state = '', ntee = '' }) {
  const u = new URL('https://projects.propublica.org/nonprofits/api/v2/search.json');
  if (q) u.searchParams.set('q', q);
  if (/^[A-Z]{2}$/.test(state)) u.searchParams.set('state[id]', state);
  if (/^([1-9]|10)$/.test(ntee)) u.searchParams.set('ntee[id]', ntee);
  const res = await fetch(u.toString(), {
    headers: { 'User-Agent': 'VolunteerU (nonprofit discovery)' },
    // cache identical searches for an hour; this data barely changes
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.organizations || []).slice(0, 12).map((o) => ({
    ein: o.ein,
    name: o.name,
    city: o.city || '',
    state: o.state || '',
    cause: causeFromNtee(o.ntee_code),
    url: `https://projects.propublica.org/nonprofits/organizations/${o.ein}`,
  }));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ein = (searchParams.get('ein') || '').trim().replace(/\D/g, '');
  if (/^\d{6,9}$/.test(ein)) return orgDetail(ein);

  const q = (searchParams.get('q') || '').trim().slice(0, 120);
  const state = (searchParams.get('state') || '').trim().toUpperCase();
  const ntee = (searchParams.get('ntee') || '').trim();
  const stateOk = /^[A-Z]{2}$/.test(state);

  // Progressively broaden so the volunteer always sees the closest related
  // nonprofits rather than an empty result:
  //   1. exact  — the cause + their state
  //   2. closest by location — any nonprofit in their state
  //   3. related by cause — the cause, nationally
  //   4. general community orgs near them (last resort, never empty)
  const attempts = [];
  if (q && stateOk) attempts.push({ q, state, ntee });
  if (stateOk) attempts.push({ state });
  if (q) attempts.push({ q });
  if (stateOk) attempts.push({ q: 'community', state });
  attempts.push({ q: 'community' });

  try {
    let organizations = [];
    let upstreamErr = false;
    for (const a of attempts) {
      const r = await runSearch(a);
      if (r === null) { upstreamErr = true; continue; }
      if (r.length) { organizations = r; break; }
    }
    const body = { organizations, total: organizations.length };
    if (upstreamErr && !organizations.length) body.error = 'upstream';
    return Response.json(body);
  } catch {
    return Response.json({ organizations: [], error: 'fetch_failed' });
  }
}
