/* ==========================================================================
   db.js — domain logic
   Selectors read; actions mutate. Nothing in the screens touches raw state.
   ========================================================================== */

import { getState, update, eph, updateEphemeral } from './store.js';
import {
  GRADE_TONE, ATTEND_TONE, PERSON_TONE, APP_TONE, SHIFT_TONE, TONE, monthly,
} from './seed.js';
import { supabase } from './supabase.js';
import { applySession } from './auth.js';
import { publishListing } from './listings.js';

/* ---- ids & helpers ------------------------------------------------------ */
let seq = 0;
export function uid(prefix = 'id') {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export const round1 = (n) => Math.round(Number(n) * 10) / 10;
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

export function tone(map, key, fallback = TONE.mute) {
  return map[key] || fallback;
}
export { GRADE_TONE, ATTEND_TONE, PERSON_TONE, APP_TONE, SHIFT_TONE };

/* ---- simulated I/O ------------------------------------------------------
   Real products have latency and failures; the screens must render loading and
   error paths, so every mutation that would hit a server goes through here.
   ------------------------------------------------------------------------- */

const inflight = new Set();

export function isBusy(key) {
  return inflight.has(key);
}

export function perform(key, work, opts = {}) {
  const { latency = 380, requiresNetwork = true } = opts;
  if (inflight.has(key)) return Promise.reject(Object.assign(new Error('duplicate'), { code: 'DUPLICATE' }));
  if (requiresNetwork && !eph().online) {
    return Promise.reject(Object.assign(new Error('offline'), { code: 'OFFLINE' }));
  }
  inflight.add(key);
  updateEphemeral((e) => {
    e.pending = { ...e.pending, [key]: true };
  });
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        const value = work();
        resolve(value);
      } catch (err) {
        reject(err);
      } finally {
        inflight.delete(key);
        updateEphemeral((e) => {
          const next = { ...e.pending };
          delete next[key];
          e.pending = next;
        });
      }
    }, latency);
  });
}

/* ---- session ------------------------------------------------------------ */

export const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function validateEmail(v) {
  if (!v || !v.trim()) return 'Enter your email address.';
  if (!EMAIL_RX.test(v.trim())) return 'That does not look like an email address.';
  return null;
}

export function validatePassword(v) {
  if (!v) return 'Enter a password.';
  if (v.length < 8) return 'Use at least 8 characters.';
  if (!/[a-z]/i.test(v) || !/[0-9]/.test(v)) return 'Mix in at least one letter and one number.';
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

function authError(error) {
  const msg = error && error.message ? error.message : 'Something went wrong.';
  return Object.assign(new Error(msg), { code: 'AUTH' });
}

export async function signIn(email, password) {
  if (!supabase) throw authError({ message: 'The backend is not configured.' });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw authError(error);
  // Load the user's cloud workspace + identity now, so the caller can navigate
  // immediately (the auth listener would also fire, but may lag the redirect).
  await applySession(data.session);
  return data;
}

export async function signUp({ email, password, firstName, lastName }) {
  if (!supabase) throw authError({ message: 'The backend is not configured.' });
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
  return data;
}

export async function signOut() {
  try { sessionStorage.removeItem('vu.demo'); } catch { /* no-op */ }
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      /* clear locally even if the network call fails */
    }
  }
  return update((s) => {
    s.session.authed = false;
    s.session.signedInAt = null;
  });
}

export function isAuthed() {
  return !!getState().session.authed;
}
export function onboardingDone() {
  return !!getState().onboarding.completed;
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
export function logHours({ org, activity, date, hrs, note } = {}) {
  return update((s) => {
    const entry = {
      id: uid('hl'),
      date: (date && date.trim()) || 'Today',
      name: (activity && activity.trim()) || 'Volunteering',
      org: (org && org.trim()) || '',
      hrs: round1(Number(hrs) || 0),
      verified: false,
      source: 'self',
      note: (note && note.trim()) || '',
    };
    s.hoursLog.unshift(entry);
    s.stats.pendingVerification = round1((s.stats.pendingVerification || 0) + entry.hrs);
    s.stats.events = (s.stats.events || 0) + 1;
    return entry;
  });
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
export function hoursTowardGoal() {
  const goal = getState().prefs.hoursGoal || 40;
  return { done: Math.min(verifiedHours(), goal), goal };
}
export function activeWeeks() {
  return 11;
}
export function hoursThisMonth() {
  return monthly[monthly.length - 1].h;
}
export function chartSeries(range) {
  const rows = monthly.slice(monthly.length - range);
  const max = Math.max(0, ...rows.map((r) => r.h));
  return rows.map((r) => ({
    m: r.m,
    h: `${r.h} hrs`,
    raw: r.h,
    height: max > 0 ? `${Math.round((r.h / max) * 100)}%` : '0%',
    bg: max > 0 && r.h === max ? '#C2603C' : '#E4CDC0',
  }));
}

export function nextBadge() {
  const hrs = verifiedHours();
  const locked = getState().badges.filter((b) => !b.on && b.kind === 'hours');
  const next = locked.sort((a, b) => a.need - b.need)[0];
  if (!next) return null;
  return { ...next, remaining: round1(next.need - hrs) };
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
      st: 'Pending',
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
      t: `Application sent to ${opp.org}`,
      b: `${app.role} · ${shift.d}`,
      when: 'now',
      read: false,
      tone: 'brand',
      to: { path: `/opportunity/${oppId}` },
    });
    s.drafts.apply[oppId] = null;
    return app;
  });
}

export function withdrawApplication(appId) {
  return update((s) => {
    const app = s.applications.find((a) => a.id === appId);
    if (!app) return null;
    app.st = 'Withdrawn';
    const opp = s.opportunities.find((o) => o.id === app.oppId);
    const shift = opp && opp.shifts.find((x) => x.id === app.shiftId);
    if (shift && shift.taken > 0) shift.taken -= 1;
    s.bookings = s.bookings.filter((b) => !(b.oppId === app.oppId && b.shiftId === app.shiftId));
    return app;
  });
}

export function claimSpot(oppId) {
  const opp = getOpportunity(oppId);
  if (!opp) throw new Error('That opportunity is no longer listed.');
  const shift = opp.shifts.find((x) => spotsLeft(x) > 0);
  if (!shift) throw Object.assign(new Error('Every shift is full right now.'), { code: 'FULL' });
  return { opp, shift };
}

export function cancelBooking(bookingId) {
  return update((s) => {
    const idx = s.bookings.findIndex((b) => b.id === bookingId);
    if (idx < 0) return null;
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
    p.auditLog.unshift({ id: uid('au'), t: text, who: 'Eli F.', w: meta || 'just now' });
    p.auditLog = p.auditLog.slice(0, 60);
  });
}

export function logActivity(projectId, text) {
  withProject(projectId, (p) => {
    p.activity.unshift({ id: uid('ac'), t: text, w: 'now' });
    p.activity = p.activity.slice(0, 30);
  });
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
  return withProject(projectId, (p) => {
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
  return withProject(projectId, (p) => {
    const src = p.positions.find((x) => x.id === posId);
    if (!src) return null;
    const copy = { ...src, id: uid('pos'), t: `${src.t} (copy)`, filledCount: 0, open: true };
    p.positions.splice(p.positions.indexOf(src) + 1, 0, copy);
    logAudit(p.id, `Position duplicated: ${src.t}`);
    return copy;
  });
}

export function deletePosition(projectId, posId) {
  return withProject(projectId, (p) => {
    const i = p.positions.findIndex((x) => x.id === posId);
    if (i < 0) return null;
    const [gone] = p.positions.splice(i, 1);
    logAudit(p.id, `Position removed: ${gone.t}`);
    return gone;
  });
}

export function positionLabel(pos) {
  return `${pos.filledCount} / ${pos.slots}`;
}
export function positionAppsLabel(p, pos) {
  const waiting = p.applications.filter((a) => a.status === 'pending' && a.positionId === pos.id).length;
  if (!pos.open) return 'Closed';
  return waiting ? `${waiting} waiting` : 'Open';
}

/* sessions */
export function upsertSession(projectId, data) {
  return withProject(projectId, (p) => {
    if (data.id) {
      const s = p.sessions.find((x) => x.id === data.id);
      if (!s) return null;
      Object.assign(s, data);
      logAudit(p.id, `Session updated: ${s.d}`);
      return s;
    }
    const s = {
      id: uid('ses'),
      d: data.d,
      t: data.t || '10:00 AM - 12:00 PM',
      loc: data.loc || p.siteShort,
      cap: Number(data.cap) || 9,
      filledCount: 0,
      st: 'Draft',
      posted: false,
    };
    p.sessions.push(s);
    logAudit(p.id, `Session added: ${s.d}`);
    return s;
  });
}

export function deleteSession(projectId, sessionId) {
  return withProject(projectId, (p) => {
    const i = p.sessions.findIndex((x) => x.id === sessionId);
    if (i < 0) return null;
    const [gone] = p.sessions.splice(i, 1);
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
  if (s.st === 'Draft' || s.st === 'Cancelled' || s.st === 'Open') return s.st;
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
  if (label === 'Draft' || label === 'Open') return SHIFT_TONE.Open;
  if (label === 'Cancelled') return SHIFT_TONE.Cancelled;
  const n = parseInt(String(label).replace(/\D/g, ''), 10) || 0;
  return n >= 5 ? TONE.bad : TONE.warn;
}

export function repeatWeekly(projectId, weeks) {
  return withProject(projectId, (p) => {
    const last = p.sessions[p.sessions.length - 1];
    if (!last) return 0;
    const parsed = parseSessionDate(last.d);
    const made = [];
    for (let i = 1; i <= weeks; i++) {
      const next = addDays(parsed, 7 * i);
      made.push({
        id: uid('ses'),
        d: formatSessionDate(next),
        t: last.t,
        loc: last.loc,
        cap: last.cap,
        filledCount: 0,
        st: 'Draft',
        posted: false,
      });
    }
    p.sessions.push(...made);
    logAudit(p.id, `${made.length} weekly sessions generated`);
    return made.length;
  });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function parseSessionDate(label) {
  // "Sat, Aug 9" → Date in the seeded year (2026).
  const m = /([A-Z][a-z]{2})\s+(\d{1,2})/.exec(label || '');
  if (!m) return new Date(2026, 7, 9);
  const mo = MONTHS.indexOf(m[1]);
  return new Date(2026, mo < 0 ? 7 : mo, parseInt(m[2], 10));
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
    logAudit(p.id, `Reminder changed: ${key} → ${value}`);
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
      short: shortName(data.n),
      s: `${data.school} · Grade ${data.grade}`,
      school: data.school,
      grade: Number(data.grade),
      role: data.role || 'Tutor',
      positionId: data.positionId || (p.positions[0] && p.positions[0].id),
      st: data.st || 'Invited',
      hrs: 0,
      last: 'Just now',
      tags: data.tags || [],
      slug: `p-${(data.n || 'x').toLowerCase().split(' ')[0]}`,
      consent: !!data.consent,
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

export function shortName(n) {
  const parts = String(n || '').trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || '';
  return `${parts[0]} ${parts[1][0]}.`;
}

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
    person.notes.unshift({ id: uid('nt'), t: text, w: 'just now' });
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
    { l: 'Active crew', v: String(active) },
    { l: 'Onboarding', v: String(onboarding) },
    { l: 'Waitlist', v: String(waitlist) },
    { l: 'Avg hours per person', v: avg.toFixed(1) },
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
        short: shortName(app.n),
        s: app.s,
        school: app.school,
        grade: app.grade,
        role: app.role,
        positionId: app.positionId,
        st: app.grade < 10 || app.flags.some((f) => /under/i.test(f)) ? 'Onboarding' : 'Active',
        hrs: 0,
        last: 'Just now',
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
export function attendanceFor(p, sessionId) {
  if (!p.attendance[sessionId]) {
    p.attendance[sessionId] = p.people
      .filter((x) => x.st === 'Active' || x.st === 'Onboarding')
      .map((x) => ({
        personId: x.id,
        n: x.n,
        role: x.role,
        slug: x.slug,
        st: 'Unmarked',
        inOut: 'No check-in',
        hrs: 0,
        grade: 'Not scored',
        note: '',
      }));
  }
  return p.attendance[sessionId];
}

export function setAttendance(projectId, sessionId, personId, patch, reason) {
  return withProject(projectId, (p) => {
    const rows = attendanceFor(p, sessionId);
    const row = rows.find((r) => r.personId === personId);
    if (!row) return null;
    const before = { ...row };
    Object.assign(row, patch);
    if (patch.st && patch.st !== before.st) {
      if (patch.st === 'Absent') {
        row.hrs = 0;
        row.inOut = 'No check-in';
        row.grade = 'Not scored';
      } else if (before.st === 'Absent' && !patch.hrs) {
        row.hrs = 2.0;
        row.inOut = '10:00 AM to 12:00 PM';
      }
      row.edited = true;
      logAudit(p.id, `Attendance for ${row.n} changed from ${before.st} to ${patch.st}`, reason ? `reason: ${reason}` : undefined);
    }
    if (patch.hrs !== undefined && patch.hrs !== before.hrs) {
      row.edited = true;
      logAudit(p.id, `Hours edited for ${row.n} from ${before.hrs} to ${patch.hrs}`, reason ? `reason: ${reason}` : undefined);
    }
    if (patch.grade && patch.grade !== before.grade) {
      logAudit(p.id, `Score changed for ${row.n} from ${before.grade} to ${patch.grade}`, reason ? `reason: ${reason}` : undefined);
    }
    return row;
  });
}

export function markAllPresent(projectId, sessionId) {
  return withProject(projectId, (p) => {
    const rows = attendanceFor(p, sessionId);
    let n = 0;
    for (const r of rows) {
      if (r.st === 'Unmarked' || r.st === 'Absent') {
        r.st = 'Present';
        r.inOut = '10:00 AM to 12:00 PM';
        r.hrs = 2.0;
        if (r.grade === 'Not scored') r.grade = 'Solid';
        n += 1;
      }
    }
    if (n) logAudit(p.id, `${n} volunteers marked present in bulk`);
    return n;
  });
}

export function postAttendance(projectId, sessionId) {
  return withProject(projectId, (p, s) => {
    const rows = attendanceFor(p, sessionId);
    const unmarked = rows.filter((r) => r.st === 'Unmarked');
    if (unmarked.length) {
      throw Object.assign(new Error(`${unmarked.length} volunteers are still unmarked.`), { code: 'INCOMPLETE' });
    }
    const meta = p.attendanceSessions.find((x) => x.id === sessionId);
    if (meta && meta.posted) throw Object.assign(new Error('This session was already posted.'), { code: 'DUPLICATE' });

    let posted = 0;
    for (const r of rows) {
      if (r.hrs > 0) {
        const person = p.people.find((x) => x.id === r.personId);
        if (person) {
          person.hrs = round1(person.hrs + r.hrs);
          person.last = 'Just now';
        }
        posted += 1;
      }
    }
    if (meta) {
      meta.posted = true;
      const present = rows.filter((r) => r.st !== 'Absent').length;
      meta.m = `${present} of ${rows.length} present · posted`;
    }
    logAudit(p.id, `Attendance posted to ${posted} student profiles`);
    logActivity(p.id, `Attendance posted for ${meta ? meta.d : 'the session'}`);
    s.notifications.unshift({
      id: uid('nt'),
      t: 'Attendance posted',
      b: `${posted} student records updated`,
      when: 'now',
      read: false,
      tone: 'ok',
      to: { path: `/lead/${p.id}/attendance` },
    });
    return posted;
  });
}

export function attendanceStats(rows) {
  const total = rows.length || 1;
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
    { l: 'Average score', v: avgIdx >= 0 ? order[avgIdx] : '—' },
    { l: 'Hours this session', v: hours.toFixed(1) },
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
      logAudit(p.id, `${n} hour log${n === 1 ? '' : 's'} approved`);
      logActivity(p.id, `${n} hour log${n === 1 ? '' : 's'} approved`);
    }
    return n;
  });
}

export function adjustHours(projectId, id, hrs, reason) {
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
    d.st = outcome === 'upheld' ? 'Resolved · upheld' : 'Resolved · declined';
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
      who: 'Logged by Eli F.',
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
    logAudit(p.id, `Follow up resolved: ${e.n} · ${e.step}`);
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
    const msg = { id: uid('m'), body, who: 'me', when: 'Just now' };
    th.messages.push(msg);
    th.p = body.length > 60 ? `${body.slice(0, 57)}…` : body;
    th.when = 'now';
    th.unread = 0;
    logActivity(p.id, `Message sent to ${th.n}`);
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
  return withProject(projectId, (p) => {
    const row = p.settings.find((r) => r.id === settingId);
    if (!row || row.locked) return null;
    row.on = !row.on;
    if (row.id === 'set-digest') row.v = row.on ? 'Mondays' : 'Off';
    else row.v = row.on ? 'On' : 'Off';
    logAudit(p.id, `Setting changed: ${row.t} → ${row.v}`);
    return row;
  });
}

export function updateProject(projectId, patch) {
  return withProject(projectId, (p) => {
    Object.assign(p, patch);
    logAudit(p.id, 'Project details updated');
    return p;
  });
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
  return withProject(projectId, (p, s) => {
    p.archived = true;
    p.status = 'ARCHIVED';
    const next = s.projects.find((x) => !x.archived);
    s.activeProjectId = next ? next.id : p.id;
    return p;
  });
}

/* ---- org type: pipeline (volunteering) + task board (team) --------------- */

export function isTeam(p) {
  return !!p && p.orgType === 'team';
}
export function orgTypeLabel(p) {
  return isTeam(p) ? 'Project team' : 'Volunteer program';
}

/* Pipeline — the QC steps a volunteer clears before their first shift. */
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

export function addPipelineStep(projectId, data) {
  return withProject(projectId, (p) => {
    if (!p.pipeline) p.pipeline = [];
    const step = { id: uid('pl'), label: data.label, kind: data.kind || 'check', required: data.required !== false, note: data.note || '' };
    p.pipeline.push(step);
    logAudit(p.id, `Pipeline step added: ${step.label}`);
    return step;
  });
}

export function updatePipelineStep(projectId, stepId, patch) {
  return withProject(projectId, (p) => {
    const step = (p.pipeline || []).find((s) => s.id === stepId);
    if (!step) return null;
    Object.assign(step, patch);
    logAudit(p.id, `Pipeline step updated: ${step.label}`);
    return step;
  });
}

export function removePipelineStep(projectId, stepId) {
  return withProject(projectId, (p) => {
    const i = (p.pipeline || []).findIndex((s) => s.id === stepId);
    if (i < 0) return null;
    const [gone] = p.pipeline.splice(i, 1);
    // Drop the cleared flag from every volunteer so counts stay honest.
    p.people.forEach((x) => { if (x.pipelineDone) delete x.pipelineDone[stepId]; });
    logAudit(p.id, `Pipeline step removed: ${gone.label}`);
    return gone;
  });
}

/* Task board — roles, briefings and tasks for a task-based team. */
const TASK_STATUSES = ['todo', 'doing', 'done'];

export function taskRoles(p) {
  return (p && p.taskBoard && p.taskBoard.roles) || [];
}
export function tasksOf(p) {
  return (p && p.taskBoard && p.taskBoard.tasks) || [];
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
  return withProject(projectId, (p) => {
    const board = ensureBoard(p);
    const role = { id: uid('tr'), name: data.name, briefing: data.briefing || '', color: data.color || '#C2603C' };
    board.roles.push(role);
    logAudit(p.id, `Role created: ${role.name}`);
    return role;
  });
}

export function updateTaskRole(projectId, roleId, patch) {
  return withProject(projectId, (p) => {
    const role = taskRoles(p).find((r) => r.id === roleId);
    if (!role) return null;
    Object.assign(role, patch);
    logAudit(p.id, `Role updated: ${role.name}`);
    return role;
  });
}

export function deleteTaskRole(projectId, roleId) {
  return withProject(projectId, (p) => {
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
      createdLabel: 'just now',
    };
    board.tasks.unshift(task);
    const who = task.assigneeId && p.people.find((x) => x.id === task.assigneeId);
    logActivity(p.id, `Task added: ${task.title}${who ? ` → ${who.short || who.n}` : ''}`);
    logAudit(p.id, `Task created: ${task.title}`);
    return task;
  });
}

export function updateTask(projectId, taskId, patch) {
  return withProject(projectId, (p) => {
    const task = tasksOf(p).find((t) => t.id === taskId);
    if (!task) return null;
    Object.assign(task, patch);
    logAudit(p.id, `Task updated: ${task.title}`);
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
    logActivity(p.id, `${task.title} moved to ${label}`);
    return task;
  });
}

export function assignTask(projectId, taskId, personId) {
  return withProject(projectId, (p) => {
    const task = tasksOf(p).find((t) => t.id === taskId);
    if (!task) return null;
    task.assigneeId = personId || null;
    const who = personId && p.people.find((x) => x.id === personId);
    logActivity(p.id, who ? `${task.title} assigned to ${who.short || who.n}` : `${task.title} unassigned`);
    return task;
  });
}

export function deleteTask(projectId, taskId) {
  return withProject(projectId, (p) => {
    const board = ensureBoard(p);
    const i = board.tasks.findIndex((t) => t.id === taskId);
    if (i < 0) return null;
    const [gone] = board.tasks.splice(i, 1);
    logAudit(p.id, `Task removed: ${gone.title}`);
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
    return { id, name: r.name, briefing: r.briefing || '', color: r.color || '#C2603C' };
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
      createdLabel: 'just now',
    }));
  return { roles, tasks };
}

export async function createProject(draft) {
  const board = buildTaskBoard(draft);
  const created = update((s) => {
    const id = uid('proj');
    const project = {
      id,
      name: draft.name,
      status: 'LIVE',
      cause: draft.cause,
      site: draft.site,
      siteShort: draft.site,
      cadence: `${draft.repeats} ${draft.time}`,
      termWeeks: Number(String(draft.term).replace(/\D/g, '')) || 8,
      createdLabel: 'created just now',
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
      })),
      taskBoard: board,
      checkinCode: String(Math.floor(1000 + Math.random() * 9000)),
      recruitLink: `https://volunteeru.app/p/${slugify(draft.name)}`,
      leadHours: { planning: 0.5, sessions: 0, recruiting: 0 },
      sponsor: {
        name: 'Pending sponsor match',
        verified: false,
        since: '',
        contact: '—',
        roomBookedTo: '—',
        insurance: 'Pending',
        slug: 'sp-pending',
        lastReview: '—',
        rating: '—',
        renewal: '—',
      },
      nextSession: {
        label: (draft.sessions && draft.sessions[0] && `${draft.sessions[0].d} · ${draft.sessions[0].t}`) || 'Not scheduled',
        meta: `${draft.site} · 0 of ${draft.crewTarget || 9} seats staffed`,
        confirmed: 0,
        pending: 0,
        materials: 'Not ready',
        setting: 'Indoor',
      },
      screeningQuestions: ['Why this project?', 'When can you commit?', 'Any relevant experience?'],
      rules: ['Guardian consent required under 16'],
      documents: [
        { t: 'Safety plan', v: 'Ready for sponsor', tone: 'warn' },
        { t: 'Room agreement', v: 'Not started', tone: 'warn' },
        { t: 'Consent forms', v: '0 of 0', tone: 'warn' },
      ],
      reminders: [
        { l: 'Crew text', v: '2 days before' },
        { l: 'Guardian email', v: '1 week before' },
        { l: 'Sponsor digest', v: 'Mondays' },
      ],
      debrief: { worked: '', fix: '' },
      coleads: [],
      tasks: [
        { id: uid('tk'), t: 'Get sponsor sign-off', done: false },
        { id: uid('tk'), t: `Book ${draft.site}`, done: false },
        { id: uid('tk'), t: 'Recruit your first crew', done: false },
        { id: uid('tk'), t: 'Submit safety plan for under-16 volunteers', done: false },
        { id: uid('tk'), t: 'Set shift roles and check-in code', done: true },
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
      sessions: (draft.sessions || []).map((x) => ({
        id: uid('ses'),
        d: x.d,
        t: x.t,
        loc: draft.site,
        cap: Number(draft.crewTarget) || 9,
        filledCount: 0,
        st: 'Draft',
        posted: false,
      })),
      people: [],
      applications: [],
      attendanceSessions: [],
      attendance: {},
      hoursQueue: [],
      compliance: [
        { id: 'cp1', t: 'Guardian consent on file', v: '0 of 0', st: 'Clear', bg: TONE.ok.bg, color: TONE.ok.color },
        { id: 'cp3', t: 'Media releases', v: '0 of 0', st: 'Clear', bg: TONE.ok.bg, color: TONE.ok.color },
        { id: 'cp4', t: 'Sponsor staff present each session', v: 'Pending sponsor', st: 'Action needed', bg: TONE.warn.bg, color: TONE.warn.color },
      ],
      escalations: [],
      incidents: [],
      disputes: [],
      auditLog: [{ id: uid('au'), t: 'Project created', who: 'Eli F.', w: 'just now' }],
      activity: [{ id: uid('ac'), t: 'Project published and sponsor requests sent', w: 'now' }],
      threads: [
        {
          id: uid('t'),
          n: 'Crew announcements',
          p: 'No messages yet.',
          when: 'now',
          unread: 0,
          members: 0,
          repliesOff: true,
          messages: [],
        },
      ],
      settings: [
        { id: 'set-auto', t: 'Auto-approve applications from my school', v: 'Off', on: false },
        { id: 'set-consent', t: 'Require guardian consent under 16', v: 'Required', on: true, locked: true },
        { id: 'set-public', t: 'Show project in the public feed', v: 'On', on: true },
        { id: 'set-invite', t: 'Allow crew to invite friends', v: 'On', on: true },
        { id: 'set-digest', t: 'Send weekly digest to sponsor', v: 'Mondays', on: true },
        { id: 'set-archive', t: 'Archive project after final session', v: 'Off', on: false },
      ],
      archived: false,
    };
    s.projects.unshift(project);
    s.activeProjectId = id;
    s.drafts.create = null;
    s.notifications.unshift({
      id: uid('nt'),
      t: `${project.name} is live`,
      b: 'Sponsor requests sent to vetted organizations near you',
      when: 'now',
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
    /* offline or signed-out demo — discovery just waits */
  }
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
    const arr = node[last];
    const i = arr.indexOf(value);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(value);
    return arr.slice();
  });
}

export function updateAccount(patch) {
  return update((s) => {
    Object.assign(s.account, patch);
    if (patch.firstName || patch.lastName) {
      s.account.name = `${s.account.firstName} ${s.account.lastName}`.trim();
    }
    return s.account;
  });
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
export function transcriptCSV() {
  const s = getState();
  const head = ['Date', 'Activity', 'Organization', 'Hours', 'Verified'];
  const rows = s.hoursLog.map((h) => [h.date, h.name, h.org, h.hrs, h.verified ? 'yes' : 'no']);
  const esc = (v) => {
    const t = String(v == null ? '' : v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}

export function rosterCSV(p) {
  const head = ['Name', 'School', 'Grade', 'Role', 'Status', 'Hours', 'Last seen', 'Tags'];
  const rows = p.people.map((x) => [x.n, x.school, x.grade, x.role, x.st, x.hrs, x.last, x.tags.join(' | ')]);
  const esc = (v) => {
    const t = String(v == null ? '' : v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
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
