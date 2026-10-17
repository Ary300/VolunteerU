'use client';

/* ==========================================================================
   Providers.jsx, client root
   Hydrates the persisted store, mirrors accessibility preferences onto <html>,
   enforces route guards, and hosts overlays plus the design's screen nav.
   ========================================================================== */

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { S } from '../lib/style.js';
import { hydrate, useSnapshot, useHydrated } from '../lib/store.js';
import { initAuth } from '../lib/auth.js';
import { syncVolunteerDirectory, refreshNotificationBadge, syncMyListingsVerification, syncMyServiceHours, justSignedOut as signedOutRecently } from '../lib/db.js';
import { sameSitePath } from '../lib/safePath.js';
import OverlayHost from './OverlayHost.jsx';
import OfflineBanner from './OfflineBanner.jsx';
import AnalyticsProvider from './AnalyticsProvider.jsx';
import { identifyUser, resetAnalytics } from '../lib/analytics.js';

/* Routes that require a signed-in account. */
const PROTECTED = ['/app', '/crew', '/volunteers', '/opportunity', '/apply', '/lead', '/create', '/profile', '/saved', '/friends', '/projects', '/notifications', '/settings', '/onboarding'];
/* Routes anyone can open, but a signed-in account finishes onboarding first. */
const PUBLIC_IN_APP = ['/discover'];
/* Routes a signed-in user should not sit on. */
const AUTH_ONLY = ['/signin', '/signup', '/forgot'];

/** The ?next= of the current URL when it is a same-site page outside the auth forms, else ''. */
function nextTarget(search) {
  let raw = '';
  try { raw = new URLSearchParams(search).get('next') || ''; } catch { raw = ''; }
  const p = sameSitePath(raw);
  const path = p.split(/[?#]/)[0];
  return p && !AUTH_ONLY.includes(path) ? p : '';
}

export default function Providers({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useHydrated();
  const { state } = useSnapshot();

  useEffect(() => {
    hydrate();
    initAuth();
  }, []);

  /* Keep this volunteer's public directory card in sync once signed in, so
     founders can find them. Idempotent upsert; re-runs when identity/hours/causes
     or the public-profile pref change. */
  useEffect(() => {
    if (!hydrated || !state.session.authed) return;
    syncVolunteerDirectory();
  }, [hydrated, state.session.authed, state.account.name, state.stats.verifiedHours, state.prefs.causes, state.prefs.privacy.publicProfile]);

  /* Reflect a reviewer's verification decision back onto the founder's projects. */
  useEffect(() => {
    if (!hydrated || !state.session.authed) return;
    syncMyListingsVerification();
  }, [hydrated, state.session.authed, state.projects.length]);

  /* Pull org-confirmed service hours into the headline stat, so the profile
     number and the public directory reflect real verified hours. Runs on load
     and on route change; the directory-sync effect above re-publishes when the
     resulting stats.verifiedHours changes. */
  useEffect(() => {
    if (!hydrated || !state.session.authed) return;
    syncMyServiceHours();
  }, [hydrated, state.session.authed, pathname]);

  /* Recompute the notification badge on sign-in and each route change. */
  useEffect(() => {
    if (!hydrated || !state.session.authed) return;
    refreshNotificationBadge();
  }, [hydrated, state.session.authed, pathname]);

  /* Tie analytics events to the signed-in user; reset on sign-out. */
  useEffect(() => {
    if (!hydrated) return;
    const a = state.account;
    if (state.session.authed && a && a.id && a.id !== 'me') {
      identifyUser(a.id, {
        email: a.email || state.session.email || undefined,
        name: a.name || undefined,
        city: a.city || (state.prefs && state.prefs.location) || undefined,
        is_founder: (state.projects || []).length > 0,
      });
    } else if (!state.session.authed) {
      resetAnalytics();
    }
  }, [hydrated, state.session.authed, state.account.id, state.account.email]);

  /* Mirror preferences onto <html> so CSS can act on them. The store mutates
     `prefs.appearance` in place, so the effect keys on the values themselves;
     keying on the object meant a change only showed up after a reload. */
  const appearance = (state.prefs && state.prefs.appearance) || {};
  const motionPref = appearance.motion === 'off' ? 'off' : 'system';
  const textSizePref = appearance.textSize || 'default';
  const contrastPref = appearance.contrast || 'default';
  useEffect(() => {
    if (!hydrated) return;
    const el = document.documentElement;
    el.dataset.motion = motionPref;
    el.dataset.textsize = textSizePref;
    el.dataset.contrast = contrastPref;
  }, [hydrated, motionPref, textSizePref, contrastPref]);

  /* Was the user signed in on the previous render? A true -> false flip means
     they just signed out, which should land on the home page, not on a sign-in
     form that promises to send them back where they were. */
  const wasAuthed = useRef(null);

  /* Onboarding flips `completed` itself and then navigates, so only someone who
     arrives on /onboarding already finished gets sent on. These track whether
     the flip happened while the page was open. */
  const wasCompleted = useRef(null);
  const finishedOnPage = useRef(false);

  /* Route guards. Runs only after hydration so we never bounce a signed-in
     user during the first paint. */
  useEffect(() => {
    if (!hydrated || !pathname) return;
    const authed = state.session.authed;
    const justSignedOut = (wasAuthed.current === true && !authed) || signedOutRecently();
    wasAuthed.current = !!authed;
    const completed = !!state.onboarding.completed;
    if (pathname !== '/onboarding') finishedOnPage.current = false;
    else if (wasCompleted.current === false && completed) finishedOnPage.current = true;
    wasCompleted.current = completed;
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const under = (p) => pathname === p || pathname.startsWith(`${p}/`);
    const needsAuth = PROTECTED.some(under);
    const needsOnboarding = needsAuth || PUBLIC_IN_APP.some(under);
    if (needsAuth && !authed) {
      router.replace(justSignedOut ? '/' : `/signin?next=${encodeURIComponent(pathname + search)}`);
      return;
    }
    if (authed && AUTH_ONLY.includes(pathname)) {
      router.replace(nextTarget(search) || '/app');
      return;
    }
    if (authed && completed && pathname === '/onboarding' && !finishedOnPage.current) {
      // Setup is done; redoing it would overwrite causes, location and goals.
      // Those are edited in Settings instead.
      const target = nextTarget(search);
      router.replace(target && target.split(/[?#]/)[0] !== '/onboarding' ? target : '/app');
      return;
    }
    if (authed && needsOnboarding && !completed && pathname !== '/onboarding') {
      // '/app' is onboarding's own default, so only deep links carry a next=.
      const back = pathname === '/app' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
      router.replace(`/onboarding${back}`);
    }
  }, [hydrated, pathname, state.session.authed, state.onboarding.completed, router]);

  return (
    <div
      className="vu-root"
      style={S(
        'min-height:100vh;min-width:1180px;background:#FAF8F5'
      )}
    >
      <OfflineBanner />
      <AnalyticsProvider />
      {children}
      <OverlayHost />
    </div>
  );
}
