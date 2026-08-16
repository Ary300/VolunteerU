/* ==========================================================================
   auth.js — bridges the real Supabase session into the store
   The UI reads auth from `state.session.authed` (see Providers route guards).
   This keeps that flag, and `state.account`, in sync with the real session:
   on load, and on every sign-in / sign-out. Screens never import this — it is
   wired once from Providers, and db.js calls Supabase auth directly.
   ========================================================================== */

'use client';

import { supabase } from './supabase.js';
import { update } from './store.js';

/** Pull the profile row into state.account so the UI shows the real person. */
export async function loadProfile(userId) {
  if (!supabase) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (!data) return null;
  update((s) => {
    s.account.id = data.id;
    if (data.email) s.account.email = data.email;
    if (data.first_name) s.account.firstName = data.first_name;
    if (data.last_name) s.account.lastName = data.last_name;
    const full = `${data.first_name || ''} ${data.last_name || ''}`.trim();
    if (full) s.account.name = full;
    if (data.phone) s.account.phone = data.phone;
    if (data.grade != null) s.account.grade = data.grade;
    if (data.age != null) s.account.age = data.age;
    if (data.school) s.account.school = data.school;
    if (data.city) s.account.city = data.city;
    if (data.zip) s.account.zip = data.zip;
    if (data.avatar) s.account.avatar = data.avatar;
    if (typeof data.bio === 'string') s.account.bio = data.bio;
    if (data.onboarding && typeof data.onboarding === 'object') {
      s.onboarding = { ...s.onboarding, ...data.onboarding };
    }
    if (data.prefs && typeof data.prefs === 'object' && Object.keys(data.prefs).length) {
      s.prefs = { ...s.prefs, ...data.prefs };
    }
  });
  return data;
}

async function applySession(session) {
  if (session && session.user) {
    update((s) => {
      s.session.authed = true;
      s.session.email = session.user.email || s.session.email;
      s.session.signedInAt = s.session.signedInAt || Date.now();
    });
    await loadProfile(session.user.id);
  } else {
    update((s) => {
      s.session.authed = false;
      s.session.signedInAt = null;
    });
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
