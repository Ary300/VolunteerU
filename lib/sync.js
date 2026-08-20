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
import { getState, update, setCommitHook } from './store.js';
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
    meta: { firstRun: false, installedAt: null, lastSeen: null },
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

/* ---- current user + debounced push ------------------------------------- */

let currentUserId = null;
let handle = null;

export function setSyncUser(id) {
  currentUserId = id;
  if (!id && handle) {
    clearTimeout(handle);
    handle = null;
  }
}

export function scheduleSync() {
  if (!supabase || !currentUserId || handle) return;
  handle = setTimeout(flush, 700);
}

async function flush() {
  handle = null;
  if (!supabase || !currentUserId) return;
  try {
    await supabase
      .from('user_state')
      .upsert({ user_id: currentUserId, data: collect(), updated_at: new Date().toISOString() });
  } catch {
    /* Offline or transient — the local store still holds everything; the next
       mutation reschedules a push. */
  }
}

/** Pull the saved workspace into the store. Returns true when one existed. */
export async function loadUserState(userId) {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('user_state')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data || !data.data || Object.keys(data.data).length === 0) return false;
  apply(data.data);
  return true;
}

let started = false;
/** Register the store commit hook once, so every mutation schedules a push. */
export function initSync() {
  if (started) return;
  started = true;
  setCommitHook(scheduleSync);
}
