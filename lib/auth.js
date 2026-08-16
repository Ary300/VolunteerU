/* ==========================================================================
   auth.js — bridges the real Supabase session into the store
   The UI reads auth from `state.session.authed`. On sign-in we load the user's
   cloud workspace (or blank it for a brand-new account) and their identity,
   then register the sync hook so future mutations persist. On sign-out we clear
   the flag. Screens never import this — Providers wires it once, and db.js calls
   applySession right after a real sign-in so navigation can happen immediately.
   ========================================================================== */

'use client';

import { supabase } from './supabase.js';
import { update } from './store.js';
import { setSyncUser, loadUserState, applyEmptyUserState, initSync, scheduleSync } from './sync.js';

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

/** Bring the store in line with a session (or the lack of one). */
export async function applySession(session) {
  initSync();
  if (session && session.user) {
    const { id, email } = session.user;
    setSyncUser(id);
    const had = await loadUserState(id);
    if (!had) {
      // First time on this account: a blank workspace + identity from signup.
      applyEmptyUserState();
      await loadIdentity(id, email);
      scheduleSync();
    }
    update((s) => {
      s.session.authed = true;
      s.session.email = email || s.session.email;
      s.session.signedInAt = s.session.signedInAt || Date.now();
    }, { transient: true });
  } else {
    // The local demo bypass has no Supabase session on purpose — keep it signed
    // in against the seeded record instead of bouncing it to the sign-in page.
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('vu.demo')) {
      return;
    }
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
