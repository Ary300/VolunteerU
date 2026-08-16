/* ==========================================================================
   overlays.js — imperative surface for toasts, modals, menus and confirms
   Action handlers live outside the render tree, so these need to be callable
   from plain functions. A tiny external store keeps React in charge of the DOM.
   ========================================================================== */

import { useSyncExternalStore } from 'react';

let seq = 0;
let state = { toasts: [], modals: [], menu: null };
const empty = state;
const listeners = new Set();

function emit(next) {
  state = next;
  for (const fn of Array.from(listeners)) fn();
}
function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useOverlays() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => empty
  );
}

/* ---- toasts ------------------------------------------------------------- */

const timers = new Map();

export function toast(input) {
  const o = typeof input === 'string' ? { title: input } : input || {};
  const {
    title = '',
    message = '',
    tone = 'brand',
    timeout = 4200,
    actionLabel = '',
    onAction = null,
  } = o;

  // Collapse duplicates so a double-tap does not stack identical toasts.
  const dedupe = o.dedupe || `${tone}|${title}|${message}`;
  const existing = state.toasts.find((t) => t.dedupe === dedupe && !t.out);
  if (existing) {
    resetTimer(existing.id, timeout);
    emit({ ...state, toasts: state.toasts.map((t) => (t.id === existing.id ? { ...t, nudge: (t.nudge || 0) + 1 } : t)) });
    return existing.id;
  }

  const id = `toast-${++seq}`;
  emit({ ...state, toasts: [...state.toasts, { id, title, message, tone, actionLabel, onAction, dedupe, out: false }] });
  resetTimer(id, timeout);
  return id;
}

function resetTimer(id, ms) {
  clearTimeout(timers.get(id));
  if (!ms) return;
  timers.set(id, setTimeout(() => dismissToast(id), ms));
}

export function holdToast(id) {
  clearTimeout(timers.get(id));
}
export function releaseToast(id) {
  resetTimer(id, 1800);
}

export function dismissToast(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  emit({ ...state, toasts: state.toasts.map((t) => (t.id === id ? { ...t, out: true } : t)) });
  setTimeout(() => emit({ ...state, toasts: state.toasts.filter((t) => t.id !== id) }), 200);
}

/* ---- modals ------------------------------------------------------------- */

/**
 * `Body` is a component rendered with `{ api }` so dialogs can own their form
 * state. `footer` is a function of `api` for the same reason.
 */
export function openModal(config) {
  const id = `modal-${++seq}`;
  const api = {
    id,
    close(reason) {
      closeModal(id, reason);
    },
  };
  const entry = { id, api, dismissable: true, ...config };
  emit({ ...state, modals: [...state.modals, entry] });
  return api;
}

export function closeModal(id, reason) {
  const entry = state.modals.find((m) => m.id === id);
  if (!entry) return;
  emit({ ...state, modals: state.modals.filter((m) => m.id !== id) });
  if (entry.onClose) entry.onClose(reason);
}

export function closeTopOverlay() {
  if (state.menu) {
    closeMenu();
    return true;
  }
  const top = state.modals[state.modals.length - 1];
  if (top && top.dismissable !== false) {
    closeModal(top.id, 'escape');
    return true;
  }
  return false;
}

export function hasOverlay() {
  return state.modals.length > 0 || !!state.menu;
}

/* ---- confirmation ------------------------------------------------------- */

export function confirmDialog(config) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    openModal({
      kind: 'confirm',
      size: 'slim',
      title: config.title || 'Are you sure?',
      body: config.body || '',
      confirmLabel: config.confirmLabel || 'Confirm',
      cancelLabel: config.cancelLabel || 'Cancel',
      tone: config.tone || 'danger',
      requireText: config.requireText || '',
      onResolve: finish,
      onClose: () => finish(false),
    });
  });
}

/* ---- anchored menu ------------------------------------------------------ */

export function openMenu(anchorRect, items, onPick, opts = {}) {
  emit({ ...state, menu: { rect: anchorRect, items, onPick, id: `menu-${++seq}`, ...opts } });
}

export function closeMenu() {
  if (state.menu) emit({ ...state, menu: null });
}

/** Convenience for click handlers: derives the rect from the event target. */
export function menuFromEvent(e, items, onPick, opts) {
  const el = e.currentTarget || e.target;
  const rect = el.getBoundingClientRect();
  openMenu({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, items, onPick, opts);
}
