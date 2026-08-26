/* ==========================================================================
   store.js, single source of truth
   An external store read through `useSyncExternalStore`, so any component can
   subscribe without prop drilling and the server render stays deterministic.
   Persisted slices survive reload; ephemeral slices (overlays, in-flight
   requests, sidebar) deliberately do not.
   ========================================================================== */

import { useSyncExternalStore, useCallback } from 'react';
import { makeInitialState } from './seed.js';

const KEY = 'volunteeru.state.v1';
// Bump when shared seed data changes shape, so stale local copies are dropped.
// The user's own workspace survives, it reloads from the cloud on sign-in.
const SCHEMA = 3;

let state = makeInitialState();
state.__schema = SCHEMA;

let ephemeral = {
  hydrated: false,
  online: true,
  pending: {},
  sidebarOpen: false,
  storageOK: true,
  saveStatus: 'idle', // idle | saving | saved | offline | error (cloud sync)
};

let snapshot = { state, ephemeral };
const listeners = new Set();
let saveHandle = null;

/* The server has no localStorage; it always renders the pristine seed so the
   markup matches what the client renders before hydration completes. */
const serverSnapshot = snapshot;

/* ---- persistence -------------------------------------------------------- */

function canStore() {
  if (typeof window === 'undefined' || !ephemeral.storageOK) return false;
  try {
    window.localStorage.setItem('__vu_probe__', '1');
    window.localStorage.removeItem('__vu_probe__');
    return true;
  } catch {
    ephemeral.storageOK = false;
    return false;
  }
}

function persistNow() {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    ephemeral = { ...ephemeral, storageOK: false };
    // Quota exceeded or private browsing, keep running from memory.
    console.warn('[VolunteerU] could not save locally:', err && err.name);
  }
}

function schedulePersist() {
  if (typeof window === 'undefined' || saveHandle) return;
  saveHandle = window.setTimeout(() => {
    saveHandle = null;
    persistNow();
  }, 200);
}

export function forcePersist() {
  if (saveHandle) {
    clearTimeout(saveHandle);
    saveHandle = null;
  }
  persistNow();
}

/* ---- notification ------------------------------------------------------- */

function emit() {
  snapshot = { state, ephemeral };
  for (const fn of Array.from(listeners)) fn();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot() {
  return snapshot;
}
function getServerSnapshot() {
  return serverSnapshot;
}

/* ---- mutation ----------------------------------------------------------- */

/* A single hook invoked after every persisted mutation, used by sync.js to
   push the user's workspace to the cloud. Registered via setCommitHook so the
   store has no hard dependency on the backend. */
let commitHook = null;
export function setCommitHook(fn) {
  commitHook = fn;
}

/**
 * Apply a mutation. `fn` receives the live state object and may mutate it.
 * A new top-level reference is published so React sees the change.
 */
export function update(fn, opts = {}) {
  const result = fn(state);
  state = { ...state };
  if (!opts.transient) {
    schedulePersist();
    if (commitHook) commitHook();
  }
  // `silent` writes (autosaved drafts) persist without forcing a re-render.
  if (!opts.silent) emit();
  return result;
}

export function updateEphemeral(fn) {
  const next = { ...ephemeral };
  const result = fn(next);
  ephemeral = next;
  emit();
  return result;
}

export function getState() {
  return state;
}
export function eph() {
  return ephemeral;
}

/* ---- hydration ---------------------------------------------------------- */

let hydrationStarted = false;

/** Load persisted state. Safe to call repeatedly; only the first call works. */
export function hydrate() {
  if (hydrationStarted || typeof window === 'undefined') return;
  hydrationStarted = true;

  let saved = null;
  if (canStore()) {
    try {
      const rawText = window.localStorage.getItem(KEY);
      if (rawText) {
        const parsed = JSON.parse(rawText);
        if (parsed && parsed.__schema === SCHEMA) saved = parsed;
      }
    } catch {
      // Corrupted payload: discard rather than crash on every render.
      try {
        window.localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
    }
  }

  if (saved) {
    // Merge forward any slice added since this profile was first written.
    const fresh = makeInitialState();
    for (const k of Object.keys(fresh)) if (!(k in saved)) saved[k] = fresh[k];
    state = saved;
  }

  ephemeral = { ...ephemeral, hydrated: true, online: navigator.onLine };
  emit();

  window.addEventListener('online', () => updateEphemeral((e) => { e.online = true; }));
  window.addEventListener('offline', () => updateEphemeral((e) => { e.online = false; }));
  window.addEventListener('pagehide', forcePersist);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') forcePersist();
  });

  // Another tab wrote a newer state.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      const next = JSON.parse(e.newValue);
      if (next && next.__schema === SCHEMA) {
        state = next;
        emit();
      }
    } catch {
      /* ignore */
    }
  });
}

/* ---- React bindings ----------------------------------------------------- */

export function useStore(selector) {
  const select = useCallback(
    () => (selector ? selector(getSnapshot().state, getSnapshot().ephemeral) : getSnapshot().state),
    [selector]
  );
  return useSyncExternalStore(subscribe, select, select);
}

/** Full snapshot, use when a screen reads many slices. */
export function useSnapshot() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot().ephemeral.hydrated,
    () => false
  );
}

/* ---- backup / restore --------------------------------------------------- */

export function exportState() {
  return JSON.stringify(state, null, 2);
}

export function importState(json) {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object') throw new Error('That is not a VolunteerU backup file.');
  if (parsed.__schema !== SCHEMA) throw new Error('That backup was made by a different version of VolunteerU.');
  state = parsed;
  forcePersist();
  emit();
  return state;
}

export function resetStore() {
  state = makeInitialState();
  state.__schema = SCHEMA;
  forcePersist();
  emit();
  return state;
}

export function storageAvailable() {
  return ephemeral.storageOK;
}
