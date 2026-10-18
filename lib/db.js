/* ==========================================================================
   db.js, domain logic
   Selectors read; actions mutate. Nothing in the screens touches raw state.
   ========================================================================== */

import { getState, update, eph, updateEphemeral, forcePersist } from './store.js';
import {
  GRADE_TONE, ATTEND_TONE, PERSON_TONE, APP_TONE, SHIFT_TONE, TONE, APPLICATION_STATUS,
  badges as BADGE_DEFS, messageTemplates, shiftReminderText,
} from './seed.js';
import { inferYear, isPastShift, shiftLengthHours } from './calendar.js';
import { supabase } from './supabase.js';
import { applySession } from './auth.js';
import { flushAndWait, clearLocalWorkspace, setSyncUser, getSyncUser } from './sync.js';
import { signUpMatchesShift, publishListing, publishedShiftsKey, isPublishedShift, markProjectClosed, publishVolunteerProfile, unlistVolunteerProfile, loadMyNotifications, requestListingVerification, loadMyListingVerification, loadMyServiceHours, pauseIdentity, invalidateMyApplications, saveMyName, townFromZip } from './listings.js';
import { track } from './analytics.js';
import { C } from './tokens.js';

/* ---- ids & helpers ------------------------------------------------------ */
let seq = 0;
export function uid(prefix = 'id') {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export const round1 = (n) => Math.round(Number(n) * 10) / 10;
/** Hours for display: 3 -> "3", 2.5 -> "2.5", never "3.0". Same rule as fmtHours in components/vu. */
const fmtHrs = (n) => {
  const v = round1(Number(n) || 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function pluralize(n, one, many) {
  return `${n} ${n === 1 ? one : many || one + 's'}`;
}

/** Human "2 hours ago" from a minutes-ago integer. */
export function ago(mins) {
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

const STAMP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Oct 18", the date an activity row, note, thread or audit entry happened.
 * Stored labels carry the date (as the seeded "Sep 2" rows do), never "now",
 * so a label written once still reads true an hour or a week later.
 * @param {number} [ms] epoch milliseconds, default the real clock
 */
export function stampLabel(ms = Date.now()) {
  const d = new Date(ms);
  return `${STAMP_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * An entry's age for display, from its real timestamp `at` (epoch ms or ISO):
 * "Just now", "18 min ago", "3 hr ago", "2 days ago", then "Sep 2". Entries
 * written before timestamps were stored fall back to their saved label
 * (`w`, `when` or `createdLabel`). The wording matches the notification list.
 * @param {{at?: number|string, w?: string, when?: string}} entry
 * @param {number} [now] epoch milliseconds
 */
export function whenLabel(entry, now = Date.now()) {
  const e = entry || {};
  const t = e.at == null ? NaN : new Date(e.at).getTime();
  if (!Number.isFinite(t)) return String(e.w || e.when || '');
  const sec = Math.max(0, (now - t) / 1000);
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;
  if (sec < 604800) {
    const days = Math.floor(sec / 86400);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }
  return stampLabel(t);
}

/** "created Oct 18" for a project's header, from `createdAt` when it was
    stored. An older project saved with the literal "created just now" and no
    timestamp shows nothing rather than a stale "just now". */
export function projectCreatedLabel(p) {
  if (!p) return '';
  if (Number.isFinite(Number(p.createdAt)) && p.createdAt) return `created ${stampLabel(Number(p.createdAt))}`;
  const saved = String(p.createdLabel || '');
  return /just now|\bnow\b/i.test(saved) ? '' : saved;
}

/**
 * When a volunteer was at a posted shift, in epoch ms: the start of the
 * shift's day when that day is already over, otherwise the time it was posted.
 * @param {{d?: string}|undefined} meta the attendance session
 * @param {number} [now] epoch milliseconds
 */
export function shiftSeenAt(meta, now = Date.now()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = meta && meta.d ? parseSessionDate(meta.d, new Date(now)) : null;
  const t = day instanceof Date ? day.getTime() : NaN;
  return Number.isFinite(t) && t < today.getTime() ? t : now;
}

const NOW_LABEL = /^(just )?now$/i;

/**
 * A roster row's "last seen" for display and export: "18 min ago", "Oct 18",
 * or '' when they have not been at a posted shift. Rows saved before `lastAt`
 * was stored carry the literal "Just now"; those read the date of the latest
 * posted shift they attended instead ("Oct 18"), so the label never freezes.
 * @param {{attendanceSessions?: Array, attendance?: object}} p the project
 * @param {{id: string, last?: string, lastAt?: number}} x the roster row
 * @param {number} [now] epoch milliseconds
 */
export function personLastSeen(p, x, now = Date.now()) {
  if (!x) return '';
  if (Number.isFinite(Number(x.lastAt)) && x.lastAt != null) return whenLabel({ at: Number(x.lastAt) }, now);
  const saved = String(x.last || '').trim();
  if (!NOW_LABEL.test(saved)) return saved;
  let best = null;
  for (const meta of (p && p.attendanceSessions) || []) {
    if (!meta.posted) continue;
    const row = ((p.attendance && p.attendance[meta.id]) || []).find((r) => r.personId === x.id);
    if (!row || row.st === 'Absent' || !(Number(row.hrs) > 0)) continue;
    const day = meta.d ? parseSessionDate(meta.d, new Date(now)) : null;
    const t = day instanceof Date ? day.getTime() : NaN;
    if (Number.isFinite(t) && (!best || t > best)) best = t;
  }
  // No real time was saved, so the shift's date is the honest answer.
  return best ? stampLabel(best) : '';
}

export function tone(map, key, fallback = TONE.mute) {
  return map[key] || fallback;
}
export { GRADE_TONE, ATTEND_TONE, PERSON_TONE, APP_TONE, SHIFT_TONE, APPLICATION_STATUS, isPastShift };

/* ---- application status --------------------------------------------------
   Server rows use lowercase statuses; the older local applications used
   'Pending', 'In review', 'Submitted' and so on. Normalize both to one key so
   every screen shows the same word for the same state. */
const STATUS_ALIASES = {
  pending: 'pending', submitted: 'pending', 'in review': 'pending', 'under review': 'pending', applied: 'pending', reviewing: 'pending',
  accepted: 'accepted', confirmed: 'accepted',
  waitlisted: 'waitlisted', waitlist: 'waitlisted',
  declined: 'declined', rejected: 'declined', 'not accepted': 'declined',
  withdrawn: 'withdrawn', cancelled: 'withdrawn',
};

/** The status key ('pending' | 'accepted' | 'waitlisted' | 'declined' | 'withdrawn'). */
export function applicationStatusKey(st) {
  return STATUS_ALIASES[String(st || '').trim().toLowerCase()] || 'pending';
}

/** { label, detail, bg, color } for an application status, e.g. "Applied". */
export function applicationStatus(st) {
  return APPLICATION_STATUS[applicationStatusKey(st)];
}

/* ---- hours ---------------------------------------------------------------- */
export const MAX_SHIFT_HOURS = 24;

/**
 * Check an hours value before it is saved. Returns an error string, or null
 * when it is fine. `allowZero` is for organizer edits (an absent volunteer is
 * 0 hours); a volunteer's own log has to be more than 0.
 */
export function validateHours(value, { allowZero = false } = {}) {
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '' || raw == null) return 'Enter the number of hours.';
  const n = Number(raw);
  if (!Number.isFinite(n)) return 'Enter hours as a number, like 2.5.';
  if (n < 0) return "Hours can't be negative.";
  if (!allowZero && n === 0) return 'Enter more than 0 hours.';
  if (n > MAX_SHIFT_HOURS) return `Enter ${MAX_SHIFT_HOURS} hours or fewer.`;
  return null;
}

function hoursError(msg) {
  return Object.assign(new Error(msg), { code: 'INVALID_HOURS' });
}

/* ---- guarded actions ----------------------------------------------------
   Every mutation a screen fires from a button goes through here. The work
   runs right away: no artificial wait. What this adds is a duplicate guard
   (a second call with the same key while the first is still running is
   refused with code DUPLICATE, so a double click never writes twice), an
   offline check (code OFFLINE) and `ephemeral.pending[key]` for screens that
   read the pending state. When `work` returns a promise, the key stays busy
   until that promise settles.
   ------------------------------------------------------------------------- */

const inflight = new Set();

export function isBusy(key) {
  return inflight.has(key);
}

function setPending(key, on) {
  updateEphemeral((e) => {
    const next = { ...e.pending };
    if (on) next[key] = true;
    else delete next[key];
    e.pending = next;
  });
}

export function perform(key, work, opts = {}) {
  const { requiresNetwork = true } = opts;
  if (inflight.has(key)) return Promise.reject(Object.assign(new Error('duplicate'), { code: 'DUPLICATE' }));
  if (requiresNetwork && !eph().online) {
    return Promise.reject(Object.assign(new Error('offline'), { code: 'OFFLINE' }));
  }
  inflight.add(key);
  setPending(key, true);
  const release = () => {
    inflight.delete(key);
    setPending(key, false);
  };
  let result;
  try {
    result = work();
  } catch (err) {
    release();
    return Promise.reject(err);
  }
  return Promise.resolve(result).finally(release);
}

/* ---- session ------------------------------------------------------------ */

export const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function validateEmail(v) {
  if (!v || !v.trim()) return 'Enter your email address.';
  if (!EMAIL_RX.test(v.trim())) return 'Enter an email address like name@example.com.';
  return null;
}

export function validatePassword(v) {
  if (!v) return 'Enter a password.';
  if (v.length < 8) return 'Use at least 8 characters.';
  if (!/[a-z]/i.test(v) || !/[0-9]/.test(v)) return 'Use at least 1 letter and 1 number.';
  return null;
}

export function passwordStrength(v) {
  if (!v) return { score: 0, label: 'Empty' };
  let s = 0;
  if (v.length >= 8) s += 1;
  if (v.length >= 12) s += 1;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) s += 1;
  if (/[0-9]/.test(v)) s += 1;
  if (/[^\w\s]/.test(v)) s += 1;
  const label = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Strong'][s];
  return { score: s, label };
}

/**
 * A plain sentence for a failed auth call. The raw Supabase text stays on
 * `err.message` (screens match on it and log it); show this to people instead.
 */
export function friendlyAuthMessage(err) {
  const raw = String((err && err.message) || '');
  if (err && err.code === 'OFFLINE') return "You're offline. Check your connection and try again.";
  if (/invalid login credentials/i.test(raw)) return "That email and password don't match. Check both and try again.";
  if (/already (been )?registered|already exists/i.test(raw)) return "There's already an account for that email. Sign in instead.";
  if (/email not confirmed|confirm your account/i.test(raw)) return 'Confirm your email first, then sign in.';
  if (/rate limit|too many|security purposes/i.test(raw)) return 'Too many tries. Wait a minute, then try again.';
  if (/not configured/i.test(raw)) return "Sign-in isn't working right now. Try again in a few minutes.";
  if (/failed to fetch|network|load failed/i.test(raw)) return "Couldn't reach VolunteerU. Check your connection and try again.";
  if (/different from the old|same password/i.test(raw)) return "That's your current password. Choose a different one.";
  if (/password/i.test(raw) && /(weak|short|at least|should)/i.test(raw)) return 'Use at least 8 characters, with a letter and a number.';
  if (/expired|jwt|session|token/i.test(raw)) return 'You were signed out. Sign in again and retry.';
  return "That didn't work. Try again in a moment.";
}

function authError(error) {
  const msg = error && error.message ? error.message : 'Unknown error';
  const err = Object.assign(new Error(msg), { code: 'AUTH' });
  err.friendly = friendlyAuthMessage(err);
  return err;
}

/** Thrown when no Supabase client exists (missing env). The internal reason is
    logged here. `err.message` keeps the "not configured" marker because screens
    match on it to pick their copy (Auth.jsx); people only ever see
    `err.friendly`: "Sign-in isn't working right now. Try again in a few minutes." */
function backendMissing() {
  console.error('[auth] Supabase client is not configured (check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY).');
  return authError({ message: 'Backend not configured' });
}

export async function signIn(email, password) {
  if (!supabase) throw backendMissing();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw authError(error);
  // Load the user's cloud workspace + identity now, so the caller can navigate
  // immediately (the auth listener would also fire, but may lag the redirect).
  await applySession(data.session);
  return data;
}

export async function signUp({ email, password, firstName, lastName }) {
  if (!supabase) throw backendMissing();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { first_name: firstName || '', last_name: lastName || '' } },
  });
  if (error) throw authError(error);

  // With email confirmation off, signUp returns a session. If it does not, try
  // to sign in straight away so the new student lands in onboarding.
  let session = data.session;
  if (!session) {
    const signedIn = await supabase.auth.signInWithPassword({ email, password });
    if (signedIn.error) {
      // Confirmation is required: surface it rather than a dead end.
      throw authError({ message: 'Check your email to confirm your account, then sign in.' });
    }
    session = signedIn.data.session;
  }

  // A blank workspace + the identity the trigger just wrote from signup.
  await applySession(session);
  track('signup', { method: 'email' });
  return data;
}

/* Routes that need a session (mirrors the guard in Providers). Sign-out waits
   for the caller's navigation to leave these, so the guard never bounces the
   person to /signin?next=... on their way out. */
const SIGNED_IN_PREFIXES = ['/app', '/discover', '/crew', '/volunteers', '/opportunity', '/apply', '/lead', '/create', '/profile', '/saved', '/friends', '/projects', '/notifications', '/settings', '/onboarding'];

function onSignedInRoute() {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  return SIGNED_IN_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

async function waitToLeaveSignedInRoute(timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (onSignedInRoute() && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** True for a few seconds after signOut() ends the session (see Providers). */
export function justSignedOut(windowMs = 30000) {
  const at = eph().signedOutAt;
  return !!at && Date.now() - at < windowMs;
}

/**
 * Sign out. Callers navigate to "/" right after calling this. Unsaved edits
 * are pushed first, then the session ends and this browser's copy of the
 * workspace is cleared, so the next person to sign in here starts blank.
 * Everything comes back from the account on the next sign-in.
 *
 * Only this browser signs out (scope 'local'): the same account stays signed
 * in on the person's other devices. Identity lookups stop before the session
 * ends, so a poll on the page being left never asks the auth server about a
 * session that's gone.
 */
export async function signOut() {
  try { sessionStorage.removeItem('vu.demo'); } catch { /* no-op */ }
  updateEphemeral((e) => { e.signingOut = true; });
  pauseIdentity(true);
  try {
    await waitToLeaveSignedInRoute(10000);
    let saved = true;
    try { saved = await flushAndWait(3000); } catch { saved = false; }
    if (supabase) {
      try {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) console.warn('[signOut]', error.message || error);
      } catch {
        /* clear locally even if the network call fails */
      }
    }
    // Stop syncing before touching local state, so nothing below is ever
    // pushed over the account's cloud copy.
    setSyncUser(null);
    lastServiceEntries = [];
    lastDirectorySent = null;
    invalidateMyApplications();
    // Route guards read this to send a just-signed-out person to "/" instead
    // of /signin?next=... if the flip lands before their navigation does.
    updateEphemeral((e) => { e.signedOutAt = Date.now(); });
    update((s) => {
      s.session.authed = false;
      s.session.signedInAt = null;
    }, { transient: true });
    forcePersist();
    // Keep the local copy only if the last edits could not reach the cloud,
    // otherwise they would be lost.
    if (saved) {
      try { clearLocalWorkspace(); } catch { /* keep local copy */ }
    }
  } finally {
    updateEphemeral((e) => { e.signingOut = false; });
    pauseIdentity(false);
  }
  return getState();
}

/**
 * Erase the signed-in student's saved workspace (hours they logged, projects,
 * settings) and take them out of the volunteer directory. Applications and
 * messages already sent to organizations stay with those organizations.
 * Syncing stops first so nothing pushes the local copy back over the erased
 * row; an empty row loads as a brand-new account next time. On a failed write
 * syncing resumes and this throws, so the caller can say nothing was removed.
 * The caller signs out afterwards (signOut clears this browser's copy).
 */
export async function eraseMyData() {
  const me = getSyncUser();
  if (!supabase || !me) throw Object.assign(new Error('Not signed in.'), { code: 'SIGNED_OUT' });
  setSyncUser(null);
  try {
    const { error } = await supabase
      .from('user_state')
      .upsert({ user_id: me, data: {}, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;
  } catch (err) {
    setSyncUser(me);
    throw Object.assign(new Error("Your data wasn't deleted."), { code: 'ERASE_FAILED', cause: err });
  }
  lastServiceEntries = [];
  const res = await unlistVolunteerProfile().catch((error) => ({ ok: false, error }));
  if (res && res.error) console.error('[eraseMyData] unlist failed', res.error);
  return true;
}

/** Change the signed-in user's password. The active session authorizes it, so
    Supabase does not require the old password. Throws an AUTH error the UI can
    surface (weak password, expired session, network). */
export async function changePassword(newPassword) {
  if (!supabase) throw backendMissing();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw authError(error);
  return true;
}

export function isAuthed() {
  return !!getState().session.authed;
}
export function onboardingDone() {
  return !!getState().onboarding.completed;
}

/* ---- volunteer directory ------------------------------------------------ */

/* The directory is strictly opt-in. Only a student who turned on
   prefs.privacy.publicProfile is listed. Someone who signed up to lead a
   project is never listed on a default: they must have flipped the switch
   themselves (togglePref stamps publicProfileChosenAt when they do). */
export function directoryOptedIn(s = getState()) {
  const privacy = (s.prefs && s.prefs.privacy) || {};
  if (privacy.publicProfile !== true) return false;
  const leadOnly = !!(s.onboarding && s.onboarding.intent === 'start');
  return !leadOnly || !!privacy.publicProfileChosenAt;
}

/* What was last written for this account, so a re-render or a navigation
   that changes nothing on the card sends nothing. Cleared on sign-out. */
let lastDirectorySent = null;

/* Publish (or refresh) this account's public directory card from local state,
   so founders can find them, when they opted in (directoryOptedIn). Anyone
   else is never written to the directory; a card they published earlier is
   marked unlisted (an update, so no row is created and no profile data is
   sent). Writes only when the card would change. */
export function syncVolunteerDirectory() {
  const s = getState();
  if (!s.session || !s.session.authed) return;
  const a = s.account;
  const name = (a.name || `${a.firstName || ''} ${a.lastName || ''}`).trim();
  if (!name) return; // wait until identity is loaded
  const owner = getSyncUser() || a.id || '';
  if (!directoryOptedIn(s)) {
    const key = `${owner}|unlisted`;
    if (lastDirectorySent === key) return;
    lastDirectorySent = key;
    unlistVolunteerProfile()
      .then((res) => { if (!res || !res.ok) lastDirectorySent = null; })
      .catch(() => { lastDirectorySent = null; /* directory refresh is best-effort */ });
    return;
  }
  const card = {
    name,
    city: a.city || (s.prefs && s.prefs.location) || '',
    causes: (s.prefs && s.prefs.causes) || [],
    // Only what the student wrote for their public profile. The private
    // onboarding answer (prefs.interest) never goes to the directory.
    bio: a.bio || '',
    skills: Array.isArray(a.skills) ? a.skills.join(', ') : (a.skills || ''),
    grade: a.grade,
    verified_hours: (s.stats && s.stats.verifiedHours) || 0,
    listed: true,
  };
  const key = `${owner}|${JSON.stringify(card)}`;
  if (lastDirectorySent === key) return;
  lastDirectorySent = key;
  publishVolunteerProfile(card)
    .then((res) => { if (!res || !res.ok) lastDirectorySent = null; })
    .catch(() => { lastDirectorySent = null; /* directory refresh is best-effort */ });
}

/* ---- profile stats ------------------------------------------------------ */

/* The record's headline totals are stored, not derived: the seeded history is a
   sample of the student's service, and posting new hours updates both. */
export function verifiedHours() {
  return round1(getState().stats.verifiedHours);
}
export function loggedHours() {
  return round1(getState().hoursLog.filter((h) => h.verified).reduce((a, h) => a + Number(h.hrs), 0));
}

/** Self-reported service the volunteer logs on their own account. Persists to
    their cloud workspace (hoursLog is a per-user slice). Stays unverified until
    an organization confirms it. */
export function logHours({ org, activity, date, hrs, note, category } = {}) {
  const bad = validateHours(hrs);
  if (bad) throw hoursError(bad);
  const entry = update((s) => {
    const entry = {
      id: uid('hl'),
      date: (date && date.trim()) || 'Today',
      name: (activity && activity.trim()) || 'Volunteering',
      org: (org && org.trim()) || '',
      category: (category && category.trim()) || '',
      hrs: round1(Number(hrs)),
      verified: false,
      source: 'self',
      note: (note && note.trim()) || '',
    };
    s.hoursLog.unshift(entry);
    s.stats.pendingVerification = round1((s.stats.pendingVerification || 0) + entry.hrs);
    s.stats.events = (s.stats.events || 0) + 1;
    // count this week toward the volunteering streak
    const wk = isoWeekKey();
    if (s.stats.lastActiveWeek !== wk) {
      const prevWk = isoWeekKey(new Date(Date.now() - 7 * 86400000));
      s.stats.currentStreak = s.stats.lastActiveWeek === prevWk ? (s.stats.currentStreak || 0) + 1 : 1;
      s.stats.lastActiveWeek = wk;
      if (s.stats.currentStreak > (s.stats.bestStreak || 0)) s.stats.bestStreak = s.stats.currentStreak;
    }
    // Grow the snapshot's distinct-org / distinct-cause counts from the log.
    // Never shrink a seeded total: take the larger of what's stored and what
    // the log now shows.
    const orgs = new Set(s.hoursLog.map((h) => (h.org || '').trim().toLowerCase()).filter(Boolean));
    s.stats.orgs = Math.max(s.stats.orgs || 0, orgs.size);
    const cats = new Set(s.hoursLog.map((h) => (h.category || '').trim()).filter(Boolean));
    s.stats.causes = Math.max(s.stats.causes || 0, cats.size);
    return entry;
  });
  track('hours_logged', { hrs: entry.hrs, category: entry.category || 'uncategorized', has_org: !!entry.org, source: 'self' });
  return entry;
}

/** Total hours the volunteer has self-logged but no organization has confirmed. */
export function selfReportedHours() {
  return round1(getState().hoursLog.filter((h) => !h.verified).reduce((a, h) => a + Number(h.hrs), 0));
}

export function removeHoursLog(id) {
  return update((s) => {
    const i = s.hoursLog.findIndex((h) => h.id === id);
    if (i < 0) return null;
    const [gone] = s.hoursLog.splice(i, 1);
    if (!gone.verified) s.stats.pendingVerification = round1(Math.max(0, (s.stats.pendingVerification || 0) - Number(gone.hrs || 0)));
    if (s.stats.events > 0) s.stats.events -= 1;
    return gone;
  });
}
export function eventCount() {
  return getState().stats.events;
}
export function orgCount() {
  return getState().stats.orgs;
}
export function causeCount() {
  return getState().stats.causes;
}
export function leadershipHours() {
  const p = activeProject();
  if (!p) return round1(getState().stats.leadershipHours);
  const l = p.leadHours || {};
  return round1((l.planning || 0) + (l.sessions || 0) + (l.recruiting || 0));
}
/** Confirmed hours against the student's goal. A cleared goal (0 or blank)
    means no goal: `goal` is null and `done` is the plain total. */
export function hoursTowardGoal() {
  const raw = Number(getState().prefs.hoursGoal);
  const goal = Number.isFinite(raw) && raw > 0 ? raw : null;
  const done = verifiedHours();
  return { done: goal ? Math.min(done, goal) : done, goal };
}

/* ---- weekly volunteering streak --------------------------------------------
   A streak is consecutive calendar weeks with at least one logged activity.
   We store the count and the last active ISO week; the effective streak is the
   stored count only while the last active week is this week or last week, so a
   missed week silently drops it to zero without us having to sweep on a timer. */
export function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Record activity for the current week and advance (or reset) the streak. */
export function bumpStreak() {
  return update((s) => {
    const wk = isoWeekKey();
    if (s.stats.lastActiveWeek === wk) return; // already counted this week
    const prevWk = isoWeekKey(new Date(Date.now() - 7 * 86400000));
    s.stats.currentStreak = s.stats.lastActiveWeek === prevWk ? (s.stats.currentStreak || 0) + 1 : 1;
    s.stats.lastActiveWeek = wk;
    if (s.stats.currentStreak > (s.stats.bestStreak || 0)) s.stats.bestStreak = s.stats.currentStreak;
  });
}

/** The streak to show: the stored count, but only if it is still unbroken. */
export function effectiveStreak() {
  const s = getState().stats;
  const wk = isoWeekKey();
  const prevWk = isoWeekKey(new Date(Date.now() - 7 * 86400000));
  if (s.lastActiveWeek === wk || s.lastActiveWeek === prevWk) return s.currentStreak || 0;
  return 0;
}

/**
 * The next hours badge still ahead of the volunteer. Reads the static
 * definitions in lib/seed.js (a saved workspace can hold `badges: []`), and
 * derives earned/locked from confirmed hours, the same way Profile does.
 * `confirmed` defaults to organizer-confirmed hours only: hoursLog is the
 * volunteer's own editable slice, so none of it counts toward a badge.
 */
export function nextBadge(confirmed = verifiedHours()) {
  const have = Number(confirmed) || 0;
  const ahead = BADGE_DEFS
    .filter((b) => b.kind === 'hours' && Number(b.need) > have)
    .sort((a, b) => a.need - b.need);
  const next = ahead[0];
  if (!next) return null;
  return { ...next, on: false, remaining: round1(next.need - have) };
}

/* ---- opportunities ------------------------------------------------------ */

export function allOpportunities() {
  return getState().opportunities;
}

export function getOpportunity(id) {
  return getState().opportunities.find((o) => o.id === id) || null;
}

export function shiftOf(opp, shiftId) {
  if (!opp) return null;
  return opp.shifts.find((s) => s.id === shiftId) || opp.shifts[0] || null;
}

export function spotsLeft(shift) {
  if (!shift) return 0;
  return Math.max(0, shift.cap - shift.taken);
}

export function spotsLabel(shift) {
  if (!shift) return '';
  return `${spotsLeft(shift)} of ${shift.cap} left`;
}

export function isSaved(id) {
  return getState().saved.includes(id);
}

export function toggleSaved(id) {
  return update((s) => {
    const i = s.saved.indexOf(id);
    if (i >= 0) {
      s.saved.splice(i, 1);
      return false;
    }
    s.saved.unshift(id);
    return true;
  });
}

const WINDOW_ALIASES = {
  'sat afternoon': 'Saturday afternoon',
  'saturday afternoon': 'Saturday afternoon',
  'sat morning': 'Saturday morning',
  'saturday morning': 'Saturday morning',
  sunday: 'Sunday',
  weekday: 'Weekday after school',
  evening: 'Weekday evenings',
  evenings: 'Weekday evenings',
  break: 'School breaks',
  breaks: 'School breaks',
};

/** Parses queries like `Saturday afternoon, food bank, under 5 miles`. */
export function parseQuery(q) {
  const out = { text: '', windows: [], causes: [], maxMiles: null, minHours: null };
  if (!q) return out;
  const lower = q.toLowerCase();

  const miles = lower.match(/(?:under|within|less than|<=?)\s*([\d.]+)\s*(?:mi|mile|miles)/);
  if (miles) out.maxMiles = parseFloat(miles[1]);

  const hrs = lower.match(/([\d.]+)\s*\+?\s*(?:hr|hrs|hour|hours)/);
  if (hrs) out.minHours = parseFloat(hrs[1]);

  for (const key in WINDOW_ALIASES) {
    if (lower.includes(key)) {
      const w = WINDOW_ALIASES[key];
      if (!out.windows.includes(w)) out.windows.push(w);
    }
  }

  const causeWords = {
    food: 'Food & hunger',
    hunger: 'Food & hunger',
    'food bank': 'Food & hunger',
    education: 'Education',
    reading: 'Education',
    tutor: 'Education',
    environment: 'Environment',
    trail: 'Environment',
    garden: 'Environment',
    civic: 'Civic',
    voter: 'Civic',
    animal: 'Animals',
    dog: 'Animals',
    senior: 'Seniors',
    health: 'Health',
    hospital: 'Health',
    art: 'Arts',
    mural: 'Arts',
    shelter: 'Homelessness',
    homeless: 'Homelessness',
    disaster: 'Disaster relief',
  };
  for (const key in causeWords) {
    if (lower.includes(key) && !out.causes.includes(causeWords[key])) out.causes.push(causeWords[key]);
  }

  out.text = q.trim();
  return out;
}

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function textMatch(opp, text) {
  if (!text) return true;
  const hay = stripAccents(
    `${opp.title} ${opp.org} ${opp.cause} ${opp.tags.join(' ')} ${opp.description} ${opp.address}`
  ).toLowerCase();
  const terms = stripAccents(text).toLowerCase().split(/[\s,]+/).filter((t) => t.length > 1);
  if (!terms.length) return true;
  return terms.some((t) => hay.includes(t));
}

export function searchOpportunities({ q = '', causes = [], windows = [], maxMiles = null, sort = 'match', savedOnly = false, place = 'all' } = {}) {
  const parsed = parseQuery(q);
  const effCauses = causes.length ? causes : parsed.causes;
  const effWindows = windows.length ? windows : parsed.windows;
  const effMiles = maxMiles != null ? maxMiles : parsed.maxMiles;
  const savedSet = new Set(getState().saved);

  let rows = allOpportunities().filter((o) => {
    if (savedOnly && !savedSet.has(o.id)) return false;
    // In-person / online. Online openings have no distance, so a radius filter
    // never excludes them.
    if (place === 'online' && !o.online) return false;
    if (place === 'person' && o.online) return false;
    if (effCauses.length && !effCauses.includes(o.cause)) return false;
    if (effWindows.length && !effWindows.includes(o.window)) return false;
    if (effMiles != null && !o.online && o.distance > effMiles) return false;
    if (parsed.minHours != null && o.hours < parsed.minHours) return false;
    if (!textMatch(o, parsed.text.replace(/(?:under|within|less than)\s*[\d.]+\s*(?:mi|mile|miles)/gi, ''))) return false;
    return true;
  });

  const sorters = {
    match: (a, b) => b.score - a.score,
    distance: (a, b) => a.distance - b.distance,
    hours: (a, b) => b.hours - a.hours,
    soonest: (a, b) => (a.shifts[0]?.d || '').localeCompare(b.shifts[0]?.d || ''),
    spots: (a, b) => spotsLeft(b.shifts[0]) - spotsLeft(a.shifts[0]),
  };
  rows = rows.slice().sort(sorters[sort] || sorters.match);
  return rows;
}

export function suggestionsFor(q) {
  if (!q || q.trim().length < 2) return [];
  const t = stripAccents(q).toLowerCase();
  const out = [];
  for (const o of allOpportunities()) {
    if (stripAccents(o.title).toLowerCase().includes(t)) out.push({ kind: 'opportunity', label: o.title, sub: o.org, id: o.id });
    else if (stripAccents(o.org).toLowerCase().includes(t)) out.push({ kind: 'org', label: o.org, sub: o.cause, id: o.id });
  }
  for (const p of getState().peerProjects) {
    if (stripAccents(p.t).toLowerCase().includes(t)) out.push({ kind: 'project', label: p.t, sub: p.lead, id: p.id });
  }
  const seen = new Set();
  return out.filter((s) => (seen.has(s.label) ? false : (seen.add(s.label), true))).slice(0, 6);
}

export function rememberSearch(q) {
  const clean = String(q || '').trim();
  if (!clean) return;
  update((s) => {
    s.recentSearches = [clean, ...s.recentSearches.filter((r) => r !== clean)].slice(0, 6);
  });
}

export function clearSearches() {
  update((s) => {
    s.recentSearches = [];
  });
}

/* ---- applications & bookings -------------------------------------------- */

export function applicationFor(oppId) {
  return getState().applications.find((a) => a.oppId === oppId) || null;
}

export function bookingFor(oppId, shiftId) {
  return (
    getState().bookings.find((b) => b.oppId === oppId && (!shiftId || b.shiftId === shiftId)) || null
  );
}

export function submitApplication({ oppId, roleId, shiftId, note, shareRecord, remindMe }) {
  return update((s) => {
    const opp = s.opportunities.find((o) => o.id === oppId);
    if (!opp) throw new Error('That opportunity is no longer listed.');
    const shift = opp.shifts.find((x) => x.id === shiftId);
    if (!shift) throw new Error('That shift is no longer available.');
    if (isPastShift(shift)) throw Object.assign(new Error('That shift already happened. Choose another date.'), { code: 'PAST' });
    if (shift.taken >= shift.cap) throw new Error('That shift filled while you were applying.');

    const existing = s.applications.find((a) => a.oppId === oppId && a.shiftId === shiftId);
    if (existing && existing.st !== 'Withdrawn' && existing.st !== 'Declined') {
      throw Object.assign(new Error('You already applied to this shift.'), { code: 'DUPLICATE' });
    }

    shift.taken += 1;
    const role = opp.roles.find((r) => r.id === roleId);
    const app = {
      id: uid('oa'),
      n: opp.org,
      role: role ? role.t : 'Volunteer',
      roleId,
      shiftId,
      st: 'Applied',
      when: 'Just now',
      slug: opp.orgSlug,
      verified: opp.verified,
      oppId,
      note: note || '',
      shareRecord: shareRecord !== false,
      remindMe: remindMe !== false,
      createdAt: Date.now(),
    };
    s.applications.unshift(app);
    s.notifications.unshift({
      id: uid('nt'),
      t: `Applied to ${opp.org}`,
      b: `${app.role}, ${shift.d}`,
      when: stampLabel(),
      at: new Date().toISOString(),
      read: false,
      tone: 'brand',
      // Home lists the student's applications; the opportunity catalogue
      // isn't saved with user state, so a detail link could go stale.
      to: { path: '/app' },
    });
    s.drafts.apply[oppId] = null;
    return app;
  });
}

export function withdrawApplication(appId) {
  return update((s) => {
    const app = s.applications.find((a) => a.id === appId);
    if (!app) return null;
    const opp0 = s.opportunities.find((o) => o.id === app.oppId);
    const shift0 = opp0 && opp0.shifts.find((x) => x.id === app.shiftId);
    // A shift that already happened can't be cancelled.
    if (shift0 && isPastShift(shift0)) return null;
    app.st = 'Withdrawn';
    const opp = s.opportunities.find((o) => o.id === app.oppId);
    const shift = opp && opp.shifts.find((x) => x.id === app.shiftId);
    if (shift && shift.taken > 0) shift.taken -= 1;
    s.bookings = s.bookings.filter((b) => !(b.oppId === app.oppId && b.shiftId === app.shiftId));
    return app;
  });
}

/** Shifts that haven't happened yet, soonest first. */
export function upcomingShifts(opp, now = new Date()) {
  if (!opp || !Array.isArray(opp.shifts)) return [];
  return opp.shifts.filter((x) => !isPastShift(x, now));
}

/** The next upcoming shift with an open spot. Past shifts are never offered. */
export function claimSpot(oppId) {
  const opp = getOpportunity(oppId);
  if (!opp) throw Object.assign(new Error('That opportunity is no longer listed.'), { code: 'GONE' });
  const upcoming = upcomingShifts(opp);
  if (!upcoming.length) throw Object.assign(new Error('Every shift for this opportunity has already happened.'), { code: 'PAST' });
  const shift = upcoming.find((x) => spotsLeft(x) > 0);
  if (!shift) throw Object.assign(new Error('Every upcoming shift is full.'), { code: 'FULL' });
  return { opp, shift };
}

/** A sign-up can be cancelled only before its shift happens. */
export function canCancelShift(shift) {
  return !!shift && !isPastShift(shift);
}

export function cancelBooking(bookingId) {
  return update((s) => {
    const idx = s.bookings.findIndex((b) => b.id === bookingId);
    if (idx < 0) return null;
    const b0 = s.bookings[idx];
    const opp0 = s.opportunities.find((o) => o.id === b0.oppId);
    const shift0 = opp0 && opp0.shifts.find((x) => x.id === b0.shiftId);
    if (shift0 && isPastShift(shift0)) return null;
    const [b] = s.bookings.splice(idx, 1);
    const opp = s.opportunities.find((o) => o.id === b.oppId);
    const shift = opp && opp.shifts.find((x) => x.id === b.shiftId);
    if (shift && shift.taken > 0) shift.taken -= 1;
    return b;
  });
}

export function checkIn(bookingId) {
  return update((s) => {
    const b = s.bookings.find((x) => x.id === bookingId);
    if (!b) return null;
    b.checkedIn = true;
    b.checkedInAt = Date.now();
    return b;
  });
}

/* ---- projects ----------------------------------------------------------- */

export function projects() {
  return getState().projects;
}
export function activeProject() {
  const s = getState();
  return s.projects.find((p) => p.id === s.activeProjectId) || s.projects[0] || null;
}
export function getProject(id) {
  return getState().projects.find((p) => p.id === id) || null;
}

/** A project has verified events once it has posted attendance for a session. */
export function projectHasVerifiedEvents(p) {
  return !!(p && (p.attendanceSessions || []).some((sn) => sn.posted));
}

/** Founders can only start a new project once every live volunteering
    project they run has posted attendance for at least 1 shift, which keeps
    the workspace to programs that actually ran. Team projects have no shifts
    or attendance, so they never block (the block would be permanent). */
function blocksCreation(p) {
  return !p.archived && p.orgType !== 'team' && !projectHasVerifiedEvents(p);
}

export function canCreateProject() {
  return !getState().projects.some(blocksCreation);
}

/** The live project blocking new creation, if any (for messaging). */
export function projectBlockingCreation() {
  return getState().projects.find(blocksCreation) || null;
}
export function setActiveProject(id) {
  update((s) => {
    if (s.projects.some((p) => p.id === id)) s.activeProjectId = id;
  });
}

function withProject(id, fn) {
  return update((s) => {
    const p = s.projects.find((x) => x.id === (id || s.activeProjectId));
    if (!p) return null;
    return fn(p, s);
  });
}

export function logAudit(projectId, text, meta) {
  withProject(projectId, (p) => {
    p.auditLog.unshift({ id: uid('au'), t: text, who: getState().account.name || 'You', w: meta || stampLabel(), at: Date.now() });
    p.auditLog = p.auditLog.slice(0, 60);
  });
}

export function logActivity(projectId, text) {
  withProject(projectId, (p) => {
    p.activity.unshift({ id: uid('ac'), t: text, w: stampLabel(), at: Date.now() });
    p.activity = p.activity.slice(0, 30);
  });
}

/**
 * Submit this project's organization for verification. This is a real, persisted
 * request (it syncs to the cloud with the rest of the workspace), not an
 * automated match. A human reviewer flips `sponsor.verified` after checking the
 * details; until then the honest status is "verification requested".
 */
export function requestProjectVerification(projectId, { name, contact } = {}) {
  let listingId = null;
  withProject(projectId, (p) => {
    if (!p.sponsor) p.sponsor = { verified: false };
    if (name && name.trim()) p.sponsor.name = name.trim();
    if (contact && contact.trim()) p.sponsor.contact = contact.trim();
    p.sponsor.verificationRequestedAt = Date.now();
    p.auditLog = [{ id: uid('au'), t: 'Verification requested', who: 'You', w: stampLabel(), at: Date.now() }, ...(p.auditLog || [])].slice(0, 60);
    listingId = p.listingId || null;
    return true;
  });
  // Surface the request on the public listing so a reviewer can find it. The DB
  // guard still prevents self-verification; this only stamps the request.
  if (listingId) requestListingVerification(listingId, { name, contact }).catch(() => {});
  return true;
}

/**
 * Reflect a reviewer's verification decision back into the founder's local
 * projects. Called on load (like the directory sync). Owner-scoped; read-only
 * against the cloud, so it never lets a founder self-verify.
 */
/**
 * Pull the real, org-confirmed service hours (the cross-user verified-hours loop)
 * into the headline stat + pending total, so the profile/home number AND the
 * public volunteer directory (which publishes stats.verifiedHours) reflect what
 * organizations actually confirmed, not a value stuck at 0. Read-only against
 * the cloud; the confirming founder is still the only writer of the underlying
 * confirmedHours. Called on load, like the other syncs.
 */
/* The last project hours read for this signed-in user, so the Settings export
   (transcriptCSV) includes organizer-confirmed hours without a second read.
   Cleared on sign-out. */
let lastServiceEntries = [];

export async function syncMyServiceHours() {
  const s = getState();
  if (!s.session || !s.session.authed) return;
  let res;
  try { res = await loadMyServiceHours(); } catch { return; }
  if (!res) return;
  lastServiceEntries = Array.isArray(res.entries) ? res.entries : [];
  const verified = round1(Number(res.verified) || 0);
  const memberPending = round1(Number(res.pending) || 0);
  // Include self-reported hours the volunteer logged locally that no organization
  // has confirmed yet, otherwise this sync would wipe them from the pending total.
  const selfPending = round1(getState().hoursLog.filter((h) => !h.verified).reduce((a, h) => a + Number(h.hrs || 0), 0));
  const pending = round1(memberPending + selfPending);
  if (verified === round1(s.stats.verifiedHours || 0) && pending === round1(s.stats.pendingVerification || 0)) return;
  update((st) => {
    st.stats.verifiedHours = verified;
    st.stats.pendingVerification = pending;
  });
}

/**
 * The organization a site names: its first part, "Riverbend Food Bank" from
 * "Riverbend Food Bank, 3737 Waldemere Ave, Rivertown". A site that starts
 * with a street number or says it is remote names no organization, so the
 * result is '' and the Organization panel says none was added yet.
 */
export function orgNameFromSite(site) {
  const first = String(site || '').split(',')[0].trim();
  if (!first || /^\d/.test(first) || /^(remote|online|virtual)\b/i.test(first)) return '';
  return first;
}

/* Registered-nonprofit projects created before the fix above stored the
   program title as the organization ("Saturday Food Distribution"). Swap in
   the organization from the site, unless the lead already sent that name to a
   reviewer (the request stays as sent; they can update it themselves). */
function repairOfficialSponsorNames() {
  const wrong = (p) => p.orgClass === 'official' && p.sponsor && !p.sponsor.verificationRequestedAt
    && String(p.sponsor.name || '').trim().toLowerCase() === String(p.name || '').trim().toLowerCase()
    && String(p.sponsor.name || '').trim() !== ''
    && orgNameFromSite(p.site).toLowerCase() !== String(p.sponsor.name || '').trim().toLowerCase();
  if (!(getState().projects || []).some(wrong)) return;
  update((st) => {
    for (const p of st.projects) if (wrong(p)) p.sponsor.name = orgNameFromSite(p.site);
  });
}

export async function syncMyListingsVerification() {
  const s = getState();
  if (!s.session || !s.session.authed || !s.projects || !s.projects.length) return;
  try { repairOfficialSponsorNames(); } catch { /* best-effort, retried next load */ }
  try { refreshStaleListings(); } catch { /* best-effort, retried next load */ }
  let map = {};
  try { map = await loadMyListingVerification(); } catch { return; }
  if (!map || !Object.keys(map).length) return;
  // Only write when a reviewer's decision changed something here.
  const stale = getState().projects.some((p) => {
    const v = p.listingId && map[p.listingId];
    if (!v) return false;
    const sp = p.sponsor || {};
    return !!sp.verified !== !!v.verified || (!!v.requestedAt && !sp.verificationRequestedAt);
  });
  if (!stale) return;
  update((st) => {
    for (const p of st.projects) {
      const v = p.listingId && map[p.listingId];
      if (!v) continue;
      if (!p.sponsor) p.sponsor = {};
      p.sponsor.verified = !!v.verified;
      if (v.requestedAt && !p.sponsor.verificationRequestedAt) {
        p.sponsor.verificationRequestedAt = new Date(v.requestedAt).getTime();
      }
    }
  }, { silent: true });
}

export function toggleTask(projectId, taskId) {
  return withProject(projectId, (p) => {
    const t = p.tasks.find((x) => x.id === taskId);
    if (!t) return null;
    t.done = !t.done;
    logAudit(p.id, `Checklist item ${t.done ? 'completed' : 'reopened'}: ${t.t}`);
    return t;
  });
}

export function taskProgress(p) {
  const done = p.tasks.filter((t) => t.done).length;
  return { done, total: p.tasks.length, pct: p.tasks.length ? (done / p.tasks.length) * 100 : 0 };
}

/* positions */
export function upsertPosition(projectId, data) {
  // Volunteers pick from the listing's positions, so every change re-publishes it.
  return withResync(projectId, (p) => {
    if (data.id) {
      const pos = p.positions.find((x) => x.id === data.id);
      if (!pos) return null;
      Object.assign(pos, data);
      logAudit(p.id, `Position updated: ${pos.t}`);
      return pos;
    }
    const pos = {
      id: uid('pos'),
      t: data.t,
      slots: Number(data.slots) || 1,
      filledCount: 0,
      age: data.age || '13+',
      minAge: Number(String(data.age || '13').replace(/\D/g, '')) || 13,
      train: data.train || 'None',
      commit: data.commit || '1 hr weekly',
      open: true,
      note: data.note || '',
      requirements: data.requirements || [],
    };
    p.positions.push(pos);
    logAudit(p.id, `Position created: ${pos.t}`);
    return pos;
  });
}

export function duplicatePosition(projectId, posId) {
  // Volunteers pick from the listing's positions, so every change re-publishes it.
  return withResync(projectId, (p) => {
    const src = p.positions.find((x) => x.id === posId);
    if (!src) return null;
    const copy = { ...src, id: uid('pos'), t: `${src.t} (copy)`, filledCount: 0, open: true };
    p.positions.splice(p.positions.indexOf(src) + 1, 0, copy);
    logAudit(p.id, `Position duplicated: ${src.t}`);
    return copy;
  });
}

export function deletePosition(projectId, posId) {
  // Volunteers pick from the listing's positions, so every change re-publishes it.
  return withResync(projectId, (p) => {
    const i = p.positions.findIndex((x) => x.id === posId);
    if (i < 0) return null;
    const [gone] = p.positions.splice(i, 1);
    logAudit(p.id, `Position removed: ${gone.t}`);
    return gone;
  });
}

/** "4 of 8", the spots-filled wording Shifts and Overview use. */
export function positionLabel(pos) {
  return `${pos.filledCount} of ${pos.slots}`;
}
export function positionAppsLabel(p, pos) {
  const waiting = p.applications.filter((a) => a.status === 'pending' && a.positionId === pos.id).length;
  if (!pos.open) return 'Closed';
  return waiting ? `${waiting} waiting` : 'Open';
}

/* sessions */

/** The project's shifts in date order (labels carry no year, so the year is
    the one nearest today, see parseSessionDate). Ties keep their order. */
function sortSessions(p) {
  p.sessions = (p.sessions || [])
    .map((x, i) => ({ x, i, at: parseSessionDate(x.d).getTime() }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map((r) => r.x);
}

/** The next shift volunteers should come to: the earliest one that isn't
    cancelled and hasn't ended. Same rule as the lead's overview. */
function nextOpenSession(p, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return (p.sessions || [])
    .filter((x) => isPublishedShift(x) && !isPastShift(x, now))
    .map((x, i) => ({ x, i, at: parseSessionDate(x.d, now).getTime() }))
    .filter((r) => r.at >= today)
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map((r) => r.x)[0] || null;
}

/** A message template's text for this project. The shift reminder names the
    next open shift; a project with none scheduled (or a team project) keeps
    the blank for the lead to fill in. */
/** The message templates for a project, ready for a composer's Templates menu. */
export function messageTemplateOptions(projectOrId) {
  return messageTemplates.map((t) => ({ key: t.id, label: t.t, text: messageTemplateText(projectOrId, t.id) }));
}

export function messageTemplateText(projectOrId, templateId, now = new Date()) {
  const t = messageTemplates.find((x) => x.id === templateId);
  if (!t) return '';
  if (templateId !== 'mt1') return t.body;
  const p = typeof projectOrId === 'string' ? getProject(projectOrId) : projectOrId;
  const next = p ? nextOpenSession(p, now) : null;
  if (!next) return t.body;
  const where = String(next.loc || '').trim();
  return shiftReminderText(`${next.d}, ${next.t}${where ? ` at ${where}` : ''}`);
}

/** Recompute project.nextSession.label from the shift list, so the published
    listing never points volunteers at a deleted or finished shift. Returns
    true when the label changed. */
function refreshNextSession(p, now = new Date()) {
  const next = nextOpenSession(p, now);
  const label = next ? `${next.d} at ${next.t}` : 'Not scheduled';
  const cur = p.nextSession || {};
  if (cur.label === label) return false;
  p.nextSession = { ...cur, label };
  return true;
}

export function upsertSession(projectId, data) {
  return withResync(projectId, (p) => {
    if (data.id) {
      const s = p.sessions.find((x) => x.id === data.id);
      if (!s) return null;
      Object.assign(s, data);
      sortSessions(p);
      refreshNextSession(p);
      logAudit(p.id, `Session updated: ${s.d}`);
      return s;
    }
    // The lead typed this shift's date and time and pressed Add shift, so it
    // goes out to volunteers. Only Repeat weekly's copies start as drafts.
    const s = {
      id: uid('ses'),
      d: data.d,
      t: data.t || '10:00 AM - 12:00 PM',
      loc: data.loc || p.siteShort,
      cap: Number(data.cap) || 9,
      filledCount: 0,
      st: 'Open',
      posted: false,
    };
    p.sessions.push(s);
    sortSessions(p);
    refreshNextSession(p);
    logAudit(p.id, `Session added: ${s.d}`);
    return s;
  });
}

export function deleteSession(projectId, sessionId) {
  return withResync(projectId, (p) => {
    const i = p.sessions.findIndex((x) => x.id === sessionId);
    if (i < 0) return null;
    const [gone] = p.sessions.splice(i, 1);
    refreshNextSession(p);
    logAudit(p.id, `Session cancelled: ${gone.d}`);
    return gone;
  });
}

/**
 * A session's label comes from its authored state: 'Open' means published but
 * not yet chased, 'Needs' means the lead flagged it as understaffed. Only the
 * latter reports a shortfall count.
 */
export function sessionStatus(s) {
  if (s.st === 'Cancelled') return s.st;
  // A finished shift is done, whatever its staffing was.
  if (s.st === 'Complete' || isPastShift(s)) return 'Done';
  if (s.st === 'Draft' || s.st === 'Open') return s.st;
  const short = s.cap - s.filledCount;
  if (short <= 0) return 'Staffed';
  if (s.st === 'Needs') return `Needs ${short}`;
  return short <= 1 ? 'Staffed' : `Needs ${short}`;
}

/** Sessions the lead has flagged as short, worst first. */
export function shortSessions(p) {
  return p.sessions
    .filter((x) => x.st === 'Needs' && x.cap - x.filledCount > 0)
    .sort((a, b) => b.cap - b.filledCount - (a.cap - a.filledCount));
}

export function sessionTone(label) {
  if (label === 'Staffed') return SHIFT_TONE.Staffed;
  if (label === 'Draft' || label === 'Open' || label === 'Done') return SHIFT_TONE.Open;
  if (label === 'Cancelled') return SHIFT_TONE.Cancelled;
  const n = parseInt(String(label).replace(/\D/g, ''), 10) || 0;
  return n >= 5 ? TONE.bad : TONE.warn;
}

/**
 * Copy the latest-dated shift (time, place and spots) into the next `weeks`
 * weeks. A week that already has a shift at the same time is skipped, so
 * repeating twice never doubles a date. Returns how many shifts were added.
 */
export function repeatWeekly(projectId, weeks) {
  const out = withProject(projectId, (p) => {
    sortSessions(p);
    const dated = p.sessions.filter((x) => x.st !== 'Cancelled');
    const last = dated[dated.length - 1] || p.sessions[p.sessions.length - 1];
    if (!last) return 0;
    const parsed = parseSessionDate(last.d);
    const taken = new Set(p.sessions.map((x) => `${x.d}|${x.t}`));
    const made = [];
    for (let i = 1; i <= weeks; i++) {
      const d = formatSessionDate(addDays(parsed, 7 * i));
      if (taken.has(`${d}|${last.t}`)) continue;
      taken.add(`${d}|${last.t}`);
      made.push({
        id: uid('ses'),
        d,
        t: last.t,
        loc: last.loc,
        cap: last.cap,
        filledCount: 0,
        st: 'Draft',
        posted: false,
      });
    }
    p.sessions.push(...made);
    sortSessions(p);
    refreshNextSession(p);
    logAudit(p.id, `${pluralize(made.length, 'weekly session')} added`);
    return made.length;
  });
  if (out) resyncListing(projectId);
  return out || 0;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * "Sat, Aug 9" → a Date. Labels carry no year, so the year is the one that
 * puts the date nearest `ref` (calendar.inferYear): a date a few weeks back
 * stays in the past instead of jumping to next year. An unreadable label
 * falls back to today.
 */
export function parseSessionDate(label, ref = new Date()) {
  const m = /([A-Z][a-z]{2})\s+(\d{1,2})/.exec(label || '');
  const mo = m ? MONTHS.indexOf(m[1]) : -1;
  if (!m || mo < 0) return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const day = parseInt(m[2], 10);
  return new Date(inferYear(mo, day, ref), mo, day);
}
export function addDays(d, n) {
  const c = new Date(d.getTime());
  c.setDate(c.getDate() + n);
  return c;
}
export function formatSessionDate(d) {
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function setReminder(projectId, key, value) {
  return withProject(projectId, (p) => {
    p.reminders = p.reminders.map((r) => (r.l === key ? { ...r, v: value } : r));
    logAudit(p.id, `Reminder changed: ${key} to ${value}`);
    return p.reminders;
  });
}

export function regenerateCode(projectId) {
  return withProject(projectId, (p) => {
    let code;
    do {
      code = String(Math.floor(1000 + Math.random() * 9000));
    } while (code === p.checkinCode);
    p.checkinCode = code;
    logAudit(p.id, `Check-in code regenerated`);
    return code;
  });
}

/* people */
export function addPerson(projectId, data) {
  return withProject(projectId, (p) => {
    const person = {
      id: uid('per'),
      n: data.n,
      short: memberName(data.n),
      s: `${data.school}, grade ${data.grade}`,
      school: data.school,
      grade: Number(data.grade),
      role: data.role || 'Tutor',
      positionId: data.positionId || (p.positions[0] && p.positions[0].id),
      st: data.st || 'Invited',
      hrs: 0,
      // Not seen at a shift yet. postAttendance stamps lastAt and last.
      last: '',
      tags: data.tags || [],
      slug: `p-${(data.n || 'x').toLowerCase().split(' ')[0]}`,
      // A parent's consent form is never assumed on file for someone just
      // added or imported. Grade says nothing about age, and nobody has
      // collected the form yet. Only an explicit `consentOnFile: true` (the
      // lead ticked it) marks it received; the lead can toggle it later.
      consent: data.consentOnFile === true,
      trained: false,
      notes: [],
    };
    p.people.unshift(person);
    recountPositions(p);
    logAudit(p.id, `${person.n} added to the roster`);
    logActivity(p.id, `${person.n} was added to the roster`);
    return person;
  });
}

/**
 * The name a lead's own team lists show: the member's full name, trimmed.
 * The lead accepted every member, and Activity, Applications and People
 * already print full names, so the team list doesn't abbreviate one member
 * to "Marcus B." beside "Owen Park". (The public volunteer directory keeps
 * its own initial-only form in Volunteers.jsx.)
 * @param {string} n
 */
export function memberName(n) {
  return String(n || '').trim().replace(/\s+/g, ' ');
}

/** Older name for memberName, kept for existing imports (Lead.jsx). */
export const shortName = memberName;

export function updatePerson(projectId, personId, patch) {
  return withProject(projectId, (p) => {
    const person = p.people.find((x) => x.id === personId);
    if (!person) return null;
    const before = person.st;
    Object.assign(person, patch);
    if (patch.role || patch.positionId) recountPositions(p);
    if (patch.st && patch.st !== before) logAudit(p.id, `${person.n} status changed from ${before} to ${patch.st}`);
    return person;
  });
}

export function removePerson(projectId, personId) {
  return withProject(projectId, (p) => {
    const i = p.people.findIndex((x) => x.id === personId);
    if (i < 0) return null;
    const [gone] = p.people.splice(i, 1);
    recountPositions(p);
    logAudit(p.id, `${gone.n} removed from the roster`);
    return gone;
  });
}

export function addNote(projectId, personId, text) {
  return withProject(projectId, (p) => {
    const person = p.people.find((x) => x.id === personId);
    if (!person) return null;
    person.notes.unshift({ id: uid('nt'), t: text, w: stampLabel(), at: Date.now() });
    logAudit(p.id, `Note added on ${person.n}`);
    return person;
  });
}

function recountPositions(p) {
  for (const pos of p.positions) {
    pos.filledCount = p.people.filter(
      (x) => x.positionId === pos.id && (x.st === 'Active' || x.st === 'Onboarding')
    ).length;
  }
}

export function filterPeople(p, { q = '', status = 'all', role = 'all' } = {}) {
  const t = stripAccents(q).toLowerCase().trim();
  return p.people.filter((x) => {
    if (status !== 'all' && x.st !== status) return false;
    if (role !== 'all' && x.role !== role) return false;
    if (!t) return true;
    return stripAccents(`${x.n} ${x.school} ${x.role} ${x.tags.join(' ')}`).toLowerCase().includes(t);
  });
}

export function peopleStats(p) {
  const active = p.people.filter((x) => x.st === 'Active').length;
  const onboarding = p.people.filter((x) => x.st === 'Onboarding').length;
  const waitlist = p.people.filter((x) => x.st === 'Waitlist').length;
  const counted = p.people.filter((x) => x.hrs > 0);
  const avg = counted.length ? round1(counted.reduce((a, x) => a + x.hrs, 0) / counted.length) : 0;
  const retention = p.people.length
    ? Math.round((p.people.filter((x) => x.st !== 'Inactive' && x.st !== 'Removed').length / p.people.length) * 100)
    : 0;
  return [
    { l: 'Active members', v: String(active) },
    { l: 'Onboarding', v: String(onboarding) },
    { l: 'Waitlist', v: String(waitlist) },
    { l: 'Avg hours per person', v: fmtHrs(avg) },
    { l: 'Retention this term', v: `${retention}%` },
  ];
}

/* project applications */
export function decideApplication(projectId, appId, decision) {
  return withProject(projectId, (p) => {
    const app = p.applications.find((a) => a.id === appId);
    if (!app) return null;
    if (app.status !== 'pending') return Object.assign({ already: true }, app);
    app.status = decision;
    app.decidedAt = Date.now();

    if (decision === 'accepted') {
      const person = {
        id: uid('per'),
        n: app.n,
        short: memberName(app.n),
        s: app.s,
        school: app.school,
        grade: app.grade,
        role: app.role,
        positionId: app.positionId,
        st: app.grade < 10 || app.flags.some((f) => /under/i.test(f)) ? 'Onboarding' : 'Active',
        hrs: 0,
        // Accepted, not seen at a shift yet. postAttendance stamps lastAt and last.
        last: '',
        tags: app.flags.slice(0, 2),
        slug: app.slug,
        consent: app.flags.some((f) => /consent on file/i.test(f)),
        trained: app.flags.some((f) => /trained/i.test(f)),
        notes: [],
      };
      p.people.unshift(person);
      recountPositions(p);
      logActivity(p.id, `${app.n} accepted as ${app.role}`);
      logAudit(p.id, `Application accepted: ${app.n} (${app.role})`);
    } else if (decision === 'waitlisted') {
      logAudit(p.id, `Application waitlisted: ${app.n}`);
    } else {
      logAudit(p.id, `Application declined: ${app.n}`);
    }
    return app;
  });
}

export function pendingApplications(p) {
  return p.applications.filter((a) => a.status === 'pending');
}

export function reopenApplication(projectId, appId) {
  return withProject(projectId, (p) => {
    const app = p.applications.find((a) => a.id === appId);
    if (!app) return null;
    if (app.status === 'accepted') {
      const i = p.people.findIndex((x) => x.n === app.n);
      if (i >= 0) p.people.splice(i, 1);
      recountPositions(p);
    }
    app.status = 'pending';
    delete app.decidedAt;
    logAudit(p.id, `Application decision undone: ${app.n}`);
    return app;
  });
}

export function updateScreeningQuestions(projectId, list) {
  return withProject(projectId, (p) => {
    p.screeningQuestions = list.filter((q) => q && q.trim());
    logAudit(p.id, 'Screening questions updated');
    return p.screeningQuestions;
  });
}

/* attendance */
function blankAttendanceRow(x) {
  return {
    personId: x.id,
    n: x.n,
    role: x.role,
    slug: x.slug,
    st: 'Unmarked',
    inOut: 'No check-in',
    hrs: 0,
    grade: 'Not scored',
    note: '',
  };
}

/** The attendance rows for one shift. The first call builds them from the
    roster. Until the shift is posted, anyone accepted or added since then
    (Active or Onboarding) gets a fresh Unmarked row, so a late accept can still
    be marked. A posted shift's rows stay as they were posted. */
export function attendanceFor(p, sessionId) {
  const onRoster = (p.people || []).filter((x) => (x.st === 'Active' || x.st === 'Onboarding') && expectedAtShift(p, x, sessionId));
  const rows = p.attendance[sessionId];
  if (!rows) {
    p.attendance[sessionId] = onRoster.map(blankAttendanceRow);
    return p.attendance[sessionId];
  }
  const meta = (p.attendanceSessions || []).find((x) => x.id === sessionId);
  if (meta && meta.posted) return rows;
  const have = new Set(rows.map((r) => r.personId));
  const missing = onRoster.filter((x) => !have.has(x.id));
  // A member who signed up for other shifts and hasn't been marked here yet
  // isn't expected, so their untouched row comes off.
  const expected = new Set(onRoster.map((x) => x.id));
  const byId = new Map((p.people || []).map((x) => [x.id, x]));
  const kept = rows.filter((r) => expected.has(r.personId) || !byId.has(r.personId) || !untouchedRow(r));
  if (missing.length || kept.length !== rows.length) p.attendance[sessionId] = [...kept, ...missing.map(blankAttendanceRow)];
  return p.attendance[sessionId];
}

const untouchedRow = (r) => r.st === 'Unmarked' && !(Number(r.hrs) > 0) && (!r.grade || r.grade === 'Not scored') && !r.note;

/* A member whose application picked shifts (person.signUps, copied from it
   in Lead) is expected only at those shifts. Everyone else on the roster is
   expected at every shift. */
function expectedAtShift(p, person, sessionId) {
  const picks = Array.isArray(person.signUps) ? person.signUps : [];
  if (!picks.length) return true;
  const sn = (p.sessions || []).find((x) => x.id === sessionId) || (p.attendanceSessions || []).find((x) => x.id === sessionId);
  const shift = sn ? { id: sessionId, d: sn.d, t: sn.t || sn.m || '' } : sessionId;
  return picks.some((su) => signUpMatchesShift(su, shift));
}

export function setAttendance(projectId, sessionId, personId, patch, reason) {
  if (patch && patch.hrs !== undefined) {
    const bad = validateHours(patch.hrs, { allowZero: true });
    if (bad) throw hoursError(bad);
  }
  return withProject(projectId, (p) => {
    const rows = attendanceFor(p, sessionId);
    const row = rows.find((r) => r.personId === personId);
    if (!row) return null;
    const before = { ...row };
    Object.assign(row, patch);
    // Hours that come with a status change are that status's default (the
    // shift length on arrival, 0 when absent). Only a change to hours on its
    // own is the lead editing hours, which is what `edited` and the
    // "Hours edited" audit entry mean.
    const statusChanged = !!patch.st && patch.st !== before.st;
    if (statusChanged) {
      if (patch.st === 'Absent') {
        row.hrs = 0;
        row.inOut = 'No check-in';
        row.grade = 'Not scored';
        row.edited = false;
      } else if (before.st === 'Absent' || before.st === 'Unmarked') {
        if (before.st === 'Absent' && patch.hrs === undefined) {
          // Back from Absent: the shift's own length, or 0 for the lead to fill.
          const sn = attendanceShift(p, sessionId);
          row.hrs = sn.hrs || 0;
          row.inOut = sn.time || 'No check-in';
        }
        row.edited = false;
      }
      logAudit(p.id, `Attendance for ${row.n} changed from ${before.st} to ${patch.st}`, reason ? `reason: ${reason}` : undefined);
    }
    if (!statusChanged && patch.hrs !== undefined && Number(patch.hrs) !== Number(before.hrs)) {
      row.edited = true;
      logAudit(p.id, `Hours edited for ${row.n} from ${before.hrs} to ${patch.hrs}`, reason ? `reason: ${reason}` : undefined);
    }
    if (patch.grade && patch.grade !== before.grade) {
      logAudit(p.id, `Score changed for ${row.n} from ${before.grade} to ${patch.grade}`, reason ? `reason: ${reason}` : undefined);
    }
    return row;
  });
}

/** The scheduled shift behind an attendance sheet: its time label and its
    length in hours (0 when the label has no readable time range). */
function attendanceShift(p, sessionId) {
  const sn = (p.attendanceSessions || []).find((x) => x.id === sessionId)
    || (p.sessions || []).find((x) => x.id === sessionId)
    || null;
  if (!sn) return { time: '', hrs: 0 };
  const time = sn.t || sn.m || '';
  const hrs = shiftLengthHours({ d: sn.d, t: time });
  return { time, hrs: hrs && hrs <= MAX_SHIFT_HOURS ? hrs : 0 };
}

export function markAllPresent(projectId, sessionId) {
  return withProject(projectId, (p) => {
    const rows = attendanceFor(p, sessionId);
    const sn = attendanceShift(p, sessionId);
    let n = 0;
    for (const r of rows) {
      if (r.st === 'Unmarked' || r.st === 'Absent') {
        r.st = 'Present';
        r.inOut = sn.time || 'No check-in';
        r.hrs = sn.hrs || 0;
        // The score stays 'Not scored' until the lead picks one.
        n += 1;
      }
    }
    if (n) logAudit(p.id, `${pluralize(n, 'volunteer')} marked present`);
    return n;
  });
}

export function postAttendance(projectId, sessionId) {
  return withProject(projectId, (p, s) => {
    const rows = attendanceFor(p, sessionId);
    const unmarked = rows.filter((r) => r.st === 'Unmarked');
    if (unmarked.length) {
      throw Object.assign(new Error(`Mark ${pluralize(unmarked.length, 'more volunteer')} before posting.`), { code: 'INCOMPLETE' });
    }
    const meta = p.attendanceSessions.find((x) => x.id === sessionId);
    if (meta && meta.posted) throw Object.assign(new Error('This session was already posted.'), { code: 'DUPLICATE' });

    const seenAt = shiftSeenAt(meta);
    let posted = 0;
    for (const r of rows) {
      if (r.hrs > 0) {
        const person = p.people.find((x) => x.id === r.personId);
        if (person) {
          person.hrs = round1(person.hrs + r.hrs);
          // Posting an older session later never moves "last seen" backwards.
          if (!(Number(person.lastAt) >= seenAt)) {
            person.lastAt = seenAt;
            person.last = stampLabel(seenAt);
          }
        }
        posted += 1;
      }
    }
    if (meta) {
      meta.posted = true;
      const present = rows.filter((r) => r.st !== 'Absent').length;
      meta.m = `${present} of ${rows.length} present, posted`;
    }
    logAudit(p.id, `Attendance posted, hours added for ${pluralize(posted, 'volunteer')}`);
    logActivity(p.id, `Attendance posted for ${meta ? meta.d : 'the session'}`);
    s.notifications.unshift({
      id: uid('nt'),
      t: 'Attendance posted',
      b: `Hours added for ${pluralize(posted, 'volunteer')}`,
      when: stampLabel(),
      at: new Date().toISOString(),
      read: false,
      tone: 'ok',
      to: { path: `/lead/${p.id}/attendance` },
    });
    return posted;
  });
}

export function attendanceStats(rows) {
  // Rates count only marked rows, so an unmarked roster doesn't read as no-shows.
  const marked = rows.filter((r) => r.st !== 'Unmarked');
  const total = marked.length || 1;
  const present = rows.filter((r) => r.st === 'Present' || r.st === 'Late').length;
  const onTime = rows.filter((r) => r.st === 'Present').length;
  const hours = round1(rows.reduce((a, r) => a + Number(r.hrs || 0), 0));
  const scores = rows.map((r) => r.grade).filter((g) => g && g !== 'Not scored');
  const order = ['Needs support', 'Solid', 'Strong', 'Exceptional'];
  const avgIdx = scores.length
    ? Math.round(scores.reduce((a, g) => a + Math.max(0, order.indexOf(g)), 0) / scores.length)
    : -1;
  return [
    { l: 'Show rate', v: `${Math.round((present / total) * 100)}%` },
    { l: 'On time', v: `${Math.round((onTime / total) * 100)}%` },
    { l: 'Average score', v: avgIdx >= 0 ? order[avgIdx] : 'None yet' },
    { l: 'Hours this session', v: fmtHrs(hours) },
  ];
}

/* hours queue */
export function approveHours(projectId, ids) {
  return withProject(projectId, (p) => {
    let n = 0;
    for (const id of ids) {
      const row = p.hoursQueue.find((q) => q.id === id);
      if (!row || row.status !== 'pending') continue;
      row.status = 'approved';
      const person = p.people.find((x) => x.id === row.personId);
      if (person) person.hrs = round1(person.hrs + row.hrs);
      n += 1;
    }
    if (n) {
      logAudit(p.id, `Hours confirmed for ${pluralize(n, 'shift')}`);
      logActivity(p.id, `Hours confirmed for ${pluralize(n, 'shift')}`);
    }
    return n;
  });
}

export function adjustHours(projectId, id, hrs, reason) {
  const bad = validateHours(hrs, { allowZero: true });
  if (bad) throw hoursError(bad);
  return withProject(projectId, (p) => {
    const row = p.hoursQueue.find((q) => q.id === id);
    if (!row) return null;
    const before = row.hrs;
    row.hrs = round1(hrs);
    row.adjusted = true;
    row.reason = reason;
    logAudit(p.id, `Hours edited for ${row.n} from ${before} to ${row.hrs}`, `reason: ${reason}`);
    return row;
  });
}

export function pendingHours(p) {
  return p.hoursQueue.filter((q) => q.status === 'pending');
}
export function cleanHours(p) {
  return pendingHours(p).filter((q) => q.ok);
}

/* quality */
export function resolveDispute(projectId, disputeId, outcome, note) {
  return withProject(projectId, (p) => {
    const d = p.disputes.find((x) => x.id === disputeId);
    if (!d) return null;
    d.st = outcome === 'upheld' ? 'Resolved, upheld' : 'Resolved, declined';
    d.resolvedNote = note;
    logAudit(p.id, `Hour dispute for ${d.n} resolved (${outcome})`, note ? `note: ${note}` : undefined);
    return d;
  });
}

export function fileIncident(projectId, data) {
  return withProject(projectId, (p) => {
    const inc = {
      id: uid('in'),
      d: data.d || 'Today',
      t: data.t,
      who: `Logged by ${getState().account.name || 'you'}`,
      st: data.st || 'Open',
      note: data.note || '',
    };
    p.incidents.unshift(inc);
    logAudit(p.id, `Incident filed: ${inc.t}`);
    return inc;
  });
}

export function closeIncident(projectId, id) {
  return withProject(projectId, (p) => {
    const inc = p.incidents.find((x) => x.id === id);
    if (!inc) return null;
    inc.st = 'Closed';
    logAudit(p.id, `Incident closed: ${inc.t}`);
    return inc;
  });
}

export function resolveEscalation(projectId, id) {
  return withProject(projectId, (p) => {
    const e = p.escalations.find((x) => x.id === id);
    if (!e) return null;
    e.resolved = true;
    logAudit(p.id, `Follow-up resolved: ${e.n}, ${e.step}`);
    return e;
  });
}

export function recomputeCompliance(p) {
  const active = p.people.filter((x) => x.st === 'Active' || x.st === 'Onboarding');
  const consented = active.filter((x) => x.consent).length;
  const tutors = active.filter((x) => x.role === 'Tutor');
  const trained = tutors.filter((x) => x.trained).length;
  const rows = p.compliance.map((c) => ({ ...c }));
  const consentRow = rows.find((c) => c.id === 'cp1');
  if (consentRow) {
    consentRow.v = `${consented} of ${active.length}`;
    const clear = consented >= active.length;
    consentRow.st = clear ? 'Clear' : 'Action needed';
    consentRow.bg = clear ? TONE.ok.bg : TONE.warn.bg;
    consentRow.color = clear ? TONE.ok.color : TONE.warn.color;
  }
  const trainRow = rows.find((c) => c.id === 'cp2');
  if (trainRow) {
    trainRow.v = `${trained} of ${tutors.length} tutors`;
    const clear = trained >= tutors.length;
    trainRow.st = clear ? 'Clear' : 'Action needed';
    trainRow.bg = clear ? TONE.ok.bg : TONE.warn.bg;
    trainRow.color = clear ? TONE.ok.color : TONE.warn.color;
  }
  return rows;
}

/* messages */
export function sendMessage(projectId, threadId, body) {
  return withProject(projectId, (p) => {
    const th = p.threads.find((t) => t.id === threadId);
    if (!th) return null;
    const sentAt = Date.now();
    const msg = { id: uid('m'), body, who: 'me', when: stampLabel(sentAt), at: sentAt };
    th.messages.push(msg);
    th.p = body.length > 60 ? `${body.slice(0, 57)}…` : body;
    th.when = stampLabel(sentAt);
    th.at = sentAt;
    th.unread = 0;
    // Threads in a lead workspace are private notes ("Only you see these").
    // Nothing is sent to anyone, so no "Message sent" line goes in the
    // project Activity feed that co-leads and the overview read.
    return msg;
  });
}

export function readThread(projectId, threadId) {
  withProject(projectId, (p) => {
    const th = p.threads.find((t) => t.id === threadId);
    if (th) th.unread = 0;
  });
}

export function unreadThreads(p) {
  return p.threads.reduce((a, t) => a + (t.unread || 0), 0);
}

/* project settings */
export function toggleProjectSetting(projectId, settingId) {
  const out = withProject(projectId, (p) => {
    const row = p.settings.find((r) => r.id === settingId);
    if (!row || row.locked) return null;
    row.on = !row.on;
    if (row.id === 'set-digest') row.v = row.on ? 'Mondays' : 'Off';
    else row.v = row.on ? 'On' : 'Off';
    logAudit(p.id, `Setting changed: ${row.t} to ${row.v}`);
    return row;
  });
  // Unlist or re-list the public listing right away.
  if (out && settingId === 'set-public') resyncListing(projectId);
  return out;
}

export function updateProject(projectId, patch) {
  const out = withProject(projectId, (p) => {
    Object.assign(p, patch);
    logAudit(p.id, 'Project details updated');
    return p;
  });
  resyncListing(projectId);
  // An archived listing is hidden from members, so they read the copy stamped
  // on their application when it closed. Keep that copy current after an edit.
  const cur = getProject(projectId);
  if (out && cur && cur.archived && cur.listingId) {
    markProjectClosed(cur.listingId, undefined, cur).catch(() => { /* best-effort */ });
  }
  return out;
}

export function inviteCoLead(projectId, name, email) {
  return withProject(projectId, (p) => {
    p.coleads.push({ id: uid('cl'), name, email, status: 'Invited' });
    logAudit(p.id, `Co-lead invited: ${name}`);
    return p.coleads;
  });
}

export function removeCoLead(projectId, id) {
  return withProject(projectId, (p) => {
    p.coleads = p.coleads.filter((c) => c.id !== id);
    return p.coleads;
  });
}

export function archiveProject(projectId) {
  const out = withProject(projectId, (p, s) => {
    p.archived = true;
    p.status = 'ARCHIVED';
    const next = s.projects.find((x) => !x.archived);
    s.activeProjectId = next ? next.id : p.id;
    return p;
  });
  // listingRow publishes an archived project as paused, off Discover.
  resyncListing(projectId);
  // Tell accepted members: the listing is hidden from them now, so the
  // close is stamped on their application rows instead.
  const archived = getProject(projectId);
  if (out && archived && archived.listingId) {
    markProjectClosed(archived.listingId, undefined, archived).catch(() => { /* best-effort notice */ });
  }
  return out;
}

/* ---- org type: pipeline (volunteering) + task board (team) --------------- */

export function isTeam(p) {
  return !!p && p.orgType === 'team';
}
export function orgTypeLabel(p) {
  return isTeam(p) ? 'Project team' : 'Volunteer program';
}

/* Pipeline, the QC steps a volunteer clears before their first shift. */
export function pipelineFor(p) {
  return (p && p.pipeline) || [];
}

/** A volunteer's progress through the pipeline: which required steps are clear. */
export function pipelineProgress(p, person) {
  const steps = pipelineFor(p);
  const done = (person && person.pipelineDone) || {};
  const required = steps.filter((s) => s.required);
  const cleared = required.filter((s) => done[s.id]).length;
  return {
    steps: steps.map((s) => ({ ...s, done: !!done[s.id] })),
    cleared,
    total: required.length,
    ready: required.length === 0 || cleared === required.length,
    pct: required.length ? Math.round((cleared / required.length) * 100) : 100,
  };
}

export function togglePipelineStep(projectId, personId, stepId) {
  return withProject(projectId, (p) => {
    const person = p.people.find((x) => x.id === personId);
    if (!person) return null;
    if (!person.pipelineDone) person.pipelineDone = {};
    person.pipelineDone[stepId] = !person.pipelineDone[stepId];
    const step = pipelineFor(p).find((s) => s.id === stepId);
    const prog = pipelineProgress(p, person);
    // Clearing the pipeline promotes an onboarding volunteer to active.
    if (prog.ready && person.st === 'Onboarding') person.st = 'Active';
    logAudit(p.id, `Pipeline step ${person.pipelineDone[stepId] ? 'cleared' : 'reopened'} for ${person.n}: ${step ? step.label : stepId}`);
    return person;
  });
}

/** Re-publish a project's listing so cross-user volunteers see pipeline,
    role and detail edits. listingRow pauses archived projects and unlists
    hidden ones. */
function resyncListing(projectId) {
  const cur = getProject(projectId);
  if (!cur || !cur.listingId) return;
  // Publish the shift that's actually next, not the one picked at creation.
  withProject(cur.id, (p) => (refreshNextSession(p) ? true : null));
  const p = getProject(projectId);
  if (!p || !p.listingId) return;
  const key = publishedShiftsKey(p);
  publishListing(p)
    .then(() => {
      // Remember which shift list went out, so a load only republishes when
      // it changed (see refreshStaleListings).
      if ((getProject(projectId) || {}).shiftsPublishedKey !== key) {
        withProject(projectId, (cur) => { cur.shiftsPublishedKey = key; return true; });
      }
    })
    .catch(() => { /* best-effort resync */ });
}

/**
 * Re-publish any of the signed-in lead's listings whose next shift has moved
 * since it was published (a shift date passed, or the list changed on another
 * device). Called on load with the verification sync.
 */
function refreshStaleListings() {
  const stale = (getState().projects || [])
    .filter((p) => p.listingId && !p.archived && Array.isArray(p.sessions))
    .filter((p) => {
      const next = nextOpenSession(p);
      const label = next ? `${next.d} at ${next.t}` : 'Not scheduled';
      // The shift list volunteers pick from also goes stale as shifts pass.
      return !p.nextSession || p.nextSession.label !== label || p.shiftsPublishedKey !== publishedShiftsKey(p);
    })
    .map((p) => p.id);
  for (const id of stale) resyncListing(id);
}

/** withProject, then re-publish the listing when the edit changed something. */
function withResync(projectId, fn) {
  const out = withProject(projectId, fn);
  if (out) resyncListing(projectId);
  return out;
}

export function addPipelineStep(projectId, data) {
  const step = withProject(projectId, (p) => {
    if (!p.pipeline) p.pipeline = [];
    const s = {
      id: uid('pl'), label: data.label, kind: data.kind || 'check', required: data.required !== false,
      note: data.note || '', link: data.link || '', when: data.when || '', due: data.due || '',
    };
    p.pipeline.push(s);
    logAudit(p.id, `Pipeline step added: ${s.label}`);
    return s;
  });
  resyncListing(projectId);
  return step;
}

export function updatePipelineStep(projectId, stepId, patch) {
  const step = withProject(projectId, (p) => {
    const s = (p.pipeline || []).find((x) => x.id === stepId);
    if (!s) return null;
    Object.assign(s, patch);
    logAudit(p.id, `Pipeline step updated: ${s.label}`);
    return s;
  });
  resyncListing(projectId);
  return step;
}

export function removePipelineStep(projectId, stepId) {
  const gone = withProject(projectId, (p) => {
    const i = (p.pipeline || []).findIndex((s) => s.id === stepId);
    if (i < 0) return null;
    const [removed] = p.pipeline.splice(i, 1);
    // Drop the cleared flag from every volunteer so counts stay honest.
    p.people.forEach((x) => { if (x.pipelineDone) delete x.pipelineDone[stepId]; });
    logAudit(p.id, `Pipeline step removed: ${removed.label}`);
    return removed;
  });
  resyncListing(projectId);
  return gone;
}

/* Task board, roles, briefings and tasks for a task-based team. */
const TASK_STATUSES = ['todo', 'doing', 'done'];

export function taskRoles(p) {
  return (p && p.taskBoard && p.taskBoard.roles) || [];
}
export function tasksOf(p) {
  return (p && p.taskBoard && p.taskBoard.tasks) || [];
}
/** Seeded and fixture tasks store their title as `t`. */
export function taskTitle(task) {
  return (task && (task.title || task.t)) || 'Untitled task';
}
export function roleOf(p, roleId) {
  return taskRoles(p).find((r) => r.id === roleId) || null;
}

export function taskStats(p) {
  const tasks = tasksOf(p);
  const by = (st) => tasks.filter((t) => t.status === st).length;
  const done = by('done');
  return {
    todo: by('todo'),
    doing: by('doing'),
    done,
    total: tasks.length,
    pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    roles: taskRoles(p).length,
  };
}

/** Tasks assigned to a specific member, newest-relevant first. */
export function tasksForPerson(p, personId) {
  return tasksOf(p).filter((t) => t.assigneeId === personId);
}

function ensureBoard(p) {
  if (!p.taskBoard) p.taskBoard = { roles: [], tasks: [] };
  if (!p.taskBoard.roles) p.taskBoard.roles = [];
  if (!p.taskBoard.tasks) p.taskBoard.tasks = [];
  return p.taskBoard;
}

export function addTaskRole(projectId, data) {
  return withResync(projectId, (p) => {
    const board = ensureBoard(p);
    const role = { id: uid('tr'), name: data.name, briefing: data.briefing || '', color: data.color || C.ink2 };
    board.roles.push(role);
    logAudit(p.id, `Role created: ${role.name}`);
    return role;
  });
}

export function updateTaskRole(projectId, roleId, patch) {
  return withResync(projectId, (p) => {
    const role = taskRoles(p).find((r) => r.id === roleId);
    if (!role) return null;
    Object.assign(role, patch);
    logAudit(p.id, `Role updated: ${role.name}`);
    return role;
  });
}

export function deleteTaskRole(projectId, roleId) {
  return withResync(projectId, (p) => {
    const board = ensureBoard(p);
    const i = board.roles.findIndex((r) => r.id === roleId);
    if (i < 0) return null;
    const [gone] = board.roles.splice(i, 1);
    // Unassign the role from any tasks that used it.
    board.tasks.forEach((t) => { if (t.roleId === roleId) t.roleId = null; });
    logAudit(p.id, `Role removed: ${gone.name}`);
    return gone;
  });
}

export function addTask(projectId, data) {
  return withProject(projectId, (p) => {
    const board = ensureBoard(p);
    const task = {
      id: uid('tsk'),
      title: data.title,
      detail: data.detail || '',
      roleId: data.roleId || (board.roles[0] && board.roles[0].id) || null,
      assigneeId: data.assigneeId || null,
      status: TASK_STATUSES.includes(data.status) ? data.status : 'todo',
      createdLabel: stampLabel(),
      createdAt: Date.now(),
    };
    board.tasks.unshift(task);
    const who = task.assigneeId && p.people.find((x) => x.id === task.assigneeId);
    logActivity(p.id, `Task added: ${taskTitle(task)}${who ? `, for ${who.short || who.n}` : ''}`);
    logAudit(p.id, `Task created: ${taskTitle(task)}`);
    return task;
  });
}

export function updateTask(projectId, taskId, patch) {
  return withProject(projectId, (p) => {
    const task = tasksOf(p).find((t) => t.id === taskId);
    if (!task) return null;
    Object.assign(task, patch);
    logAudit(p.id, `Task updated: ${taskTitle(task)}`);
    return task;
  });
}

export function setTaskStatus(projectId, taskId, status) {
  if (!TASK_STATUSES.includes(status)) return null;
  return withProject(projectId, (p) => {
    const task = tasksOf(p).find((t) => t.id === taskId);
    if (!task || task.status === status) return task || null;
    task.status = status;
    const label = { todo: 'To do', doing: 'In progress', done: 'Done' }[status];
    logActivity(p.id, `${taskTitle(task)} moved to ${label}`);
    return task;
  });
}

export function assignTask(projectId, taskId, personId) {
  return withProject(projectId, (p) => {
    const task = tasksOf(p).find((t) => t.id === taskId);
    if (!task) return null;
    task.assigneeId = personId || null;
    const who = personId && p.people.find((x) => x.id === personId);
    logActivity(p.id, who ? `${taskTitle(task)} assigned to ${who.short || who.n}` : `${taskTitle(task)} unassigned`);
    return task;
  });
}

export function deleteTask(projectId, taskId) {
  return withProject(projectId, (p) => {
    const board = ensureBoard(p);
    const i = board.tasks.findIndex((t) => t.id === taskId);
    if (i < 0) return null;
    const [gone] = board.tasks.splice(i, 1);
    logAudit(p.id, `Task removed: ${taskTitle(gone)}`);
    return gone;
  });
}

/** A member confirms they read their role briefing. */
export function ackBriefing(projectId, personId, roleId) {
  return withProject(projectId, (p) => {
    const person = p.people.find((x) => x.id === personId);
    if (!person) return null;
    if (!person.briefingAck) person.briefingAck = {};
    person.briefingAck[roleId] = true;
    logAudit(p.id, `${person.n} acknowledged the ${roleOf(p, roleId)?.name || 'role'} briefing`);
    return person;
  });
}

function buildTaskBoard(draft) {
  const roleIdBySeed = {};
  const roles = (draft.teamRoles || []).map((r) => {
    const id = uid('tr');
    roleIdBySeed[r.id] = id;
    return { id, name: r.name, briefing: r.briefing || '', color: r.color || C.ink2 };
  });
  const firstRole = roles[0] ? roles[0].id : null;
  const tasks = (draft.starterTasks || [])
    .filter((t) => t.title && t.title.trim())
    .map((t) => ({
      id: uid('tsk'),
      title: t.title.trim(),
      detail: t.detail || '',
      roleId: roleIdBySeed[t.roleId] || firstRole,
      assigneeId: null,
      status: 'todo',
      createdLabel: stampLabel(),
      createdAt: Date.now(),
    }));
  return { roles, tasks };
}

/* True when the lead picked a schedule: a volunteer program whose draft
   has shifts and passed the wizard's schedule step, which can't be finished
   without the 3 safety checks. Onboarding never asks for a date or time, so
   its draft has none of this and the project starts with no shifts instead
   of an invented weekly schedule. */
function draftHasSchedule(draft) {
  const safety = draft.safety || {};
  return draft.orgType !== 'team'
    && Array.isArray(draft.sessions) && draft.sessions.length > 0
    && !!(safety.staff && safety.consent && safety.pair);
}

/* "Every Saturday, 10 AM to 12 PM", from the repeat choice and the first shift's
   time (already formatted by the wizard). Empty without a schedule. */
function projectCadence(draft) {
  if (!draftHasSchedule(draft)) return '';
  const time = String((draft.sessions[0] && draft.sessions[0].t) || '').trim();
  return [String(draft.repeats || '').trim(), time].filter(Boolean).join(', ');
}

/* The term length in weeks, only for a repeating schedule with a numbered
   term ("8 weeks"). "Ongoing", "One time" and team projects have none. */
function projectTermWeeks(draft) {
  if (!draftHasSchedule(draft) || /one time/i.test(String(draft.repeats || ''))) return null;
  return Number(String(draft.term || '').replace(/\D/g, '')) || null;
}

export async function createProject(draft) {
  const board = buildTaskBoard(draft);
  const created = update((s) => {
    const id = uid('proj');
    // An official org supervises itself; a student-led project runs under a
    // sponsor. Keep the scaffolding copy honest for each, and never claim an
    // automated sponsor match, which does not exist.
    const official = draft.orgClass === 'official';
    const supervisor = official ? 'your organization' : 'your sponsor';
    const scheduled = draftHasSchedule(draft) ? draft.sessions : null;
    const project = {
      id,
      name: draft.name,
      status: 'LIVE',
      cause: draft.cause,
      delivery: ['in_person', 'remote', 'hybrid'].includes(draft.delivery) ? draft.delivery : 'in_person',
      site: draft.site,
      siteShort: draft.site,
      // Only a volunteer program has a schedule step. A team project (or a
      // payload with no shifts) gets no cadence or term, so the overview never
      // shows the wizard's untouched defaults as if the lead picked them.
      cadence: projectCadence(draft),
      termWeeks: projectTermWeeks(draft),
      createdLabel: `created ${stampLabel()}`,
      createdAt: Date.now(),
      mission: draft.mission,
      bio: draft.bio,
      cover: draft.cover,
      visibility: draft.visibility,
      audience: draft.audience || [],
      website: draft.website || '',
      eventsHosted: Number(draft.eventsHosted) || 0,
      approxVolunteers: Number(draft.approxVolunteers) || 0,
      orgType: draft.orgType === 'team' ? 'team' : 'volunteering',
      orgClass: draft.orgClass === 'official' ? 'official' : 'student',
      founderExperience: draft.founderExperience || '',
      pipeline: (draft.pipeline || []).map((s) => ({
        id: s.id && String(s.id).startsWith('pl-user') ? s.id : uid('pl'),
        label: s.label,
        kind: s.kind || 'check',
        required: s.required !== false,
        note: s.note || '',
        // What a volunteer needs to finish the step: the meeting or form link
        // and its time or due date. PipelineTab and the member view read these.
        link: s.link || '',
        when: s.when || '',
        due: s.due || '',
      })),
      taskBoard: board,
      checkinCode: String(Math.floor(1000 + Math.random() * 9000)),
      // Real share link is built from the published listingId (/join/[id]); this
      // placeholder is only a pre-publish fallback and is never copied.
      recruitLink: '',
      leadHours: { planning: 0, sessions: 0, recruiting: 0 },
      sponsor: {
        // Honest defaults: nothing here is confirmed by us until an actual
        // review flips `verified`. An "official" org vouches for itself; a
        // student-led project names a supervising organization it recruits.
        // The organization is named by the site ("Riverbend Food Bank, 3737
        // Waldemere Ave"), never by the program title the lead typed.
        name: draft.orgClass === 'official' ? orgNameFromSite(draft.site) : '',
        verified: false,
        verificationRequestedAt: null,
        since: '',
        contact: draft.website || '-',
        roomBookedTo: '-',
        insurance: '-',
        slug: 'sp-self',
        lastReview: '-',
        rating: '-',
        renewal: '-',
      },
      // No indoor/outdoor setting: nothing in the draft says which it is.
      nextSession: {
        label: (scheduled && `${scheduled[0].d} at ${scheduled[0].t}`) || 'Not scheduled',
        meta: `${draft.site}, 0 of ${draft.crewTarget || 9} spots filled`,
        confirmed: 0,
        pending: 0,
        materials: 'Not ready',
      },
      screeningQuestions: ['Why this project?', 'When can you commit?', 'Any relevant experience?'],
      rules: ['Guardian consent form required under 16'],
      documents: [
        { t: 'Safety plan', v: 'Not started', tone: 'warn' },
        { t: 'Room agreement', v: 'Not started', tone: 'warn' },
        { t: 'Guardian consent forms', v: '0 of 0', tone: 'warn' },
      ],
      reminders: [
        { l: 'Text to members', v: '2 days before' },
        { l: 'Email to parents', v: '1 week before' },
        { l: official ? 'Team digest' : 'Sponsor digest', v: 'Mondays' },
      ],
      debrief: { worked: '', fix: '' },
      coleads: [],
      tasks: [
        { id: uid('tk'), t: official ? 'Confirm your organization details' : 'Ask your supervising organization to confirm', done: false },
        ...(draft.site && String(draft.site).trim() && draft.delivery !== 'remote'
          ? [{ id: uid('tk'), t: `Book ${String(draft.site).trim()}`, done: false }]
          : []),
        { id: uid('tk'), t: 'Find your first volunteers', done: false },
        { id: uid('tk'), t: 'Write a safety plan for volunteers under 16', done: false },
        // Create always generates a check-in code (checkinCode above), so the
        // step is already done once the lead published with at least one role.
        { id: uid('tk'), t: 'Set shift roles and check-in code', done: (draft.positions || []).length > 0 },
      ],
      positions: (draft.positions || []).map((p) => ({
        id: uid('pos'),
        t: p.t,
        slots: Number(p.slots) || 1,
        filledCount: 0,
        age: p.age || '13+',
        minAge: Number(String(p.age || '13').replace(/\D/g, '')) || 13,
        train: p.train || 'None',
        commit: p.commit || '1 hr weekly',
        open: true,
        note: p.note || '',
        requirements: p.requirements || [],
      })),
      // The lead chose these in the wizard and published, so they're open
      // to volunteers. Without a chosen schedule there are none.
      sessions: (scheduled || []).map((x) => ({
        id: uid('ses'),
        d: x.d,
        t: x.t,
        loc: draft.site,
        cap: Number(draft.crewTarget) || 9,
        filledCount: 0,
        st: 'Open',
        posted: false,
      })),
      people: [],
      applications: [],
      attendanceSessions: [],
      attendance: {},
      hoursQueue: [],
      compliance: [
        { id: 'cp1', t: 'Guardian consent forms received', v: '0 of 0', st: 'Clear', bg: TONE.ok.bg, color: TONE.ok.color },
      ],
      escalations: [],
      incidents: [],
      disputes: [],
      auditLog: [{ id: uid('au'), t: 'Project created', who: getState().account.name || 'You', w: stampLabel(), at: Date.now() }],
      activity: [{ id: uid('ac'), t: 'Project published', w: stampLabel(), at: Date.now() }],
      threads: [
        {
          id: uid('t'),
          n: 'Announcements',
          p: 'No messages yet',
          when: stampLabel(),
          at: Date.now(),
          unread: 0,
          members: 0,
          repliesOff: true,
          messages: [],
        },
      ],
      // Only settings something acts on. "Show project on Discover" unlists
      // the public listing (listingRow) when it's off: off Discover, join
      // link still open.
      settings: [
        { id: 'set-public', t: 'Show project on Discover', v: 'On', on: true },
      ],
      archived: false,
    };
    s.projects.unshift(project);
    s.activeProjectId = id;
    s.drafts.create = null;
    s.notifications.unshift({
      id: uid('nt'),
      t: `${project.name} is published`,
      b: 'Students can find it on Discover. Share your join link too.',
      when: stampLabel(),
      at: new Date().toISOString(),
      read: false,
      tone: 'ok',
      to: { path: `/lead/${id}/overview` },
    });
    return project;
  });

  // Publish to the shared feed so other volunteers can discover it and apply.
  // Best-effort: the workspace exists regardless of whether publishing succeeds.
  try {
    const listingId = await publishListing(created);
    if (listingId) {
      update((s) => {
        const p = s.projects.find((x) => x.id === created.id);
        if (p) p.listingId = listingId;
      });
    }
  } catch {
    /* offline or signed-out demo, discovery just waits */
  }
  track('project_published', { org_type: created.orgType || 'volunteering', delivery: created.delivery || 'in_person', cause: created.cause || '' });
  return created;
}

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/* ---- notifications ------------------------------------------------------ */

/* When the signed-in person last opened the feed. It lives in two places:
   prefs.notificationsSeenAt (synced with the workspace, so another browser or
   device knows too) and a localStorage key scoped to the account id (so a
   cloud pull carrying an older prefs copy can't bring the badge back, and the
   next account on a shared browser never inherits it). The newer one wins. */
const NOTIF_SEEN_PREFIX = 'volunteeru.notifsSeenAt.';
const LEGACY_NOTIF_SEEN_KEY = 'volunteeru.notifsSeenAt';

function notifSeenKey() {
  const id = getSyncUser();
  return id ? `${NOTIF_SEEN_PREFIX}${id}` : null;
}

/** The timestamp the signed-in account last viewed the feed (0 if never). */
export function getNotificationsSeenAt() {
  const prefs = getState().prefs || {};
  const synced = Number(prefs.notificationsSeenAt) || 0;
  let local = 0;
  try {
    // The old key was shared by every account on this browser. Drop it.
    window.localStorage.removeItem(LEGACY_NOTIF_SEEN_KEY);
    const key = notifSeenKey();
    if (key) local = Number(window.localStorage.getItem(key)) || 0;
  } catch { /* private mode */ }
  return Math.max(synced, local);
}

/** Mark the derived cross-user notification feed as seen (clears the badge). */
export function markNotificationsSeen() {
  const now = Date.now();
  try {
    const key = notifSeenKey();
    if (key) window.localStorage.setItem(key, String(now));
  } catch { /* private mode */ }
  update((s) => {
    const prev = Number(s.prefs && s.prefs.notificationsSeenAt) || 0;
    s.prefs = { ...s.prefs, notificationsSeenAt: Math.max(prev, now) };
    s.ui = { ...s.ui, unreadNotifs: 0 };
  });
}

/** Recompute the unread badge from the real derived feed vs. the last-seen time. */
export async function refreshNotificationBadge() {
  try {
    const notifs = await loadMyNotifications();
    const seen = getNotificationsSeenAt();
    const unread = notifs.filter((n) => n.at && new Date(n.at).getTime() > seen).length;
    // Unchanged: no store write, so nothing re-renders or syncs.
    if (Number((getState().ui || {}).unreadNotifs) === unread) return;
    update((s) => { s.ui = { ...s.ui, unreadNotifs: unread }; }, { silent: true });
  } catch { /* best-effort */ }
}

export function unreadNotifications() {
  return getState().notifications.filter((n) => !n.read).length;
}
export function markNotificationRead(id) {
  update((s) => {
    const n = s.notifications.find((x) => x.id === id);
    if (n) n.read = true;
  });
}
export function markAllNotificationsRead() {
  return update((s) => {
    const n = s.notifications.filter((x) => !x.read).length;
    s.notifications.forEach((x) => {
      x.read = true;
    });
    return n;
  });
}
export function clearNotifications() {
  return update((s) => {
    const n = s.notifications.length;
    s.notifications = [];
    return n;
  });
}

/* ---- preferences -------------------------------------------------------- */
export function togglePref(path, value) {
  return update((s) => {
    const keys = path.split('.');
    let node = s.prefs;
    for (let i = 0; i < keys.length - 1; i++) node = node[keys[i]];
    const last = keys[keys.length - 1];
    node[last] = value === undefined ? !node[last] : value;
    // The directory switch records that the person chose it, so a default
    // never lists anyone (see directoryOptedIn).
    if (path === 'privacy.publicProfile') node.publicProfileChosenAt = Date.now();
    return node[last];
  });
}

export function setPref(path, value) {
  return togglePref(path, value);
}

export function toggleInList(listPath, value) {
  return update((s) => {
    const keys = listPath.split('.');
    let node = s;
    for (let i = 0; i < keys.length - 1; i++) node = node[keys[i]];
    const last = keys[keys.length - 1];
    const arr = Array.isArray(node[last]) ? node[last] : [];
    // A new array, so effects keyed on it (the directory republish keys on
    // prefs.causes) see the change. update() only copies the top level.
    node[last] = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
    return node[last].slice();
  });
}

export function updateAccount(patch) {
  const before = getState().account || {};
  const renamed = ('firstName' in patch && patch.firstName !== before.firstName) || ('lastName' in patch && patch.lastName !== before.lastName);
  const moved = ('city' in patch && patch.city !== before.city) || ('zip' in patch && patch.zip !== before.zip);
  const out = update((s) => {
    Object.assign(s.account, patch);
    if (patch.firstName || patch.lastName) {
      s.account.name = `${s.account.firstName} ${s.account.lastName}`.trim();
    }
    // Home and Discover search near prefs.location (the onboarding answer),
    // so a new city or ZIP moves it too.
    if (moved && s.prefs) {
      const city = String(s.account.city || '').trim();
      const zip = String(s.account.zip || '').trim();
      const loc = city || townFromZip(zip) || zip;
      if (loc) s.prefs.location = loc;
    }
    return s.account;
  });
  if (renamed && getState().session && getState().session.authed) {
    const a = getState().account;
    saveMyName(a.firstName, a.lastName).catch(() => { /* logged in saveMyName */ });
  }
  return out;
}

/* ---- permissions -------------------------------------------------------- */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    setPref('permissions.notifications', 'unsupported');
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    setPref('permissions.notifications', result);
    return result;
  } catch {
    setPref('permissions.notifications', 'denied');
    return 'denied';
  }
}

export function requestLocationPermission() {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      setPref('permissions.location', 'unsupported');
      resolve('unsupported');
      return;
    }
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      setPref('permissions.location', v);
      resolve(v);
    };
    // Guard against the prompt being dismissed without a callback firing.
    const timer = setTimeout(() => done('dismissed'), 12000);
    navigator.geolocation.getCurrentPosition(
      () => {
        clearTimeout(timer);
        done('granted');
      },
      (err) => {
        clearTimeout(timer);
        done(err && err.code === 1 ? 'denied' : 'unavailable');
      },
      { timeout: 10000, maximumAge: 600000 }
    );
  });
}

/* ---- export ------------------------------------------------------------- */
function csvEscape(v) {
  const raw = String(v == null ? '' : v);
  // A cell starting with = + - @ tab or CR runs as a formula in spreadsheet apps.
  const plainNumber = typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(raw);
  const t = !plainNumber && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${t.replace(/"/g, '""')}"`;
}

/* How far back a logged-hours date label may reach. Same window as
   LogHoursForm's MAX_YEARS_BACK (4 years of high school). */
const LOG_MAX_YEARS_BACK = 4;

/**
 * A logged-hours date label back to a timestamp, for sorting. Reads the labels
 * LogHoursForm writes ("Sat, Oct 10", or "Sat, Oct 10, 2025" from another
 * year) and "Today". A label without a year is a date on or before today, so
 * the year is the latest one in range whose weekday matches the label. This
 * never picks a future year (parseSessionDate can, so don't use it here).
 * Returns NaN for anything it can't read.
 */
export function logDateTime(label, now = new Date()) {
  const t = String(label || '').trim();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/^today$/i.test(t)) return today.getTime();
  const m = /^(?:([A-Z][a-z]{2}),?\s+)?([A-Z][a-z]{2})\s+(\d{1,2})(?:,\s*(\d{4}))?$/.exec(t);
  const mo = m ? MONTHS.indexOf(m[2]) : -1;
  if (!m || mo < 0) return NaN;
  const day = Number(m[3]);
  if (m[4]) return new Date(Number(m[4]), mo, day).getTime();
  const dow = m[1] ? DAYS.indexOf(m[1]) : -1;
  let fallback = NaN;
  for (let y = now.getFullYear(); y >= now.getFullYear() - LOG_MAX_YEARS_BACK; y--) {
    const d = new Date(y, mo, day);
    if (d.getMonth() !== mo || d > today) continue;
    if (Number.isNaN(fallback)) fallback = d.getTime();
    if (dow < 0 || d.getDay() === dow) return d.getTime();
  }
  return Number.isNaN(fallback) ? new Date(now.getFullYear(), mo, day).getTime() : fallback;
}

/** Newest first by `date` label; unreadable dates go last, ties keep their order. */
export function sortByLogDate(rows, now = new Date()) {
  return (rows || [])
    .map((r, i) => ({ r, i, at: logDateTime(r && r.date, now) }))
    .sort((x, y) => {
      const ax = Number.isNaN(x.at) ? -Infinity : x.at;
      const ay = Number.isNaN(y.at) ? -Infinity : y.at;
      return ay - ax || x.i - y.i;
    })
    .map((x) => x.r);
}

/** Every hour the student has, with its status spelled out, newest first:
    project hours (from loadMyServiceHours entries) and hours logged on their own. */
export function hoursCSV(serviceEntries, hoursLog) {
  const head = ['Date', 'Activity', 'Organization', 'Hours', 'Status'];
  const all = [
    ...(serviceEntries || []).map((e) => ({ date: e.date, row: [e.date, e.activity || e.name, e.org, e.hrs, e.verified ? 'Confirmed by organizer' : 'Waiting on organizer'] })),
    // hoursLog is the volunteer's own editable slice; nothing an organizer
    // writes lives there, so none of it is reported as confirmed.
    ...(hoursLog || []).map((h) => ({ date: h.date, row: [h.date, h.name, h.org, h.hrs, 'Logged on your own'] })),
  ];
  const rows = sortByLogDate(all).map((x) => x.row);
  return { count: rows.length, text: [head, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n') };
}

/** The hours spreadsheet as text, from what's already loaded this session.
    Use exportHoursCSV() to read project hours fresh first. */
export function transcriptCSV(serviceEntries = lastServiceEntries) {
  return hoursCSV(serviceEntries, getState().hoursLog).text;
}

/** Read project hours now, then build the spreadsheet. Returns { count, text }.
    A failed read still exports what's loaded. */
export async function exportHoursCSV() {
  try {
    const res = await loadMyServiceHours();
    if (res && Array.isArray(res.entries)) lastServiceEntries = res.entries;
  } catch { /* fall back to the last read */ }
  return hoursCSV(lastServiceEntries, getState().hoursLog);
}

export function rosterCSV(p) {
  const head = ['Name', 'School', 'Grade', 'Role', 'Status', 'Hours', 'Last seen', 'Tags'];
  const rows = (p.people || []).map((x) => [x.n, x.school, x.grade, x.role, x.st, x.hrs, personLastSeen(p, x), (x.tags || []).join(' | ')]);
  // Names, schools and tags come from applicants, so every cell goes through
  // csvEscape, which quotes it and neutralises a leading formula character.
  return [head, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
}

export function download(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
