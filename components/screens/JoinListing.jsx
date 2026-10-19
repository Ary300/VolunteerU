'use client';

/* ==========================================================================
   JoinListing.jsx, the public page a shared link opens
   Anyone can view it signed out. Applying goes through sign-in and lands back
   here. It reads the live Supabase listing (never local seed data), so the
   application it creates is the one the organizer sees on /lead.

   Layout: title and facts, the listing's own photo when it has one, then the
   details on the left and a sticky action panel on the right with the shifts,
   the apply form or where the application stands. Under 960px the panel sits
   right under the header.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { S, cx, H } from '../../lib/style.js';
import { C, F, R, causeOf, causeKey } from '../../lib/tokens.js';
import { Button, Icon, StatusPill, StatusText, ErrorState } from '../ui.jsx';
import { MarketingHeader, MarketingFooter } from '../Marketing.jsx';
import { useSnapshot } from '../../lib/store.js';
import DateBlock, { dateParts } from '../vu/DateBlock.jsx';
import { fmtRange } from '../../lib/format.js';
import { photoFor } from '../../lib/photos.js';
import { toast, confirmDialog, openModal } from '../../lib/overlays.js';
import { toggleSaved, copyText } from '../../lib/db.js';
import MessageThread from '../MessageThread.jsx';
import AppShell from '../AppShell.jsx';
import { getListing, applyToListing, loadMyApplications, setApplicationStatus, myId, listingShifts, myShiftSignUps, signUpForShift, cancelShiftSignUp, memberHourEntries, loadShiftSpots, listingSignup, listingNonprofitHref } from '../../lib/listings.js';
import { safeUrl } from '../MemberProjects.jsx';
import { isPastShift, parseTimeRange, googleCalUrl, icsEvent } from '../../lib/calendar.js';
import { isArchivedApplication } from '../VolunteerApplications.jsx';
import { whenLabel } from '../AnnouncementBoard.jsx';
import { AddressMap } from '../MapPanel.jsx';
import { storedPoint, geocode, distanceMiles } from '../../lib/geo.js';
import { useLocation, pointOf, milesLabel } from '../../lib/location.js';

/* The verified check sits after the organization's name; the explanation is its hover
   title and screen-reader text. Shared with Detail and Apply. */
export const VERIFIED_NOTE = 'A VolunteerU reviewer checked this organization by hand.';
export const VERIFIED_LABEL = `Verified. ${VERIFIED_NOTE}`;
export const SR_ONLY = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
const KIND = { meeting: 'Meeting', form: 'Form', training: 'Training', check: 'Check' };
const NOTE_MAX = 400;
/* Shifts shown in the panel before "Show all". */
const SHIFT_PREVIEW = 4;
/* Application statuses that can hold shift sign-ups (lib/listings.js agrees). */
const SIGNUP_STATUSES = ['pending', 'accepted'];
/* Statuses whose join link opens. Unlisted is off Discover, link still open. */
const OPEN_STATUSES = ['live', 'unlisted'];

/* One clock reading in the house style: "9 AM", "9:30 PM", "noon", "midnight". */
function clockPart(min) {
  if (min === 12 * 60) return { text: 'noon', mer: '' };
  if (min === 0 || min === 24 * 60) return { text: 'midnight', mer: '' };
  const h24 = Math.floor(min / 60) % 24;
  const mm = min % 60;
  const h = h24 % 12 || 12;
  return { text: mm ? `${h}:${String(mm).padStart(2, '0')}` : String(h), mer: h24 >= 12 ? 'PM' : 'AM' };
}

const END_RX = '(?:\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM)?|noon|midnight)';
const WHOLE_RANGE_RX = new RegExp(`^${END_RX}\\s*(?:to|\\u2013|-)\\s*${END_RX}$`, 'i');
const SINGLE_TIME_RX = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i;

/**
 * Any shift time the app has stored, in the one format every screen shows
 * (lib/format.js fmtRange): "1:00-4:00 PM" → "1 to 4 PM", "3:30-5:30 PM" →
 * "3:30 to 5:30 PM", "10:00 AM-1:00 PM" → "10 AM to 1 PM". A stored "noon"
 * or "midnight" end keeps its word ("9 AM to noon"). Text that isn't a time
 * comes back as it was.
 */
export function formatShiftTime(t) {
  const raw = String(t || '').trim();
  if (!/noon|midnight/i.test(raw) && (SINGLE_TIME_RX.test(raw) || WHOLE_RANGE_RX.test(raw))) {
    const house = fmtRange(raw);
    if (house) return house;
  }
  const one = SINGLE_TIME_RX.exec(raw);
  if (one) {
    const h = Number(one[1]);
    const mm = Number(one[2] || 0);
    if (h < 1 || h > 12 || mm > 59) return raw;
    const pm = /pm/i.test(one[3]);
    const c = clockPart(((h % 12) + (pm ? 12 : 0)) * 60 + mm);
    return c.mer ? `${c.text} ${c.mer}` : c.text;
  }
  const range = WHOLE_RANGE_RX.test(raw) ? parseTimeRange(raw) : null;
  if (!range) return raw;
  const a = clockPart(range.start);
  const b = clockPart(range.end);
  const end = b.mer ? `${b.text} ${b.mer}` : b.text;
  if (a.mer && a.mer === b.mer) return `${a.text} to ${end}`;
  return `${a.mer ? `${a.text} ${a.mer}` : a.text} to ${end}`;
}

/* Splits a stored next-shift label into its date and time. The app has
   written "Sat, Oct 24 · 1:00-4:00 PM", "Sat, Oct 24 at 1:00-4:00 PM" and
   "Sat, Oct 24, 1:00-4:00 PM"; all three read the same. */
function splitShift(text) {
  const dot = /^(.+?)\s*·\s*(.+)$/.exec(text);
  if (dot) return [dot[1], dot[2]];
  const at = /^(.+?)\s+at\s+(.+)$/.exec(text);
  if (at) return [at[1], at[2]];
  const comma = /^([A-Za-z]{3},\s*[A-Za-z]{3}\s+\d{1,2}),\s*(.+)$/.exec(text);
  if (comma) return [comma[1], comma[2]];
  return [text, ''];
}

/** Reads a stored next shift ("Sat, Oct 24 · 1:00-4:00 PM") into the label
    every screen shows ("Sat, Oct 24 · 1 to 4 PM") and whether it already happened. */
export function nextShiftInfo(raw, now = new Date()) {
  const text = String(raw || '').trim();
  if (!text || /not scheduled/i.test(text)) return null;
  const [datePart, timePart] = splitShift(text);
  const label = timePart ? `${datePart} · ${formatShiftTime(timePart)}` : datePart;
  return { label, past: isPastShift({ d: datePart, t: timePart }, now) };
}

/** "Sat, Oct 24 · 1 to 4 PM" for one published shift (cards, rows, toasts). */
export function shiftLabel(sh) {
  if (!sh) return '';
  const t = formatShiftTime(sh.t);
  return t ? `${sh.d} · ${t}` : String(sh.d || '');
}

/** "Sat, Oct 24, 1 to 4 PM": the same shift inside a sentence, where a
    middle dot would read as a typo. */
export function shiftPhrase(sh) {
  if (!sh) return '';
  const t = formatShiftTime(sh.t);
  return t ? `${sh.d}, ${t}` : String(sh.d || '');
}

function friendlyError(e) {
  const msg = String((e && e.message) || '');
  if (/already applied/i.test(msg)) return 'You already applied to this one.';
  if (/sign in/i.test(msg)) return 'Sign in again, then apply.';
  return "Your application didn't send. Check your connection and try again.";
}

/* Sticky offset for the action panel. A panel taller than the window sticks
   by its bottom edge (negative top), so every control in it stays reachable
   without an inner scroll. */
function useStickyTop(ref, gap = 24) {
  const [top, setTop] = useState(gap);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return undefined;
    const measure = () => setTop(Math.min(gap, window.innerHeight - el.offsetHeight - gap));
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  });
  return top;
}

/* True while one of the panel's main actions (the apply button, or the
   organization's form when it is the only way to hold a spot) is on screen
   above the phone action bar, so the bar steps aside instead of doubling it. */
function useSubmitInView(panelRef, barHeight = 80) {
  const [inView, setInView] = useState(false);
  const target = useRef([]);
  const io = useRef(null);
  useEffect(() => {
    const els = panelRef.current ? Array.from(panelRef.current.querySelectorAll('[data-apply-submit]')) : [];
    if (els.length === target.current.length && els.every((el, i) => el === target.current[i])) return;
    target.current = els;
    if (io.current) io.current.disconnect();
    io.current = null;
    if (!els.length || typeof IntersectionObserver === 'undefined') { setInView(false); return; }
    const seen = new Map();
    io.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => seen.set(entry.target, entry.isIntersecting));
      setInView(Array.from(seen.values()).some(Boolean));
    }, { rootMargin: `0px 0px -${barHeight}px 0px` });
    els.forEach((el) => io.current.observe(el));
  });
  useEffect(() => () => { if (io.current) io.current.disconnect(); }, []);
  return inView;
}

/* Listing ids are UUIDs. Anything else on /join is a typo or an old link. */
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* The shift a visitor tapped before signing in. It arrives as ?shift= and is
   kept in this tab's sessionStorage until it's used, so a refresh before
   applying doesn't drop it. */
const shiftKey = (listingId) => `vu.join.shift.${listingId}`;

function readSavedShift(listingId) {
  try {
    return window.sessionStorage.getItem(shiftKey(listingId)) || '';
  } catch {
    return '';
  }
}

/** Saves the picked shift for this listing, or forgets it when `shiftId` is ''. */
function saveShift(listingId, shiftId) {
  try {
    if (shiftId) window.sessionStorage.setItem(shiftKey(listingId), shiftId);
    else window.sessionStorage.removeItem(shiftKey(listingId));
  } catch {
    // Storage blocked (private mode): the pick just won't survive a refresh.
  }
}

/* That shift, while it's still one of this listing's upcoming shifts. */
function returnedShift(listing) {
  if (typeof window === 'undefined' || !listing) return '';
  const want = new URLSearchParams(window.location.search).get('shift') || readSavedShift(listing.id);
  return want && listingShifts(listing).some((x) => x.id === want) ? want : '';
}

/* A Google Calendar link for one shift the volunteer signed up for. */
function calendarEvent(listing) {
  const remote = listing.delivery === 'remote';
  return {
    title: listing.name,
    org: splitOrgSite(listing).org,
    address: remote ? '' : String(listing.site || listing.location || ''),
    description: listing.mission || '',
  };
}
function calendarLink(listing, sh) {
  return googleCalUrl(calendarEvent(listing), sh);
}
/* The shift as a downloadable .ics, for Apple Calendar and Outlook. */
function icsLink(listing, sh) {
  const text = icsEvent(calendarEvent(listing), sh);
  return text ? `data:text/calendar;charset=utf-8,${encodeURIComponent(text)}` : null;
}

/**
 * @param {{ id: string, outdated?: boolean, preview?: object | null }} props
 *   preview: the public fields app/join/[id]/page.js read on the server. It
 *   draws the header while the browser loads the listing and the visitor's
 *   application, so the page has its title, org, date and photo without JS.
 */
export default function JoinListing({ id, outdated = false, preview = null }) {
  const router = useRouter();
  const stale = outdated && !UUID_RX.test(String(id || ''));
  const [loaded, setListing] = useState(undefined); // undefined=loading, null=missing
  // Signed out (as far as this browser's stored session says), nothing on
  // the page waits on the visitor's applications, so it draws the whole
  // listing from the server's copy at once and the browser's own read just
  // refreshes it. Signed in, PreviewShell holds the panel until that read
  // says whether they already applied.
  const { state: snap } = useSnapshot();
  const storedAuthed = !!(snap && snap.session && snap.session.authed);
  const draft = loaded === undefined && !stale && preview && preview.full && !storedAuthed ? preview : undefined;
  const listing = draft || loaded;
  const [me, setMe] = useState(undefined);
  const [app, setApp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState('');
  const [note, setNote] = useState('');
  const [posError, setPosError] = useState('');
  const [shiftPick, setShiftPick] = useState('');
  // The shift they came back to sign up for while their application is
  // withdrawn, waitlisted or declined. The status panel names it.
  const [blockedShift, setBlockedShift] = useState(null);
  const [cameBack, setCameBack] = useState(false); // back from sign-in with a shift picked
  // Back from sign-in with a shift picked, but they had already applied: the
  // row's sign-up runs once the panel has loaded.
  const [returned, setReturned] = useState('');
  const [shiftBusy, setShiftBusy] = useState(''); // id of the shift being saved
  // The member's application when the organizer archived this project: RLS
  // hides the listing from them, so the read above comes back empty.
  const [archivedApp, setArchivedApp] = useState(null);
  // A pending or waitlisted application to a listing the organizer has since paused or closed.
  const [closedApp, setClosedApp] = useState(null);
  // The applications read failed, so this page can't tell whether the
  // student already applied. The panel says so instead of offering the form.
  const [appsError, setAppsError] = useState(false);
  const [appsRetrying, setAppsRetrying] = useState(false);
  // The listing read itself failed (network, 5xx). That isn't a dead link,
  // so the page offers a retry instead of "This link isn't active".
  const [loadError, setLoadError] = useState(false);
  const [loadNonce, setLoadNonce] = useState(0);
  // Spots per shift ({ [id]: { cap, taken, left, full } }), or null when unknown.
  const [spots, setSpots] = useState(null);
  // Bumped after Apply, Withdraw and Apply again, so focus lands on the new status.
  const [focusTick, setFocusTick] = useState(0);
  const panelRef = useRef(null);
  const stickyTop = useStickyTop(panelRef);
  const submitInView = useSubmitInView(panelRef);

  useEffect(() => {
    let alive = true;
    (async () => {
      // The listing, who's signed in and their applications load together, so
      // the panel renders once in its real state (apply form or application
      // status) instead of showing the form and then swapping it out.
      // loadMyApplications returns [] when signed out.
      let failed = false;
      const [l, uid, mine, sp] = await Promise.all([
        getListing(id).catch((err) => {
          console.error('[join] could not load the listing', err);
          return 'error';
        }),
        myId(),
        loadMyApplications({ throwOnError: true }).catch((err) => {
          console.error('[join] could not load your applications', err);
          failed = true;
          return [];
        }),
        UUID_RX.test(String(id || '')) ? loadShiftSpots(id) : null,
      ]);
      if (!alive) return;
      setSpots(sp);
      if (l === 'error') {
        setLoadError(true);
        setMe(uid || null);
        return;
      }
      setLoadError(false);
      // A malformed id can't match any application's listing_id (a UUID).
      // A hidden listing may be a project this member was in that got
      // archived. Check before showing "This link isn't active".
      if (uid && !l && UUID_RX.test(String(id || ''))) {
        setArchivedApp(mine.find((a) => a.listing_id === id && isArchivedApplication(a)) || null);
        setClosedApp(mine.find((a) => a.listing_id === id && ['pending', 'waitlisted'].includes(a.status)) || null);
      }
      const found = uid && l ? mine.find((a) => a.listing_id === l.id) : null;
      if (found) setApp(found);
      // Back from sign-in with the shift they chose signed out. Without an
      // application it's picked in the apply form, so one tap applies and
      // signs them up. With one, the row's sign-up runs for them.
      const want = uid && l && !failed && l.owner_id !== uid ? returnedShift(l) : '';
      if (want && !found) {
        saveShift(l.id, want);
        setShiftPick(want);
        setCameBack(true);
      } else if (want) {
        setReturned(want);
      }
      if (typeof window !== 'undefined' && /[?&]shift=/.test(window.location.search)) {
        window.history.replaceState(window.history.state, '', window.location.pathname);
      }
      setAppsError(!!uid && failed);
      setListing(l);
      setMe(uid || null);
    })();
    return () => { alive = false; };
  }, [id, loadNonce]);

  // Coming back with a shift picked: bring the Apply button into view.
  useEffect(() => {
    if (!cameBack || !listing) return;
    setCameBack(false);
    const el = panelRef.current ? panelRef.current.querySelector('[data-apply-submit]') : null;
    if (el) el.scrollIntoView({ block: 'center' });
  }, [cameBack, listing]);

  // Already applied when they came back with a shift: sign them up for it, or
  // say why that can't happen yet. Runs once per return.
  useEffect(() => {
    if (!returned || !listing || !app || !me) return;
    setReturned('');
    saveShift(listing.id, '');
    const sh = listingShifts(listing).find((x) => x.id === returned);
    if (!sh) return;
    if (!app.id || !SIGNUP_STATUSES.includes(app.status)) {
      setBlockedShift(sh);
      return;
    }
    if (myShiftSignUps(app).some((x) => x.id === sh.id && !x.past)) {
      toast({ title: 'Already signed up', message: `${listing.name} · ${shiftLabel(sh)}`, tone: 'ok' });
      scrollToShift(sh.id);
      return;
    }
    signUpShift(sh).then((ok) => { if (ok) scrollToShift(sh.id); });
    // signUpShift reads this render's app and listing, which the deps cover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returned, listing, app, me]);

  // A link to #vu-join-apply (See shifts on Home and My crew) lands before
  // the panel exists, so the jump runs again once the listing is drawn.
  useEffect(() => {
    if (!listing || typeof window === 'undefined' || !window.location.hash) return;
    const el = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (el) el.scrollIntoView({ block: 'start' });
  }, [listing]);

  // Apply, Withdraw and Apply again swap the panel, which drops the focused
  // button. Focus moves to the new status so keyboard and screen-reader users
  // keep their place.
  useEffect(() => {
    if (!focusTick || !panelRef.current) return;
    const el = panelRef.current.querySelector('[data-status-focus]');
    if (el) el.focus({ preventScroll: false });
  }, [focusTick]);

  /** Reads the spots left on each shift again. */
  async function refreshSpots() {
    if (!listing) return;
    const sp = await loadShiftSpots(listing.id);
    if (sp) setSpots(sp);
  }

  /** Scrolls the panel's row for one shift into view. */
  function scrollToShift(shiftId) {
    const el = typeof document === 'undefined' ? null : document.querySelector(`[data-shift-id="${CSS.escape(shiftId)}"]`);
    if (el) el.scrollIntoView({ block: 'center' });
  }

  /** Reads the student's applications again after a failed load. */
  async function retryApps() {
    if (appsRetrying) return;
    setAppsRetrying(true);
    try {
      const mine = await loadMyApplications({ throwOnError: true });
      if (listing) setApp(mine.find((a) => a.listing_id === listing.id) || null);
      else if (UUID_RX.test(String(id || ''))) setArchivedApp(mine.find((a) => a.listing_id === id && isArchivedApplication(a)) || null);
      setAppsError(false);
    } catch (err) {
      console.error('[join] could not load your applications again', err);
      toast({ title: "Couldn't load your application", message: 'Check your connection and try again.', tone: 'danger' });
    }
    setAppsRetrying(false);
  }

  /** Re-reads this listing's application. Returns the row it found, or null. */
  async function refreshApp(fallback) {
    try {
      const mine = await loadMyApplications({ throwOnError: true });
      const found = mine.find((a) => a.listing_id === listing.id) || null;
      setApp(found || fallback);
      return found;
    } catch (err) {
      console.error('[join] could not reload your application', err);
      setApp(fallback);
      return null;
    }
  }

  async function apply() {
    if (busy || !listing || appsError) return;
    // Signed out: create an account (or sign in from there) and come back here.
    if (!me) { router.push(signupHref(id)); return; }
    const positions = listing.positions || [];
    if (positions.length > 1 && !position) {
      setPosError('Choose a role.');
      return;
    }
    setPosError('');
    const chosen = position || (positions.length === 1 ? positions[0].t : '');
    const pick = shiftPick ? listingShifts(listing).find((x) => x.id === shiftPick) : null;
    setBusy(true);
    try {
      await applyToListing(listing, { position: chosen || undefined, note: note.trim() });
      saveShift(listing.id, '');
      const found = await refreshApp({ id: null, status: 'pending', position: chosen });
      if (pick) {
        const res = found && found.id ? await signUpForShift(found.id, pick.id) : null;
        if (res && res.ok) {
          setApp({ ...found, member_state: res.member_state });
          setShiftPick('');
          toast({ title: 'Applied and signed up', message: `${listing.name} has your application. You're signed up for ${shiftPhrase(pick)}.`, tone: 'ok' });
        } else if (res && res.error && res.error.code === 'FULL') {
          setShiftPick('');
          toast({ title: 'Applied, that shift is full', message: `${listing.name} has your application. Choose another shift from the list.`, tone: 'warn' });
        } else {
          if (res) console.error('[join] shift sign-up after applying failed', res.error);
          toast({ title: 'Applied, shift not saved', message: 'Sign up for the shift from the list of shifts.', tone: 'warn' });
        }
      } else {
        toast({ title: 'Applied', message: `${listing.name} will see your application.`, tone: 'ok' });
      }
      refreshSpots();
      setFocusTick((n) => n + 1);
    } catch (e) {
      if (e && e.code === 'DUPLICATE') {
        // Applied from another tab or device. Show where that application
        // stands instead of leaving the form up.
        const found = await refreshApp(null);
        if (found) {
          toast({
            title: 'Already applied',
            message: found.status === 'withdrawn' ? 'You withdrew it earlier. Apply again to reopen it.' : `You applied to ${listing.name} earlier.`,
            tone: 'ok',
          });
        }
        else toast({ title: "Couldn't apply", message: friendlyError(e), tone: 'danger' });
      } else {
        console.error('[join] apply failed', e);
        toast({ title: "Couldn't apply", message: friendlyError(e), tone: 'danger' });
      }
    }
    setBusy(false);
  }

  async function withdraw() {
    if (busy || !app || !app.id) return;
    const ok = await confirmDialog({
      title: 'Withdraw your application?',
      body: `${listing.name} will see you withdrew. You can apply again later.`,
      confirmLabel: 'Withdraw application',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    const { ok: saved, error } = await setApplicationStatus(app.id, 'withdrawn');
    if (saved) {
      await refreshApp({ ...app, status: 'withdrawn', member_state: { ...(app.member_state || {}), shifts: myShiftSignUps(app).filter((x) => x.past) } });
      toast({ title: 'Application withdrawn', tone: 'ok' });
      refreshSpots();
      setFocusTick((n) => n + 1);
    } else {
      console.error('[join] withdraw failed', error);
      toast({ title: "Couldn't withdraw", message: 'Check your connection and try again.', tone: 'danger' });
    }
    setBusy(false);
  }

  /* A refused shift (canceled, moved or already over) means this page shows
     an old list, so read the listing again. */
  async function reloadListing() {
    try {
      const l = await getListing(id);
      if (l) setListing(l);
    } catch (err) {
      console.error('[join] could not reload the listing', err);
    }
  }

  /** Signs the applicant up for one shift. Resolves true when it saved. */
  async function signUpShift(sh, forApp = app) {
    // Signed out: the button says "Sign up", so it opens account creation.
    // That page links to sign-in for a returning student, and both come back
    // here with this shift picked.
    if (!me) { router.push(signupHref(id, sh.id)); return false; }
    if (shiftBusy || !forApp || !forApp.id) return false;
    setShiftBusy(sh.id);
    const res = await signUpForShift(forApp.id, sh.id);
    if (res.ok) {
      setApp((prev) => ({ ...prev, member_state: res.member_state }));
      toast({ title: 'Signed up', message: `${listing.name} · ${shiftLabel(sh)}`, tone: 'ok' });
      refreshSpots();
    } else {
      if (res.error.code !== 'FULL') console.error('[join] shift sign-up failed', res.error);
      toast({ title: "Couldn't sign up", message: res.error.message, tone: 'danger' });
      if (['GONE', 'PAST'].includes(res.error.code)) await reloadListing();
      if (res.error.code === 'FULL') await refreshSpots();
      if (res.error.code === 'CLOSED') await refreshApp(forApp);
    }
    setShiftBusy('');
    return !!res.ok;
  }

  async function cancelShift(sh) {
    if (shiftBusy || !app || !app.id) return;
    const ok = await confirmDialog({
      title: 'Cancel your sign-up?',
      body: `${listing.name} will see you're not coming on ${shiftPhrase(sh)}. You can sign up again before it starts.`,
      confirmLabel: 'Cancel sign-up',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!ok) return;
    setShiftBusy(sh.id);
    const res = await cancelShiftSignUp(app.id, sh.id);
    if (res.ok) {
      setApp((prev) => ({ ...prev, member_state: res.member_state }));
      toast({ title: 'Sign-up canceled', message: `${listing.name} · ${shiftLabel(sh)}`, tone: 'ok' });
      refreshSpots();
    } else {
      console.error('[join] cancel shift sign-up failed', res.error);
      toast({ title: "Couldn't cancel", message: res.error.message, tone: 'danger' });
    }
    setShiftBusy('');
  }

  async function applyAgain() {
    if (busy || !app || !app.id) return;
    setBusy(true);
    const { ok: saved, error } = await setApplicationStatus(app.id, 'pending');
    if (saved) {
      const found = await refreshApp({ ...app, status: 'pending' });
      const want = blockedShift && listingShifts(listing).find((x) => x.id === blockedShift.id);
      setBlockedShift(null);
      if (want) {
        // They came back to sign up for this shift; applying again opens it.
        setBusy(false);
        const signed = await signUpShift(want, found || { ...app, status: 'pending' });
        if (signed) scrollToShift(want.id);
        return;
      }
      toast({ title: 'Applied', message: `${listing.name} will see your application.`, tone: 'ok' });
      setFocusTick((n) => n + 1);
    } else {
      console.error('[join] re-apply failed', error);
      toast({ title: "Couldn't apply", message: 'Check your connection and try again.', tone: 'danger' });
    }
    setBusy(false);
  }

  if (loadError) {
    return (
      <Shell signedIn={me === undefined ? undefined : !!me}>
        <ErrorState
          title="Couldn't load this opportunity"
          body="Check your connection and try again."
          onRetry={() => {
            setLoadError(false);
            setListing(undefined);
            setLoadNonce((n) => n + 1);
          }}
        />
      </Shell>
    );
  }
  if (listing === undefined && preview && !stale) {
    return <Shell signedIn={me === undefined ? undefined : !!me}><PreviewShell id={id} preview={preview} /></Shell>;
  }
  if (listing === undefined) {
    return <Shell signedIn={me === undefined ? undefined : !!me}><div role="status" aria-busy="true" style={S(`padding:80px 0;text-align:center;font:400 15px/1.5 ${F.body};color:${C.ink2}`)}>Loading</div></Shell>;
  }
  if (stale) {
    return (
      <Shell signedIn={!!me}>
        <Notice icon="link" title="This link is out of date" body="Search for the opportunity by name to find its current page." cta="Search opportunities" href={me ? '/discover' : '/#search'} />
      </Shell>
    );
  }
  if (listing === null && archivedApp) {
    return <Shell signedIn={!!me}><ArchivedProject app={archivedApp} /></Shell>;
  }
  if (listing === null && closedApp) {
    const name = (closedApp.listings && closedApp.listings.name) || 'This project';
    return (
      <Shell signedIn={!!me}>
        <Notice icon="link" title={`${name} stopped taking applications`} body="Your application was still waiting when the organizer paused or closed this project. Other opportunities are open on Discover." cta="Find opportunities" href="/discover" />
      </Shell>
    );
  }
  if (listing === null && appsError) {
    // Hidden listing and no applications to check it against: it may be an
    // archived project this student was in, so don't call the link dead yet.
    return (
      <Shell signedIn={!!me}>
        <Notice icon="alert" title="Couldn't open this link" body="Your projects didn't load, so we can't tell whether this one was archived. Check your connection and try again." cta={appsRetrying ? 'Trying again' : 'Try again'} onAction={retryApps} busy={appsRetrying} />
      </Shell>
    );
  }
  if (listing === null || !OPEN_STATUSES.includes(listing.status)) {
    return (
      <Shell signedIn={!!me}>
        <Notice icon="link" title="This link isn't active" body="The organizer may have paused it, or the link has a typo." cta="Browse opportunities" href="/discover" />
      </Shell>
    );
  }

  const isTeam = listing.org_type === 'team';
  const isOwner = !!me && me === listing.owner_id;
  const roles = listing.task_roles || [];
  const positions = listing.positions || [];
  const pipeline = (listing.pipeline || []).filter((x) => x && x.label);
  const needsConsent = pipeline.some((x) => /consent/i.test(x.label));
  const signup = listingSignup(listing);
  // The organization's form is the only way to hold a spot: it becomes the
  // page's main action, ahead of applying here.
  const formFirst = !!signup && signup.only && !isOwner;
  // ...and while the apply form shows, it leads the panel (TheirForm `lead`).
  const formLeads = formFirst && !app && !appsError;
  const orgName = splitOrgSite(listing).org;
  const nonprofitHref = listingNonprofitHref(listing);
  const website = safeUrl(listing.website);
  const shift = isTeam ? null : nextShiftInfo(listing.next_session);
  const shifts = isTeam ? [] : listingShifts(listing);
  const canPickShifts = !isOwner && !!app && !!app.id && SIGNUP_STATUSES.includes(app.status);
  const mySignUps = canPickShifts ? myShiftSignUps(app).filter((x) => !x.past) : [];
  const signedUpIds = new Set(mySignUps.map((x) => x.id));
  // Upcoming sign-ups for a shift the organizer has since taken off the list.
  const orphanSignUps = mySignUps.filter((x) => !shifts.some((sh) => sh.id === x.id));
  // Signed in without an application: shifts are picked in the apply form.
  const pickInForm = !!me && !isOwner && !app && !appsError && shifts.length > 0;
  // The form's "Which role?" picker lists each role with its age and hours,
  // so while it shows, the "Roles they need" section would repeat it.
  const pickRoleInForm = !!me && !isOwner && !app && !appsError && positions.length > 1;
  // The organizer types these counts in; nobody checks them, so they're
  // credited to the organizer and never shown as fact.
  const counts = [
    listing.events_hosted ? `${listing.events_hosted} ${listing.events_hosted === 1 ? 'event' : 'events'} hosted` : '',
    listing.approx_volunteers ? `about ${listing.approx_volunteers} ${listing.approx_volunteers === 1 ? 'volunteer' : 'volunteers'} so far` : '',
  ].filter(Boolean);
  const facts = counts.length ? `The organizer reports ${counts.join(' and ')}.` : '';

  const shiftList = isTeam ? null : pickInForm ? (
    <ShiftPicker shifts={shifts} site={listing.site} spots={spots} value={shiftPick} onChange={(v) => { setShiftPick(v); saveShift(listing.id, v); }} />
  ) : (shifts.length || orphanSignUps.length) ? (
    <ShiftList
      shifts={shifts}
      orphans={orphanSignUps}
      site={listing.site}
      canPick={canPickShifts || (!me && !isOwner)}
      signedOut={!me}
      spots={spots}
      signedUpIds={signedUpIds}
      shiftBusy={shiftBusy}
      onSignUp={signUpShift}
      onCancel={cancelShift}
      calendarHref={(sh) => calendarLink(listing, sh)}
      icsHref={(sh) => icsLink(listing, sh)}
    />
  ) : (
    <div style={S(`font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>
      <span style={S(`font-weight:600;color:${C.ink}`)}>Next shift </span>
      {shift && !shift.past ? shift.label : 'No upcoming shift posted yet'}
    </div>
  );

  // Phones: the about text comes first and this bar carries the main action
  // (globals.css .vu-jl-bar). Hidden for the organizer and once there's an
  // application or a load error, since the panel then isn't a form.
  const showBar = !isOwner && !app && !appsError;
  const barShift = shift && !shift.past ? shift.label : shifts[0] ? shiftLabel(shifts[0]) : '';
  const barWhen = isTeam ? '' : barShift || 'No upcoming shift posted yet';
  function jumpToApply() {
    if (!me) { apply(); return; }
    const el = panelRef.current;
    if (!el) return;
    const still = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    const first = el.querySelector('input:not([disabled]),button:not([disabled]),textarea,select');
    if (first) first.focus({ preventScroll: true });
  }

  const panelShifts = shiftList && !pickInForm ? (
    <div style={S(`margin-top:22px;padding-top:20px;border-top:1px solid ${C.line}`)}>
      <h2 style={S(`margin:0 0 8px;font:600 17px/1.2 ${F.display};letter-spacing:-0.01em;color:${C.ink}`)}>Shifts</h2>
      {shiftList}
    </div>
  ) : null;

  return (
    <Shell signedIn={!!me}>
      <ListingHeader listing={listing} isTeam={isTeam} formNote={formFirst ? { url: signup.url, org: orgName } : null} />

      {/* data-draft: drawn from the server's copy, the browser's read still on its way. */}
      <div className={cx('vu-jl-grid', showBar && 'has-bar')} data-draft={draft ? 'true' : undefined}>
        <div className="vu-jl-main">
          {listing.mission || listing.bio || facts ? (
            <section className="vu-jl-sec">
              {listing.mission ? <p className="vu-break" style={S(`margin:0;font:400 18px/1.5 ${F.body};color:${C.ink};max-width:620px`)}>{listing.mission}</p> : null}
              {listing.bio ? <p className="vu-break" style={S(`margin:${listing.mission ? 14 : 0}px 0 0;font:400 15px/1.6 ${F.body};color:${C.ink2};max-width:620px`)}>{listing.bio}</p> : null}
              {facts ? <p style={S(`margin:${listing.mission || listing.bio ? 16 : 0}px 0 0;font:400 14px/1.4 ${F.body};color:${C.ink2};font-variant-numeric:tabular-nums`)}>{facts}</p> : null}
            </section>
          ) : null}

          {isTeam && roles.length ? (
            <Section title="Roles on this team">
              {roles.map((r) => <Row key={r.id} title={r.name} sub={r.briefing} />)}
            </Section>
          ) : null}
          {!isTeam && positions.length && !pickRoleInForm ? (
            <Section title="Roles they need">
              {positions.map((pos) => <Row key={pos.id || pos.t} title={pos.t} sub={pos.m ? String(pos.m).replace(/\s*·\s*/g, ', ') : ''} />)}
            </Section>
          ) : null}

          {!isTeam && pipeline.length ? (
            <Section title="Before your first shift">
              <ol style={S('margin:0;padding:0;list-style:none')}>
                {pipeline.map((step, i) => (
                  <li key={step.id || i} style={S(`display:flex;align-items:flex-start;gap:16px;padding:14px 0;${i ? `border-top:1px solid ${C.line}` : ''}`)}>
                    <div style={S('min-width:0;flex:1')}>
                      <div className="vu-break" style={S(`font:600 15px/1.3 ${F.body};color:${C.ink}`)}>{step.label}</div>
                      {step.note ? <div className="vu-break" style={S(`margin-top:3px;font:400 14px/1.45 ${F.body};color:${C.ink2}`)}>{step.note}</div> : null}
                    </div>
                    <span style={S(`flex:none;padding-top:2px;font:400 13px/18px ${F.body};color:${C.ink2}`)}>{KIND[step.kind] || 'Step'}</span>
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}

          {(listing.announcements || []).length ? <OrganizerNotes items={listing.announcements} /> : null}

          {!isTeam ? <WhereSection listing={listing} /> : null}

          <OrgLinks website={website} nonprofitHref={nonprofitHref} official={listing.org_class === 'official'} />
        </div>
        <aside ref={panelRef} id="vu-join-apply" className="vu-jl-panel" style={{ top: stickyTop }} aria-live="polite" aria-label={isOwner ? 'Your listing' : 'Apply'}>
          {isOwner ? (
            <StatusBlock title="You run this project" body="Volunteers apply from this page. Their applications show up in Lead." shifts={panelShifts}>
              <Button href="/lead" variant="outline" full>Open Lead</Button>
            </StatusBlock>
          ) : app ? (
            <AppStatus app={app} listing={listing} busy={busy} hasShifts={shifts.length > 0} onWithdraw={withdraw} onApplyAgain={applyAgain} shifts={panelShifts} wantShift={blockedShift} />
          ) : appsError ? (
            <StatusBlock title="Couldn't load your application" body="We can't tell whether you already applied here. Check your connection and try again." shifts={panelShifts}>
              <Button variant="outline" icon="refresh" full onClick={retryApps} disabled={appsRetrying} busy={appsRetrying}>
                {appsRetrying ? 'Trying again' : 'Try again'}
              </Button>
            </StatusBlock>
          ) : (
            <>
            {formLeads ? <TheirForm signup={signup} org={orgName} isOwner={false} lead /> : null}
            <ApplyForm
              me={me}
              afterForm={formLeads}
              needsConsent={needsConsent}
              positions={positions}
              position={position}
              posError={posError}
              onPosition={(t) => { setPosition(t); setPosError(''); }}
              note={note}
              onNote={setNote}
              busy={busy}
              onApply={apply}
              signinHref={signinHref(id)}
              shiftPicker={pickInForm ? shiftList : panelShifts}
            />
            </>
          )}
          {signup && !formLeads ? <TheirForm signup={signup} org={orgName} isOwner={isOwner} applied={!!app} /> : null}
          {!isOwner ? <ListingActions listing={listing} app={app} /> : null}
        </aside>
      </div>
      {showBar ? (
        <div className="vu-jl-bar" data-off={submitInView ? 'true' : undefined}>
          <span className="vu-jl-bar-meta"><b>{listing.name}</b>{barWhen}</span>
          {formFirst ? (
            <Button href={signup.url} target="_blank" rel="noreferrer noopener" variant="primary" icon="external">
              Fill out their form{NEW_TAB}
            </Button>
          ) : (
            <Button variant="primary" onClick={jumpToApply}>{me ? 'Apply to join' : 'Sign up to apply'}</Button>
          )}
        </div>
      ) : null}
    </Shell>
  );
}

/* ---- header and photo ---------------------------------------------------- */

/* The organizer as a card's line A shows it: the organization's name is the
   first part of the stored site ("Riverbend Food Bank, 3737 Waldemere Ave,
   Rivertown"), and the address is what follows. A remote site names no one.
   Student projects carry no organization, so their whole site is the address. */
const NO_PLACE_RE = /^(remote|online|virtual)\b/i;
function splitOrgSite(listing) {
  const site = String((listing && (listing.site || listing.location)) || '').trim();
  const official = !!listing && listing.org_class === 'official';
  const parts = site.split(',').map((x) => x.trim()).filter(Boolean);
  if (!official || !parts.length || NO_PLACE_RE.test(parts[0])) return { org: '', address: site };
  return { org: parts[0], address: parts.slice(1).join(', ') };
}

/* Title, one meta line ("Riverbend Food Bank (check) · Food and hunger") and
   the address. A listing with its own photo shows it under the header. The
   dates live in one place, the panel's Shifts list, so the header never
   repeats them. */
function ListingHeader({ listing, isTeam, formNote = null }) {
  const cause = listing.cause ? causeOf(listing.cause) : null;
  const photo = photoFor(listing, { seed: false });
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [photo && photo.src]);
  const hasPhoto = !!photo && !broken;
  const official = listing.org_class === 'official';
  const { org, address } = splitOrgSite(listing);
  const check = listing.verified ? (
    <>
      <span style={S('display:inline-block;margin-left:4px;vertical-align:-2px')} title={VERIFIED_LABEL}>
        <Icon name="badge-check" size={15} color={C.confirmed} />
      </span>
      <span style={S(SR_ONLY)}> Verified organization. {VERIFIED_NOTE}</span>
    </>
  ) : null;
  // An organization with no name on file still gets its check, as text.
  const who = !official ? (
    <span key="who">Student project</span>
  ) : org ? (
    <span key="who" style={S('white-space:nowrap')}>{org}{check}</span>
  ) : listing.verified ? (
    <span key="who" style={S('white-space:nowrap')}>Verified organization{check}</span>
  ) : null;
  const tokens = [
    who,
    isTeam ? <span key="kind">Task team</span> : null,
    cause ? <span key="cause">{causeKey(listing.cause) === 'other' ? listing.cause : cause.label}</span> : null,
  ].filter(Boolean);
  return (
    <>
      <header style={S(hasPhoto ? 'margin-bottom:24px' : '')}>
        <h1 className="vu-break vu-jl-title" style={S(`margin:0;font:700 40px/1.05 ${F.display};letter-spacing:-0.03em;color:${C.ink}`)}>{listing.name}</h1>
        {/* Inline text so a long line wraps like a sentence; the no-break space
            keeps each dot on the end of the line it follows. */}
        {tokens.length ? (
          <p style={S(`margin:12px 0 0;font:500 15px/22px ${F.body};color:${C.ink2}`)}>
            {tokens.map((t, i) => (
              <span key={t.key}>
                {i ? <span className="vu-sep" aria-hidden="true">{'\u00a0· '}</span> : null}
                {t}
              </span>
            ))}
          </p>
        ) : null}
        {address ? (
          <p className="vu-break" style={S(`margin:${tokens.length ? 6 : 12}px 0 0;font:400 15px/20px ${F.body};color:${C.ink2}`)}>{address}</p>
        ) : null}
        {formNote ? (
          <p className="vu-break" data-form-note="" style={S(`margin:14px 0 0;font:400 15px/22px ${F.body};color:${C.ink}`)}>
            {formNote.org || 'The organizer'} holds spots through {formNote.org ? 'its' : 'their'} own form.{' '}
            <a href={formNote.url} target="_blank" rel="noreferrer noopener" className="vu-link-ul" style={S(`display:inline-flex;align-items:center;gap:5px;font-weight:600;color:${C.ink}`)}>
              Fill out their form
              <Icon name="external" size={14} />
              {NEW_TAB}
            </a>
          </p>
        ) : null}
      </header>
      {hasPhoto ? (
        <div className="vu-jl-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.src} alt="" onError={() => setBroken(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: photo.pos, display: 'block' }} />
        </div>
      ) : null}
    </>
  );
}

/* The page as the server draws it: the real header, the about text and a
   panel with the next date that waits for the visitor's application. The
   panel never offers the form here, so a member who already applied doesn't
   see "Apply" flash before their status. Without JS the panel links to sign-in. */
function PreviewShell({ id, preview }) {
  const isTeam = preview.org_type === 'team';
  const next = signupHref(id);
  return (
    <>
      <ListingHeader listing={preview} isTeam={isTeam} />
      <div className="vu-jl-grid">
        <div className="vu-jl-main">
          {preview.mission || preview.bio ? (
            <section className="vu-jl-sec">
              {preview.mission ? <p className="vu-break" style={S(`margin:0;font:400 18px/1.5 ${F.body};color:${C.ink};max-width:620px`)}>{preview.mission}</p> : null}
              {preview.bio ? <p className="vu-break" style={S(`margin:${preview.mission ? 14 : 0}px 0 0;font:400 15px/1.6 ${F.body};color:${C.ink2};max-width:620px`)}>{preview.bio}</p> : null}
            </section>
          ) : null}
        </div>
        <aside className="vu-jl-panel" aria-label="Apply" aria-busy="true">
          {!isTeam ? (
            <div style={S(`font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>
              <span style={S(`font-weight:600;color:${C.ink}`)}>Next shift </span>
              {preview.nextDate || 'No upcoming shift posted yet'}
            </div>
          ) : null}
          <div role="status" className="vu-jl-wait" style={S(`margin-top:${isTeam ? 0 : 16}px;font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>Loading</div>
          <noscript>
            <style>{'.vu-jl-wait{display:none}'}</style>
            <div style={S('margin-top:16px')}>
              <Button href={next} variant="primary" size="lg" full>Sign up to apply</Button>
            </div>
          </noscript>
        </aside>
      </div>
    </>
  );
}

/* ---- action panel -------------------------------------------------------- */

/* Account creation and sign-in from this page. Both come back to the listing
   (Auth keeps ?next= through sign-up, onboarding and sign-in). */
function signupHref(id, shiftId = '') {
  const back = shiftId ? `/join/${id}?shift=${encodeURIComponent(shiftId)}` : `/join/${id}`;
  return `/signup?intent=join&next=${encodeURIComponent(back)}`;
}
function signinHref(id) {
  return `/signin?next=${encodeURIComponent(`/join/${id}`)}`;
}

const NEW_TAB = <span style={S(SR_ONLY)}> (opens in a new tab)</span>;

/* The organization's own sign-up form. When it's the only way they hold a
   spot, it is the panel's first and main action (`lead`, above the apply form)
   for a visitor who hasn't applied, and stays a full-width button under the
   application status after they apply. Otherwise it's a link to fill out as
   well, under the panel's main action. */
function TheirForm({ signup, org, isOwner, lead = false, applied = false }) {
  const who = org || 'The organizer';
  const its = org ? 'its' : 'their';
  if (signup.only) {
    const body = isOwner
      ? 'Volunteers are told to fill out your form first. They apply here too so their shifts and hours are tracked.'
      : applied
        ? `${who} only saves a spot for people who fill out ${its} own form. If you haven't yet, fill it out now.`
        : `${who} only saves a spot for people who fill out ${its} own form. Fill it out first, then apply here so your shifts and hours are tracked.`;
    return (
      <div data-their-form="only" style={S(lead ? `padding-bottom:22px;margin-bottom:22px;border-bottom:1px solid ${C.line}` : `margin-top:22px;padding-top:18px;border-top:1px solid ${C.line}`)}>
        {lead ? (
          <h2 style={S(`margin:0;font:600 20px/1.2 ${F.display};letter-spacing:-0.012em;color:${C.ink}`)}>Fill out their form first</h2>
        ) : (
          <h3 style={S(`margin:0;font:600 16px/1.3 ${F.body};color:${C.ink}`)}>Spots are held through their form</h3>
        )}
        <p className="vu-break" style={S(`margin:6px 0 0;font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>{body}</p>
        <div style={S('margin-top:14px')}>
          <Button
            href={signup.url}
            target="_blank"
            rel="noreferrer noopener"
            variant={isOwner ? 'outline' : 'primary'}
            size={lead ? 'lg' : 'md'}
            full
            icon="external"
            data-apply-submit={lead ? '' : undefined}
          >
            Fill out their form{NEW_TAB}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div data-their-form="also" style={S(`margin-top:22px;padding-top:18px;border-top:1px solid ${C.line}`)}>
      <p className="vu-break" style={S(`margin:0;font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>
        {isOwner ? 'Volunteers see a link to your own sign-up form here.' : `${who} also takes sign-ups on ${org ? 'its' : 'their'} own form.`}
      </p>
      <a href={signup.url} target="_blank" rel="noreferrer noopener" className="vu-link-ul" style={S(`margin-top:8px;display:inline-flex;align-items:center;gap:6px;font:600 15px/1.2 ${F.body};color:${C.ink}`)}>
        Also fill out their form
        <Icon name="external" size={15} />
        {NEW_TAB}
      </a>
    </div>
  );
}

/* The organization's website and its nonprofit page here, as plain links.
   Their own sign-up form sits in the panel, next to Apply (TheirForm). */
function OrgLinks({ website, nonprofitHref, official }) {
  if (!website && !nonprofitHref) return null;
  const LINK = `display:inline-flex;align-items:center;gap:6px;font:600 15px/1.2 ${F.body};color:${C.ink}`;
  return (
    <section className="vu-jl-sec" aria-label="Links">
      <ul style={S('margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:14px')}>
        {website ? (
          <li>
            <a href={website} target="_blank" rel="noreferrer noopener" className="vu-link-ul" style={S(LINK)}>
              Visit their website
              <Icon name="external" size={15} />
              {NEW_TAB}
            </a>
          </li>
        ) : null}
        {nonprofitHref ? (
          <li>
            <Link href={nonprofitHref} className="vu-link-ul" style={S(LINK)}>
              {official ? 'See their nonprofit page' : 'See the partner nonprofit'}
              <Icon name="arrow-right" size={15} />
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

/* afterForm: the organization's own form holds the spot and sits above this
   one, so applying here reads as the second step and its button steps down
   to the outline style. */
function ApplyForm({ me, afterForm = false, needsConsent, positions, position, posError, onPosition, note, onNote, busy, onApply, signinHref: signin, shiftPicker }) {
  return (
    <div>
      <h2 style={S(`margin:0;font:600 20px/1.2 ${F.display};letter-spacing:-0.012em;color:${C.ink}`)}>{afterForm ? 'Then apply here' : 'Applications are open'}</h2>
      <p style={S(`margin:6px 0 0;font:400 14px/1.45 ${F.body};color:${C.ink2}`)}>
        {afterForm
          ? (me ? 'Your shifts and hours are tracked here, and the organizer replies in the app.' : "Create a free account to apply, so your shifts and hours are tracked. You'll come right back here to finish.")
          : (me ? 'The organizer reads each one and replies in the app.' : "Create a free account to apply. You'll come right back here to finish.")}
      </p>
      {needsConsent ? (
        <p style={S(`margin:8px 0 0;font:400 14px/1.45 ${F.body};color:${C.ink2}`)}>
          If you're under 16, you'll need a parent's OK on the consent form before your first shift.
        </p>
      ) : null}

      {me && positions.length > 1 ? (
        <fieldset style={S('margin:20px 0 0;padding:0;border:0;min-width:0')}>
          <legend id="vu-join-role-label" style={S(`padding:0;font:600 14px/1.3 ${F.body};color:${C.ink}`)}>Which role?</legend>
          <div role="radiogroup" aria-labelledby="vu-join-role-label" style={S(OPTION_LIST)}>
            {positions.map((pos) => (
              <Option
                key={pos.id || pos.t}
                on={position === pos.t}
                onClick={() => onPosition(pos.t)}
                title={pos.t}
                sub={pos.m ? String(pos.m).replace(/\s*·\s*/g, ', ') : ''}
              />
            ))}
          </div>
          {posError ? <div className="vu-err" role="alert">{posError}</div> : null}
        </fieldset>
      ) : null}

      {shiftPicker}

      {me ? (
        <label style={S('display:block;margin-top:20px')}>
          <span style={S('display:flex;align-items:baseline;justify-content:space-between;gap:12px')}>
            <span style={S(`font:600 14px/1.3 ${F.body};color:${C.ink}`)}>Note to the organizer (optional)</span>
            <span className="vu-count">{note.length}/{NOTE_MAX}</span>
          </span>
          <textarea
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => onNote(e.target.value)}
            placeholder="e.g. Free most Saturday afternoons"
            rows={3}
            className={cx('vu-input', H.input)}
            style={S(`display:block;box-sizing:border-box;margin-top:8px;width:100%;padding:12px 14px;border-radius:${R.control};border:1px solid ${C.line2};background:#fff;font:400 15px/1.5 ${F.body};color:${C.ink};resize:vertical`)}
          />
        </label>
      ) : null}

      <div style={S('margin-top:20px')}>
        <Button variant={afterForm ? 'outline' : 'primary'} size="lg" full onClick={onApply} busy={busy} data-apply-submit="">
          {busy ? 'Applying' : me ? 'Apply to join' : 'Sign up to apply'}
        </Button>
      </div>
      {!me && signin ? (
        <p style={S(`margin:12px 0 0;text-align:center;font:400 14px/1.4 ${F.body};color:${C.ink2}`)}>
          Have an account? <Link href={signin} className="vu-link-ul" style={S(`font-weight:600;color:${C.ink}`)}>Sign in</Link>
        </p>
      ) : null}
    </div>
  );
}

/* Signed in, no application yet: pick one shift to sign up for with the
   application. Optional, and changeable later. */
/* "Full", "1 spot left", "4 spots left", or '' when the shift has no limit
   or the count couldn't be read. */
function spotsText(spot) {
  if (!spot || spot.cap === null) return '';
  if (spot.full) return 'Full';
  return `${spot.left} ${spot.left === 1 ? 'spot' : 'spots'} left`;
}

function ShiftPicker({ shifts, site, spots, value, onChange }) {
  const [all, setAll] = useState(false);
  const shown = all ? shifts : shifts.filter((sh, i) => i < SHIFT_PREVIEW || sh.id === value);
  return (
    <div style={S('margin-top:20px')}>
      <div id="vu-join-shift-label" style={S(`font:600 14px/1.3 ${F.body};color:${C.ink}`)}>
        {shifts.length === 1 ? 'Shift' : 'Which shift?'} <span style={S(`font-weight:400;color:${C.ink2}`)}>(optional)</span>
      </div>
      <div role="radiogroup" aria-labelledby="vu-join-shift-label" style={S(OPTION_LIST)}>
        {shown.map((sh) => {
          const text = shiftText(sh, site);
          const spot = spots ? spots[sh.id] : null;
          const full = !!(spot && spot.full);
          const left = spotsText(spot);
          return (
            <Option
              key={sh.id}
              on={value === sh.id && !full}
              disabled={full}
              onClick={() => onChange(value === sh.id ? '' : sh.id)}
              label={`${shiftPhrase(sh)}${left ? `, ${left}` : ''}`}
              lead={text.dated ? <DateBlock date={sh.d} size="sm" month /> : null}
              title={text.title}
              sub={[text.sub, left].filter(Boolean).join(', ')}
            />
          );
        })}
      </div>
      <MoreToggle total={shifts.length} shown={shown.length} all={all} onToggle={() => setAll((v) => !v)} />
      <div style={S(`margin-top:8px;font:400 13px/1.4 ${F.body};color:${C.ink2}`)}>You can change shifts after you apply.</div>
    </div>
  );
}

/* The words beside a shift's DateBlock. The block already carries the
   weekday, day and month, so the row leads with the time and adds the place
   only when it differs from the listing's site. A shift whose date the block
   can't read keeps its date as the title. */
function shiftText(sh, site) {
  const time = formatShiftTime(sh.t);
  const where = sh.loc && sh.loc !== site ? sh.loc : '';
  if (!dateParts(sh.d)) {
    return { dated: false, title: String(sh.d || 'Date not set'), sub: [time, where].filter(Boolean).join(', ') };
  }
  if (time) return { dated: true, title: time, sub: where };
  return { dated: true, title: where || 'Time not set', sub: '' };
}

/* Role and shift choices: plain rows split by dividers, no tiles. */
const OPTION_LIST = `margin-top:8px;display:flex;flex-direction:column;border-bottom:1px solid ${C.line}`;

/* A selectable row (role or shift): radio semantics, the radio on the right.
   Chosen reads as ink text and a filled radio. */
function Option({ on, onClick, title, sub, lead, label, disabled = false }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx('vu-jl-option', H.press)}
      data-on={on ? 'true' : 'false'}
      style={S(`display:flex;align-items:center;gap:12px;width:100%;min-height:56px;text-align:left;padding:${lead ? 10 : 14}px 0;margin:0;border:0;border-top:1px solid ${C.line};border-radius:0;background:transparent;cursor:${disabled ? 'not-allowed' : 'pointer'};color:${C.ink}`)}
    >
      {lead}
      <span style={S('min-width:0;flex:1')}>
        <span className="vu-break" style={S(`display:block;font:${on ? 650 : 500} 15px/1.25 ${F.body};color:${on ? C.ink : C.ink2}`)}>{title}</span>
        {sub ? <span className="vu-break" style={S(`display:block;margin-top:2px;font:400 13.5px/1.35 ${F.body};color:${C.ink2}`)}>{sub}</span> : null}
      </span>
      <span aria-hidden="true" className="vu-jl-radio" style={S(`flex:none;width:20px;height:20px;border-radius:50%;border:${on ? `6px solid ${C.ink}` : `1.5px solid ${C.line2}`};background:#fff;box-sizing:border-box`)} />
    </button>
  );
}

function MoreToggle({ total, shown, all, onToggle }) {
  if (total <= SHIFT_PREVIEW) return null;
  return (
    <button type="button" onClick={onToggle} aria-expanded={all} className="vu-link-ul" style={S(`margin-top:12px;padding:0;border:0;background:none;cursor:pointer;font:600 14px/1.2 ${F.body}`)}>
      {all ? 'Show fewer shifts' : `Show all ${total} shifts`}
      {!all && shown < total ? <span style={S(SR_ONLY)}>, {total - shown} hidden</span> : null}
    </button>
  );
}

/* The listing's upcoming shifts. An applicant signs up or cancels from the
   row; anyone else just sees the dates. Past shifts are never listed. */
function ShiftList({ shifts, orphans, site, canPick, signedOut = false, spots = null, signedUpIds, shiftBusy, onSignUp, onCancel, calendarHref, icsHref = null }) {
  const [all, setAll] = useState(false);
  const shown = all ? shifts : shifts.filter((sh, i) => i < SHIFT_PREVIEW || signedUpIds.has(sh.id));
  return (
    <div>
      <ul style={S('margin:0;padding:0;list-style:none')}>
        {shown.map((sh, i) => (
          <ShiftRow
            key={sh.id}
            first={i === 0}
            shift={sh}
            site={site}
            canPick={canPick}
            signedOut={signedOut}
            spot={spots ? spots[sh.id] : null}
            signedUp={signedUpIds.has(sh.id)}
            busy={shiftBusy === sh.id}
            disabled={!!shiftBusy}
            calHref={signedUpIds.has(sh.id) && calendarHref ? calendarHref(sh) : null}
            icsHref={signedUpIds.has(sh.id) && icsHref ? icsHref(sh) : null}
            onSignUp={() => onSignUp(sh)}
            onCancel={() => onCancel(sh)}
          />
        ))}
        {orphans.map((sh) => (
          <ShiftRow
            key={sh.id}
            shift={sh}
            site={site}
            canPick
            signedUp
            removed
            busy={shiftBusy === sh.id}
            disabled={!!shiftBusy}
            onCancel={() => onCancel(sh)}
          />
        ))}
      </ul>
      <MoreToggle total={shifts.length} shown={shown.length} all={all} onToggle={() => setAll((v) => !v)} />
    </div>
  );
}

function ShiftRow({ shift, site, canPick, signedOut = false, spot = null, signedUp, removed, busy, disabled, onSignUp, onCancel, calHref = null, icsHref = null, first = false }) {
  const label = shiftPhrase(shift);
  const text = shiftText(shift, site);
  const full = !signedUp && !!(spot && spot.full);
  const left = signedUp ? '' : spotsText(spot);
  return (
    <li data-shift-id={shift.id} style={S(`display:flex;align-items:center;gap:12px;padding:10px 0;${first ? '' : `border-top:1px solid ${C.line}`}`)}>
      {text.dated ? <DateBlock date={shift.d} size="sm" month tone={signedUp ? 'white' : 'line'} className={signedUp ? 'vu-jl-date-on' : undefined} /> : null}
      <div style={S('min-width:0;flex:1')}>
        <div className="vu-break" style={S(`font:600 15px/1.25 ${F.body};color:${C.ink}`)}>{text.title}</div>
        {text.sub ? <div className="vu-break" style={S(`margin-top:2px;font:400 13.5px/1.35 ${F.body};color:${C.ink2}`)}>{text.sub}</div> : null}
        {left && !full ? <div style={S(`margin-top:2px;font:400 13.5px/1.35 ${F.body};color:${C.ink2};font-variant-numeric:tabular-nums`)}>{left}</div> : null}
        {removed ? <div style={S(`margin-top:3px;font:500 13px/1.35 ${F.body};color:${C.emberDeep}`)}>The organizer took this shift off the list.</div> : null}
      </div>
      {canPick ? (
        signedUp ? (
          <div style={S('flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:6px')}>
            <StatusText tone="ok">Signed up</StatusText>
            {calHref ? (
              <a href={calHref} target="_blank" rel="noopener noreferrer" className="vu-link-ul" style={S(`font:600 13px/1.2 ${F.body}`)}>
                Add to calendar
                <span style={S(SR_ONLY)}> for {label} (opens Google Calendar in a new tab)</span>
              </a>
            ) : null}
            {icsHref ? (
              <a href={icsHref} download="volunteeru-shift.ics" className="vu-link-ul" style={S(`font:600 13px/1.2 ${F.body}`)}>
                Apple or Outlook
                <span style={S(SR_ONLY)}> calendar file for {label}</span>
              </a>
            ) : null}
            <button type="button" onClick={onCancel} disabled={disabled} aria-label={`Cancel sign-up for ${label}`} data-busy={busy ? 'true' : undefined} className="vu-link-ul" style={S(`padding:0;border:0;background:none;cursor:pointer;font:600 13px/1.2 ${F.body};color:${C.emberDeep}`)}>
              {busy ? 'Canceling' : 'Cancel sign-up'}
            </button>
          </div>
        ) : full ? (
          <StatusText tone="mute">Full</StatusText>
        ) : signedOut ? (
          <Button variant="outline" size="sm" onClick={onSignUp} disabled={disabled} aria-label={`Sign up for ${label}`}>
            Sign up
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onSignUp} disabled={disabled} busy={busy} aria-label={`Sign up for ${label}`}>
            {busy ? 'Signing up' : 'Sign up'}
          </Button>
        )
      ) : null}
    </li>
  );
}

/* Save, Share and, once there's an application, a thread with the organizer. */
const THREAD_STATUSES = ['pending', 'accepted', 'waitlisted'];
function ListingActions({ listing, app }) {
  const { state } = useSnapshot();
  const saved = Array.isArray(state.saved) && state.saved.includes(listing.id);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 2400);
    return () => clearTimeout(t);
  }, [copied]);

  function save() {
    const now = toggleSaved(listing.id);
    toast({ title: now ? 'Saved' : 'Removed from saved', message: listing.name, tone: now ? 'ok' : 'brand', actionLabel: 'Undo', onAction: () => toggleSaved(listing.id) });
  }

  async function share() {
    const url = `${window.location.origin}/join/${listing.id}`;
    if (navigator.share && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: listing.name, url });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    if (await copyText(url)) {
      setCopied(true);
      toast({ title: 'Link copied', message: listing.name, tone: 'ok' });
    } else {
      toast({ title: "Couldn't copy", message: `Copy this link yourself: ${url}`, tone: 'warn' });
    }
  }

  function message() {
    openModal({
      title: listing.name,
      subtitle: 'Message the organizer',
      Body: () => <MessageThread applicationId={app.id} recipientId={listing.owner_id} recipientName={listing.name} />,
    });
  }

  const canMessage = !!(app && app.id && THREAD_STATUSES.includes(app.status));
  return (
    <div style={S(`margin-top:22px;padding-top:18px;border-top:1px solid ${C.line};display:flex;flex-wrap:wrap;gap:10px`)}>
      {canMessage ? <Button variant="outline" size="sm" icon="message" onClick={message}>Message the organizer</Button> : null}
      <Button variant="outline" size="sm" icon="bookmark" onClick={save} aria-pressed={saved} aria-label={saved ? `Remove ${listing.name} from saved` : `Save ${listing.name}`}>
        {saved ? 'Saved' : 'Save'}
      </Button>
      <Button variant="outline" size="sm" icon={copied ? 'check' : 'share'} onClick={share}>
        {copied ? 'Link copied' : 'Share'}
      </Button>
    </div>
  );
}

const APP_TONE = { accepted: 'ok', waitlisted: 'mute', declined: 'bad', withdrawn: 'mute', pending: 'wait' };

function AppStatus({ app, listing, busy, hasShifts, onWithdraw, onApplyAgain, shifts, wantShift = null }) {
  const role = app.position ? ` as ${app.position}` : '';
  const tone = APP_TONE[app.status] || 'wait';
  // The shift they came back to sign up for, when this status blocks it.
  const want = wantShift ? shiftPhrase(wantShift) : '';
  if (app.status === 'accepted') {
    return (
      <StatusBlock tone={tone} shifts={shifts} title="Accepted" body={`You're on ${listing.name}${role}. ${hasShifts ? 'Sign up for the shifts you can make.' : 'Your role and next steps are on Home.'}`}>
        <Button href="/app" variant="outline" full>Go to Home</Button>
        <WithdrawLink onClick={onWithdraw} disabled={busy} />
      </StatusBlock>
    );
  }
  if (app.status === 'waitlisted') {
    return (
      <StatusBlock tone={tone} shifts={shifts} title="Waitlisted" body={`${listing.name} put you on the waitlist${role}. If a spot opens and they accept you, it shows up on Home.${want ? ` Shift sign-up for ${want} opens once they accept you.` : ''}`}>
        <Button href="/app" variant="outline" full>Go to Home</Button>
        <WithdrawLink onClick={onWithdraw} disabled={busy} />
      </StatusBlock>
    );
  }
  if (app.status === 'declined') {
    return (
      <StatusBlock tone={tone} shifts={shifts} title="Not accepted" body={`${listing.name} passed on your application${want ? `, so you can't sign up for ${want}` : ''}. Other opportunities are open on Discover.`}>
        <Button href="/discover" variant="outline" full>Find opportunities</Button>
        <HomeLink />
      </StatusBlock>
    );
  }
  if (app.status === 'withdrawn') {
    return (
      <StatusBlock tone={tone} shifts={shifts} title="Withdrawn" body={want ? `You withdrew this application. Apply again to sign up for ${want}.` : 'You withdrew this application. You can apply again.'}>
        <Button variant="primary" size="lg" full onClick={onApplyAgain} busy={busy}>
          {busy ? 'Applying' : 'Apply again'}
        </Button>
        <HomeLink />
      </StatusBlock>
    );
  }
  return (
    <StatusBlock tone={tone} shifts={shifts} title="Applied" body={`You applied${role}. Waiting to hear back. Their reply shows up in Notifications and on your Profile.${hasShifts && app.id ? ' You can sign up for shifts now.' : ''}`}>
      <Button href="/app" variant="outline" full>Go to Home</Button>
      {app.id ? <WithdrawLink onClick={onWithdraw} disabled={busy} /> : null}
    </StatusBlock>
  );
}

/* The panel's heading. A status shows as its pill; the owner gets plain text. */
function StatusBlock({ tone, title, body, shifts, children }) {
  return (
    <div>
      <h2 tabIndex={-1} data-status-focus="" style={S(`margin:0;font:600 20px/1.2 ${F.display};letter-spacing:-0.012em;color:${C.ink};outline-offset:4px`)}>
        {tone ? <StatusPill tone={tone} icon={tone !== 'mute'}>{title}</StatusPill> : title}
      </h2>
      <p className="vu-break" style={S(`margin:12px 0 0;font:400 15px/1.5 ${F.body};color:${C.ink}`)}>{body}</p>
      {shifts}
      <div style={S(`margin-top:${shifts ? 22 : 18}px;display:flex;flex-direction:column;align-items:center;gap:12px`)}>{children}</div>
    </div>
  );
}

function HomeLink() {
  return (
    <Link href="/app" className="vu-link-ul" style={S(`padding:4px 0;font:600 14px/1.2 ${F.body}`)}>Go to Home</Link>
  );
}

function WithdrawLink({ onClick, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="vu-link-ul" style={S(`padding:4px 0;border:0;background:none;cursor:pointer;font:600 14px/1.2 ${F.body};color:${C.emberDeep}`)}>
      Withdraw application
    </button>
  );
}

/* ---- details ------------------------------------------------------------- */

function Section({ title, children }) {
  return (
    <section className="vu-jl-sec">
      <h2 style={S(`margin:0 0 6px;font:650 22px/1.15 ${F.display};letter-spacing:-0.02em;color:${C.ink}`)}>{title}</h2>
      {children}
    </section>
  );
}

function Row({ title, sub }) {
  return (
    <div className="vu-jl-row" style={S('padding:14px 0')}>
      <div className="vu-break" style={S(`font:600 15px/1.3 ${F.body};color:${C.ink}`)}>{title}</div>
      {sub ? <div className="vu-break" style={S(`margin-top:3px;font:400 14px/1.45 ${F.body};color:${C.ink2}`)}>{sub}</div> : null}
    </div>
  );
}

/** "Sat, Oct 17" for an organizer post ("Sat, Oct 17, 2025" in another year), '' if unreadable. */
/* The organizer's posts (listings.announcements, newest first), read-only. */
function OrganizerNotes({ items }) {
  return (
    <Section title="From the organizer">
      {items.map((an) => (
        <div key={an.id} className="vu-jl-row" style={S('padding:14px 0')}>
          <div className="vu-break" style={S(`font:400 15px/1.55 ${F.body};color:${C.ink};white-space:pre-wrap`)}>{an.body}</div>
          {whenLabel(an.at) ? <div style={S(`margin-top:6px;font:400 13px/1.2 ${F.body};color:${C.ink2};font-variant-numeric:tabular-nums`)}>{whenLabel(an.at)}</div> : null}
        </div>
      ))}
    </Section>
  );
}

/* Where the shift happens: the address on a small real map (stored or
   geocoded coordinates), with Directions and Open in Maps links. An address
   the geocoder can't find shows as text with the links. */
function WhereSection({ listing }) {
  const remote = listing.delivery === 'remote';
  const address = String(listing.site || listing.location || '').trim();
  if (!address && !remote) return null;
  if (remote) {
    return (
      <Section title="Where you'll be">
        <p style={S(`margin:8px 0 0;font:400 15px/1.5 ${F.body};color:${C.ink2}`)}>
          Online. The organizer sends the link after you're accepted.
        </p>
      </Section>
    );
  }
  return (
    <Section title="Where you'll be">
      <AddressMap address={address} lat={listing.lat} lng={listing.lng} />
      <MilesFromYou address={address} lat={listing.lat} lng={listing.lng} />
    </Section>
  );
}

/* "7.7 mi from you", when the visitor shared a location and the place can be found. */
function MilesFromYou({ address, lat, lng }) {
  const from = pointOf(useLocation());
  const stored = storedPoint({ lat, lng });
  const [found, setFound] = useState(null);
  useEffect(() => {
    let live = true;
    if (stored || !from || !address) return undefined;
    geocode(address).then((p) => live && setFound(p ? { lat: p.lat, lng: p.lng } : null));
    return () => {
      live = false;
    };
    // stored and from are derived from these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, lat, lng, Boolean(from)]);
  const to = stored || found;
  const mi = from && to ? milesLabel(distanceMiles(from, to)) : '';
  if (!mi) return null;
  return <p style={S(`margin:8px 0 0;font:400 14px/1.45 ${F.body};color:${C.ink2}`)}>{mi} from you</p>;
}

/* ---- other states -------------------------------------------------------- */

/** "Oct 16" for an archive stamp ("Oct 16, 2025" in another year), '' if unreadable. */
function archivedOn(closedAt) {
  const d = new Date(closedAt);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

function hrsText(n) {
  const h = Math.round(Number(n || 0) * 10) / 10;
  return `${h} ${h === 1 ? 'hr' : 'hrs'}`;
}

/* What a member sees on the link of a project the organizer archived: its
   name from the copy saved on their application, when it closed, and their
   hours there, counted the way Home and Profile count them: their own log
   (confirmed values from the organizer's assignment.confirmedHours) plus the
   shifts the organizer posted in Attendance, which count as confirmed. */
function ArchivedProject({ app }) {
  const name = (app.listings && app.listings.name) || 'This project';
  const on = archivedOn(app.assignment.closedAt);
  const own = memberHourEntries(app);
  const posted = (Array.isArray(app.assignment.attendanceHours) ? app.assignment.attendanceHours : [])
    .filter((h) => h && h.id && Number(h.hrs) > 0);
  const sum = (rows) => rows.reduce((a, h) => a + (Number(h.hrs) || 0), 0);
  const total = sum(own) + sum(posted);
  const ok = sum(own.filter((h) => h.confirmed)) + sum(posted);
  let hoursLine = "You didn't log hours there.";
  if (total > 0) {
    if (ok <= 0) hoursLine = `You logged ${hrsText(total)} there. They stay on your profile.`;
    else if (ok >= total) hoursLine = `You have ${hrsText(total)} there, all confirmed by the organizer. They stay on your profile.`;
    else hoursLine = `You have ${hrsText(total)} there and the organizer confirmed ${hrsText(ok)}. They stay on your profile.`;
  }
  const closed = on ? `The organizer archived it on ${on}, so this link is closed.` : 'The organizer archived it, so this link is closed.';
  return <Notice icon="folder" title={`${name} was archived`} body={`${closed} ${hoursLine}`} cta="See your projects" href="/crew" />;
}

/* A page-level state (old link, inactive link, archived project). */
function Notice({ icon, title, body, cta, href, onAction, busy = false }) {
  return (
    <div style={S('max-width:480px;margin:0 auto;padding:72px 0 40px;text-align:center')}>
      <span aria-hidden="true" style={S(`display:inline-grid;place-items:center;width:56px;height:56px;border-radius:50%;background:${C.mist};color:${C.ink2}`)}>
        <Icon name={icon} size={24} />
      </span>
      <h1 className="vu-break" style={S(`margin:18px 0 0;font:650 28px/1.15 ${F.display};letter-spacing:-0.02em;color:${C.ink}`)}>{title}</h1>
      <p style={S(`margin:10px 0 0;font:400 15px/1.55 ${F.body};color:${C.ink2}`)}>{body}</p>
      <div style={S('margin-top:22px')}>
        {onAction ? (
          <Button variant="primary" icon="refresh" onClick={onAction} disabled={busy} busy={busy}>{cta}</Button>
        ) : (
          <Button href={href} variant="primary">{cta}</Button>
        )}
      </div>
    </div>
  );
}

/* ---- page frame ---------------------------------------------------------- */

/* Join-page rules the shared .vu-jl-* classes in globals.css don't cover:
   option rows keep their divider on hover (the radio darkens instead), and
   once the panel drops under the photo it is a plain section, not a box.
   On tablets the panel leads; on phones with the action bar it follows the
   about text, and the page leaves room at the bottom for the bar. */
const JOIN_CSS = `
.vu-jl-panel .vu-jl-option[data-on="false"]:hover { border-color:${C.line} !important; }
@media (hover:hover) {
  .vu-jl-option[data-on="false"]:hover .vu-jl-radio { border-color:${C.ink3} !important; }
}
@media (max-width:960px) {
  .vu-jl-grid > .vu-jl-panel { order:-1; border:0; border-radius:0; padding:0 0 32px; background:transparent; border-bottom:1px solid ${C.line}; }
  .vu-jl-grid { row-gap:32px; }
}
@media (max-width:720px) {
  .vu-jl-grid > .vu-jl-panel { padding-bottom:28px; }
  .vu-jl-grid { row-gap:28px; }
  .vu-jl-grid.has-bar > .vu-jl-panel { order:2; padding:28px 0 0; border-bottom:0; border-top:1px solid ${C.line}; }
  .vu-jl-page:has(.vu-jl-bar) { padding-bottom:calc(76px + env(safe-area-inset-bottom, 0px)); }
  .vu-jl-bar[data-off], .vu-jl-page:has(.vu-jl-panel:focus-within) .vu-jl-bar { display:none; }
}
`;

/* Signed out, the page wears the same header and footer as the landing and
   the other public pages. Signed in, a slim bar with the way back to Discover.
   While sign-in is still being checked, the stored session decides. */
function Shell({ children, signedIn }) {
  const { state } = useSnapshot();
  const authed = signedIn === undefined ? !!(state && state.session && state.session.authed) : signedIn;
  if (!authed) {
    return (
      <div className="vu-jl-page" style={S('min-height:100vh;background:#fff')}>
        <style dangerouslySetInnerHTML={{ __html: JOIN_CSS }} />
        <MarketingHeader />
        <main id="vu-main" tabIndex={-1} className="vu-jl-wrap" style={S('padding-top:32px;outline:none')}>{children}</main>
        <MarketingFooter />
      </div>
    );
  }
  // Signed in, the page sits in the app's own frame (sidebar on desktop,
  // tab bar on phones), so Home, My crew and Profile stay one tap away.
  // `loading` holds the first-visit tours back, so they never cover the
  // listing someone just followed a link to.
  return (
    <AppShell loading>
      <div className="vu-jl-page" style={S('background:#fff')}>
        <style dangerouslySetInnerHTML={{ __html: JOIN_CSS }} />
        <div className="vu-jl-wrap" style={S('padding-top:32px;padding-bottom:96px')}>{children}</div>
      </div>
    </AppShell>
  );
}

