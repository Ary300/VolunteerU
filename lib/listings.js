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

async function uid() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ? data.user.id : null;
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
    positions: (project.positions || []).map((p) => ({ id: p.id, t: p.t, m: p.m })),
    next_session: project.nextSession ? project.nextSession.label : null,
    status: project.archived ? 'paused' : 'live',
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
  const row = listingRow(project, owner);
  if (project.listingId) {
    const { data } = await supabase
      .from('listings')
      .update(row)
      .eq('id', project.listingId)
      .eq('owner_id', owner)
      .select('id')
      .maybeSingle();
    return data ? data.id : project.listingId;
  }
  const { data, error } = await supabase.from('listings').insert(row).select('id').single();
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
  const note = [name, contact].filter((x) => x && x.trim()).join(' · ').slice(0, 400) || null;
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

/**
 * Real, server-side search over live listings. Filtering happens in Postgres via
 * the Supabase (PostgREST) API, text across name/mission/bio/site/cause, plus
 * cause, org-class and place facets, so it scales past what one page holds.
 * The free-text term is sanitised so a user's punctuation can't break the
 * PostgREST filter grammar.
 */
export async function searchListings({ q = '', causes = [], kind = 'all', place = 'all', near = '', sort = 'recent' } = {}) {
  if (!supabase) return [];
  const me = await uid();

  let query = supabase.from('listings').select('*').eq('status', 'live');

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

  const { data, error } = await query.limit(80);
  if (error) return [];
  return (data || []).filter((l) => l.owner_id !== me);
}

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getListing(id) {
  if (!supabase) return null;
  // Listing ids are UUIDs; skip the round-trip (and a 400) for a malformed link.
  if (!UUID_RX.test(String(id || ''))) return null;
  const { data } = await supabase.from('listings').select('*').eq('id', id).maybeSingle();
  return data || null;
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
 * Returns [] on any failure so the caller can degrade gracefully.
 */
export async function searchWebNonprofits({ q = '', near = '', causes = [] } = {}) {
  const terms = [];
  if (q && q.trim()) terms.push(q.trim());
  else if (Array.isArray(causes) && causes.length) terms.push(CAUSE_KEYWORD[causes[0]] || causes[0]);
  const query = terms.join(' ').trim();
  const state = parseState(near);
  if (!query && !state) return [];
  const params = new URLSearchParams();
  params.set('q', query || 'nonprofit');
  if (state) params.set('state', state);
  try {
    const res = await fetch(`/api/nonprofits?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.organizations || [];
  } catch {
    return [];
  }
}

/** Apply to a listing. Throws with a human message on failure. */
export async function applyToListing(listing, { position, note, answers } = {}) {
  if (!supabase) throw new Error('The backend is not configured.');
  const me = await uid();
  if (!me) throw new Error('Sign in to apply.');
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
    if (error.code === '23505') throw new Error('You have already applied to this project.');
    throw new Error(error.message || 'We could not send your application.');
  }
  track('application_submitted', { listing: listing.name || '', cause: listing.cause || '', position: position || '', student_led: listing.is_student_led !== false });
}

/** Applications the signed-in volunteer has sent. */
export async function loadMyApplications() {
  if (!supabase) return [];
  const me = await uid();
  if (!me) return [];
  const { data } = await supabase
    .from('applications')
    .select('*, listings(name, cause, site, org_type, pipeline, task_roles, next_session, mission, announcements)')
    .eq('applicant_id', me)
    .order('created_at', { ascending: false });
  return data || [];
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
  const { error } = await supabase.from('listings').update({ announcements: next }).eq('id', listingId).eq('owner_id', me);
  return { ok: !error, announcements: next, error };
}

/** Remove an announcement by id (owner only). */
export async function deleteAnnouncement(listingId, annId) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const { data: cur, error: readErr } = await supabase.from('listings').select('announcements').eq('id', listingId).maybeSingle();
  if (readErr) return { ok: false, error: readErr };
  const next = ((cur && cur.announcements) || []).filter((a) => a.id !== annId);
  const { error } = await supabase.from('listings').update({ announcements: next }).eq('id', listingId).eq('owner_id', me);
  return { ok: !error, announcements: next, error };
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
  if (error) return [];
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
  const apps = await loadMyApplications();
  return apps.filter((a) => a.status === 'accepted' && a.listings);
}

/** Accepted members who joined a founder's listing through the app (owner side). */
export async function loadProjectMembers(listingId) {
  if (!supabase || !listingId) return [];
  const me = await uid();
  if (!me) return [];
  const { data } = await supabase
    .from('applications')
    .select('*')
    .eq('owner_id', me)
    .eq('listing_id', listingId)
    .eq('status', 'accepted')
    .order('decided_at', { ascending: false });
  return data || [];
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

/** Ratings organizers have given the signed-in volunteer, newest first.
    Each rating lives in the owner-written assignment on an application row, so it
    is tied to a real project and a real account. */
export async function loadMyRatings() {
  const apps = await loadMyApplications();
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
  const { data: cur, error: readErr } = await supabase.from('applications').select('member_state').eq('id', applicationId).maybeSingle();
  if (readErr) return { ok: false, error: readErr };
  const ms = (cur && cur.member_state) || {};
  const row = {
    id: `mh-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    date: (entry.date || '').trim() || 'Today',
    activity: (entry.activity || '').trim() || 'Volunteering',
    hrs: Math.max(0, Math.min(24, Number(entry.hrs) || 0)),
  };
  const next = { ...ms, hoursLog: [row, ...((ms.hoursLog) || [])].slice(0, 100) };
  const { error } = await supabase.from('applications').update({ member_state: next }).eq('id', applicationId).eq('applicant_id', me);
  if (!error) track('member_hours_logged', { hrs: row.hrs });
  return { ok: !error, member_state: next, entry: row };
}

/** A member checks in for a session (writes member_state.checkins). Records the
    code they were given and a timestamp so the organizer sees who arrived. The
    code is not verified here, the organizer confirms attendance on their side. */
export async function checkInMember(applicationId, { session = '', code = '', at = 'Today' } = {}) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const { data: cur, error: readErr } = await supabase.from('applications').select('member_state').eq('id', applicationId).maybeSingle();
  if (readErr) return { ok: false, error: readErr };
  const ms = (cur && cur.member_state) || {};
  const row = {
    id: `ci-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    session: String(session || '').slice(0, 60) || 'Next session',
    code: String(code || '').replace(/\D/g, '').slice(0, 8),
    at: String(at || 'Today').slice(0, 40),
  };
  const next = { ...ms, checkins: [row, ...((ms.checkins) || [])].slice(0, 50) };
  const { error } = await supabase.from('applications').update({ member_state: next }).eq('id', applicationId).eq('applicant_id', me);
  if (!error) track('member_checked_in', { has_code: !!row.code });
  return { ok: !error, member_state: next, entry: row };
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

/** The founder confirms (or un-confirms) one of a member's logged hours (writes
    assignment.confirmedHours). Confirmed hours count on the member's record. */
export async function confirmMemberHour(applicationId, hourId, confirmed) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const { data: cur, error: readErr } = await supabase.from('applications').select('assignment').eq('id', applicationId).maybeSingle();
  if (readErr) return { ok: false, error: readErr };
  const a = (cur && cur.assignment) || {};
  const confirmedHours = { ...(a.confirmedHours || {}) };
  if (confirmed) confirmedHours[hourId] = true; else delete confirmedHours[hourId];
  const next = { ...a, confirmedHours };
  const { error } = await supabase.from('applications').update({ assignment: next }).eq('id', applicationId).eq('owner_id', me);
  if (!error) track('member_hours_confirmed', { confirmed: !!confirmed });
  return { ok: !error, assignment: next };
}

/** The signed-in volunteer's hours across every project they joined, split into
    org-verified vs still-pending. This is the real verified-hours total. */
export async function loadMyServiceHours() {
  const apps = await loadMyMemberships();
  const out = { verified: 0, pending: 0, entries: [] };
  for (const app of apps) {
    const log = (app.member_state && app.member_state.hoursLog) || [];
    const confirmed = (app.assignment && app.assignment.confirmedHours) || {};
    for (const h of log) {
      const isVerified = !!confirmed[h.id];
      const hrs = Number(h.hrs) || 0;
      if (isVerified) out.verified += hrs; else out.pending += hrs;
      out.entries.push({ ...h, hrs, verified: isVerified, org: (app.listings && app.listings.name) || 'A project', applicationId: app.id });
    }
  }
  out.verified = Math.round(out.verified * 10) / 10;
  out.pending = Math.round(out.pending * 10) / 10;
  out.entries.sort((a, b) => Number(b.verified) - Number(a.verified));
  return out;
}

/**
 * The signed-in volunteer's real notifications, derived from cross-user data:
 * application decisions, ratings from organizers, and announcements from orgs
 * they've joined. Newest first. No separate table, computed from live rows.
 */
export async function loadMyNotifications() {
  const apps = await loadMyApplications();
  const out = [];
  for (const a of apps) {
    const name = (a.listings && a.listings.name) || 'a project';
    if (a.status === 'accepted' && a.decided_at) {
      out.push({ id: `acc-${a.id}`, type: 'accepted', title: `You're in at ${name}`, body: 'Your application was accepted, open your home to see what comes next.', at: a.decided_at, href: '/app' });
    }
    if (a.status === 'declined' && a.decided_at) {
      out.push({ id: `dec-${a.id}`, type: 'declined', title: `${name} isn't moving forward`, body: 'Not this time, there are plenty more to find.', at: a.decided_at, href: '/discover' });
    }
    const r = a.assignment && a.assignment.rating;
    if (r && r.stars && r.ratedAt) {
      out.push({ id: `rate-${a.id}`, type: 'rating', title: `${name} rated you ${r.stars}★`, body: r.note || 'A new rating landed on your record.', at: r.ratedAt, href: '/profile' });
    }
    if (a.status === 'accepted') {
      for (const an of ((a.listings && a.listings.announcements) || [])) {
        if (an.at) out.push({ id: `ann-${an.id}`, type: 'announcement', title: `Update from ${name}`, body: an.body, at: an.at, href: '/app' });
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
export async function loadOwnerApplications() {
  if (!supabase) return [];
  const me = await uid();
  if (!me) return [];
  const { data } = await supabase
    .from('applications')
    .select('*, listings(name)')
    .eq('owner_id', me)
    .order('created_at', { ascending: false });
  return data || [];
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

export async function loadMessages(applicationId) {
  if (!supabase) return [];
  const me = await uid();
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true });
  // Mark the ones sent to me as read.
  const unread = (data || []).filter((m) => m.recipient_id === me && !m.read_at).map((m) => m.id);
  if (unread.length) {
    await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unread);
  }
  return data || [];
}

export async function sendMessage(applicationId, recipientId, body) {
  if (!supabase) throw new Error('The backend is not configured.');
  const me = await uid();
  if (!me) throw new Error('Sign in to send a message.');
  const clean = (body || '').trim();
  if (!clean) return;
  const { error } = await supabase.from('messages').insert({
    application_id: applicationId,
    sender_id: me,
    recipient_id: recipientId,
    body: clean.slice(0, 2000),
  });
  if (error) throw new Error(error.message || 'We could not send that.');
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
 * plus cause (array overlap) and city facets. Returns everyone listed except the
 * searcher, most-experienced first.
 */
export async function searchVolunteers({ q = '', causes = [], near = '' } = {}) {
  if (!supabase) return [];
  const me = await uid();
  let query = supabase.from('volunteer_directory').select('*').eq('listed', true);

  if (Array.isArray(causes) && causes.length) query = query.overlaps('causes', causes);

  const loc = String(near || '').replace(/[,()%*\\]/g, ' ').trim();
  if (loc) query = query.ilike('city', `%${loc}%`);

  const term = String(q || '').replace(/[,()%*\\]/g, ' ').trim();
  if (term) {
    const like = `%${term}%`;
    query = query.or(`name.ilike.${like},bio.ilike.${like},skills.ilike.${like}`);
  }

  const { data, error } = await query.order('verified_hours', { ascending: false }).limit(80);
  if (error) return [];
  return (data || []).filter((v) => v.user_id !== me);
}
