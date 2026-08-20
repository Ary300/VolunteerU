/* ==========================================================================
   sync.js — the store, in the cloud
   The app is client-first: store.js is the source of truth for the UI. This
   mirrors the per-user slices of that store to Supabase (debounced on every
   mutation) and loads them back on sign-in. Shared/public data (opportunities,
   peer projects) is never synced — only the user's own workspace. Last write
   wins, exactly like the local cross-tab persistence.
   ========================================================================== */

'use client';

import { supabase } from './supabase.js';
import { getState, update, updateEphemeral, setCommitHook } from './store.js';
import { makeInitialState } from './seed.js';

/* The slices that belong to one user. Everything else in state is shared seed
   data (opportunities, peerProjects) or ephemeral. */
export const PER_USER_SLICES = [
  'account', 'prefs', 'onboarding', 'saved', 'friendsGoing', 'stats',
  'requirement', 'applications', 'bookings', 'hoursLog', 'myAttendance',
  'leadFeedback', 'badges', 'causeBars', 'projects', 'activeProjectId',
  'drafts', 'notifications', 'recentSearches', 'ui', 'meta',
];

function collect(s = getState()) {
  const out = {};
  for (const k of PER_USER_SLICES) out[k] = s[k];
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
    hoursLog: [], myAttendance: [], leadFeedback: [], badges: [], causeBars: [],
    projects: [], activeProjectId: null,
    drafts: { create: null, apply: {} },
    notifications: [], recentSearches: [],
    stats: {
      verifiedHours: 0, events: 0, orgs: 0, causes: 0, leadershipHours: 0,
      thisMonth: 0, bestMonth: 0, avgShift: 0, pendingVerification: 0,
      activeWeeks: 0, currentStreak: 0, bestStreak: 0, lastActiveWeek: '', showRate: 0, onTime: 0,
      averageScore: '—', hoursGenerated: 0, recruited: 0,
    },
    requirement: {
      termDone: 0, termGoal: 40, yearCounted: 0, yearGoal: 40,
      deadline: 'June 1', counselor: '', lastConfirmed: '—',
    },
    ui: seed.ui,
    meta: { firstRun: false, installedAt: null, lastSeen: null, tutorialSeen: false, founderTutorialSeen: false },
  };
}

function apply(sliceObject) {
  update((s) => {
    for (const k of PER_USER_SLICES) {
      if (k in sliceObject) s[k] = sliceObject[k];
    }
  }, { transient: true }); // don't re-sync what we just loaded
}

/** Blank the workspace for a new account. */
export function applyEmptyUserState() {
  apply(makeEmptyUserState());
}

/* ---- current user + durable cloud sync (an outbox, not fire-and-forget) ----
   Every mutation bumps `dirtyVersion`. flush() persists the whole workspace and,
   only on a confirmed write, advances `syncedVersion`. A failure (offline, 5xx,
   RLS, network throw) NEVER clears the dirty marker — it retries with backoff,
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

async function flush() {
  handle = null;
  if (!supabase || !currentUserId || inFlight) return;
  if (!isDirty()) { setSaveStatus('saved'); return; }
  const version = dirtyVersion; // the version this write will represent
  inFlight = true;
  try {
    const { error } = await supabase
      .from('user_state')
      .upsert({ user_id: currentUserId, data: collect(), updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;
    syncedVersion = Math.max(syncedVersion, version);
    retryDelay = 1500;
    inFlight = false;
    if (isDirty()) { setSaveStatus('saving'); handle = setTimeout(flush, 700); } // more edits arrived mid-flight
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
 * Pull the saved workspace into the store. Returns a tri-state so the caller can
 * tell a genuinely new account (empty) apart from a failed read (error) — the
 * latter must NEVER be treated as "new" or it would overwrite real cloud data.
 *   { status: 'loaded' | 'empty' | 'error' }
 */
export async function loadUserState(userId) {
  if (!supabase) return { status: 'empty' };
  try {
    const { data, error } = await supabase
      .from('user_state')
      .select('data')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { status: 'error', error };
    if (!data || !data.data || Object.keys(data.data).length === 0) return { status: 'empty' };
    apply(data.data);
    return { status: 'loaded' };
  } catch (error) {
    return { status: 'error', error };
  }
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
