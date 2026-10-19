/* ==========================================================================
   sync.js, the store, in the cloud
   The app is client-first: store.js is the source of truth for the UI. This
   mirrors the per-user slices of that store to Supabase (debounced on every
   mutation) and loads them back on sign-in. Shared/public data (opportunities,
   peer projects) is never synced, only the user's own workspace. Each write
   checks that the cloud row is still the copy this tab last saw; when another
   device wrote in between, the two are merged (see mergeWorkspace) instead of
   the stale copy overwriting the newer one.
   ========================================================================== */

'use client';

import { supabase } from './supabase.js';
import { getState, update, updateEphemeral, setCommitHook, forcePersist } from './store.js';
import { makeInitialState } from './seed.js';

/* The slices that belong to one user. Everything else in state is shared seed
   data (opportunities, peerProjects) or ephemeral. */
export const PER_USER_SLICES = [
  'account', 'prefs', 'onboarding', 'saved', 'friendsGoing', 'stats',
  'requirement', 'applications', 'bookings', 'hoursLog', 'myAttendance',
  'leadFeedback', 'badges', 'causeBars', 'projects', 'activeProjectId',
  'drafts', 'notifications', 'recentSearches', 'ui', 'meta',
];

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function collect(s = getState()) {
  const out = {};
  for (const k of PER_USER_SLICES) out[k] = s[k];
  // Carry the last-edit stamp into the cloud row so another load (this device
  // after a refresh, or a second device) can tell which copy is newer.
  out.__updatedAt = s.__updatedAt || 0;
  // A plain JSON copy, so it compares cleanly with what the cloud returns.
  return clone(out);
}

/* ---- three-way merge -----------------------------------------------------
   `base` is the cloud copy this tab last loaded or wrote, `local` is this tab
   now, `cloud` is the row as another device left it. A change made on only
   one side survives. Lists of ids or of objects with an `id` merge item by
   item, so removing a saved listing on one device and visiting Notifications
   on another keeps the removal. When both sides changed the same value, this
   tab's edit wins, since it is the newest action the person took here. */

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    // Key order differs between local objects and jsonb from Postgres.
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/** Identity of a list item: the value for primitives, `id` for records. */
function itemKey(x) {
  if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') return `${typeof x}:${x}`;
  if (isPlainObject(x) && (typeof x.id === 'string' || typeof x.id === 'number')) return `id:${x.id}`;
  return null;
}

/** Map of key -> item, or null when an item has no identity or repeats. */
function keyed(list) {
  const m = new Map();
  for (const x of list) {
    const k = itemKey(x);
    if (k === null || m.has(k)) return null;
    m.set(k, x);
  }
  return m;
}

function mergeLists(base, local, cloud) {
  const bm = keyed(Array.isArray(base) ? base : []);
  const lm = keyed(local);
  const cm = keyed(cloud);
  if (!bm || !lm || !cm) return local; // no way to match items up
  const out = [];
  for (const x of local) {
    const k = itemKey(x);
    if (cm.has(k)) out.push(merge3(bm.get(k), x, cm.get(k)));
    else if (!bm.has(k)) out.push(x); // added on this tab
    // else: removed on the other device, so it stays removed
  }
  // Items the other device added, near where it put them.
  cloud.forEach((x, i) => {
    const k = itemKey(x);
    if (!lm.has(k) && !bm.has(k)) out.splice(Math.min(i, out.length), 0, x);
  });
  return out;
}

function merge3(base, local, cloud) {
  if (deepEqual(local, base)) return cloud;
  if (deepEqual(cloud, base) || deepEqual(local, cloud)) return local;
  if (Array.isArray(local) && Array.isArray(cloud)) return mergeLists(base, local, cloud);
  if (isPlainObject(local) && isPlainObject(cloud)) {
    const b = isPlainObject(base) ? base : {};
    const out = {};
    for (const k of new Set([...Object.keys(cloud), ...Object.keys(local)])) {
      const v = merge3(b[k], local[k], cloud[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return local;
}

/** Merge this tab's workspace with a newer cloud copy (all plain JSON). */
export function mergeWorkspace(base, local, cloud) {
  const out = {};
  for (const k of PER_USER_SLICES) {
    const v = merge3(base && base[k], local[k], cloud && cloud[k]);
    if (v !== undefined) out[k] = v;
  }
  out.__updatedAt = Math.max(Number(local.__updatedAt) || 0, Number(cloud && cloud.__updatedAt) || 0);
  return out;
}

/** A blank workspace, so a brand-new account never inherits the demo's record. */
export function makeEmptyUserState() {
  const seed = makeInitialState();
  return {
    account: {
      id: 'me', firstName: '', lastName: '', name: '', email: '', phone: '',
      grade: null, age: null, school: '', city: '', zip: '', avatar: '',
      guardianEmail: '', guardianConsent: false,
      counselor: { name: '', access: false, lastChecked: '' }, bio: '',
      headline: '', pronouns: '', skills: '', resumeUrl: '', experience: '', goals: '',
    },
    prefs: seed.prefs,
    onboarding: { completed: false, step: 1, intent: 'start', firstName: '', zip: '', draft: {} },
    saved: [], friendsGoing: [], applications: [], bookings: [],
    hoursLog: [], myAttendance: [], leadFeedback: [], badges: seed.badges, causeBars: [],
    projects: [], activeProjectId: null,
    drafts: { create: null, apply: {} },
    notifications: [], recentSearches: [],
    stats: {
      verifiedHours: 0, events: 0, orgs: 0, causes: 0, leadershipHours: 0,
      thisMonth: 0, bestMonth: 0, avgShift: 0, pendingVerification: 0,
      activeWeeks: 0, currentStreak: 0, bestStreak: 0, lastActiveWeek: '', showRate: 0, onTime: 0,
      averageScore: '-', hoursGenerated: 0, recruited: 0,
    },
    requirement: {
      termDone: 0, termGoal: 0, yearCounted: 0, yearGoal: 0,
      deadline: '', counselor: '', lastConfirmed: '-',
    },
    ui: seed.ui,
    meta: { firstRun: false, installedAt: null, lastSeen: null, tutorialSeen: false, founderTutorialSeen: false },
  };
}

/* Bookmarks a visitor saved before signing in live in the guest copy (no
   owner, no account id). Read them here, right before an account's
   workspace replaces that copy, so they carry over however the sign-in
   happened (a full page load or in-app navigation). */
function guestBookmarks() {
  const s = getState();
  if (!s || s.__owner || (s.account && s.account.id && s.account.id !== 'me')) return [];
  return Array.isArray(s.saved) ? s.saved.filter((id) => id != null && id !== '') : [];
}

/* Guest bookmarks already carried into an account. Sign-up can apply the
   new account's blank workspace twice (the sign-up call and the auth event
   both load it); the second pass no longer sees a guest copy, so it reuses
   these. Cleared once a loaded copy already holds them all. */
let carriedFor = null;

function apply(sliceObject, owner = currentUserId) {
  const guest = owner ? guestBookmarks() : [];
  if (guest.length) carriedFor = { owner, ids: guest };
  const carry = guest.length ? guest : carriedFor && carriedFor.owner === owner ? carriedFor.ids : [];
  if (!owner || (carriedFor && carriedFor.owner !== owner)) carriedFor = guest.length ? carriedFor : null;
  let carried = false;
  update((s) => {
    for (const k of PER_USER_SLICES) {
      if (k in sliceObject) s[k] = sliceObject[k];
    }
    if (carry.length) {
      const mine = Array.isArray(s.saved) ? s.saved : [];
      const missing = carry.filter((id) => !mine.includes(id));
      if (missing.length) {
        s.saved = [...missing, ...mine];
        carried = true;
      } else if (!guest.length) {
        carriedFor = null;
      }
    }
    // Adopt the cloud copy's stamp so we don't immediately think local is newer.
    if ('__updatedAt' in sliceObject) s.__updatedAt = sliceObject.__updatedAt;
    // Remember whose workspace this is, so another account signing in on the
    // same browser never mistakes it for its own newer copy.
    s.__owner = owner || null;
  }, { transient: true }); // don't re-sync what we just loaded
  // Carried bookmarks aren't in the cloud copy yet; push them up.
  if (carried) scheduleSync();
}

/** Blank the workspace for a new account. */
export function applyEmptyUserState() {
  apply({ ...makeEmptyUserState(), __updatedAt: 0 });
}

/** True when the workspace in memory was loaded for `userId`. */
function localBelongsTo(userId) {
  const s = getState();
  if (s.__owner) return s.__owner === userId;
  return !!(s.account && s.account.id && s.account.id === userId);
}

/**
 * Drop the signed-in person's workspace from this browser after sign-out, so
 * the next person on a shared computer starts blank. Their data is already in
 * the cloud (call flushAndWait first) and comes back when they sign in.
 */
export function clearLocalWorkspace() {
  const blank = makeEmptyUserState();
  blank.meta = { ...blank.meta, firstRun: false };
  apply({ ...blank, __updatedAt: 0 }, null);
  forgetBase();
  forcePersist();
}

/* ---- current user + durable cloud sync (an outbox, not fire-and-forget) ----
   Every mutation bumps `dirtyVersion`. flush() persists the whole workspace and,
   only on a confirmed write, advances `syncedVersion`. A failure (offline, 5xx,
   RLS, network throw) NEVER clears the dirty marker, it retries with backoff,
   and flushes immediately on reconnect. So the last edit before a WiFi blip is
   never lost, and a stale/empty snapshot is never pushed over real data. */

let currentUserId = null;
let handle = null;
let retryHandle = null;
let retryDelay = 1500;
const MAX_RETRY = 30000;
let dirtyVersion = 0;
let syncedVersion = 0;
let inFlight = false;

/* The cloud row this tab last loaded or wrote: { uid, exists, at, data }.
   `at` is the row's updated_at, used as a compare-and-set token on writes.
   No base yet (the sign-in load hasn't finished) means no write either, so a
   tab never pushes a copy it can't merge. */
let base = null;

const BASE_KEY = 'volunteeru.syncbase.v1';

function setBase(uid, row) {
  base = { uid, exists: !!row, at: (row && row.updated_at) || null, data: clone((row && row.data) || {}) };
  // Kept beside the local copy, so after a reload this browser can still tell
  // its own unsaved edits apart from changes another device made meanwhile.
  try { window.localStorage.setItem(BASE_KEY, JSON.stringify(base)); } catch { /* private mode: merge falls back to timestamps */ }
}

function readStoredBase(uid) {
  try {
    const b = JSON.parse(window.localStorage.getItem(BASE_KEY) || 'null');
    return b && b.uid === uid && isPlainObject(b.data) ? b : null;
  } catch {
    return null;
  }
}

function forgetBase() {
  base = null;
  try { window.localStorage.removeItem(BASE_KEY); } catch { /* nothing stored */ }
}

function baseFor(uid) {
  return base && base.uid === uid ? base : null;
}

function isDirty() { return dirtyVersion > syncedVersion; }

function setSaveStatus(status) {
  // idle | saving | saved | offline | error
  try { updateEphemeral((e) => { e.saveStatus = status; }); } catch { /* pre-hydrate */ }
}

export function setSyncUser(id) {
  const changed = id !== currentUserId;
  currentUserId = id;
  if (changed) { dirtyVersion = 0; syncedVersion = 0; retryDelay = 1500; }
  if (!id) {
    if (handle) { clearTimeout(handle); handle = null; }
    if (retryHandle) { clearTimeout(retryHandle); retryHandle = null; }
  }
}

/** The id of the user currently being synced (null when signed out). */
export function getSyncUser() { return currentUserId; }

export function scheduleSync() {
  if (!supabase || !currentUserId) return;
  dirtyVersion += 1;
  setSaveStatus('saving');
  if (handle || inFlight) return;
  handle = setTimeout(flush, 700);
}

function scheduleRetry() {
  if (retryHandle || !isDirty() || !currentUserId) return;
  const delay = Math.min(retryDelay, MAX_RETRY) + Math.floor(Math.random() * 500);
  retryDelay = Math.min(retryDelay * 2, MAX_RETRY);
  retryHandle = setTimeout(() => { retryHandle = null; flush(); }, delay);
}

function isErasedData(d) {
  return !d || Object.keys(d).length === 0;
}

async function readCloudRow(uid) {
  const { data, error } = await supabase
    .from('user_state')
    .select('data, updated_at')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Write only if the row is still `seen` (null: no row yet). Returns the new
    updated_at, or null when another device wrote first. */
async function writeCloudRow(uid, data, seen) {
  const at = new Date().toISOString();
  if (!seen) {
    const { data: row, error } = await supabase
      .from('user_state')
      .insert({ user_id: uid, data, updated_at: at })
      .select('updated_at')
      .maybeSingle();
    if (error && error.code === '23505') return null; // created elsewhere meanwhile
    if (error) throw error;
    return (row && row.updated_at) || at;
  }
  let q = supabase.from('user_state').update({ data, updated_at: at }).eq('user_id', uid);
  q = seen.updated_at == null ? q.is('updated_at', null) : q.eq('updated_at', seen.updated_at);
  const { data: rows, error } = await q.select('updated_at');
  if (error) throw error;
  if (!rows || !rows.length) return null;
  return rows[0].updated_at || at;
}

/** Put merged slices into the store without counting it as a new edit. */
function adopt(merged, uid) {
  const s = getState();
  const changed = {};
  for (const k of PER_USER_SLICES) {
    if (k in merged && !deepEqual(clone(s[k]), merged[k])) changed[k] = merged[k];
  }
  if (!Object.keys(changed).length && Number(s.__updatedAt || 0) === merged.__updatedAt) return;
  apply({ ...changed, __updatedAt: merged.__updatedAt }, uid);
  forcePersist();
}

/** True when every per-user slice equals the cloud copy this tab last
    loaded or wrote. A row that doesn't exist yet never matches. */
function matchesBase(b) {
  if (!b || !b.exists || isErasedData(b.data)) return false;
  const local = collect();
  return PER_USER_SLICES.every((k) => deepEqual(local[k], b.data[k]));
}

const MAX_WRITE_ATTEMPTS = 4;

async function flush() {
  handle = null;
  if (!supabase || !currentUserId || inFlight) return;
  if (!isDirty()) { setSaveStatus('saved'); return; }
  const uid = currentUserId;
  // The sign-in load sets the base and flushes afterwards.
  if (!baseFor(uid)) return;
  // A mutation that left the workspace as the cloud already has it (a badge
  // recount, a sync that found nothing new) sends nothing: no read, no write.
  if (matchesBase(baseFor(uid))) {
    syncedVersion = Math.max(syncedVersion, dirtyVersion);
    setSaveStatus('saved');
    return;
  }
  inFlight = true;
  try {
    let version = 0;
    let done = false;
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS && !done; attempt += 1) {
      const cloud = await readCloudRow(uid);
      if (currentUserId !== uid) break; // signed out while waiting
      const b = baseFor(uid);
      const sameRow = cloud ? b.exists && cloud.updated_at === b.at : !b.exists;
      // Collect after the read, so edits made while it was in flight go too.
      version = dirtyVersion;
      let payload = collect();
      if (!sameRow) {
        if ((!cloud || isErasedData(cloud.data)) && b.exists && !isErasedData(b.data)) {
          // "Delete my data" ran on another device. Don't write this copy back.
          setBase(uid, cloud);
          applyEmptyUserState();
          syncedVersion = Math.max(syncedVersion, version);
          done = true;
          break;
        }
        payload = mergeWorkspace(b.data, payload, cloud ? cloud.data : {});
        adopt(payload, uid);
        // The merged copy now contains the cloud row, so it is the new base.
        setBase(uid, cloud);
      }
      const at = await writeCloudRow(uid, payload, cloud);
      if (at === null) continue; // another device wrote first: read and merge again
      if (currentUserId === uid) setBase(uid, { data: payload, updated_at: at });
      done = true;
    }
    if (!done && currentUserId === uid) throw new Error('user_state kept changing during the write');
    if (done) syncedVersion = Math.max(syncedVersion, version);
    retryDelay = 1500;
    inFlight = false;
    if (isDirty() && currentUserId) { setSaveStatus('saving'); handle = setTimeout(flush, 700); } // more edits arrived mid-flight
    else setSaveStatus('saved');
  } catch {
    // Offline / transient / server error: keep the dirty marker and retry.
    inFlight = false;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    setSaveStatus(offline ? 'offline' : 'error');
    scheduleRetry();
  }
}

/** Force an immediate sync attempt now (used on reconnect / tab hide). */
export function flushNow() {
  if (!supabase || !currentUserId || !isDirty()) return;
  if (handle) { clearTimeout(handle); handle = null; }
  if (retryHandle) { clearTimeout(retryHandle); retryHandle = null; }
  retryDelay = 1500;
  flush();
}

/** Are there local changes not yet confirmed saved to the cloud? */
export function hasPendingSync() { return isDirty(); }

/**
 * Push any unsaved edits now and wait (up to `timeoutMs`) for the write to be
 * confirmed. Resolves true when nothing is left unsaved.
 */
export async function flushAndWait(timeoutMs = 3000) {
  if (!supabase || !currentUserId) return true;
  if (!isDirty() && !inFlight) return true;
  flushNow();
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (!isDirty() && !inFlight) return true;
    if (!inFlight && isDirty() && !handle && !retryHandle) flush();
    await new Promise((r) => setTimeout(r, 100));
  }
  return !isDirty();
}

/**
 * Pull the saved workspace into the store. Returns a tri-state so the caller can
 * tell a genuinely new account (empty) apart from a failed read (error), the
 * latter must NEVER be treated as "new" or it would overwrite real cloud data.
 *   { status: 'loaded' | 'empty' | 'error' }
 */
export async function loadUserState(userId) {
  if (!supabase) return { status: 'empty' };
  try {
    const { data, error } = await supabase
      .from('user_state')
      .select('data, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { status: 'error', error };
    const result = pickLoad(userId, data);
    setBase(userId, data || null);
    // Edits made while the load was in flight were held back (no base yet).
    if (currentUserId === userId && isDirty() && !handle && !inFlight) handle = setTimeout(flush, 700);
    return result;
  } catch (error) {
    return { status: 'error', error };
  }
}

/** Decide between the cloud row and this browser's copy after a load. */
function pickLoad(userId, data) {
  // No row yet, but this browser already holds edits made by this same
  // account (a refresh inside the 700 ms debounce right after sign-up):
  // push them up instead of blanking them. An erased row (data {}) still
  // loads as empty, so "Delete my data" is never undone from a stale tab.
  if (!data && localBelongsTo(userId) && Number(getState().__updatedAt || 0) > 0) {
    scheduleSync();
    return { status: 'loaded' };
  }
  if (!data || !data.data || Object.keys(data.data).length === 0) return { status: 'empty' };
  const local = collect();
  const stored = localBelongsTo(userId) && Number(local.__updatedAt) > 0 ? readStoredBase(userId) : null;
  if (stored) {
    // This browser knows which cloud copy its local one grew from. Another
    // device wrote since then: merge, so neither side's changes are lost.
    // Nobody did: local is that copy plus this browser's own edits.
    const merged = stored.exists && stored.at === data.updated_at
      ? local
      : mergeWorkspace(stored.data, local, data.data);
    adopt(merged, userId);
    if (PER_USER_SLICES.some((k) => !deepEqual(merged[k], data.data[k]))) scheduleSync();
    return { status: 'loaded' };
  }
  // No stored base (first load here, or storage blocked). If local (already hydrated from localStorage) carries edits newer than
  // this cloud copy: e.g. hours logged just before a refresh that the
  // debounced push hadn't flushed yet: keep local and push it up instead of
  // clobbering it with a stale snapshot.
  // Only a copy that belongs to this same account may win; another person's
  // leftover workspace on a shared browser is never pushed into this one.
  const cloudAt = Number(data.data.__updatedAt || 0);
  const localAt = Number(getState().__updatedAt || 0);
  if (localAt > cloudAt && localBelongsTo(userId)) {
    scheduleSync();
    return { status: 'loaded' };
  }
  apply(data.data, userId);
  return { status: 'loaded' };
}

let started = false;
/** Register the store commit hook once, so every mutation schedules a push;
    and flush pending changes the moment the network comes back. */
export function initSync() {
  if (started) return;
  started = true;
  setCommitHook(scheduleSync);
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { retryDelay = 1500; flushNow(); });
    // Best-effort last push when the tab is hidden/closed (mobile WiFi handoff).
    const onHide = () => { if (isDirty()) flushNow(); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') onHide(); });
  }
}
