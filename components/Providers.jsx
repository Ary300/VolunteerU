'use client';

/* ==========================================================================
   Providers.jsx — client root
   Hydrates the persisted store, mirrors accessibility preferences onto <html>,
   enforces route guards, and hosts overlays plus the design's screen nav.
   ========================================================================== */

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { S } from '../lib/style.js';
import { hydrate, useSnapshot, useHydrated } from '../lib/store.js';
import { initAuth } from '../lib/auth.js';
import { syncVolunteerDirectory, refreshNotificationBadge, syncMyListingsVerification, syncMyServiceHours } from '../lib/db.js';
import OverlayHost from './OverlayHost.jsx';
import OfflineBanner from './OfflineBanner.jsx';

/* Routes that require a signed-in account. */
const PROTECTED = ['/app', '/discover', '/crew', '/volunteers', '/opportunity', '/apply', '/lead', '/create', '/profile', '/saved', '/friends', '/projects', '/notifications', '/settings', '/onboarding'];
/* Routes a signed-in user should not sit on. */
const AUTH_ONLY = ['/signin', '/signup', '/forgot'];

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

  /* Mirror preferences onto <html> so CSS can act on them. */
  useEffect(() => {
    if (!hydrated) return;
    const el = document.documentElement;
    const a = state.prefs.appearance;
    el.dataset.motion = a.motion === 'off' ? 'off' : 'system';
    el.dataset.textsize = a.textSize;
    el.dataset.contrast = a.contrast;
  }, [hydrated, state.prefs.appearance]);

  /* Route guards. Runs only after hydration so we never bounce a signed-in
     user during the first paint. */
  useEffect(() => {
    if (!hydrated || !pathname) return;
    const authed = state.session.authed;
    const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (needsAuth && !authed) {
      router.replace(`/signin?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (authed && AUTH_ONLY.includes(pathname)) {
      router.replace('/app');
      return;
    }
    if (authed && needsAuth && !state.onboarding.completed && pathname !== '/onboarding') {
      router.replace('/onboarding');
    }
  }, [hydrated, pathname, state.session.authed, state.onboarding.completed, router]);

  return (
    <div
      className="vu-root"
      style={S(
        'min-height:100vh;min-width:1180px;background:#FAF8F5;background-image:linear-gradient(rgba(31,27,24,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(31,27,24,.028) 1px,transparent 1px);background-size:96px 96px,96px 96px'
      )}
    >
      <OfflineBanner />
      {children}
      <OverlayHost />
    </div>
  );
}
