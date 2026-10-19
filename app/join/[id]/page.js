import { cache } from 'react';
import JoinListing from '../../../components/screens/JoinListing.jsx';
import { resolveCover } from '../../../lib/photos.js';
import { supabaseUrl, supabaseAnonKey } from '../../../lib/supabaseConfig.js';

/* /join/<id>, the page a shared listing link opens.
   The server reads the live listing once with the anon key (the same rows a
   signed-out visitor can read) so the link unfurls with its own title, org,
   date and cover in a group chat, and the page arrives with its header
   already drawn. JoinListing then loads the listing, the visitor's session
   and their application in the browser and takes over. */

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN_STATUSES = ['live', 'unlisted'];
const FETCH_TIMEOUT_MS = 2500;
const SITE_TZ = 'America/Indiana/Indianapolis';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DESCRIPTION_MAX = 200;

/* The listing row, or null when it is missing, closed or the read failed.
   A failed read only costs the preview: the browser loads the page anyway. */
const readListing = cache(async (id) => {
  const base = supabaseUrl;
  const key = supabaseAnonKey;
  if (!base || !key || !UUID_RX.test(String(id || ''))) return null;
  const url = `${base.replace(/\/+$/, '')}/rest/v1/listings?id=eq.${encodeURIComponent(id)}&select=*&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[join] listing preview read failed with ${res.status}`);
      return null;
    }
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    return row && typeof row === 'object' && OPEN_STATUSES.includes(row.status) ? row : null;
  } catch (err) {
    console.error('[join] listing preview read failed', err && err.name === 'TimeoutError' ? 'timed out' : err);
    return null;
  }
});

const text = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/* Today in Indianapolis as [year, month, day], so the server's own zone (UTC on
   the host) doesn't decide whether a shift has passed. */
function todayParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: SITE_TZ, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now);
  const get = (t) => Number((parts.find((p) => p.type === t) || {}).value);
  return [get('year'), get('month') - 1, get('day')];
}

/* "Sat, Oct 24" (or "Sat, Oct 24 at 1:00-4:00 PM") as a day number on the
   year nearest today, the rule the app's session labels use. */
function dayValue(label, today) {
  const m = /([A-Z][a-z]{2})\s+(\d{1,2})/.exec(String(label || ''));
  const mo = m ? MONTHS.indexOf(m[1]) : -1;
  if (mo < 0) return null;
  const day = Number(m[2]);
  const ref = Date.UTC(today[0], today[1], today[2]);
  let best = null;
  for (const y of [today[0] - 1, today[0], today[0] + 1]) {
    const t = Date.UTC(y, mo, day);
    if (best === null || Math.abs(t - ref) < Math.abs(best - ref)) best = t;
  }
  return best;
}

/* The date of the next shift that hasn't passed, as its label ("Sat, Oct 24"). */
function nextDateLabel(listing, now = new Date()) {
  if (!listing || listing.org_type === 'team') return '';
  const today = todayParts(now);
  const ref = Date.UTC(today[0], today[1], today[2]);
  const shifts = Array.isArray(listing.shifts) ? listing.shifts.filter((x) => x && x.d).map((x) => String(x.d)) : [];
  const labels = shifts.length ? shifts : [String(listing.next_session || '').split(/\s+at\s+|\s*·\s*/)[0]];
  const upcoming = labels
    .map((d) => ({ d: d.trim(), v: dayValue(d, today) }))
    .filter((x) => x.d && x.v !== null && x.v >= ref)
    .sort((a, b) => a.v - b.v);
  return upcoming.length ? upcoming[0].d : '';
}

/* Who runs it, the way the page header names them: the first part of an
   organization's site, or "Student project". */
function orgName(listing) {
  if (listing.org_class !== 'official') return 'Student project';
  const site = text(listing.site || listing.location);
  const first = site.split(',')[0].trim();
  return first && !/^(remote|online|virtual)\b/i.test(first) ? first : '';
}

const arr = (v, max = 100) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').slice(0, max) : []);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const coord = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/* The public fields the listing page draws, so a signed-out visitor gets the
   whole page from the server instead of a header and a placeholder (no
   shift when the browser's own read lands). Never the whole row: no owner
   id, no review notes. `full` tells JoinListing it can draw from this. */
function previewOf(listing) {
  if (!listing) return null;
  return {
    full: true,
    positions: arr(listing.positions),
    pipeline: arr(listing.pipeline),
    task_roles: arr(listing.task_roles),
    shifts: arr(listing.shifts, 200),
    announcements: arr(listing.announcements, 50),
    next_session: text(listing.next_session, 200),
    events_hosted: num(listing.events_hosted),
    approx_volunteers: num(listing.approx_volunteers),
    website: text(listing.website, 500),
    signup_url: text(listing.signup_url, 500),
    signup_only: listing.signup_only === true,
    nonprofit_ein: /^\d{9}$/.test(String(listing.nonprofit_ein || '')) ? String(listing.nonprofit_ein) : '',
    delivery: ['in_person', 'remote', 'hybrid'].includes(listing.delivery) ? listing.delivery : 'in_person',
    location: text(listing.location),
    lat: coord(listing.lat),
    lng: coord(listing.lng),
    id: String(listing.id),
    name: text(listing.name, 200),
    status: listing.status,
    org_class: listing.org_class === 'official' ? 'official' : 'student',
    org_type: listing.org_type === 'team' ? 'team' : 'volunteering',
    verified: listing.verified === true,
    cause: text(listing.cause, 80),
    site: text(listing.site || listing.location),
    cover: text(listing.cover || listing.photo || listing.img, 4096),
    mission: text(listing.mission, 1000),
    bio: text(listing.bio, 2000),
    nextDate: nextDateLabel(listing),
  };
}

export async function generateMetadata({ params, searchParams }) {
  const { id } = await params;
  const sp = (await searchParams) || {};
  if (sp.old === '1') return { title: 'Link out of date · VolunteerU', robots: { index: false } };
  const listing = await readListing(id);
  if (!listing || !text(listing.name)) return { title: 'Opportunity · VolunteerU', robots: { index: false } };

  const name = text(listing.name, 200);
  const org = orgName(listing);
  const when = nextDateLabel(listing);
  const description = [org, when ? `Next shift ${when}` : '', text(listing.mission)]
    .filter(Boolean)
    .join(' · ')
    .slice(0, DESCRIPTION_MAX);
  const cover = resolveCover(listing.cover || listing.photo || listing.img);
  // Link previews fetch the image themselves, so an inline data: cover can't be one.
  const image = cover && !cover.src.startsWith('data:') ? cover.src : '';
  const path = `/join/${listing.id}`;

  return {
    title: `${name} · VolunteerU`,
    description,
    alternates: { canonical: path },
    // Unlisted listings are off Discover on purpose; keep them out of search too.
    robots: listing.status === 'unlisted' ? { index: false } : undefined,
    openGraph: {
      title: name,
      description,
      type: 'website',
      url: path,
      siteName: 'VolunteerU',
      images: image ? [{ url: image, alt: name }] : ['/icon.png'],
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: name,
      description,
      images: image ? [image] : ['/icon.png'],
    },
  };
}

export default async function Page({ params, searchParams }) {
  const { id } = await params;
  const sp = (await searchParams) || {};
  // ?old=1 marks a redirect from a retired /opportunity, /apply or /projects link.
  const outdated = sp.old === '1';
  const preview = outdated ? null : previewOf(await readListing(id));
  return <JoinListing id={id} outdated={outdated} preview={preview} />;
}
