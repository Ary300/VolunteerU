/* ==========================================================================
   auth.js, bridges the real Supabase session into the store
   The UI reads auth from `state.session.authed`. On sign-in we load the user's
   cloud workspace (or blank it for a brand-new account) and their identity,
   then register the sync hook so future mutations persist. On sign-out we clear
   the flag. Screens never import this, Providers wires it once, and db.js calls
   applySession right after a real sign-in so navigation can happen immediately.
   ========================================================================== */

'use client';

import { supabase } from './supabase.js';
import { update } from './store.js';
import { setSyncUser, loadUserState, applyEmptyUserState, initSync, scheduleSync, getSyncUser } from './sync.js';

/** Identity from the profiles row, used when there is no saved workspace yet. */
async function loadIdentity(userId, email) {
  if (!supabase) return;
  const { data } = await supabase.from('profiles').select('first_name, last_name, email').eq('id', userId).maybeSingle();
  update((s) => {
    s.account.id = userId;
    s.account.email = (data && data.email) || email || s.account.email;
    if (data && data.first_name) s.account.firstName = data.first_name;
    if (data && data.last_name) s.account.lastName = data.last_name;
    const full = `${(data && data.first_name) || ''} ${(data && data.last_name) || ''}`.trim();
    if (full) s.account.name = full;
  }, { transient: true });
}

// The user whose cloud workspace we have actually loaded this session. Guards
// against a token refresh (same user) re-pulling, or worse, blanking, state.
let loadedUserId = null;
let loadRetry = null;

/** Retry a failed cloud load with backoff. NEVER blanks local state: a read
    error must not be mistaken for a new account (that would push empty over
    real data). Only a genuine 'empty' result seeds a blank workspace. */
function retryLoadUserState(id, email, delay = 2000) {
  if (loadRetry) clearTimeout(loadRetry);
  loadRetry = setTimeout(async () => {
    loadRetry = null;
    if (getSyncUser() !== id) return; // signed out / switched user
    const res = await loadUserState(id);
    if (res.status === 'loaded') { loadedUserId = id; }
    else if (res.status === 'empty') { applyEmptyUserState(); await loadIdentity(id, email); scheduleSync(); loadedUserId = id; }
    else retryLoadUserState(id, email, Math.min(delay * 2, 30000));
  }, delay);
}

/** Bring the store in line with a session (or the lack of one). */
export async function applySession(session) {
  initSync();
  if (session && session.user) {
    const { id, email } = session.user;
    setSyncUser(id);
    update((s) => {
      s.session.authed = true;
      s.session.email = email || s.session.email;
      s.session.signedInAt = s.session.signedInAt || Date.now();
    }, { transient: true });
    // Already loaded this user's workspace? A token refresh must not re-pull
    // (it would drop un-flushed local edits) or blank on a transient error.
    if (loadedUserId === id) return;
    const res = await loadUserState(id);
    if (res.status === 'loaded') {
      loadedUserId = id;
    } else if (res.status === 'empty') {
      // Genuinely new account: a blank workspace + identity from signup.
      applyEmptyUserState();
      await loadIdentity(id, email);
      scheduleSync();
      loadedUserId = id;
    } else {
      // Read FAILED (offline / 5xx). Keep whatever local state we have, do NOT
      // blank and do NOT push empty over the real cloud row. Retry until it loads.
      retryLoadUserState(id, email);
    }
  } else {
    // The local demo bypass has no Supabase session on purpose, keep it signed
    // in against the seeded record instead of bouncing it to the sign-in page.
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('vu.demo')) {
      return;
    }
    loadedUserId = null;
    if (loadRetry) { clearTimeout(loadRetry); loadRetry = null; }
    setSyncUser(null);
    update((s) => {
      s.session.authed = false;
      s.session.signedInAt = null;
    }, { transient: true });
  }
}

let started = false;

/** Called once from Providers. Reads the current session, then listens. */
export function initAuth() {
  if (started || !supabase) return;
  started = true;
  supabase.auth.getSession().then(({ data }) => applySession(data.session));
  supabase.auth.onAuthStateChange((_event, session) => {
    applySession(session);
  });
}
