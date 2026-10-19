/* ==========================================================================
   propublica.js, server-side reads of public IRS nonprofit records.

   ProPublica's Nonprofit Explorer API (v2) sends no CORS headers, so only
   server code calls it: /api/nonprofits for the browser and the
   /nonprofits/<ein> page for its title and first paint. Both use the
   helpers here so a record reads the same in either place.

   Nothing in this file invents a fact. A field the IRS record doesn't carry
   comes back empty and the page leaves that line out.
   ========================================================================== */

export const UPSTREAM = 'https://projects.propublica.org/nonprofits/api/v2';
const HEADERS = { 'User-Agent': 'VolunteerU/1.0 (https://www.volunteeruapp.com)' };
const DETAIL_REVALIDATE_S = 86400; // IRS records change monthly at most
const WIKIDATA_TIMEOUT_MS = 2000;
const DETAIL_TIMEOUT_MS = 8000;

/** ProPublica answers at most 400 pages of 25, the first 10,000 matches. */
export const PAGE_SIZE = 25;
export const MAX_PAGE = 399;
export const MAX_RESULTS = 10000;

// NTEE major-code first letter -> a cause label.
const NTEE_CAUSE = {
  A: 'Arts', B: 'Education', C: 'Environment', D: 'Animals',
  E: 'Health', F: 'Health', G: 'Health', H: 'Health',
  I: 'Civic', J: 'Human services', K: 'Food & hunger', L: 'Homelessness',
  M: 'Disaster relief', N: 'Recreation', O: 'Youth', P: 'Human services',
  Q: 'International', R: 'Civic', S: 'Civic', T: 'Civic', U: 'Civic',
  V: 'Civic', W: 'Civic', X: 'Religion', Y: 'Membership', Z: 'Nonprofit',
};

export function causeFromNtee(code) {
  if (!code) return 'Nonprofit';
  return NTEE_CAUSE[String(code)[0].toUpperCase()] || 'Nonprofit';
}

export function profileUrl(ein) {
  return `https://projects.propublica.org/nonprofits/organizations/${ein}`;
}

/* IRS 501(c) subsections, named the way the IRS describes them. */
const SUBSECTION_KIND = {
  2: 'title-holding corporation', 3: 'charity', 4: 'social welfare organization', 5: 'labor or farm organization',
  6: 'business league', 7: 'social club', 8: 'fraternal society', 9: 'employee benefit association',
  10: 'fraternal society', 13: 'cemetery company', 19: 'veterans organization',
};

/** "501(c)(3)", or '' when the record has no subsection. */
export function subsectionLabel(code) {
  const n = Number(code);
  return Number.isInteger(n) && n > 0 ? `501(c)(${n})` : '';
}

/* IRS foundation codes 2-4 are private foundations; 10 and up are public charities. */
function foundationKind(code) {
  const n = Number(code);
  if ([2, 3, 4].includes(n)) return 'private foundation';
  if (n >= 10) return 'public charity';
  return '';
}

/** "501(c)(3) public charity", "501(c)(4) social welfare organization", or ''. */
export function orgTypeLabel(subsection, foundation) {
  const sub = subsectionLabel(subsection);
  if (!sub) return '';
  if (Number(subsection) === 3) return `${sub} ${foundationKind(foundation) || 'charity'}`;
  return SUBSECTION_KIND[Number(subsection)] ? `${sub} ${SUBSECTION_KIND[Number(subsection)]}` : `${sub} tax-exempt organization`;
}

const FORM_NAME = { 0: '990', 1: '990-EZ', 2: '990-PF' };

/** Only https links on ProPublica or the IRS are passed through as filing PDFs. */
function filingPdf(url) {
  const s = String(url || '');
  return /^https:\/\/(projects\.propublica\.org|apps\.irs\.gov|www\.irs\.gov)\//.test(s) ? s : '';
}

function money(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Required-term query for a name plus a town. ProPublica matches every
 * "+word" against the name and the city, so "+food +carmel" finds Carmel
 * organizations with "food" in the name. Quotes and signs typed by the
 * visitor are dropped so they can't change the meaning.
 */
export function composeQuery(q, city) {
  const words = (s) => String(s || '').replace(/["'+\-]/g, ' ').split(/\s+/).filter(Boolean);
  const town = words(city);
  if (!town.length) return String(q || '').trim();
  return [...words(q), ...town].map((w) => `+${w}`).join(' ');
}

/** The search-row shape the app uses. */
export function searchRow(o) {
  return {
    ein: o.ein,
    name: o.name || '',
    city: o.city || '',
    state: o.state || '',
    cause: causeFromNtee(o.ntee_code),
    subsection: Number(o.subseccd) || null,
    url: profileUrl(o.ein),
  };
}

/* For an EIN it has no record of, ProPublica answers 200 with the name
   "Unknown Organization" and every other field empty. That isn't an org. */
function isPlaceholder(o) {
  return /^unknown organization$/i.test(String(o.name || '').trim()) && !o.address && !o.city && !o.state && !o.ruling_date;
}

/** One organization from ProPublica's /organizations/<ein>.json body. */
export function detailFrom(data) {
  const o = (data && data.organization) || {};
  if (!o.ein || isPlaceholder(o)) return null;
  const filings = Array.isArray(data.filings_with_data) ? data.filings_with_data : [];
  const f = filings[0] || null;
  // Revenue comes from the latest filed return when there is one, otherwise
  // from the IRS master file, which carries the most recent reported amount.
  const revenue = f && money(f.totrevenue) !== null ? f.totrevenue : money(o.revenue_amount);
  const taxPeriod = o.tax_period ? String(o.tax_period).slice(0, 4) : '';
  const filing = f
    ? {
        year: f.tax_prd_yr ? String(f.tax_prd_yr) : '',
        form: FORM_NAME[f.formtype] || '',
        revenue: money(f.totrevenue),
        expenses: money(f.totfuncexpns),
        pdfUrl: filingPdf(f.pdf_url),
      }
    : null;
  return {
    ein: o.ein,
    name: o.name || '',
    cause: causeFromNtee(o.ntee_code),
    nteeCode: o.ntee_code || '',
    address: o.address || '',
    city: o.city || '',
    state: o.state || '',
    zip: o.zipcode ? String(o.zipcode).replace(/-0000$/, '') : '',
    is501c3: String(o.subsection_code) === '3',
    subsection: subsectionLabel(o.subsection_code),
    orgType: orgTypeLabel(o.subsection_code, o.foundation_code),
    rulingYear: o.ruling_date ? String(o.ruling_date).slice(0, 4) : '',
    revenue,
    revenueYear: f && f.tax_prd_yr ? String(f.tax_prd_yr) : taxPeriod,
    filing,
    website: '',
    url: profileUrl(o.ein),
    // The latest e-filed return, for lib/nonprofitLinks.js (website and phone).
    efileId: /^\d{12,20}$/.test(String(o.latest_object_id || '')) ? String(o.latest_object_id) : '',
    efileForm: latestFormType(filings, data.filings_without_data),
  };
}

/* 0 for a 990, 1 for a 990-EZ, 2 for a 990-PF, from the newest filing either list has. */
function latestFormType(withData, withoutData) {
  const all = [...withData, ...(Array.isArray(withoutData) ? withoutData : [])].filter((f) => f && [0, 1, 2].includes(Number(f.formtype)));
  if (!all.length) return null;
  const newest = all.reduce((a, b) => (Number(b.tax_prd) > Number(a.tax_prd) ? b : a));
  return Number(newest.formtype);
}

/** "81-0717306" for Wikidata's EIN property. */
function dashedEin(ein) {
  const s = String(ein || '').padStart(9, '0');
  return `${s.slice(0, 2)}-${s.slice(2)}`;
}

/**
 * The organization's official website from Wikidata (property P856 on the
 * item whose IRS EIN, P1297, matches). Wikidata is a public, keyless source;
 * only notable organizations have an item, so most lookups find nothing and
 * the page simply has no website line. Never throws.
 */
export async function wikidataWebsite(ein) {
  const query = `SELECT ?site WHERE { ?item wdt:P1297 "${dashedEin(ein)}" . ?item wdt:P856 ?site . } LIMIT 1`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'VolunteerU/1.0 (nonprofit pages; https://www.volunteeruapp.com)' },
      next: { revalidate: DETAIL_REVALIDATE_S },
      signal: AbortSignal.timeout(WIKIDATA_TIMEOUT_MS),
    });
    if (!res.ok) return '';
    const data = await res.json();
    const site = data && data.results && data.results.bindings && data.results.bindings[0] && data.results.bindings[0].site;
    const value = site && typeof site.value === 'string' ? site.value : '';
    return /^https?:\/\/[^\s"<>]+\.[^\s"<>]+$/i.test(value) ? value : '';
  } catch (err) {
    console.warn('[propublica] wikidata website lookup failed', ein, err && err.name);
    return '';
  }
}

/**
 * One organization by EIN, with its website when Wikidata has one.
 * Resolves { status: 'ok', organization } | { status: 'not_found' } | { status: 'error', error }.
 */
export async function fetchOrganization(ein) {
  let res;
  try {
    res = await fetch(`${UPSTREAM}/organizations/${ein}.json`, {
      headers: HEADERS,
      next: { revalidate: DETAIL_REVALIDATE_S },
      signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[propublica] detail fetch failed', ein, err);
    return { status: 'error', error: 'fetch_failed' };
  }
  if (res.status === 404) return { status: 'not_found' };
  if (!res.ok) {
    console.error('[propublica] detail upstream status', ein, res.status);
    return { status: 'error', error: 'upstream' };
  }
  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error('[propublica] detail bad JSON', ein, err);
    return { status: 'error', error: 'upstream' };
  }
  const organization = detailFrom(data);
  if (!organization) return { status: 'not_found' };
  const website = await wikidataWebsite(organization.ein);
  return { status: 'ok', organization: { ...organization, website } };
}

/** The ein from a URL segment or query value: digits only, 1 to 9 of them, else ''. */
export function cleanEin(raw) {
  // The dashed form pages show ("EIN 86-3067673") works too.
  let s = String(raw == null ? '' : raw);
  try { s = decodeURIComponent(s); } catch { /* a stray % stays as typed */ }
  s = s.replace(/[-\s]/g, '');
  return /^\d{1,9}$/.test(s) ? s : '';
}
