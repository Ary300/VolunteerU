/* ==========================================================================
   listings.js, the cross-user layer
   Founders publish their project as a listing every other volunteer can find;
   volunteers apply, and the application lands in the founder's own workspace.
   This is the shared, multi-account half of the product (everything else is a
   private per-user workspace).
   ========================================================================== */

'use client';

import { supabase } from './supabase.js';
import { track } from './analytics.js';
import { checkInWindow, isPastShift, parseTimeRange } from './calendar.js';
import { getState } from './store.js';

/* A failed read. Screens catch this and show their error state instead of
   treating an outage as "nothing here". The raw cause stays on `.cause`. */
function loadFailed(what, error) {
  return Object.assign(new Error(`Couldn't load ${what}.`), { code: 'LOAD_FAILED', cause: error });
}

/* Who is signed in. `failed` is true when the auth server couldn't be reached
   and there's no stored session to fall back on, which is an outage, not a
   signed-out visitor. Callers that show an error state check it. */
async function identity() {
  if (!supabase) return { id: null, failed: false };
  let res;
  try {
    res = await supabase.auth.getUser();
  } catch (error) {
    res = { data: { user: null }, error };
  }
  const user = res && res.data && res.data.user;
  if (user) return { id: user.id, failed: false };
  const err = res && res.error;
  const status = Number(err && err.status) || 0;
  // No session, or the server rejected the token: signed out.
  if (!err || (err.name && err.name === 'AuthSessionMissingError') || (status >= 400 && status < 500)) {
    return { id: null, failed: false };
  }
  // Network failure or 5xx. The stored session still says who this is, and
  // RLS checks the token on every read anyway.
  try {
    const { data } = await supabase.auth.getSession();
    const u = data && data.session && data.session.user;
    if (u) return { id: u.id, failed: false };
  } catch { /* fall through */ }
  return { id: null, failed: true, error: err };
}

async function uid() {
  return (await identity()).id;
}

/* "Show project on Discover" (settings row set-public). Projects made before
   the row existed have no row and stay public. */
function isPublic(project) {
  const row = (project.settings || []).find((r) => r.id === 'set-public');
  return !row || row.on !== false;
}

/* What a volunteer needs to know about a position before applying. `m` is a
   one-line summary the listing screens already render. */
function positionRow(p) {
  const minAge = Number(p.minAge) || Number(String(p.age || '').replace(/\D/g, '')) || null;
  const age = p.age || (minAge ? `${minAge}+` : '');
  const commit = p.commit || '';
  const m = p.m || [age ? `Ages ${String(age).replace(/^ages\s*/i, '')}` : '', commit].filter(Boolean).join(', ');
  return {
    id: p.id,
    t: p.t,
    m,
    age,
    minAge,
    commit,
    note: p.note || '',
    slots: Number(p.slots) || null,
  };
}

function listingStatus(project) {
  if (project.archived) return 'paused';
  return isPublic(project) ? 'live' : 'unlisted';
}

/* A database that predates the 'unlisted' status rejects it (check constraint
   or enum). Hiding the project still has to take effect, so fall back to the
   old behavior and pause it. */
function rejectsUnlisted(row, error) {
  return row.status === 'unlisted' && !!error && ['23514', '22P02'].includes(error.code);
}

/* Shift statuses volunteers never see: a draft isn't published yet (the lead
   opens it from the Shifts tab), a cancelled shift is off. */
const UNPUBLISHED_SHIFT_STATUSES = new Set(['Draft', 'Cancelled']);

/** True when a shift is published: not a draft and not cancelled. */
export function isPublishedShift(x) {
  return !!x && !UNPUBLISHED_SHIFT_STATUSES.has(x.st);
}

/* The upcoming shifts a volunteer can pick from on the join page: published
   (not a draft, not cancelled), not over, soonest first, at most
   MAX_PUBLISHED_SHIFTS. A team project has none. Spots filled aren't
   published: a volunteer can't read other volunteers' sign-ups, so the
   organizer's side counts them. */
const MAX_PUBLISHED_SHIFTS = 20;
export function publishedShifts(project, now = new Date()) {
  if (project.orgType === 'team') return [];
  return (project.sessions || [])
    .filter((x) => x && x.id && x.d && isPublishedShift(x) && !isPastShift(x, now))
    .slice(0, MAX_PUBLISHED_SHIFTS)
    .map((x) => ({ id: String(x.id), d: String(x.d), t: String(x.t || ''), loc: String(x.loc || ''), cap: Number(x.cap) || null }));
}

/** A short fingerprint of publishedShifts, so the lead's workspace can tell
    when the published list is out of date. */
export function publishedShiftsKey(project, now = new Date()) {
  return publishedShifts(project, now).map((x) => `${x.id}|${x.d}|${x.t}|${x.loc}|${x.cap}`).join(';');
}

/* A database without the listings.shifts column rejects a write that names
   it (PostgREST PGRST204, or Postgres 42703). Publishing still has to work, so
   drop the field and remember not to send it again this page load. */
let shiftsColumnMissing = false;
function rejectsShifts(row, error) {
  if (!error || !('shifts' in row)) return false;
  const missing = ['PGRST204', '42703'].includes(error.code) && /shifts/.test(String(error.message || ''));
  if (missing) shiftsColumnMissing = true;
  return missing;
}
function withoutShifts(row) {
  return Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'shifts'));
}

function listingRow(project, ownerId) {
  return {
    owner_id: ownerId,
    name: project.name,
    cause: project.cause || null,
    site: project.site || null,
    location: project.location || project.site || null,
    mission: project.mission || null,
    bio: project.bio || null,
    cover: project.cover || null,
    website: project.website || null,
    is_student_led: project.orgClass !== 'official',
    org_class: project.orgClass === 'official' ? 'official' : 'student',
    events_hosted: Number(project.eventsHosted) || 0,
    approx_volunteers: Number(project.approxVolunteers) || 0,
    positions: (project.positions || []).map(positionRow),
    next_session: project.nextSession ? project.nextSession.label : null,
    shifts: publishedShifts(project),
    // Archived projects are paused: the join link stops working. A project
    // the lead took off Discover is unlisted: search and matching skip it,
    // but its join link still opens and members keep seeing it.
    status: listingStatus(project),
    org_type: project.orgType === 'team' ? 'team' : 'volunteering',
    delivery: ['in_person', 'remote', 'hybrid'].includes(project.delivery) ? project.delivery : 'in_person',
    pipeline: (project.pipeline || []).map((s) => ({
      id: s.id,
      label: s.label,
      kind: s.kind || 'check',
      required: s.required !== false,
      note: s.note || '',
      // details the volunteer needs to actually do the step
      link: s.link || '',
      when: s.when || '',
      due: s.due || '',
    })),
    task_roles: ((project.taskBoard && project.taskBoard.roles) || []).map((r) => ({ id: r.id, name: r.name, briefing: r.briefing || '', color: r.color || '#C2603C' })),
  };
}

/** Publish or update a project so volunteers can discover it. Returns the id. */
export async function publishListing(project) {
  if (!supabase) return null;
  const owner = await uid();
  if (!owner) return null;
  const full = listingRow(project, owner);
  const row = shiftsColumnMissing ? withoutShifts(full) : full;
  if (project.listingId) {
    const write = (r) => supabase
      .from('listings')
      .update(r)
      .eq('id', project.listingId)
      .eq('owner_id', owner)
      .select('id')
      .maybeSingle();
    let sent = row;
    let { data, error } = await write(sent);
    if (rejectsShifts(sent, error)) ({ data, error } = await write((sent = withoutShifts(sent))));
    if (rejectsUnlisted(sent, error)) ({ data, error } = await write({ ...sent, status: 'paused' }));
    // Callers report "Discover didn't update" on a throw, so a failed write
    // never reads as published.
    if (error) throw Object.assign(new Error("Couldn't update the listing."), { code: 'PUBLISH_FAILED', cause: error });
    return data ? data.id : project.listingId;
  }
  const insert = (r) => supabase.from('listings').insert(r).select('id').single();
  let sent = row;
  let { data, error } = await insert(sent);
  if (rejectsShifts(sent, error)) ({ data, error } = await insert((sent = withoutShifts(sent))));
  if (rejectsUnlisted(sent, error)) ({ data, error } = await insert({ ...sent, status: 'paused' }));
  if (error) return null;
  return data.id;
}

/** Live listings from OTHER founders, for the discovery feed. */
export async function loadDiscoverListings() {
  return searchListings();
}

/**
 * Owner submits their listing for verification. Owners may stamp the request and
 * note, but the DB guard prevents them from ever setting `verified`, only a
 * reviewer (service-role) can. Best-effort; the local project state is the
 * source of truth for the founder's own UI.
 */
export async function requestListingVerification(listingId, { name = '', contact = '' } = {}) {
  if (!supabase || !listingId) return false;
  const owner = await uid();
  if (!owner) return false;
  const note = [name, contact].filter((x) => x && x.trim()).join(', ').slice(0, 400) || null;
  const { error } = await supabase
    .from('listings')
    .update({ verification_requested_at: new Date().toISOString(), verification_note: note })
    .eq('id', listingId)
    .eq('owner_id', owner);
  return !error;
}

/**
 * Fetch the verified/requested state of the signed-in founder's own listings, so
 * their workspace can reflect a reviewer's decision. Returns a map of
 * listingId -> { verified, requestedAt }.
 */
export async function loadMyListingVerification() {
  if (!supabase) return {};
  const owner = await uid();
  if (!owner) return {};
  const { data, error } = await supabase
    .from('listings')
    .select('id, verified, verification_requested_at')
    .eq('owner_id', owner);
  if (error || !data) return {};
  const out = {};
  for (const r of data) out[r.id] = { verified: !!r.verified, requestedAt: r.verification_requested_at };
  return out;
}

/** How many rows one search page returns. */
export const SEARCH_PAGE_SIZE = 80;

/* A page window from caller input: whole numbers, at least 1 row, at most
   200 per request, never a negative offset. */
function pageWindow(limit, offset) {
  const size = Math.min(200, Math.max(1, Math.floor(Number(limit)) || SEARCH_PAGE_SIZE));
  const from = Math.max(0, Math.floor(Number(offset)) || 0);
  return { size, from, to: from + size - 1 };
}

/* The rows plus what the screen needs to describe them honestly: `total` is
   the exact match count from the database (null when it didn't send one), and
   `hasMore` says another page exists. */
function pageResult(data, count, from) {
  const rows = data || [];
  const total = Number.isFinite(count) ? count : null;
  const hasMore = total !== null ? from + rows.length < total : false;
  return { rows, total, hasMore, offset: from };
}

/**
 * Real, server-side search over live listings. Filtering happens in Postgres via
 * the Supabase (PostgREST) API, text across name/mission/bio/site/cause, plus
 * cause, org-class and place facets, so it scales past what one page holds.
 * The free-text term is sanitised so a user's punctuation can't break the
 * PostgREST filter grammar. Returns one page as { rows, total, hasMore, offset }.
 * `total` is the exact number of matches, so a screen can say "419
 * opportunities" while showing the first 80. Throws (code LOAD_FAILED) when
 * the query fails, so the screen can say so instead of showing an empty result.
 */
export async function searchListingsPage({ q = '', causes = [], kind = 'all', place = 'all', near = '', sort = 'recent', limit = SEARCH_PAGE_SIZE, offset = 0 } = {}) {
  if (!supabase) return pageResult([], 0, 0);
  const me = await uid();
  const { from, to } = pageWindow(limit, offset);

  let query = supabase.from('listings').select('*', { count: 'exact' }).eq('status', 'live');
  // Your own listings never show in your search. Filtering in the query keeps
  // the count and the pages in step with what's shown.
  if (me) query = query.neq('owner_id', me);

  if (kind === 'student' || kind === 'official') query = query.eq('org_class', kind);
  if (Array.isArray(causes) && causes.length) query = query.in('cause', causes);

  // Location: match the city/region against the listing's site. So a volunteer
  // in "Rivertown" finds projects whose site reads Rivertown.
  const loc = String(near || '').replace(/[,()%*\\]/g, ' ').trim();
  if (loc) query = query.or(`site.ilike.%${loc}%,location.ilike.%${loc}%`);

  // Online vs in-person, from the founder's explicit delivery choice. Hybrid
  // ("both") always qualifies for either filter, and a team project is remote
  // by nature. We keep the old site-text heuristic as a fallback for any legacy
  // row whose delivery was never set.
  if (place === 'online') query = query.or('delivery.eq.remote,delivery.eq.hybrid,org_type.eq.team,site.ilike.%remote%,site.ilike.%online%,site.ilike.%virtual%');
  else if (place === 'person') query = query.or('delivery.eq.in_person,delivery.eq.hybrid');

  const term = String(q || '').replace(/[,()%*\\]/g, ' ').trim();
  if (term) {
    const like = `%${term}%`;
    query = query.or(`name.ilike.${like},mission.ilike.${like},bio.ilike.${like},site.ilike.${like},cause.ilike.${like}`);
  }

  if (sort === 'established') query = query.order('events_hosted', { ascending: false });
  else query = query.order('created_at', { ascending: false });

  const { data, error, count } = await query.order('id', { ascending: true }).range(from, to);
  if (error) throw loadFailed('opportunities', error);
  return pageResult(data, count, from);
}

/**
 * The first page of searchListingsPage as a plain array, for screens that
 * list rows. The array also carries `total` and `hasMore`, so a count on
 * screen can use `rows.total` instead of `rows.length` (which is the page
 * size once more than one page matches).
 */
export async function searchListings(filters = {}) {
  const page = await searchListingsPage(filters);
  return Object.assign(page.rows.slice(), { total: page.total, hasMore: page.hasMore });
}

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getListing(id) {
  if (!supabase) return null;
  // Listing ids are UUIDs; skip the round-trip (and a 400) for a malformed link.
  if (!UUID_RX.test(String(id || ''))) return null;
  const { data } = await supabase.from('listings').select('*').eq('id', id).maybeSingle();
  return data || null;
}

/** Listings by id, for Saved. Malformed ids are skipped. Unlike getListing,
    a failed read throws LOAD_FAILED so the screen can show an outage instead
    of "nothing saved". RLS hides paused listings owned by someone else, so a
    missing id means it's no longer listed. Unlisted ones (off Discover, join
    link still open) come back with status 'unlisted'. */
export async function loadListingsByIds(ids = []) {
  if (!supabase) return [];
  const clean = [...new Set((ids || []).map(String).filter((id) => UUID_RX.test(id)))];
  if (!clean.length) return [];
  const { data, error } = await supabase.from('listings').select('*').in('id', clean);
  if (error) throw loadFailed('saved opportunities', error);
  return data || [];
}

/* ---- real nonprofits from the web (ProPublica, no AI) ------------------- */

const US_STATES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA',
  michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY',
};
const STATE_ABBRS = new Set(Object.values(US_STATES));
const CITY_STATE = {
  'san diego': 'CA', 'los angeles': 'CA', 'san francisco': 'CA', 'sacramento': 'CA',
  'new york': 'NY', 'brooklyn': 'NY', 'chicago': 'IL', 'houston': 'TX', 'austin': 'TX',
  'dallas': 'TX', 'san antonio': 'TX', 'seattle': 'WA', 'portland': 'OR', 'denver': 'CO',
  'boston': 'MA', 'atlanta': 'GA', 'miami': 'FL', 'orlando': 'FL', 'tampa': 'FL',
  'indianapolis': 'IN', 'evansville': 'IN', 'fort wayne': 'IN', 'columbus': 'OH',
  'cleveland': 'OH', 'cincinnati': 'OH', 'phoenix': 'AZ', 'philadelphia': 'PA',
  'pittsburgh': 'PA', 'detroit': 'MI', 'nashville': 'TN', 'memphis': 'TN',
  'charlotte': 'NC', 'raleigh': 'NC', 'minneapolis': 'MN', 'las vegas': 'NV',
  'washington': 'DC', 'baltimore': 'MD', 'milwaukee': 'WI', 'kansas city': 'MO',
  'st louis': 'MO', 'salt lake city': 'UT', 'new orleans': 'LA',
};

// US state by ZIP prefix (first 3 digits). Deterministic and complete -
// resolves any real US ZIP, including small towns no city list would carry.
// Ranges are [lowPrefix, highPrefix, state]; territories/military prefixes are
// intentionally omitted (they return '' → no state filter).
const ZIP3_STATE = [
  [10, 27, 'MA'], [28, 29, 'RI'], [30, 38, 'NH'], [39, 49, 'ME'], [50, 59, 'VT'],
  [60, 69, 'CT'], [70, 89, 'NJ'], [100, 149, 'NY'], [150, 196, 'PA'], [197, 199, 'DE'],
  [200, 205, 'DC'], [206, 219, 'MD'], [220, 246, 'VA'], [247, 269, 'WV'],
  [270, 289, 'NC'], [290, 299, 'SC'], [300, 319, 'GA'], [320, 349, 'FL'],
  [350, 369, 'AL'], [370, 385, 'TN'], [386, 397, 'MS'], [398, 399, 'GA'],
  [400, 427, 'KY'], [430, 459, 'OH'], [460, 479, 'IN'], [480, 499, 'MI'],
  [500, 528, 'IA'], [530, 549, 'WI'], [550, 567, 'MN'], [570, 577, 'SD'],
  [580, 588, 'ND'], [590, 599, 'MT'], [600, 629, 'IL'], [630, 658, 'MO'],
  [660, 679, 'KS'], [680, 693, 'NE'], [700, 714, 'LA'], [716, 729, 'AR'],
  [730, 749, 'OK'], [750, 799, 'TX'], [800, 816, 'CO'], [820, 831, 'WY'],
  [832, 838, 'ID'], [840, 847, 'UT'], [850, 865, 'AZ'], [870, 884, 'NM'],
  [889, 898, 'NV'], [900, 961, 'CA'], [967, 968, 'HI'], [970, 979, 'OR'],
  [980, 994, 'WA'], [995, 999, 'AK'],
];

/** US state (2-letter) from a 5-digit ZIP, or '' if it can't be resolved. */
export function stateFromZip(zip) {
  const m = String(zip || '').match(/\b(\d{5})\b/);
  if (!m) return '';
  const p = parseInt(m[1].slice(0, 3), 10);
  for (const [lo, hi, st] of ZIP3_STATE) if (p >= lo && p <= hi) return st;
  return '';
}

/** Best-effort US state (2-letter) from a free-text location or ZIP. */
export function parseState(loc) {
  const s = String(loc || '').toLowerCase().trim();
  if (!s) return '';
  const m = s.match(/\b([a-z]{2})\b\s*$/);
  if (m && STATE_ABBRS.has(m[1].toUpperCase())) return m[1].toUpperCase();
  for (const [name, ab] of Object.entries(US_STATES)) if (s.includes(name)) return ab;
  for (const [city, ab] of Object.entries(CITY_STATE)) if (s.includes(city)) return ab;
  const byZip = stateFromZip(s);
  if (byZip) return byZip;
  return '';
}

const CAUSE_KEYWORD = {
  'Food & hunger': 'food bank', 'Education': 'education', 'Homelessness': 'homeless shelter',
  'Environment': 'conservation', 'Animals': 'animal rescue', 'Civic': 'community',
  'Health': 'health', 'Seniors': 'senior', 'Arts': 'arts', 'Disaster relief': 'disaster relief',
};

/**
 * Search real registered nonprofits from the web (ProPublica / IRS data) by
 * keyword, cause and location. No AI, every result is a real org with an EIN.
 * The route answers { organizations, total, page, pages } on success (a 404
 * upstream is an empty 200) and a non-200 { error } when the search is down.
 * Returns [] on any failure so the landing search still shows opportunities;
 * pass `throwOnError` to tell "none found" apart from "search down".
 * (Discover's WebNonprofits calls /api/nonprofits itself for paging.)
 */
export async function searchWebNonprofits({ q = '', near = '', causes = [], throwOnError = false } = {}) {
  const terms = [];
  if (q && q.trim()) terms.push(q.trim());
  else if (Array.isArray(causes) && causes.length) terms.push(CAUSE_KEYWORD[causes[0]] || causes[0]);
  const query = terms.join(' ').trim();
  const state = parseState(near);
  if (!query && !state) return [];
  const params = new URLSearchParams();
  params.set('q', query || 'nonprofit');
  if (state) params.set('state', state);
  let res;
  try {
    res = await fetch(`/api/nonprofits?${params.toString()}`);
  } catch (error) {
    if (throwOnError) throw loadFailed('nonprofits', error);
    return [];
  }
  if (!res.ok) {
    if (throwOnError) throw loadFailed('nonprofits', { status: res.status });
    return [];
  }
  try {
    const data = await res.json();
    return Array.isArray(data && data.organizations) ? data.organizations : [];
  } catch (error) {
    if (throwOnError) throw loadFailed('nonprofits', error);
    return [];
  }
}

/** Apply to a listing. Throws with a human message on failure. */
export async function applyToListing(listing, { position, note, answers } = {}) {
  if (!supabase) throw Object.assign(new Error("Applications aren't open yet. Nothing was sent."), { code: 'NO_BACKEND' });
  const me = await uid();
  if (!me) throw Object.assign(new Error('Sign in to apply.'), { code: 'SIGNED_OUT' });
  const { data: prof } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', me)
    .maybeSingle();
  const name = `${(prof && prof.first_name) || ''} ${(prof && prof.last_name) || ''}`.trim() || 'A volunteer';
  const { error } = await supabase.from('applications').insert({
    listing_id: listing.id,
    owner_id: listing.owner_id,
    applicant_id: me,
    applicant_name: name,
    position: position || null,
    note: note || null,
    answers: answers || [],
    status: 'pending',
  });
  if (error) {
    if (error.code === '23505') throw Object.assign(new Error('You already applied to this one.'), { code: 'DUPLICATE' });
    console.warn('[apply]', error.message || error);
    throw Object.assign(new Error("Your application didn't send. Check your connection and try again."), { code: 'APPLY_FAILED', cause: error });
  }
  track('application_submitted', { listing: listing.name || '', cause: listing.cause || '', position: position || '', student_led: listing.is_student_led !== false });
}

/** Applications the signed-in volunteer has sent. Returns [] on a failed read
    unless `throwOnError` is set (the notifications feed needs to tell an
    outage apart from "nothing yet"). */
export async function loadMyApplications({ throwOnError = false } = {}) {
  if (!supabase) return [];
  const who = await identity();
  if (who.failed && throwOnError) throw loadFailed('your applications', who.error);
  const me = who.id;
  if (!me) return [];
  const { data, error } = await supabase
    .from('applications')
    .select('*, listings(name, cause, site, org_type, delivery, pipeline, task_roles, next_session, mission, announcements)')
    .eq('applicant_id', me)
    .order('created_at', { ascending: false });
  if (error && throwOnError) throw loadFailed('your applications', error);
  // One row per application id, even if a read ever returns a row twice.
  const seen = new Set();
  const rows = (data || []).filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  return rows.map(withListingSnapshot);
}

/* ---- the listing as the volunteer last saw it ----------------------------
   RLS hides a listing from everyone but its owner once it's archived (or, on
   a database without the 'unlisted' status, taken off Discover), so the
   embedded `listings` on an application comes back null.
   The volunteer's hours, ratings and notifications still belong to that
   project, so each application keeps a small copy of the listing in its
   member_state (applicant-written). When the live listing is hidden, the copy
   stands in for it, marked `unlisted`, with no next shift or announcements. */

const SNAPSHOT_KEYS = ['name', 'cause', 'site', 'org_type', 'delivery', 'mission', 'pipeline', 'task_roles'];

function listingSnapshot(l) {
  const out = {};
  for (const k of SNAPSHOT_KEYS) out[k] = l[k] === undefined ? null : l[k];
  return out;
}

const snapshotWrites = new Set();

function withListingSnapshot(app) {
  const ms = app.member_state || {};
  const saved = ms.listing && typeof ms.listing === 'object' ? ms.listing : null;
  if (app.listings) {
    const snap = listingSnapshot(app.listings);
    if ((!saved || JSON.stringify(listingSnapshot(saved)) !== JSON.stringify(snap)) && !snapshotWrites.has(app.id)) {
      snapshotWrites.add(app.id);
      updateMemberState(app.id, { listing: snap })
        .catch(() => { /* retried on the next read */ })
        .finally(() => snapshotWrites.delete(app.id));
    }
    return app;
  }
  if (!saved || !saved.name) return app;
  return {
    ...app,
    listings: { ...listingSnapshot(saved), next_session: null, announcements: [], unlisted: true },
  };
}

/** Post an announcement to a nonprofit's board (owner only). Newest first. */
export async function postAnnouncement(listingId, body) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const clean = (body || '').trim();
  if (!clean) return { ok: false };
  const { data: cur, error: readErr } = await supabase.from('listings').select('announcements').eq('id', listingId).maybeSingle();
  if (readErr) return { ok: false, error: readErr };
  const next = [{ id: `an-${Date.now().toString(36)}`, body: clean.slice(0, 1000), at: new Date().toISOString() }, ...((cur && cur.announcements) || [])].slice(0, 50);
  // .select() makes a 0-row update (not the owner, or the listing is gone)
  // come back empty, so it reports a failure instead of a silent success.
  const { data: rows, error } = await supabase.from('listings').update({ announcements: next }).eq('id', listingId).eq('owner_id', me).select('id');
  if (error) return { ok: false, error };
  if (!rows || rows.length === 0) return { ok: false, error: { message: 'No listing updated' } };
  return { ok: true, announcements: next, error: null };
}

/** Remove an announcement by id (owner only). */
export async function deleteAnnouncement(listingId, annId) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const { data: cur, error: readErr } = await supabase.from('listings').select('announcements').eq('id', listingId).maybeSingle();
  if (readErr) return { ok: false, error: readErr };
  const next = ((cur && cur.announcements) || []).filter((a) => a.id !== annId);
  // .select() makes a 0-row update (not the owner, or the listing is gone)
  // come back empty, so it reports a failure instead of a silent success.
  const { data: rows, error } = await supabase.from('listings').update({ announcements: next }).eq('id', listingId).eq('owner_id', me).select('id');
  if (error) return { ok: false, error };
  if (!rows || rows.length === 0) return { ok: false, error: { message: 'No listing updated' } };
  return { ok: true, announcements: next, error: null };
}

/* Words too generic to match on, dropped before cross-referencing interests. */
const MATCH_STOP = new Set([
  'the','and','for','with','want','wants','like','likes','help','helping','helped','some','that','this','have',
  'around','near','area','volunteer','volunteering','really','would','love','doing','things','thing','stuff',
  'get','can','out','all','any','who','are','not','but','make','making','more','their','them','they','also',
  'something','anything','looking','look','interested','interest','into','about','myself','people','person',
  'weekend','weekends','weekday','weekdays','hours','hour','week','time','times','online','person','remote',
]);

/* Common volunteer synonyms so "elderly" finds "seniors", "kids" finds
   "children/youth/students", etc. Each key expands to extra match terms. */
const SYNONYMS = {
  elderly: ['senior', 'elder'], senior: ['elderly', 'elder'], elder: ['senior', 'elderly'],
  kids: ['child', 'children', 'youth', 'student'], kid: ['child', 'children', 'youth', 'student'],
  children: ['kid', 'youth', 'student'], child: ['kid', 'children', 'youth', 'student'],
  youth: ['kid', 'child', 'teen', 'student'], teen: ['youth', 'teenager', 'student'], teenager: ['teen', 'youth'],
  food: ['hunger', 'meal', 'pantry', 'grocery'], hunger: ['food', 'meal', 'pantry'], meal: ['food', 'meal', 'kitchen'],
  reading: ['read', 'literacy', 'book'], read: ['reading', 'literacy'], tutor: ['tutoring', 'teach', 'mentor', 'homework'],
  tutoring: ['tutor', 'teach', 'mentor'], teach: ['teaching', 'tutor', 'mentor', 'lesson'], teaching: ['teach', 'tutor'],
  coding: ['code', 'programming', 'python', 'computer'], code: ['coding', 'programming'],
  animal: ['dog', 'cat', 'pet', 'shelter', 'wildlife'], animals: ['dog', 'cat', 'pet', 'shelter'], dog: ['animal', 'pet', 'shelter'],
  environment: ['environmental', 'conservation', 'nature', 'climate'], beach: ['ocean', 'coastal', 'shoreline', 'coast'],
  ocean: ['beach', 'coastal', 'marine'], garden: ['gardening', 'plant', 'grow'], trail: ['trails', 'park', 'hiking'],
  music: ['guitar', 'piano', 'instrument'], art: ['arts', 'painting', 'craft', 'drawing'], paint: ['painting', 'art', 'mural'],
  homeless: ['homelessness', 'shelter'], mental: ['wellness', 'counseling', 'crisis'], health: ['hospital', 'medical', 'clinic'],
  hospital: ['health', 'patient', 'medical'], voter: ['voting', 'election', 'civic'], voting: ['voter', 'election', 'civic'],
  disaster: ['relief', 'emergency', 'wildfire'], sports: ['basketball', 'coach', 'soccer', 'athletic'],
  basketball: ['sports', 'coach', 'athletic'], coach: ['coaching', 'sports', 'mentor'], library: ['book', 'reading'],
  blood: ['donor', 'donation'], math: ['mathematics', 'algebra', 'science'], english: ['esl', 'language', 'literacy'],
};

export function interestKeywords(text, max = 8) {
  return Array.from(new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !MATCH_STOP.has(w))
  )).slice(0, max);
}

/* Expand a keyword list with synonyms (capped so the OR filter stays sane). */
function expandKeywords(kws, max = 16) {
  const out = new Set(kws);
  for (const k of kws) for (const s of (SYNONYMS[k] || [])) out.add(s);
  return Array.from(out).slice(0, max);
}

/**
 * Match live listings to what a volunteer wrote about themselves, remote and
 * in-person alike, by cross-referencing keywords from their interest text (and
 * causes) against each listing's name/mission/bio/cause/site, server-side. Local
 * (in-person) results near their city are boosted, but remote openings are never
 * excluded. Returns the best matches, most-relevant first.
 */
export async function matchListings({ interest = '', causes = [], near = '', limit = 9 } = {}) {
  if (!supabase) return [];
  const me = await uid();
  const base = interestKeywords(interest);
  // Cause names are strong signals too, fold their words in.
  for (const c of (causes || [])) {
    for (const w of interestKeywords(c, 3)) if (!base.includes(w)) base.push(w);
  }
  const kws = expandKeywords(base);

  let query = supabase.from('listings').select('*').eq('status', 'live');
  if (kws.length) {
    const ors = [];
    for (const k of kws) {
      const like = `%${k}%`;
      ors.push(`name.ilike.${like}`, `mission.ilike.${like}`, `bio.ilike.${like}`, `cause.ilike.${like}`, `site.ilike.${like}`);
    }
    query = query.or(ors.join(','));
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit * 3);
  if (error) throw loadFailed('opportunities', error);
  const loc = String(near || '').toLowerCase().replace(/[,()%*\\]/g, ' ').trim();

  const score = (l) => {
    const hay = `${l.name || ''} ${l.mission || ''} ${l.bio || ''} ${l.cause || ''} ${l.site || ''}`.toLowerCase();
    let sc = kws.reduce((a, k) => a + (hay.includes(k) ? 1 : 0), 0);
    const isRemote = l.delivery === 'remote' || l.delivery === 'hybrid' || l.org_type === 'team' || /remote|online|virtual/i.test(l.site || '');
    if (loc && ((l.site || '').toLowerCase().includes(loc) || (l.location || '').toLowerCase().includes(loc))) sc += 2; // near in-person / hybrid
    if (isRemote) sc += 1; // remote is open to everyone, so always surface it
    return sc;
  };

  return (data || [])
    .filter((l) => l.owner_id !== me)
    .map((l) => ({ l, sc: score(l) }))
    .sort((a, b) => b.sc - a.sc)
    .slice(0, limit)
    .map((x) => x.l);
}

/** Read a listing's announcements (anyone, for members + the public join page). */
export async function loadAnnouncements(listingId) {
  if (!supabase || !listingId) return [];
  const { data } = await supabase.from('listings').select('announcements').eq('id', listingId).maybeSingle();
  return (data && data.announcements) || [];
}

/** The signed-in volunteer's accepted memberships, what they should do next. */
export async function loadMyMemberships() {
  // Throws on an outage, so hours never read as 0 because a request failed.
  const apps = await loadMyApplications({ throwOnError: true });
  // Accepted rows count even when the listing is hidden and no copy of it was
  // saved yet, since the hours on them are still the volunteer's.
  return apps
    .filter((a) => a.status === 'accepted')
    .map((a) => (a.listings ? a : { ...a, listings: { name: 'A project', cause: null, site: null, org_type: null, pipeline: [], task_roles: [], next_session: null, announcements: [], unlisted: true } }));
}

/* The owner's application rows on one listing with one of `statuses`. */
async function loadListingApps(listingId, me, statuses) {
  const { data } = await supabase
    .from('applications')
    .select('*')
    .eq('owner_id', me)
    .eq('listing_id', listingId)
    .in('status', statuses)
    .order('decided_at', { ascending: false });
  return data || [];
}

/** Accepted members who joined a founder's listing through the app (owner side).
    Confirmations saved by an older version (a bare `true`) are upgraded to
    snapshots first, see upgradeLegacyConfirmations. */
export async function loadProjectMembers(listingId) {
  if (!supabase || !listingId) return [];
  const me = await uid();
  if (!me) return [];
  return upgradeLegacyConfirmations(await loadListingApps(listingId, me, ['accepted']), me);
}

/** Owner writes the assignment (role + tasks) for one member. Merges keys. */
export async function setMemberAssignment(applicationId, patch) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const { data: cur, error: readErr } = await supabase.from('applications').select('assignment').eq('id', applicationId).maybeSingle();
  if (readErr) return { ok: false, error: readErr };
  const next = { ...((cur && cur.assignment) || {}), ...patch };
  const { error } = await supabase.from('applications').update({ assignment: next }).eq('id', applicationId).eq('owner_id', me);
  return { ok: !error, assignment: next, error };
}

/** Owner closed (archived) a project: stamp the assignment of each accepted
    member and each applicant still waiting with closedAt, so the volunteer
    can still see it happened after RLS hides the listing. Keeps an earlier
    stamp. Best-effort per row. */
export async function markProjectClosed(listingId, at = new Date().toISOString()) {
  if (!supabase || !listingId) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const members = await loadListingApps(listingId, me, ['accepted', 'pending']);
  const results = await Promise.all(
    members
      .filter((m) => !(m.assignment && m.assignment.closedAt))
      .map((m) => setMemberAssignment(m.id, { closedAt: at })),
  );
  const failed = results.filter((r) => !r.ok);
  if (failed.length) console.warn('[markProjectClosed]', `${failed.length} application rows not stamped`);
  return { ok: failed.length === 0, count: results.length };
}

/** Ratings organizers have given the signed-in volunteer, newest first.
    Each rating lives in the owner-written assignment on an application row, so it
    is tied to a real project and a real account. */
export async function loadMyRatings() {
  const apps = await loadMyApplications({ throwOnError: true });
  return apps
    .filter((a) => a.assignment && a.assignment.rating && a.assignment.rating.stars)
    .map((a) => ({
      ...a.assignment.rating,
      org: (a.listings && a.listings.name) || 'A project',
      cause: a.listings && a.listings.cause,
    }))
    .sort((x, y) => String(y.ratedAt || '').localeCompare(String(x.ratedAt || '')));
}

/* ---- verified-hours loop (member logs → org confirms → verified record) --- */

/** A member logs hours against a project they joined (writes member_state.hoursLog). */
export async function logMemberHours(applicationId, entry = {}) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  // Hours must be more than 0 and no more than 24. Out-of-range values are
  // refused, never clamped, so a typo can't turn into a different number.
  const hrs = Number(entry.hrs);
  if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 24) {
    return { ok: false, error: { code: 'INVALID_HOURS', message: 'Enter more than 0 hours, up to 24.' } };
  }
  const { data: cur, error: readErr } = await supabase.from('applications').select('member_state').eq('id', applicationId).maybeSingle();
  if (readErr) return { ok: false, error: readErr };
  const ms = (cur && cur.member_state) || {};
  const row = {
    id: `mh-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    date: (entry.date || '').trim() || 'Today',
    activity: (entry.activity || '').trim() || 'Volunteering',
    hrs: Math.round(hrs * 10) / 10,
  };
  const next = { ...ms, hoursLog: [row, ...((ms.hoursLog) || [])].slice(0, 100) };
  const { error } = await supabase.from('applications').update({ member_state: next }).eq('id', applicationId).eq('applicant_id', me);
  if (!error) track('member_hours_logged', { hrs: row.hrs });
  return { ok: !error, member_state: next, entry: row };
}

/* "Sat, Oct 24 at 9 AM" for a check-in error. */
function opensLabel(d) {
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const h = d.getHours();
  const m = d.getMinutes();
  const time = h === 0 && m === 0 ? '' : ` at ${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
  return `${day}${time}`;
}

/** A member checks in for a shift (writes member_state.checkins). Records the
    code they typed and a timestamp so the organizer sees who arrived.
    Check-in only opens on the shift's day (from 1 hour before the start), so
    nobody checks in to a shift a week away. The code can't be checked here:
    only the organizer's workspace holds it, so the organizer's side compares
    it (see checkInCodeMatches). */
export async function checkInMember(applicationId, { session = '', code = '', at = 'Today' } = {}, now = new Date()) {
  if (!supabase) return { ok: false };
  const win = checkInWindow(session, now);
  if (win.state === 'early') {
    return { ok: false, error: { code: 'NOT_STARTED', message: `Check-in opens ${opensLabel(win.opensAt)}.` } };
  }
  if (win.state === 'over') {
    return { ok: false, error: { code: 'ENDED', message: 'That shift is over. Log your hours instead.' } };
  }
  const me = await uid();
  if (!me) return { ok: false, error: { code: 'SIGNED_OUT', message: 'Sign in to check in.' } };
  const { data: cur, error: readErr } = await supabase.from('applications').select('member_state').eq('id', applicationId).maybeSingle();
  if (readErr) return { ok: false, error: readErr };
  const ms = (cur && cur.member_state) || {};
  const row = {
    id: `ci-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    session: String(session || '').slice(0, 60) || 'Next session',
    code: String(code || '').replace(/\D/g, '').slice(0, 8),
    at: String(at || 'Today').slice(0, 40),
    ts: now.toISOString(),
  };
  const next = { ...ms, checkins: [row, ...((ms.checkins) || [])].slice(0, 50) };
  const { error } = await supabase.from('applications').update({ member_state: next }).eq('id', applicationId).eq('applicant_id', me);
  if (!error) track('member_checked_in', { has_code: !!row.code });
  return { ok: !error, member_state: next, entry: row, error: error || null };
}

/** For the organizer: does a check-in's code match the project's code?
    true or false, or null when the volunteer didn't enter one. */
export function checkInCodeMatches(entry, projectCode) {
  const typed = String((entry && entry.code) || '').replace(/\D/g, '');
  if (!typed) return null;
  return typed === String(projectCode || '').replace(/\D/g, '');
}

/* ---- shift sign-ups ------------------------------------------------------
   A listing publishes its upcoming shifts (listings.shifts, see listingRow).
   A volunteer with an open application picks the ones they'll come to, which
   writes member_state.shifts on their own application row, so the organizer
   reads the sign-ups from the same row as hours and check-ins. Past shifts
   can't be picked or cancelled. */

const SIGNUP_STATUSES = ['pending', 'accepted'];

function shiftError(code, message) {
  return { ok: false, error: { code, message } };
}

/* Prefix of the id given to a shift read from listings.next_session. */
const NEXT_SHIFT_PREFIX = 'next:';

/* "Sat, Oct 24 at 1:00-4:00 PM" (also written with " · " or ", ") → { d, t }.
   null when there's no readable date. */
function splitNextSession(raw) {
  const text = String(raw || '').trim();
  if (!text || /not scheduled/i.test(text)) return null;
  const m = /^(.+?)\s*(?:\u00b7|\bat\b)\s*(.+)$/.exec(text)
    || /^([A-Za-z]{3},\s*[A-Za-z]{3}\s+\d{1,2}),\s*(.+)$/.exec(text);
  const d = (m ? m[1] : text).trim();
  const t = (m ? m[2] : '').trim();
  if (!/\b[A-Za-z]{3}\s+\d{1,2}\b/.test(d)) return null;
  return { d, t };
}

/* The shifts a listing offers. A listing published before listings.shifts
   existed (or whose owner hasn't opened the app since) has none stored, so
   its next shift (listings.next_session, which the same publish writes from
   the same shift list) stands in as the one shift volunteers can pick, with
   a stable id built from its date and time. */
function offeredShifts(listing) {
  const rows = Array.isArray(listing && listing.shifts) ? listing.shifts.filter((x) => x && x.id && x.d) : [];
  if (rows.length || !listing || listing.org_type === 'team') return rows;
  const next = splitNextSession(listing.next_session);
  if (!next) return [];
  return [{ id: `${NEXT_SHIFT_PREFIX}${next.d}|${next.t}`, d: next.d, t: next.t, loc: '', cap: null, fromNextSession: true }];
}

/** The listing's published shifts that haven't ended, soonest first. Falls
    back to the listing's next shift when no shift list was published. */
export function listingShifts(listing, now = new Date()) {
  return offeredShifts(listing).filter((x) => !isPastShift(x, now));
}

/* A next-shift id back into the sign-up shape signUpMatchesShift reads. */
function splitNextShiftId(id) {
  const [d, t = ''] = String(id).slice(NEXT_SHIFT_PREFIX.length).split('|');
  return { id: String(id), d, t };
}

/* Same day and time, ignoring how the time range is written. */
function sameShiftTime(a, b) {
  const ra = parseTimeRange(a);
  const rb = parseTimeRange(b);
  if (ra && rb) return ra.start === rb.start && ra.end === rb.end;
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}
function sameShiftDay(a, b) {
  const md = (v) => {
    const m = /([A-Za-z]{3})\s+(\d{1,2})/.exec(String(v || ''));
    return m ? `${m[1].toLowerCase()} ${Number(m[2])}` : String(v || '').trim().toLowerCase();
  };
  return md(a) === md(b);
}

/** True when a volunteer's sign-up is for `shift` (a session or published
    shift, or just its id). A sign-up taken from the listing's next shift
    (before a shift list was published) matches the shift on the same day
    at the same time. */
export function signUpMatchesShift(signUp, shift) {
  if (!signUp || !shift) return false;
  const id = typeof shift === 'object' ? shift.id : shift;
  if (id != null && String(signUp.id) === String(id)) return true;
  if (typeof shift !== 'object' || !String(signUp.id || '').startsWith(NEXT_SHIFT_PREFIX)) return false;
  return sameShiftDay(signUp.d, shift.d) && sameShiftTime(signUp.t, shift.t);
}

/** The shifts this application is signed up for, each with `past` set once
    the shift has ended (a past sign-up can't be cancelled). */
export function myShiftSignUps(app, now = new Date()) {
  const rows = (app && app.member_state && Array.isArray(app.member_state.shifts)) ? app.member_state.shifts : [];
  return rows.filter((x) => x && x.id).map((x) => ({ ...x, past: isPastShift(x, now) }));
}

/** For the organizer: how many members are signed up for one shift. Pass
    the shift itself (not just its id) so sign-ups taken from the listing's
    next shift are counted too (see signUpMatchesShift). */
export function shiftSignUpCount(members, shift) {
  return (members || []).filter((m) => myShiftSignUps(m).some((x) => signUpMatchesShift(x, shift))).length;
}

/* A failed read of the sign-up row. A database without listings.shifts can't
   offer shift sign-ups at all, which is different from a dropped connection. */
function signUpReadError(error) {
  console.warn('[shift sign-up]', error && (error.message || error.code));
  if (error && ['PGRST204', '42703', 'PGRST200'].includes(error.code)) {
    return shiftError('UNAVAILABLE', "Shift sign-ups aren't available for this opportunity yet.");
  }
  return shiftError('LOAD_FAILED', "We couldn't load this shift. Check your connection and try again.");
}

/* Read the volunteer's own application with its listing's shifts. */
async function readSignUpRow(applicationId, me) {
  return supabase
    .from('applications')
    .select('id, status, member_state, listings(shifts, next_session, org_type)')
    .eq('id', applicationId)
    .eq('applicant_id', me)
    .maybeSingle();
}

/**
 * Sign the signed-in volunteer up for one upcoming shift of the listing they
 * applied to. Checks the shift against the listing as stored now, so a
 * cancelled, finished or unknown shift is refused. Returns { ok, shift,
 * member_state } or { ok: false, error: { code, message } }.
 */
export async function signUpForShift(applicationId, shiftId, now = new Date()) {
  if (!supabase) return shiftError('NO_BACKEND', "Sign-ups aren't working right now. Try again in a few minutes.");
  const me = await uid();
  if (!me) return shiftError('SIGNED_OUT', 'Sign in to sign up for a shift.');
  const { data: app, error: readErr } = await readSignUpRow(applicationId, me);
  if (readErr) return signUpReadError(readErr);
  if (!app) return shiftError('NOT_FOUND', 'Apply to this opportunity before you sign up for a shift.');
  if (!SIGNUP_STATUSES.includes(app.status)) return shiftError('CLOSED', 'Apply again before you sign up for a shift.');
  const offered = offeredShifts(app.listings);
  // A pick made from the listing's next shift still lands on that shift
  // after the owner publishes the full list.
  const shift = offered.find((x) => x.id === shiftId)
    || (String(shiftId || '').startsWith(NEXT_SHIFT_PREFIX) ? offered.find((x) => signUpMatchesShift(splitNextShiftId(shiftId), x)) : null);
  if (!shift) return shiftError('GONE', "That shift isn't listed anymore. Choose another one.");
  if (isPastShift(shift, now)) return shiftError('PAST', 'That shift already happened. Choose an upcoming one.');
  const ms = app.member_state || {};
  const mine = Array.isArray(ms.shifts) ? ms.shifts : [];
  const already = mine.find((x) => x && signUpMatchesShift(x, shift));
  if (already) return { ok: true, shift: already, member_state: ms };
  const entry = { id: shift.id, d: shift.d, t: shift.t || '', at: now.toISOString() };
  const next = { ...ms, shifts: [...mine, entry].slice(-50) };
  const { error } = await supabase.from('applications').update({ member_state: next }).eq('id', applicationId).eq('applicant_id', me);
  if (error) return shiftError('SAVE_FAILED', "Your sign-up didn't save. Check your connection and try again.");
  track('shift_signed_up', {});
  return { ok: true, shift: entry, member_state: next };
}

/** Cancel one of the volunteer's shift sign-ups while the shift is still
    ahead. Same return shape as signUpForShift. */
export async function cancelShiftSignUp(applicationId, shiftId, now = new Date()) {
  if (!supabase) return shiftError('NO_BACKEND', "Sign-ups aren't working right now. Try again in a few minutes.");
  const me = await uid();
  if (!me) return shiftError('SIGNED_OUT', 'Sign in to change your sign-ups.');
  const { data: app, error: readErr } = await readSignUpRow(applicationId, me);
  if (readErr) return signUpReadError(readErr);
  if (!app) return shiftError('NOT_FOUND', "You aren't signed up for that shift.");
  const ms = app.member_state || {};
  const mine = Array.isArray(ms.shifts) ? ms.shifts : [];
  const entry = mine.find((x) => x && x.id === shiftId);
  if (!entry) return { ok: true, member_state: ms };
  if (isPastShift(entry, now)) return shiftError('PAST', "That shift already happened, so it can't be cancelled.");
  const next = { ...ms, shifts: mine.filter((x) => !(x && x.id === shiftId)) };
  const { error } = await supabase.from('applications').update({ member_state: next }).eq('id', applicationId).eq('applicant_id', me);
  if (error) return shiftError('SAVE_FAILED', "Your sign-up wasn't cancelled. Check your connection and try again.");
  track('shift_signup_cancelled', {});
  return { ok: true, member_state: next };
}

/** A member removes one of their own logged-hours rows. */
export async function removeMemberHours(applicationId, hourId) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const { data: cur, error: readErr } = await supabase.from('applications').select('member_state').eq('id', applicationId).maybeSingle();
  if (readErr) return { ok: false, error: readErr };
  const ms = (cur && cur.member_state) || {};
  const next = { ...ms, hoursLog: ((ms.hoursLog) || []).filter((h) => h.id !== hourId) };
  const { error } = await supabase.from('applications').update({ member_state: next }).eq('id', applicationId).eq('applicant_id', me);
  return { ok: !error, member_state: next };
}

/* ---- confirmed hours ------------------------------------------------------
   The member writes their hours log (member_state, applicant-written). When
   the lead confirms an entry, the approved value is copied into the
   owner-written assignment: confirmedHours[hourId] = { hrs, date, activity,
   confirmedAt }. Every total reads the hours from that copy, so editing the
   log after a confirmation can't change what was confirmed. Rows written by
   an older version hold a bare `true`; they read the log until the lead's
   next load upgrades them (upgradeLegacyConfirmations). */

const validHrs = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 24 ? Math.round(n * 10) / 10 : null;
};

/** The lead's confirmation of one logged-hours entry on `app`, as
    { hrs, date, activity, confirmedAt, legacy }, or null when it isn't
    confirmed. `hrs` comes from the saved snapshot, never from the log, except
    for a legacy `true` not upgraded yet. */
export function confirmedValue(app, h) {
  const map = app && app.assignment && app.assignment.confirmedHours;
  const id = h && h.id;
  if (!map || typeof map !== 'object' || !id) return null;
  const c = map[id];
  if (c === true) {
    const hrs = validHrs(h.hrs);
    return hrs == null ? null : { hrs, date: h.date || '', activity: h.activity || '', confirmedAt: null, legacy: true };
  }
  if (!c || typeof c !== 'object') return null;
  const hrs = validHrs(c.hrs);
  if (hrs == null) return null;
  return { hrs, date: c.date || h.date || '', activity: c.activity || h.activity || '', confirmedAt: c.confirmedAt || null, legacy: false };
}

/** Every logged-hours entry on one membership, newest first, with the
    confirmed value applied: { ...entry, hrs, confirmed, loggedHrs }. A
    confirmed entry the member later removed from their log still counts
    (removed: true), since the lead approved it. */
export function memberHourEntries(app) {
  const log = (app && app.member_state && Array.isArray(app.member_state.hoursLog)) ? app.member_state.hoursLog : [];
  const out = [];
  const seen = new Set();
  for (const h of log) {
    if (!h || !h.id || seen.has(h.id)) continue;
    seen.add(h.id);
    const c = confirmedValue(app, h);
    const loggedHrs = Number(h.hrs) || 0;
    out.push(c
      ? { ...h, hrs: c.hrs, date: c.date, activity: c.activity, confirmed: true, confirmedAt: c.confirmedAt, loggedHrs }
      : { ...h, hrs: loggedHrs, confirmed: false, loggedHrs });
  }
  const map = (app && app.assignment && app.assignment.confirmedHours) || {};
  for (const [id, c] of Object.entries(typeof map === 'object' ? map : {})) {
    if (seen.has(id) || !c || typeof c !== 'object') continue;
    const hrs = validHrs(c.hrs);
    if (hrs == null) continue;
    out.push({ id, hrs, date: c.date || '', activity: c.activity || 'Volunteering', confirmed: true, confirmedAt: c.confirmedAt || null, loggedHrs: 0, removed: true });
  }
  return out;
}

/** Confirmed and waiting hour totals for one membership's own log (not the
    shifts the lead posted in Attendance). */
export function memberHourTotals(app) {
  let confirmed = 0;
  let waiting = 0;
  for (const h of memberHourEntries(app)) {
    if (h.confirmed) confirmed += h.hrs; else waiting += h.hrs;
  }
  return { confirmed: Math.round(confirmed * 10) / 10, waiting: Math.round(waiting * 10) / 10 };
}

/* The snapshot saved for a confirmation. */
function confirmationSnapshot(entry, at) {
  return {
    hrs: validHrs(entry.hrs),
    date: String(entry.date || '').slice(0, 40),
    activity: String(entry.activity || '').slice(0, 120),
    confirmedAt: at,
  };
}

/**
 * The founder confirms (or un-confirms) one of a member's logged hours.
 * `hourEntry` is the log entry the lead is looking at ({ id, hrs, date,
 * activity }); its values are what gets saved in assignment.confirmedHours, so
 * the lead approves exactly what they saw. A bare hour id still works and
 * takes the values from the member's log as it is now. Refuses an entry that
 * isn't in the member's log anymore, or one whose hours are out of range.
 */
export async function confirmMemberHour(applicationId, hourEntry, confirmed) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const hourId = hourEntry && typeof hourEntry === 'object' ? hourEntry.id : hourEntry;
  if (!hourId) return { ok: false, error: { code: 'NOT_FOUND', message: "Those hours aren't on this volunteer's log anymore." } };
  const { data: cur, error: readErr } = await supabase.from('applications').select('assignment, member_state').eq('id', applicationId).maybeSingle();
  if (readErr) return { ok: false, error: readErr };
  if (!cur) return { ok: false, error: { code: 'NOT_FOUND', message: "We couldn't find this volunteer's application. Reload and try again." } };
  const a = cur.assignment || {};
  const confirmedHours = { ...(a.confirmedHours || {}) };
  if (confirmed) {
    const log = (cur.member_state && Array.isArray(cur.member_state.hoursLog)) ? cur.member_state.hoursLog : [];
    const logged = log.find((h) => h && h.id === hourId);
    if (!logged) return { ok: false, error: { code: 'NOT_FOUND', message: "Those hours aren't on this volunteer's log anymore. Reload to see the latest." } };
    const source = hourEntry && typeof hourEntry === 'object' ? { ...logged, ...hourEntry } : logged;
    const snap = confirmationSnapshot(source, new Date().toISOString());
    if (snap.hrs == null) return { ok: false, error: { code: 'INVALID_HOURS', message: 'Only entries of more than 0 hours, up to 24, can be confirmed.' } };
    confirmedHours[hourId] = snap;
  } else {
    delete confirmedHours[hourId];
  }
  const next = { ...a, confirmedHours };
  const { error } = await supabase.from('applications').update({ assignment: next }).eq('id', applicationId).eq('owner_id', me);
  if (!error) track('member_hours_confirmed', { confirmed: !!confirmed });
  return { ok: !error, assignment: next, error: error || null };
}

const legacyUpgrades = new Map();

/* Rewrite one row's legacy `true` confirmations as snapshots, from a fresh
   read so nothing written since the list loaded is lost. A legacy flag whose
   log entry is gone (or out of range) is dropped. Resolves to the new
   assignment, or null when nothing was written. */
async function upgradeRow(applicationId, me) {
  const { data: cur, error: readErr } = await supabase.from('applications').select('assignment, member_state').eq('id', applicationId).eq('owner_id', me).maybeSingle();
  if (readErr || !cur) return null;
  const a = cur.assignment || {};
  const map = a.confirmedHours && typeof a.confirmedHours === 'object' ? a.confirmedHours : {};
  if (!Object.values(map).some((v) => v === true)) return null;
  const log = (cur.member_state && Array.isArray(cur.member_state.hoursLog)) ? cur.member_state.hoursLog : [];
  const at = new Date().toISOString();
  const confirmedHours = {};
  for (const [id, v] of Object.entries(map)) {
    if (v !== true) { confirmedHours[id] = v; continue; }
    const logged = log.find((h) => h && h.id === id);
    const snap = logged ? confirmationSnapshot(logged, at) : null;
    if (snap && snap.hrs != null) confirmedHours[id] = snap;
  }
  const next = { ...a, confirmedHours };
  const { error } = await supabase.from('applications').update({ assignment: next }).eq('id', applicationId).eq('owner_id', me);
  if (error) {
    console.warn('[confirmed hours] upgrade failed', error.message || error.code);
    return null;
  }
  return next;
}

/** Owner side: upgrade every legacy `true` confirmation on these rows to a
    snapshot of the hours as logged now, and return the rows with the new
    assignments. Rows that fail keep their old value and are retried on the
    next load. */
export async function upgradeLegacyConfirmations(rows, me) {
  const list = rows || [];
  if (!supabase || !me) return list;
  const hasLegacy = (r) => r && r.owner_id === me && r.assignment && r.assignment.confirmedHours
    && typeof r.assignment.confirmedHours === 'object' && Object.values(r.assignment.confirmedHours).some((v) => v === true);
  if (!list.some(hasLegacy)) return list;
  return Promise.all(list.map(async (r) => {
    if (!hasLegacy(r)) return r;
    if (!legacyUpgrades.has(r.id)) {
      legacyUpgrades.set(r.id, upgradeRow(r.id, me).finally(() => legacyUpgrades.delete(r.id)));
    }
    const next = await legacyUpgrades.get(r.id);
    return next ? { ...r, assignment: next } : r;
  }));
}

/** The signed-in volunteer's hours across every project they joined, split into
    org-verified vs still-pending. This is the real verified-hours total. */
export async function loadMyServiceHours() {
  const apps = await loadMyMemberships();
  const out = { verified: 0, pending: 0, entries: [] };
  for (const app of apps) {
    for (const h of memberHourEntries(app)) {
      const isVerified = h.confirmed;
      const hrs = h.hrs;
      if (isVerified) out.verified += hrs; else out.pending += hrs;
      // `id` is unique across projects (hour ids are only unique within one
      // application); `hourId` is the id inside that application's log.
      out.entries.push({ ...h, id: `${app.id}:${h.id}`, hourId: h.id, hrs, verified: isVerified, org: (app.listings && app.listings.name) || 'A project', applicationId: app.id });
    }
    // Shifts the lead posted in Attendance (owner-written half of the row).
    // The lead posted them, so they count as confirmed, same as
    // Profile.summarizeService and the lead's member totals.
    const posted = Array.isArray(app.assignment && app.assignment.attendanceHours) ? app.assignment.attendanceHours.filter((h) => h && h.id) : [];
    for (const h of posted) {
      const hrs = Number(h.hrs) || 0;
      if (hrs <= 0) continue;
      out.verified += hrs;
      out.entries.push({ ...h, id: `${app.id}:${h.id}`, hourId: h.id, activity: h.activity || 'Shift', hrs, verified: true, source: 'attendance', org: (app.listings && app.listings.name) || 'A project', applicationId: app.id });
    }
  }
  out.verified = Math.round(out.verified * 10) / 10;
  out.pending = Math.round(out.pending * 10) / 10;
  out.entries.sort((a, b) => Number(b.verified) - Number(a.verified));
  return out;
}

/* Workspace id of the signed-in lead's project published as `listingId`, so a
   notification can link straight into /lead/<projectId>/messages. */
function projectIdForListing(listingId) {
  const p = ((getState() || {}).projects || []).find((x) => x.listingId && x.listingId === listingId);
  return p ? p.id : null;
}

/** Newest unread message per thread addressed to the signed-in user, keyed by
    application id. Throws LOAD_FAILED on a failed read. */
async function loadUnreadMessagesByThread(me) {
  const { data: msgs, error } = await supabase
    .from('messages')
    .select('id, application_id, sender_id, body, created_at')
    .eq('recipient_id', me)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw loadFailed('messages', error);
  const newest = new Map();
  for (const m of msgs || []) if (m.application_id && !newest.has(m.application_id)) newest.set(m.application_id, m);
  return newest;
}

/** Unread messages volunteers sent to the signed-in lead, one notification per
    thread (the newest message). Throws LOAD_FAILED on a failed read. */
async function loadOwnerMessageNotifications(me, newest) {
  if (!newest.size) return [];
  const { data: apps, error: appErr } = await supabase
    .from('applications')
    .select('id, listing_id, applicant_id, applicant_name, listings(name)')
    .eq('owner_id', me)
    .in('id', [...newest.keys()]);
  if (appErr) throw loadFailed('messages', appErr);
  const out = [];
  for (const a of apps || []) {
    const m = newest.get(a.id);
    // Only threads on the lead's own listings, from the volunteer.
    if (!m || m.sender_id !== a.applicant_id) continue;
    const who = (a.applicant_name || '').trim() || 'A volunteer';
    const project = a.listings && a.listings.name;
    const pid = projectIdForListing(a.listing_id);
    out.push({
      id: `msg-${a.id}`,
      type: 'message',
      title: project ? `${who} messaged you about ${project}` : `${who} messaged you`,
      body: String(m.body || '').slice(0, 280),
      at: m.created_at,
      href: pid ? `/lead/${encodeURIComponent(pid)}/messages?thread=app-${a.id}` : '/lead',
    });
  }
  return out;
}

/** Unread replies the organizer sent to the signed-in volunteer, one
    notification per application thread (the newest message). Throws
    LOAD_FAILED on a failed read. */
async function loadVolunteerReplyNotifications(me, newest) {
  if (!newest.size) return [];
  const { data: apps, error: appErr } = await supabase
    .from('applications')
    .select('id, owner_id, applicant_id, listings(name)')
    .eq('applicant_id', me)
    .in('id', [...newest.keys()]);
  if (appErr) throw loadFailed('messages', appErr);
  const out = [];
  for (const a of apps || []) {
    const m = newest.get(a.id);
    // Only the organizer's side of the volunteer's own application thread.
    if (!m || a.applicant_id !== me || !a.owner_id || m.sender_id !== a.owner_id) continue;
    const project = (a.listings && a.listings.name) || 'A project';
    out.push({
      id: `reply-${a.id}`,
      type: 'message',
      title: `${project} replied`,
      body: String(m.body || '').slice(0, 280),
      at: m.created_at,
      href: '/app',
    });
  }
  return out;
}

/** Threads volunteers started with one of the lead's listings (applications
    with at least one message), newest first, with the lead's unread count per
    thread. Reads only; MessageThread marks messages read when it opens one.
    Throws LOAD_FAILED on a failed read. */
export async function loadListingThreads(listingId) {
  if (!supabase || !listingId) return [];
  const who = await identity();
  if (who.failed) throw loadFailed('messages', who.error);
  const me = who.id;
  if (!me) return [];
  const { data: apps, error: appErr } = await supabase
    .from('applications')
    .select('id, applicant_id, applicant_name, status')
    .eq('owner_id', me)
    .eq('listing_id', listingId);
  if (appErr) throw loadFailed('messages', appErr);
  const ids = (apps || []).map((a) => a.id);
  if (!ids.length) return [];
  const { data: msgs, error } = await supabase
    .from('messages')
    .select('application_id, recipient_id, body, created_at, read_at')
    .in('application_id', ids)
    .order('created_at', { ascending: false });
  if (error) throw loadFailed('messages', error);
  const byApp = new Map();
  for (const m of msgs || []) {
    const cur = byApp.get(m.application_id) || { last: m, unread: 0 };
    byApp.set(m.application_id, { last: cur.last, unread: cur.unread + (m.recipient_id === me && !m.read_at ? 1 : 0) });
  }
  return (apps || [])
    .filter((a) => byApp.has(a.id))
    .map((a) => {
      const t = byApp.get(a.id);
      return { id: `app-${a.id}`, app: a, last: t.last, fromThem: t.last.recipient_id === me, unread: t.unread };
    })
    .sort((x, y) => String(y.last.created_at || '').localeCompare(String(x.last.created_at || '')));
}

/**
 * The signed-in user's real notifications, derived from cross-user data:
 * application decisions, ratings from organizers, and announcements from orgs
 * they've joined, unread replies from organizers, plus, for a lead, unread
 * messages from volunteers. Newest
 * first. No separate table, computed from live rows. Throws (code LOAD_FAILED)
 * when a read fails, so the screen can show its error state instead of
 * "Nothing yet".
 */
export async function loadMyNotifications() {
  const apps = await loadMyApplications({ throwOnError: true });
  const out = [];
  const me = supabase ? await uid() : null;
  if (me) {
    const newest = await loadUnreadMessagesByThread(me);
    const [asOwner, asVolunteer] = await Promise.all([
      loadOwnerMessageNotifications(me, newest),
      loadVolunteerReplyNotifications(me, newest),
    ]);
    out.push(...asOwner, ...asVolunteer);
  }
  for (const a of apps) {
    const name = (a.listings && a.listings.name) || 'A project';
    if (a.status === 'accepted' && a.decided_at) {
      out.push({ id: `acc-${a.id}`, type: 'accepted', title: `${name} accepted you`, body: 'See what to do before your first shift on Home.', at: a.decided_at, href: '/app' });
    }
    if (a.status === 'declined' && a.decided_at) {
      out.push({ id: `dec-${a.id}`, type: 'declined', title: `${name} passed on your application`, body: 'Other opportunities are open on Discover.', at: a.decided_at, href: '/discover' });
    }
    if (a.status === 'accepted' && a.assignment && a.assignment.closedAt) {
      out.push({ id: `closed-${a.id}`, type: 'closed', title: `${name} closed this project`, body: 'Your hours there stay on your profile.', at: a.assignment.closedAt, href: '/crew' });
    }
    const r = a.assignment && a.assignment.rating;
    if (r && r.stars && r.ratedAt) {
      out.push({ id: `rate-${a.id}`, type: 'rating', title: `${name} rated you ${r.stars} out of 5`, body: r.note || 'See it on your profile.', at: r.ratedAt, href: '/profile' });
    }
    if (a.status === 'accepted') {
      for (const an of ((a.listings && a.listings.announcements) || [])) {
        if (an.at) out.push({ id: `ann-${a.id}-${an.id}`, type: 'announcement', title: `Update from ${name}`, body: an.body, at: an.at, href: '/app' });
      }
    }
  }
  out.sort((x, y) => String(y.at || '').localeCompare(String(x.at || '')));
  return out.slice(0, 40);
}

/** Member marks one of their assigned tasks (writes member_state.tasks). */
export async function setMyTaskStatus(applicationId, taskId, status) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const { data: cur, error: readErr } = await supabase.from('applications').select('member_state').eq('id', applicationId).maybeSingle();
  if (readErr) return { ok: false, error: readErr };
  const ms = (cur && cur.member_state) || {};
  const next = { ...ms, tasks: { ...(ms.tasks || {}), [taskId]: status } };
  const { error } = await supabase.from('applications').update({ member_state: next }).eq('id', applicationId).eq('applicant_id', me);
  return { ok: !error, member_state: next, error };
}

/** Save the member's own progress (pipeline ticks, briefing ack, task checklist). */
export async function updateMemberState(applicationId, patch) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  // Read-merge-write so concurrent keys don't clobber each other.
  const { data: cur, error: readErr } = await supabase.from('applications').select('member_state').eq('id', applicationId).maybeSingle();
  if (readErr) return { ok: false, error: readErr };
  const next = { ...((cur && cur.member_state) || {}), ...patch };
  const { error } = await supabase
    .from('applications')
    .update({ member_state: next })
    .eq('id', applicationId)
    .eq('applicant_id', me);
  return { ok: !error, member_state: next, error };
}

/** Applications sent to the signed-in founder's listings. */
/** Applications to the signed-in owner's listings, newest first. With
    `throwOnError` a failed read throws (code LOAD_FAILED) so the screen can
    show its error state instead of "No applications waiting". */
export async function loadOwnerApplications({ throwOnError = false } = {}) {
  if (!supabase) return [];
  const who = await identity();
  if (who.failed && throwOnError) throw loadFailed('applications', who.error);
  const me = who.id;
  if (!me) return [];
  const { data, error } = await supabase
    .from('applications')
    .select('*, listings(name)')
    .eq('owner_id', me)
    .order('created_at', { ascending: false });
  if (error && throwOnError) throw loadFailed('applications', error);
  // Hour confirmations saved as a bare `true` become snapshots on this load.
  return upgradeLegacyConfirmations(data || [], me);
}

/** Accept or decline an application (founder), or withdraw (applicant). */
export async function setApplicationStatus(appId, status) {
  if (!supabase) return { ok: false };
  const { error } = await supabase
    .from('applications')
    .update({ status, decided_at: new Date().toISOString() })
    .eq('id', appId);
  return { ok: !error, error };
}

/* ---- messaging (tied to an application thread) -------------------------- */

/** One thread's messages, oldest first. Throws (code LOAD_FAILED) when the
    read fails, so the thread keeps what's on screen or shows its error state
    instead of "No messages yet". */
export async function loadMessages(applicationId) {
  if (!supabase) return [];
  const who = await identity();
  if (who.failed) throw loadFailed('messages', who.error);
  const me = who.id;
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true });
  if (error) throw loadFailed('messages', error);
  // Mark the ones sent to me as read. A failed mark is retried on the next poll.
  const unread = (data || []).filter((m) => m.recipient_id === me && !m.read_at).map((m) => m.id);
  if (unread.length) {
    try {
      await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unread);
    } catch { /* next poll tries again */ }
  }
  return data || [];
}

export async function sendMessage(applicationId, recipientId, body) {
  if (!supabase) throw Object.assign(new Error("Messages aren't working right now. Nothing was sent."), { code: 'NO_BACKEND' });
  const me = await uid();
  if (!me) throw Object.assign(new Error('Sign in to send a message.'), { code: 'SIGNED_OUT' });
  const clean = (body || '').trim();
  if (!clean) return;
  const { error } = await supabase.from('messages').insert({
    application_id: applicationId,
    sender_id: me,
    recipient_id: recipientId,
    body: clean.slice(0, 2000),
  });
  if (error) {
    console.warn('[message]', error.message || error);
    throw Object.assign(new Error("Your message didn't send. Check your connection and try again."), { code: 'SEND_FAILED', cause: error });
  }
}

/** The signed-in user's id (for deciding which side of a thread they are). */
export async function myId() {
  return uid();
}

/* ---- volunteer directory ------------------------------------------------- */

/** Publish/refresh the signed-in volunteer's public directory card. */
export async function publishVolunteerProfile(profile = {}) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const row = {
    user_id: me,
    name: (profile.name || '').trim(),
    city: profile.city || null,
    causes: Array.isArray(profile.causes) ? profile.causes : [],
    bio: profile.bio || null,
    skills: profile.skills || null,
    grade: profile.grade != null && profile.grade !== '' ? String(profile.grade) : null,
    verified_hours: Number(profile.verified_hours) || 0,
    listed: profile.listed !== false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('volunteer_directory').upsert(row, { onConflict: 'user_id' });
  return { ok: !error, error };
}

/** Remove the signed-in volunteer from the directory (privacy opt-out). */
export async function unlistVolunteerProfile() {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const { error } = await supabase.from('volunteer_directory').update({ listed: false, updated_at: new Date().toISOString() }).eq('user_id', me);
  return { ok: !error };
}

/**
 * Search the volunteer directory server-side: free text over name/bio/skills,
 * plus cause (array overlap) and city facets. Returns one page of everyone
 * listed except the searcher, most-experienced first, as
 * { rows, total, hasMore, offset }. `total` is the exact match count.
 */
export async function searchVolunteersPage({ q = '', causes = [], near = '', limit = SEARCH_PAGE_SIZE, offset = 0 } = {}) {
  if (!supabase) return pageResult([], 0, 0);
  const me = await uid();
  const { from, to } = pageWindow(limit, offset);
  let query = supabase.from('volunteer_directory').select('*', { count: 'exact' }).eq('listed', true);
  // Leave the searcher out in the query, so the count matches what's shown.
  if (me) query = query.neq('user_id', me);

  if (Array.isArray(causes) && causes.length) query = query.overlaps('causes', causes);

  const loc = String(near || '').replace(/[,()%*\\]/g, ' ').trim();
  if (loc) query = query.ilike('city', `%${loc}%`);

  const term = String(q || '').replace(/[,()%*\\]/g, ' ').trim();
  if (term) {
    const like = `%${term}%`;
    query = query.or(`name.ilike.${like},bio.ilike.${like},skills.ilike.${like}`);
  }

  const { data, error, count } = await query
    .order('verified_hours', { ascending: false })
    .order('user_id', { ascending: true })
    .range(from, to);
  if (error) throw loadFailed('volunteers', error);
  return pageResult(data, count, from);
}

/** The first page of searchVolunteersPage as an array that also carries
    `total` and `hasMore` (see searchListings). */
export async function searchVolunteers(filters = {}) {
  const page = await searchVolunteersPage(filters);
  return Object.assign(page.rows.slice(), { total: page.total, hasMore: page.hasMore });
}
