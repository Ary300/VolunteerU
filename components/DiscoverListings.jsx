'use client';

/* ==========================================================================
   DiscoverListings.jsx, live opportunities posted on VolunteerU
   Organizations and student projects publish listings; volunteers apply from
   here and the application lands with whoever posted it. Search and filters
   run server-side (lib/listings.js). Shows a count from the query, an empty
   state that offers a way out, and an error state with a retry.

   A listing with its own photo or an upcoming date is a photo-first card with
   no card chrome (the shared .vu-card classes): the photo, or a DateTile that
   prints the date. A listing with neither has nothing worth a picture-sized
   block, so it's a plain row in a list under the cards. In Newest order the
   cards come first. The title is a real link to /join/<id>; a plain click
   opens the details dialog instead, where the volunteer picks a role, applies
   or messages, and a modified click (new tab) follows the link. A `when`
   window (today, week, weekend, month) is matched against each listing's
   upcoming shifts, so with one set every page is loaded first and the count
   is the number that actually falls in the window. Saved-only loads the saved
   listings by id and applies the same filters to them.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { S } from '../lib/style.js';
import { C, F, R } from '../lib/tokens.js';
import { searchListingsPage, matchListings, applyToListing, loadMyApplications, listingShifts, loadListingsByIds, myId, nearTerm } from '../lib/listings.js';
import { shiftDates, inferYear, startOfDay } from '../lib/calendar.js';
import { usePhotoPicker, resolveCover } from '../lib/photos.js';
import { toggleSaved } from '../lib/db.js';
import { useSnapshot } from '../lib/store.js';
import { safeUrl } from './MemberProjects.jsx';
import { toast, openModal } from '../lib/overlays.js';
import Link from 'next/link';
import { Icon, Button, StatusText } from './ui.jsx';
import DateTile from './vu/DateTile.jsx';
import DateBlock from './vu/DateBlock.jsx';
import { whenParts, fmtWhen, Sep } from './vu/ListingCard.jsx';
import { causeOf } from '../lib/tokens.js';
import MessageThread from './MessageThread.jsx';

/* One status vocabulary everywhere on Discover ("Apply" becomes "Applied"). */
export const STATUS = { pending: 'Applied', accepted: 'Accepted', declined: 'Not accepted', withdrawn: 'Withdrawn' };

/* ---- dates ------------------------------------------------------------------ */

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const DAY_MS = 86400000;

/** Start of a shift's day, or null when its date can't be read. */
function shiftDay(sh, now) {
  const dts = shiftDates(sh, undefined, now);
  if (dts) return startOfDay(dts.start);
  const m = String(sh.d || '').match(/([A-Za-z]{3})\s+(\d{1,2})/);
  if (!m || MONTHS[m[1]] === undefined) return null;
  return new Date(inferYear(MONTHS[m[1]], Number(m[2]), now), MONTHS[m[1]], Number(m[2]));
}

/** When a shift starts: its start time, or the start of its day when the
    label has no readable time. `timed` says which. Null without a date. */
function shiftStart(sh, now) {
  const dts = shiftDates(sh, undefined, now);
  if (dts) return { at: dts.start, timed: true };
  const day = shiftDay(sh, now);
  return day ? { at: day, timed: false } : null;
}

/**
 * [from, to) for a When value, or null for any day. "This week" is the same
 * rule Home uses for its "this week" headings: anything starting from today
 * until 7 x 24 hours from now, so next Saturday morning still counts on a
 * Saturday evening.
 */
export function whenWindow(when, now = new Date()) {
  const today = startOfDay(now);
  const plus = (d, n) => new Date(d.getTime() + n * DAY_MS);
  if (when === 'today') return [today, plus(today, 1)];
  if (when === 'week') return [today, new Date(now.getTime() + 7 * DAY_MS + 1)];
  if (when === 'weekend') {
    const wd = today.getDay();
    if (wd === 6) return [today, plus(today, 2)];
    if (wd === 0) return [today, plus(today, 1)];
    const sat = plus(today, 6 - wd);
    return [sat, plus(sat, 2)];
  }
  if (when === 'month') return [today, new Date(today.getFullYear(), today.getMonth() + 1, 1)];
  return null;
}

/* Free-time windows a volunteer picks in onboarding and Settings
   (WINDOWS in lib/seed.js). After school starts at 2:30 PM and evenings at
   5 PM. School breaks are weekday daytime shifts, the ones a student can only
   make when school is out. A shift with no readable time fits by its day. */
const AFTER_SCHOOL = 14 * 60 + 30;
const EVENING = 17 * 60;
const NOON = 12 * 60;

function fitsFreeTime(start, w) {
  const wd = start.at.getDay();
  const weekday = wd >= 1 && wd <= 5;
  const min = start.timed ? start.at.getHours() * 60 + start.at.getMinutes() : null;
  const from = (a) => min === null || min >= a;
  const before = (b) => min === null || min < b;
  switch (w) {
    case 'Weekday after school': return weekday && from(AFTER_SCHOOL) && before(EVENING);
    case 'Weekday evenings': return weekday && from(EVENING);
    case 'Saturday morning': return wd === 6 && before(NOON);
    case 'Saturday afternoon': return wd === 6 && from(NOON);
    case 'Sunday': return wd === 0;
    case 'School breaks': return weekday && before(AFTER_SCHOOL);
    default: return false;
  }
}

/**
 * True when one of the listing's upcoming shifts falls inside the When window
 * and, with free-time windows given, fits at least one of them.
 */
export function inWindow(listing, when, now = new Date(), windows = []) {
  const win = whenWindow(when, now);
  const free = windows || [];
  if (!win && !free.length) return true;
  return listingShifts(listing, now).some((sh) => {
    const start = shiftStart(sh, now);
    if (!start) return false;
    if (win && !(start.at >= win[0] && start.at < win[1])) return false;
    return !free.length || free.some((w) => fitsFreeTime(start, w));
  });
}

const MATCH_POOL = 60;
const MATCH_SHOWN = 9;

/* The match block's grid. From 720px a grid of cards turns into a two-column
   list when photos are few (globals.css, the .vu-grid :has() rules): no photo
   at all, under 2 photos in 3 or 4 cards, under 3 in 5 or more. Otherwise a
   3-column grid has 3 columns from 1180px and 2 below. */
function matchCols(cards, photos, wide) {
  const n = cards.length;
  const withPhoto = cards.filter((l) => photos.get(l.id)).length;
  if (!withPhoto || (n >= 5 && withPhoto < 3) || (n >= 3 && n < 5 && withPhoto < 2)) return 2;
  return wide ? 3 : 2;
}

/**
 * How many of the match cards fill whole rows. Collapsed, the first of
 * `prefer` that does (3 or 4 on wide screens, 2 or 4 below); expanded, the
 * most that do. Falls back to `fallback` cards when no count fills a row.
 */
function fitRows(cards, photos, wide, prefer, fallback) {
  const fits = (n) => n > 0 && n <= cards.length && n % matchCols(cards.slice(0, n), photos, wide) === 0;
  const pick = prefer.find(fits);
  return pick || Math.min(fallback, cards.length);
}

function useMedia(query) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);
  return on;
}

const useWide = () => useMedia('(min-width: 1180px)');

/**
 * True when a grid of these cards reads as a list of rows (globals.css, the
 * .vu-grid / .vu-hscroll :has() rules): no photo at all, under 3 photos in 5
 * or more cards, or under 2 photos in 3 or 4. A photo-less card in such a
 * grid, or on a phone outside a sideways scroller, is a row led by a
 * DateBlock, the same date glyph every other dated row in the app uses. The
 * big DateTile is only for a photo-sized frame.
 */
function rowsGrid(cards, photos) {
  const n = cards.length;
  const withPhoto = cards.filter((l) => photos.get(l.id)).length;
  return n > 0 && (withPhoto === 0 || (n >= 5 && withPhoto < 3) || (n >= 3 && n < 5 && withPhoto < 2));
}

/* ---- listing facts ------------------------------------------------------------ */

// Organizations report their own counts; a student project's counts come from its lead.
function isOfficial(listing) {
  return (listing.org_class || 'student') === 'official';
}

function reportedBy(listing) {
  return isOfficial(listing) ? 'per the organization' : 'per the lead';
}

/** The place a card names: "Cedarbrook Food Pantry" from
    "Cedarbrook Food Pantry, 210 Elm St, Cedarbrook". A short site stays whole. */
function placeName(site) {
  const parts = String(site || '').split(',').map((x) => x.trim()).filter(Boolean);
  return parts.length >= 3 ? parts[0] : parts.join(', ');
}

/**
 * What a card, a pin and the map popup show about a listing. Every value is
 * from the row. `when` is the next shift as a stored label ("Sat, Oct 24 ·
 * 9:00 AM-12:00 PM") for the map pieces to parse; `whenLabel` is the house
 * format ("Sat, Oct 24 · 9 AM to 12 PM · 2 more dates"), '' without a date.
 */
export function cardFacts(listing, now = new Date()) {
  const shifts = listingShifts(listing, now);
  const next = shifts[0] || null;
  const moreDates = Math.max(0, shifts.length - 1);
  const when = next ? [String(next.d || '').trim(), String(next.t || '').trim()].filter(Boolean).join(' · ') : '';
  const whenLabel = next ? fmtWhen({ date: next.d, time: next.t, moreDates }) : '';
  const online = listing.delivery === 'remote' || listing.org_type === 'team';
  return { next, when, whenLabel, moreDates, place: placeName(listing.site || listing.location), online };
}

function applyErrorMessage(e) {
  console.error('[discover] apply failed', e);
  // lib/listings.js throws plain-language messages for these cases.
  if (e && ['DUPLICATE', 'SIGNED_OUT', 'NO_BACKEND', 'APPLY_FAILED'].includes(e.code)) return e.message;
  return "Your application didn't send. Check your connection and try again.";
}

/* Save in the details dialog, pressed while the listing is saved. */
function DetailSave({ listing, onToggle }) {
  const { state } = useSnapshot();
  const saved = Array.isArray(state.saved) && state.saved.includes(listing.id);
  return (
    <Button icon="bookmark" onClick={onToggle} aria-pressed={saved} aria-label={saved ? `Remove ${listing.name} from saved` : `Save ${listing.name}`}>
      {saved ? 'Saved' : 'Save'}
    </Button>
  );
}

/* ---- saved-only ----------------------------------------------------------- */

/* The free-text cleanup searchListingsPage applies before its ilike filters. */
const cleanTerm = (s) => String(s || '').replace(/[,()%*\\]/g, ' ').trim().toLowerCase();
const holds = (v, t) => String(v || '').toLowerCase().includes(t);

/**
 * True when a listing passes the same filters searchListingsPage runs in
 * Postgres (lib/listings.js): live, not your own, org class, cause, place
 * text, online or in person, and the search term across name, mission, bio,
 * site and cause. Used on the few listings a volunteer saved, which are
 * loaded by id instead of searched.
 */
export function matchesSearch(l, { q = '', causes = [], kind = 'all', place = 'all', near = '' } = {}, me = null) {
  if (!l || l.status !== 'live') return false;
  if (me && l.owner_id === me) return false;
  if ((kind === 'student' || kind === 'official') && l.org_class !== kind) return false;
  if (causes.length && !causes.includes(l.cause)) return false;
  const loc = nearTerm(near).toLowerCase();
  if (loc && !holds(l.site, loc) && !holds(l.location, loc)) return false;
  if (place === 'online' && !(l.delivery === 'remote' || l.delivery === 'hybrid' || l.org_type === 'team' || /remote|online|virtual/i.test(l.site || ''))) return false;
  if (place === 'person' && !(l.delivery === 'in_person' || l.delivery === 'hybrid')) return false;
  const term = cleanTerm(q);
  if (term && ![l.name, l.mission, l.bio, l.site, l.cause].some((v) => holds(v, term))) return false;
  return true;
}

/* The database's order: newest first, or most events first, then by id. */
function bySort(sort) {
  const id = (a, b) => String(a.id).localeCompare(String(b.id));
  if (sort === 'established') return (a, b) => (Number(b.events_hosted) || 0) - (Number(a.events_hosted) || 0) || id(a, b);
  return (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || id(a, b);
}

/** The saved listings that pass the filters, in the sort's order. */
async function loadSavedMatches(ids, filters) {
  const [rows, me] = await Promise.all([loadListingsByIds(ids), myId().catch(() => null)]);
  return rows.filter((l) => matchesSearch(l, filters, me)).sort(bySort(filters.sort));
}

/* A listing with its own usable photo or an upcoming shift gets a card;
   one with neither is a row. */
function hasMedia(l, now) {
  return Boolean(resolveCover(l.cover || l.photo || l.img)) || listingShifts(l, now).length > 0;
}

/* Every page of a search, for filters the database can't apply (When). */
async function searchAllPages(filters, maxRows = 1000) {
  let rows = [];
  let offset = 0;
  for (;;) {
    const res = await searchListingsPage({ ...filters, limit: 200, offset });
    rows = rows.concat(res.rows);
    if (!res.hasMore || !res.rows.length || rows.length >= maxRows) return { rows, capped: res.hasMore && rows.length >= maxRows };
    offset += res.rows.length;
  }
}

export default function DiscoverListings({
  mode = 'search', interest = '', q = '', causes = [], kind = 'all', place = 'all', near = '', sort = 'recent', when = '',
  windows = [], savedOnly = false, showEmpty = true, heading = '', onClearFilters, onCount, onRows, initial = 6,
  highlight = null, onHover, bare = false, excludeIds = [], scroller = false, cols = 2,
}) {
  const router = useRouter();
  const { state } = useSnapshot();
  const saved = state.saved || [];
  const [listings, setListings] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [applied, setApplied] = useState(new Map()); // listing_id -> application
  // The signed-in user's id: null signed out, undefined until it's known.
  const [me, setMe] = useState(undefined);
  const wide = useWide();
  const phone = useMedia('(max-width: 719px)');
  // The match block's rows hold 3 cards only in a 3-column grid on wide screens.
  const wide3 = wide && cols === 3;
  const [busy, setBusy] = useState(null);
  const [expanded, setExpanded] = useState(false);
  // Paging for search mode: `total` is the database's match count (null when
  // it didn't send one), `hasMore` says another page exists.
  const [page, setPage] = useState({ total: null, hasMore: false });
  const [moreState, setMoreState] = useState('idle'); // idle | loading | failed
  const searchKey = useRef('');

  useEffect(() => {
    let alive = true;
    myId().then((id) => alive && setMe(id || null)).catch(() => alive && setMe(null));
    return () => { alive = false; };
  }, []);

  async function refreshMine() {
    try {
      const mine = await loadMyApplications();
      setApplied(new Map(mine.map((a) => [a.listing_id, a])));
    } catch (err) {
      console.error('[discover] could not load your applications', err);
    }
  }

  const causeKey = (causes || []).join('|');
  const windowKey = (windows || []).join('|');
  const savedKey = saved.join('|');
  // Saved-only reloads when the saved list changes; other searches don't.
  const savedDep = savedOnly && mode !== 'match' ? `saved:${savedKey}` : '';
  // Debounced server-side search: filtering runs in Postgres, not the browser.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setExpanded(false);
    setMoreState('idle');
    searchKey.current = `${mode}#${interest}#${q}#${causeKey}#${kind}#${place}#${near}#${sort}#${when}#${windowKey}#${savedDep}#${nonce}`;
    const run = async () => {
      try {
        let ls;
        let meta = { total: null, hasMore: false };
        if (savedDep) {
          // The saved ids are on hand, so load those listings directly and
          // filter them, instead of hunting for them page by page.
          const now = new Date();
          const found = await loadSavedMatches(saved, { q, causes, kind, place, near, sort });
          ls = found.filter((l) => inWindow(l, when, now, windows));
          meta = { total: ls.length, hasMore: false };
        } else if (mode === 'match') {
          const now = new Date();
          // Score a wide pool, then keep the best 9 that fit When and free
          // time: the query ranks only the newest rows it fetches, so a narrow
          // pool can miss the strongest keyword match.
          const pool = await matchListings({ interest, causes, near, limit: MATCH_POOL });
          ls = pool.filter((l) => inWindow(l, when, now, windows)).slice(0, MATCH_SHOWN);
        } else if (when || windows.length) {
          const all = await searchAllPages({ q, causes, kind, place, near, sort });
          const now = new Date();
          ls = all.rows.filter((l) => inWindow(l, when, now, windows));
          meta = { total: all.capped ? null : ls.length, hasMore: false };
        } else {
          const res = await searchListingsPage({ q, causes, kind, place, near, sort });
          ls = res.rows;
          meta = { total: res.total, hasMore: res.hasMore };
        }
        if (!alive) return;
        setFailed(false);
        setListings(ls || []);
        setPage(meta);
        setLoading(false);
        refreshMine();
      } catch (err) {
        console.error('[discover] listings search failed', err);
        if (alive) {
          setFailed(true);
          setListings([]);
          setLoading(false);
        }
      }
    };
    const t = setTimeout(run, (mode !== 'match' && (q || near)) ? 280 : 0);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, interest, q, causeKey, kind, place, near, sort, when, windowKey, savedDep, nonce]);

  // Listings already on screen in another list (the main list leaves out the
  // picks shown above it), so no card appears twice. `count` below still
  // comes from the query, so it includes them.
  const excludeKey = (excludeIds || []).join('|');
  // Memoized so the rows handed to the caller keep their identity between renders.
  const shown = useMemo(() => {
    if (listings === null) return null;
    const skip = new Set(excludeIds || []);
    const rows = skip.size ? listings.filter((l) => !skip.has(l.id)) : listings;
    const kept = savedOnly ? rows.filter((l) => saved.includes(l.id)) : rows;
    if (mode === 'match' || sort !== 'recent') return kept;
    // Newest order leads with listings that have a photo or a date. A stable
    // split, so each group keeps the database's order.
    const now = new Date();
    const media = kept.filter((l) => hasMedia(l, now));
    return media.length === kept.length ? kept : [...media, ...kept.filter((l) => !hasMedia(l, now))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings, savedOnly, savedKey, excludeKey, mode, sort]);
  /* The number of matches to print. Search mode uses the database's total, so
     the count isn't capped at one page. Saved-only loads every saved listing,
     so its count is exact. */
  const count = shown === null || failed
    ? null
    : savedOnly
      ? shown.length
      : (page.total ?? listings.length);

  useEffect(() => {
    if (onCount) onCount(count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  // Listings people created have no photo of their own; they get a cause tile,
  // never a stock photo that would misrepresent them. The match block picks
  // photos for its whole pool first, since how many cards fill a row depends
  // on how many have one.
  const fitting = mode === 'match' && !scroller;
  const poolPhotos = usePhotoPicker(fitting && shown ? shown : [], { seed: false });
  /* The match block shows whole rows only: at 2 columns 2 or 4 cards, at 3
     columns 3. A listing it leaves out isn't in pickIds, so the main list
     below shows it instead. */
  const fit = useMemo(() => {
    if (!fitting || shown === null) return null;
    const now = new Date();
    const cards = shown.filter((l) => poolPhotos.get(l.id) || listingShifts(l, now).length > 0);
    const rest = shown.filter((l) => !cards.includes(l));
    if (!cards.length) return { collapsed: rest.slice(0, initial), full: rest };
    // Phones show one column of rows, so any count fills its rows.
    if (phone) return { collapsed: cards.slice(0, initial), full: [...cards, ...rest] };
    const collapsed = cards.slice(0, fitRows(cards, poolPhotos, wide3, wide3 ? [3, 4, 2] : [2, 4], initial));
    const most = Array.from({ length: cards.length }, (_, i) => cards.length - i);
    const full = cards.slice(0, Math.max(collapsed.length, fitRows(cards, poolPhotos, wide3, most, cards.length)));
    return { collapsed, full: [...full, ...rest] };
  }, [fitting, shown, poolPhotos, wide3, phone, initial]);
  const visible = useMemo(() => {
    if (shown === null) return [];
    if (fit) return expanded ? fit.full : fit.collapsed;
    return expanded ? shown : shown.slice(0, initial);
  }, [shown, fit, expanded, initial]);
  const listPhotos = usePhotoPicker(fitting ? [] : visible, { seed: false });
  const photos = fitting ? poolPhotos : listPhotos;
  const facts = useMemo(() => {
    const now = new Date();
    return new Map(visible.map((l) => [l.id, cardFacts(l, now)]));
  }, [visible]);

  useEffect(() => {
    if (!onRows) return;
    onRows(failed ? [] : visible.map((l) => ({ ...l, ...facts.get(l.id) })), photos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, facts, photos, failed]);

  /* Loads the next page of search results and appends it. A result for an
     older search (the filters changed while it loaded) is dropped. */
  async function loadMore() {
    if (mode === 'match' || moreState === 'loading' || !listings) return;
    const key = searchKey.current;
    setMoreState('loading');
    try {
      const res = await searchListingsPage({ q, causes, kind, place, near, sort, offset: listings.length });
      if (key !== searchKey.current) return;
      setListings((prev) => {
        const seen = new Set((prev || []).map((l) => l.id));
        return [...(prev || []), ...res.rows.filter((l) => !seen.has(l.id))];
      });
      setPage({ total: res.total, hasMore: res.hasMore && res.rows.length > 0 });
      setExpanded(true);
      setMoreState('idle');
      refreshMine();
    } catch (err) {
      console.error('[discover] loading more opportunities failed', err);
      if (key === searchKey.current) setMoreState('failed');
    }
  }

  const active = Boolean(q || (causes || []).length || kind !== 'all' || place !== 'all' || near || savedOnly || when || (windows || []).length);
  const title = heading || (mode === 'match' ? 'Based on your causes and interests' : near ? `Opportunities near ${near}` : 'Opportunities anywhere');

  /* Sends the application with its role, like /join does. A listing with one
     role fills it in; with several, the card opens the details dialog so the
     volunteer picks one there. Returns true once the application is sent. */
  async function apply(listing, api, position = '') {
    const positions = listing.positions || [];
    const role = position || (positions.length === 1 ? positions[0].t : '');
    if (positions.length > 1 && !role) {
      details(listing);
      return false;
    }
    if (busy) return false;
    setBusy(listing.id);
    let sent = false;
    try {
      await applyToListing(listing, { position: role || undefined, note: '' });
      sent = true;
      await refreshMine();
      if (api) api.close();
      const said = role ? `${listing.name} will see you applied as ${role}.` : `${listing.name} will see your application.`;
      // Applying here doesn't pick a shift, so point to where shifts are picked.
      toast(listingShifts(listing).length
        ? { title: 'Applied', message: `${said} Pick your shift on its page.`, tone: 'ok', actionLabel: 'Pick a shift', onAction: () => router.push(`/join/${listing.id}`) }
        : { title: 'Applied', message: said, tone: 'ok' });
    } catch (e) {
      toast({ title: "Couldn't apply", message: applyErrorMessage(e), tone: 'danger' });
    }
    setBusy(null);
    return sent;
  }

  function save(listing) {
    const now = toggleSaved(listing.id);
    toast(now
      ? { title: 'Saved', message: listing.name, tone: 'ok', actionLabel: 'Undo', onAction: () => toggleSaved(listing.id) }
      : { title: 'Removed from saved', message: listing.name, tone: 'brand', actionLabel: 'Undo', onAction: () => toggleSaved(listing.id) });
  }

  function message(listing, app) {
    openModal({
      title: `Message ${listing.name}`,
      subtitle: STATUS[app.status] || 'Applied',
      Body: () => <MessageThread applicationId={app.id} recipientId={listing.owner_id} recipientName={listing.name} />,
    });
  }

  function details(listing) {
    const app = applied.get(listing.id);
    const signedIn = me;
    const claims = [
      listing.events_hosted ? `${listing.events_hosted} ${listing.events_hosted === 1 ? 'event' : 'events'} hosted` : '',
      listing.approx_volunteers ? `about ${listing.approx_volunteers} volunteers so far` : '',
    ].filter(Boolean);
    const factLine = claims.length ? `${claims.join(' and ')}, ${reportedBy(listing)}` : '';
    const positions = listing.positions || [];
    const pickRole = !app && positions.length > 1;
    const f = cardFacts(listing);
    // The card's meta grammar: who, where, then the cause, joined by dots.
    const meta = [
      isOfficial(listing) ? '' : 'Student project',
      String(listing.site || listing.location || '').trim(),
      listing.cause ? causeOf(listing.cause).label : '',
    ].filter(Boolean);
    openModal({
      title: listing.name,
      subtitle: meta.length ? (
        <>
          {meta.map((m, i) => (
            <span key={i}>
              {i ? <Sep /> : null}
              {m}
            </span>
          ))}
        </>
      ) : 'Organization',
      Body: function ListingDetails({ api }) {
        const [role, setRole] = useState('');
        const [roleError, setRoleError] = useState('');
        const [sending, setSending] = useState(false);
        // Known when the dialog opened, or looked up now if it wasn't yet.
        const [viewer, setViewer] = useState(signedIn);
        useEffect(() => {
          if (viewer !== undefined) return undefined;
          let alive = true;
          myId().then((id) => alive && setViewer(id || null)).catch(() => alive && setViewer(null));
          return () => { alive = false; };
        }, [viewer]);
        const signedOut = viewer === null;
        const send = async () => {
          if (sending) return;
          if (signedOut) {
            // The same step /join takes: sign in, then come back to this listing.
            api.close();
            router.push(`/signin?next=${encodeURIComponent(`/join/${listing.id}`)}`);
            return;
          }
          if (pickRole && !role) {
            setRoleError('Choose a role.');
            return;
          }
          setSending(true);
          const sent = await apply(listing, api, role);
          if (!sent) setSending(false);
        };
        const body = `font:400 15px/1.55 ${F.body};color:${C.ink}`;
        const small = `font:400 14px/1.5 ${F.body};color:${C.ink2}`;
        const label = `font:600 13px/1.2 ${F.body};color:${C.ink}`;
        return (
        <div style={S('display:flex;flex-direction:column;gap:18px;min-width:0;overflow-wrap:anywhere')}>
          {listing.verified ? (
            <div style={S(`display:flex;align-items:center;gap:8px;${small}`)}>
              <Icon name="badge-check" size={18} color={C.confirmed} />
              Verified. A VolunteerU reviewer checked this organization by hand.
            </div>
          ) : null}
          {f.whenLabel ? <div style={S(`font:600 15px/1.4 ${F.body};color:${C.ink}`)}>{f.whenLabel}</div> : null}
          {listing.mission ? <div style={S(body)}>{listing.mission}</div> : null}
          {listing.bio ? <div style={S(small)}>{listing.bio}</div> : null}
          {factLine ? <div style={S(small)}>{factLine.charAt(0).toUpperCase() + factLine.slice(1)}</div> : null}
          {pickRole && !signedOut ? (
            <div role="radiogroup" aria-labelledby={`vu-roles-${listing.id}`}>
              <div id={`vu-roles-${listing.id}`} style={S(label)}>Which role?</div>
              {/* Radio rows on hairlines: the mark and a quiet fill show the pick. */}
              <div style={S(`margin-top:8px;border-top:1px solid ${C.line}`)}>
                {positions.map((pos) => {
                  const on = role === pos.t;
                  return (
                    <button
                      key={pos.id || pos.t}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => { setRole(pos.t); setRoleError(''); }}
                      className="dz-opt"
                      style={S(`width:100%;display:flex;align-items:flex-start;gap:12px;padding:12px 10px;text-align:left;cursor:pointer;border-bottom:1px solid ${C.line};background:${on ? C.mist : '#fff'}`)}
                    >
                      <span
                        aria-hidden="true"
                        style={S(`flex:none;margin-top:1px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:#fff;box-shadow:inset 0 0 0 ${on ? '2px' : '1.5px'} ${on ? C.ink : C.ink3}`)}
                      >
                        {on ? <i style={S(`display:block;width:8px;height:8px;border-radius:50%;background:${C.ink}`)} /> : null}
                      </span>
                      <span style={S('min-width:0')}>
                        <span style={S(`display:block;font:600 15px/20px ${F.body};color:${C.ink}`)}>{pos.t}</span>
                        {pos.m ? <span style={S(`display:block;margin-top:2px;font:400 13px/18px ${F.body};color:${C.ink2}`)}>{String(pos.m).replace(/\s*·\s*/g, ', ')}</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
              {roleError ? <div className="vu-err" role="alert">{roleError}</div> : null}
            </div>
          ) : positions.length ? (
            <div>
              <div style={S(label)}>Roles they need</div>
              <ul style={S(`margin:8px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
                {listing.positions.map((pos) => (
                  <li key={pos.id || pos.t} style={S(`padding:10px 0;border-bottom:1px solid ${C.line}`)}>
                    <div style={S(`font:600 15px/1.3 ${F.body};color:${C.ink}`)}>{pos.t}</div>
                    {pos.m ? <div style={S(`margin-top:2px;${small}`)}>{String(pos.m).replace(/\s*·\s*/g, ', ')}</div> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {safeUrl(listing.website) ? (
            <a href={safeUrl(listing.website)} target="_blank" rel="noreferrer noopener" className="vu-link-ul" style={S(`display:inline-flex;align-items:center;gap:6px;align-self:flex-start;font:500 14px/1.3 ${F.body};color:${C.ink}`)}>
              Visit their website <Icon name="external" size={14} />
            </a>
          ) : null}
          <div style={S('display:flex;gap:10px;flex-wrap:wrap;margin-top:2px')}>
            {app ? (
              <Button icon="message" onClick={() => { api.close(); message(listing, app); }}>
                Message {listing.name}
              </Button>
            ) : (
              <Button variant="primary" onClick={send} busy={sending}>
                {signedOut ? 'Sign in to apply' : sending ? 'Applying' : 'Apply'}
              </Button>
            )}
            <DetailSave listing={listing} onToggle={() => save(listing)} />
            <Button onClick={() => { api.close(); router.push(`/join/${listing.id}`); }}>
              Open full page
            </Button>
          </div>
        </div>
        );
      },
    });
  }

  // Match mode says which saved causes it read, from the settings it used.
  const causeNames = (causes || []).map((c) => causeOf(c).label);
  const matchSub = causeNames.length
    ? `Matches ${causeNames.length > 1 ? `${causeNames.slice(0, -1).join(', ')} and ${causeNames[causeNames.length - 1]}` : causeNames[0]} from your settings`
    : 'Matches the interests in your settings';
  // The match section's heading sits right in its section (a fragment, no
  // wrapper), so the section is the heading's parent.
  const header = bare ? null : mode === 'match' ? (
    <>
      <h2 className="vu-t-h2s" style={S(`color:${C.ink}`)}>{title}</h2>
      <p style={S(`margin:4px 0 0;font:400 13px/18px ${F.body};color:${C.ink2}`)}>
        {matchSub}.{' '}
        <Link href="/settings/preferences#set-causes-h" className="vu-link-ul" style={S(`font:500 13px/18px ${F.body};color:${C.ink}`)}>
          Change
        </Link>
      </p>
    </>
  ) : (
    <div style={S('display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px')}>
      <h2 style={S(`margin:0;font:650 22px/1.15 ${F.display};letter-spacing:-0.02em;color:${C.ink}`)}>{title}</h2>
    </div>
  );

  if (shown === null) {
    if (mode === 'match') return null;
    return (
      <section aria-label={title} aria-busy="true">
        {header}
        <div className={`${cols === 3 ? 'vu-grid-3' : 'vu-grid-2'} dz-grid`}>
          {(cols === 3 ? [0, 1, 2] : [0, 1]).map((i) => (
            <div key={i}>
              <div className="vu-skel" style={S(`aspect-ratio:3 / 2;border-radius:${R.photo}`)} />
              <div className="vu-skel" style={S('margin-top:12px;height:18px;width:70%')} />
              <div className="vu-skel" style={S('margin-top:8px;height:14px;width:45%')} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (failed) {
    if (mode === 'match') return null;
    return (
      <section aria-label={title}>
        {header}
        <Plain alert title="Opportunities didn't load" body="Check your connection and try again.">
          <Button size="sm" icon="refresh" onClick={() => setNonce((n) => n + 1)}>Try again</Button>
        </Plain>
      </section>
    );
  }

  if (shown.length === 0) {
    // The match feed stays silent; its mount point carries its own way forward.
    if (mode === 'match' || !showEmpty) return null;
    const emptyTitle = savedOnly ? 'Nothing saved matches' : active ? (q ? `Nothing for “${q}” yet` : 'Nothing matches these filters') : 'No opportunities posted yet';
    const emptyBody = savedOnly
      ? saved.length
        ? 'None of your saved opportunities fit these filters.'
        : 'Save an opportunity with its bookmark and it shows up here.'
      : active
        ? near ? 'Try a broader word, another day or clear the location.' : 'Try a broader word or clear a filter.'
        : 'No student projects yet. Start one and it shows up here.';
    const cta = active && onClearFilters ? 'Clear filters' : !active ? 'Start a student project' : '';
    const onCta = active ? onClearFilters : () => router.push('/create');
    return (
      <section aria-label={title} aria-busy={loading ? 'true' : undefined}>
        {header}
        <Plain title={emptyTitle} body={emptyBody}>
          {cta ? (
            <Button size="sm" onClick={onCta}>
              {cta}
            </Button>
          ) : null}
        </Plain>
      </section>
    );
  }

  // Cards for listings with a photo or a date; the rest as rows below them.
  const cards = visible.filter((l) => Boolean(photos.get(l.id)) || Boolean(facts.get(l.id).next));
  const plain = visible.filter((l) => !photos.get(l.id) && !facts.get(l.id).next);
  const gridClass = scroller ? 'vu-hscroll dz-grid' : `${cols === 3 ? 'vu-grid-3' : 'vu-grid-2'} dz-grid`;
  // Photo-less cards that render as rows get a DateBlock instead of a DateTile.
  const asRows = rowsGrid(cards, photos);

  return (
    <section aria-label={title} aria-busy={loading ? 'true' : undefined}>
      {header}
      {cards.length ? (
        <div
          className={gridClass}
          style={S(`transition:opacity .16s ease;opacity:${loading ? 0.55 : 1}${scroller ? ';margin-left:-16px;margin-right:-16px;padding:0 16px;scroll-padding:0 16px' : ''}`)}
        >
          {cards.map((l, i) => (
            <OppCard
              key={l.id}
              eager={i < 4}
              listing={l}
              facts={facts.get(l.id)}
              photo={photos.get(l.id)}
              app={applied.get(l.id)}
              saved={saved.includes(l.id)}
              selected={Array.isArray(highlight) ? highlight.includes(l.id) : highlight === l.id}
              row={asRows || (phone && !scroller)}
              onHover={onHover}
              onOpen={() => details(l)}
              onSave={() => save(l)}
            />
          ))}
        </div>
      ) : null}
      {plain.length ? (
        <div style={S(`margin-top:${cards.length ? 40 : 22}px;transition:opacity .16s ease;opacity:${loading ? 0.55 : 1}`)}>
          <h3 style={S(`margin:0 0 4px;font:600 15px/20px ${F.body};color:${C.ink}`)}>No dates posted yet</h3>
          <div className="vu-list">
            {plain.map((l) => (
              <OppRow
                key={l.id}
                listing={l}
                facts={facts.get(l.id)}
                app={applied.get(l.id)}
                saved={saved.includes(l.id)}
                onOpen={() => details(l)}
                onSave={() => save(l)}
              />
            ))}
          </div>
        </div>
      ) : null}
      {!expanded && (fit ? fit.full.length > fit.collapsed.length : shown.length > initial) && !scroller ? (
        <div style={S('margin-top:32px')}>
          <Button onClick={() => setExpanded(true)}>
            {page.hasMore ? 'Show more opportunities' : `Show all ${fit ? fit.full.length : shown.length} opportunities`}
          </Button>
        </div>
      ) : (expanded || shown.length <= initial) && page.hasMore && mode !== 'match' ? (
        <div style={S('margin-top:32px;display:flex;align-items:center;gap:14px;flex-wrap:wrap')}>
          <Button onClick={loadMore} busy={moreState === 'loading'}>
            {moreState === 'loading' ? 'Loading more opportunities' : 'Show more opportunities'}
          </Button>
          <span aria-live="polite" style={S(`font:400 13px/1.45 ${F.body};color:${moreState === 'failed' ? C.emberDeep : C.ink2};font-variant-numeric:tabular-nums`)}>
            {moreState === 'failed'
              ? "Couldn't load more opportunities. Check your connection and try again."
              : !savedOnly && page.total
                ? `Showing ${listings.length} of ${page.total}`
                : ''}
          </span>
        </div>
      ) : null}
    </section>
  );
}

/* A quiet empty or error block: heading, one line, one action. */
function Plain({ title, body, alert, children }) {
  return (
    <div role={alert ? 'alert' : undefined} style={S(`margin-top:24px;padding:24px 0 8px;border-top:1px solid ${C.line}`)}>
      <div style={S(`font:600 20px/1.2 ${F.display};letter-spacing:-0.012em;color:${C.ink}`)}>{title}</div>
      <div style={S(`margin-top:6px;font:400 15px/1.5 ${F.body};color:${C.ink2};max-width:520px`)}>{body}</div>
      {children ? <div style={S('margin-top:16px')}>{children}</div> : null}
    </div>
  );
}

/** Bookmark glyph, the same drawing ListingCard uses (translucent fill, white edge). */
function SaveGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="vu-card-save-ic">
      <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/* A plain click opens the quick view; a click meant for a new tab or window
   (modifier keys, middle button) follows the link to /join/<id>. */
function quickView(onOpen) {
  return (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen();
  };
}

/* The viewer's own state, the only badge a Discover photo carries. */
const BADGE = { accepted: { k: 'in', t: "You're in", tone: 'ok' }, pending: { k: 'applied', t: 'Applied', tone: 'wait' } };

/** "Student project · Pantry Hall", or the place alone for an organization. */
function whoParts(l, facts) {
  return isOfficial(l) ? [facts.place].filter(Boolean) : ['Student project', facts.place].filter(Boolean);
}

/**
 * One listing with a photo or a date: the photo (or a DateTile with its next
 * date), then the title, who runs it and when. Same markup and classes as
 * components/vu/ListingCard. The title is a link to /join/<id> whose plain
 * click opens the details dialog, where Apply and Message live. No buttons
 * under the card.
 */
function OppCard({ listing: l, eager = false, facts, photo, app, saved, selected, row = false, onHover, onOpen, onSave }) {
  const official = isOfficial(l);
  const hasPhoto = Boolean(photo && photo.src);
  const hover = onHover
    ? { onMouseEnter: () => onHover(l.id), onMouseLeave: () => onHover(null), onFocus: () => onHover(l.id), onBlur: () => onHover(null) }
    : {};
  const badge = app ? BADGE[app.status] : null;
  const next = facts.next;
  const who = whoParts(l, facts);
  const lineB = whenParts({ date: next ? next.d : null, time: next ? next.t : '', moreDates: facts.moreDates, hasPhoto, online: facts.online });
  // A photo-less card shown as a row leads with a DateBlock ("Sat" over "24"),
  // like Landing's rows; the big DateTile fills a photo-sized frame only.
  const dateRow = !hasPhoto && row && Boolean(next);
  return (
    <article className={['vu-card', 'vu-card--wide', 'dz-card', hasPhoto ? 'vu-card--photo' : 'vu-card--tile', dateRow ? 'vu-card--row' : '', selected ? 'is-selected' : ''].filter(Boolean).join(' ')} {...hover}>
      <div className={hasPhoto ? 'vu-card-ph' : 'vu-card-ph has-tile'}>
        {hasPhoto ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={photo.src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" style={photo.pos ? { objectPosition: photo.pos } : undefined} />
        ) : dateRow ? (
          <span style={{ gridColumn: 1, gridRow: '1 / span 2', display: 'block' }}>
            <DateBlock size="md" date={next.d} />
          </span>
        ) : (
          <DateTile cause={l.cause} date={next ? next.d : null} />
        )}
        {badge ? (
          <span className={`vu-card-badge is-${badge.k}`}>
            <i aria-hidden="true" />
            {badge.t}
          </span>
        ) : null}
      </div>
      <div className="vu-card-body">
        <h3 className="vu-card-title">
          <Link href={`/join/${l.id}`} prefetch={false} className="vu-card-link dz-open" onClick={quickView(onOpen)}>
            {l.name}
            <span className="vu-sr">{official ? (l.verified ? ', verified organization' : ', organization') : ', student project'}</span>
          </Link>
        </h3>
        {who.length ? (
          <div className="vu-card-who">
            {who.map((w, i) => (
              <span key={i}>
                {i ? <Sep /> : null}
                {w}
                {i === 0 && official && l.verified ? <Icon name="badge-check" size={14} color={C.confirmed} label="Verified organization" className="vu-card-check" /> : null}
              </span>
            ))}
          </div>
        ) : null}
        {lineB.length ? (
          <div className="vu-card-when">
            {lineB.map((x, i) => (
              <span key={i}>
                {i ? <Sep /> : null}
                {x.text}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {/* After the body in the DOM so the title is the card's first stop; drawn over the photo. */}
      <button
        type="button"
        className={saved ? 'vu-card-save is-on' : 'vu-card-save'}
        aria-pressed={saved ? 'true' : 'false'}
        aria-label={saved ? `Remove ${l.name} from saved` : `Save ${l.name}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSave();
        }}
      >
        <SaveGlyph />
      </button>
    </article>
  );
}

/**
 * A listing with no photo and no date: a row, since a picture-sized block
 * would only announce what's missing. Title, who and where, and the cause;
 * the viewer's state as a dot and word; a bookmark at the end. The row is a
 * link to /join/<id> whose plain click opens the details dialog.
 */
function OppRow({ listing: l, facts, app, saved, onOpen, onSave }) {
  const badge = app ? BADGE[app.status] : null;
  const meta = [...whoParts(l, facts), l.cause ? causeOf(l.cause).label : ''].filter(Boolean);
  return (
    <article style={S('position:relative')}>
      <Link
        href={`/join/${l.id}`}
        prefetch={false}
        className="vu-row vu-row--nolead"
        onClick={quickView(onOpen)}
        style={S('padding-right:48px')}
      >
        <span style={S('display:block;min-width:0')}>
          <span className="vu-row-t">
            {l.name}
            {/* The check is drawn for the eye; the words below say it for screen readers, as on cards. */}
            {isOfficial(l) && l.verified ? <Icon name="badge-check" size={14} color={C.confirmed} className="vu-card-check" /> : null}
            <span className="vu-sr">{isOfficial(l) ? (l.verified ? ', verified organization' : ', organization') : ', student project'}</span>
          </span>
          {meta.length ? (
            <span className="vu-row-m">
              {meta.map((m, i) => (
                <span key={i}>
                  {i ? <Sep /> : null}
                  {m}
                </span>
              ))}
            </span>
          ) : null}
        </span>
        {badge ? (
          <span className="vu-row-end">
            <StatusText tone={badge.tone}>{badge.t}</StatusText>
          </span>
        ) : null}
      </Link>
      <button
        type="button"
        className="vu-iconbtn-sm"
        aria-pressed={saved ? 'true' : 'false'}
        aria-label={saved ? `Remove ${l.name} from saved` : `Save ${l.name}`}
        onClick={onSave}
        style={S(`position:absolute;right:0;top:12px;width:36px;height:36px;color:${saved ? C.ember : C.ink3}`)}
      >
        <Icon name="bookmark" size={20} fillColor={saved ? C.ember : undefined} />
      </button>
    </article>
  );
}
