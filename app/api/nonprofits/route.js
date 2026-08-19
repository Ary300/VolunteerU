/* ==========================================================================
   /api/nonprofits — real nonprofit search, no AI.
   Server-side proxy to ProPublica's Nonprofit Explorer (public IRS 990 data).
   Proxied here because the upstream API sends no CORS headers, so the browser
   cannot call it directly. Returns normalized cards: real registered nonprofits
   by name/keyword, state and cause. Nothing is generated — every row is a real
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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim().slice(0, 120);
  const state = (searchParams.get('state') || '').trim().toUpperCase();
  const ntee = (searchParams.get('ntee') || '').trim();

  if (!q && !/^[A-Z]{2}$/.test(state)) return Response.json({ organizations: [] });

  const u = new URL('https://projects.propublica.org/nonprofits/api/v2/search.json');
  if (q) u.searchParams.set('q', q);
  if (/^[A-Z]{2}$/.test(state)) u.searchParams.set('state[id]', state);
  if (/^([1-9]|10)$/.test(ntee)) u.searchParams.set('ntee[id]', ntee);

  try {
    const res = await fetch(u.toString(), {
      headers: { 'User-Agent': 'VolunteerU (nonprofit discovery)' },
      // cache identical searches for an hour; this data barely changes
      next: { revalidate: 3600 },
    });
    if (!res.ok) return Response.json({ organizations: [], error: 'upstream' });
    const data = await res.json();
    const organizations = (data.organizations || []).slice(0, 12).map((o) => ({
      ein: o.ein,
      name: o.name,
      city: o.city || '',
      state: o.state || '',
      cause: causeFromNtee(o.ntee_code),
      url: `https://projects.propublica.org/nonprofits/organizations/${o.ein}`,
    }));
    return Response.json({ organizations, total: data.total_results || organizations.length });
  } catch {
    return Response.json({ organizations: [], error: 'fetch_failed' });
  }
}
