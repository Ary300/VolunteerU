'use client';

/* ==========================================================================
   analytics.js, product analytics via PostHog (autocapture + custom events).
   SSR-safe: every call no-ops on the server and lazily initialises the client
   the first time it runs in the browser. The key is a public client key
   (phc_…) inlined at build time, exactly like the Supabase anon key.
   ========================================================================== */

import posthog from 'posthog-js';

let started = false;

export function initAnalytics() {
  if (started || typeof window === 'undefined') return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.posthog.com';
  if (!key) return; // analytics simply off when unconfigured
  started = true;
  try {
    posthog.init(key, {
      api_host: host,
      capture_pageview: false, // captured manually on route change (App Router)
      capture_pageleave: true,
      autocapture: true, // deep tracking: clicks, form interactions, etc.
      persistence: 'localStorage+cookie',
      person_profiles: 'identified_only',
    });
  } catch { started = false; }
}

/** Fire a custom product event, e.g. track('hours_logged', { hrs: 3 }). */
export function track(event, props) {
  initAnalytics();
  if (!started) return;
  try { posthog.capture(event, props || {}); } catch { /* never break the app for analytics */ }
}

/** Tie subsequent events to a real user (call on sign-in). */
export function identifyUser(id, props) {
  initAnalytics();
  if (!started || !id) return;
  try { posthog.identify(String(id), props || {}); } catch { /* noop */ }
}

/** Clear the identity on sign-out so the next person is separate. */
export function resetAnalytics() {
  if (!started) return;
  try { posthog.reset(); } catch { /* noop */ }
}

/** Manual pageview (App Router SPA navigations don't fire one automatically). */
export function capturePageview() {
  initAnalytics();
  if (!started) return;
  try { posthog.capture('$pageview'); } catch { /* noop */ }
}
