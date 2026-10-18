'use client';

/* ==========================================================================
   RouteProgress.jsx, the thin Ember bar at the top of the window while a
   route change is on its way.

   Hand-rolled for the App Router, no dependency:
   - starts on a click on a same-site link that goes somewhere else, or when
     the router fetches a page (the `?_rsc=` request a router.push or a
     link sends; prefetches and server actions are left out);
   - shows only when the change takes longer than SHOW_AFTER_MS (60ms when
     a click or key press started it), so a fast change never flashes a bar;
   - the .vu-btn that started it wears its pressed colour until it lands;
   - finishes when the pathname or query string changes, or when the page
     request settles without changing the URL (router.refresh).
   Mounted once in OverlayHost, which lives in the root Providers and so
   survives every navigation. Reduced motion: the bar still shows and hides,
   with no sliding (globals.css collapses the transitions).
   ========================================================================== */

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const SHOW_AFTER_MS = 120;
// A route change someone just clicked or keyed shows sooner; one nobody
// asked for (a redirect, a refresh) keeps the longer delay.
const PRESSED_SHOW_AFTER_MS = 60;
const PRESS_WINDOW_MS = 1000;
const GIVE_UP_MS = 10000;
const DONE_FADE_MS = 220;

/* One controller per window; the component only renders its state. */
const ctl = {
  tokens: new Set(),
  listeners: new Set(),
  phase: 'idle', // idle | wait | run | done
  showTimer: 0,
  giveUpTimer: 0,
  doneTimer: 0,
  set(phase) {
    this.phase = phase;
    for (const fn of Array.from(this.listeners)) fn(phase);
  },
  pressedEl: null,
  start(token) {
    this.tokens.add(token);
    clearTimeout(this.giveUpTimer);
    this.giveUpTimer = setTimeout(() => this.finishAll(), GIVE_UP_MS);
    if (this.phase === 'run' || this.phase === 'wait') return;
    clearTimeout(this.doneTimer);
    this.set('wait');
    const pressed = Date.now() - lastPress.at < PRESS_WINDOW_MS ? lastPress.el : null;
    if (pressed && pressed.isConnected) {
      // The button that started it keeps its pressed colour until the route
      // lands (globals.css [data-nav-pending]), the way sidebar items do.
      pressed.setAttribute('data-nav-pending', 'true');
      this.pressedEl = pressed;
    }
    clearTimeout(this.showTimer);
    this.showTimer = setTimeout(() => {
      if (this.tokens.size) this.set('run');
    }, lastPress.at && Date.now() - lastPress.at < PRESS_WINDOW_MS ? PRESSED_SHOW_AFTER_MS : SHOW_AFTER_MS);
  },
  releasePressed() {
    if (this.pressedEl) this.pressedEl.removeAttribute('data-nav-pending');
    this.pressedEl = null;
  },
  finish(token) {
    this.tokens.delete(token);
    if (!this.tokens.size) this.complete();
  },
  finishAll() {
    this.tokens.clear();
    this.complete();
  },
  complete() {
    clearTimeout(this.showTimer);
    clearTimeout(this.giveUpTimer);
    this.releasePressed();
    if (this.phase === 'run') {
      this.set('done');
      clearTimeout(this.doneTimer);
      this.doneTimer = setTimeout(() => this.set('idle'), DONE_FADE_MS);
    } else if (this.phase !== 'idle' && this.phase !== 'done') {
      this.set('idle');
    }
  },
};

/** Start the bar by hand, for a navigation the listeners below can't see. */
export function startRouteProgress() {
  if (typeof window !== 'undefined') ctl.start('manual');
}

/* The last control someone pressed (pointer or Enter/Space), so a route
   change it starts can mark it and show the bar sooner. */
const lastPress = { el: null, at: 0 };
function onPress(e) {
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  const t = e.type === 'keydown' ? document.activeElement : e.target;
  lastPress.at = Date.now();
  lastPress.el = t && t.closest ? t.closest('.vu-btn') : null;
}

/** Same-site link clicks that will change the URL. Runs in the bubble phase,
    after React's handlers, so a handler that called preventDefault (a quick
    view opened instead) never starts the bar. */
function onDocumentClick(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if (!a || a.target && a.target !== '_self' || a.hasAttribute('download')) return;
  let url;
  try { url = new URL(a.href, window.location.href); } catch { return; }
  if (url.origin !== window.location.origin) return;
  const here = window.location;
  if (url.pathname === here.pathname && url.search === here.search) return; // same page or a #hash jump
  ctl.start('link');
}

let fetchPatched = false;
let seq = 0;
function headerOf(init, name) {
  const h = init && init.headers;
  if (!h) return null;
  if (typeof h.get === 'function') return h.get(name);
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? h[key] : null;
}
/** The router's page requests (router.push, router.replace, links that were
    not prefetched) carry `_rsc` in the URL. */
function patchFetch() {
  if (fetchPatched || typeof window.fetch !== 'function') return;
  fetchPatched = true;
  const original = window.fetch.bind(window);
  window.fetch = function routeAwareFetch(input, init) {
    let isNav = false;
    try {
      const href = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
      const url = new URL(href, window.location.href);
      isNav = url.origin === window.location.origin
        && url.searchParams.has('_rsc')
        && !headerOf(init, 'Next-Router-Prefetch')
        && !headerOf(init, 'Next-Action');
    } catch { /* not a URL we know */ }
    if (!isNav) return original(input, init);
    const token = `rsc-${++seq}`;
    ctl.start(token);
    const p = original(input, init);
    // The response arrives before React commits the new page; the URL change
    // that follows finishes the bar. This settles refreshes, which keep the URL.
    p.then(() => setTimeout(() => ctl.finish(token), 0), () => ctl.finish(token));
    return p;
  };
}

function Watcher() {
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params ? params.toString() : '';
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    ctl.finishAll();
  }, [pathname, search]);
  return null;
}

export default function RouteProgress() {
  const [phase, setPhase] = useState('idle');
  useEffect(() => {
    ctl.listeners.add(setPhase);
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('click', onPress, true);
    document.addEventListener('keydown', onPress, true);
    patchFetch();
    return () => {
      ctl.listeners.delete(setPhase);
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('pointerdown', onPress, true);
      document.removeEventListener('click', onPress, true);
      document.removeEventListener('keydown', onPress, true);
    };
  }, []);
  const state = phase === 'run' ? 'run' : phase === 'done' ? 'done' : 'idle';
  return (
    <>
      <Suspense fallback={null}>
        <Watcher />
      </Suspense>
      <div className="vu-progress" data-state={state} aria-hidden="true">
        <span className="vu-progress-bar" />
      </div>
    </>
  );
}
