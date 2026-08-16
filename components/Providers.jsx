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
import OverlayHost from './OverlayHost.jsx';
import ScreenNav from './ScreenNav.jsx';
import OfflineBanner from './OfflineBanner.jsx';

/* Routes that require a signed-in account. */
const PROTECTED = ['/app', '/discover', '/opportunity', '/apply', '/lead', '/create', '/profile', '/saved', '/friends', '/projects', '/notifications', '/settings'];
/* Routes a signed-in user should not sit on. */
const AUTH_ONLY = ['/signin', '/signup', '/forgot'];

export default function Providers({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useHydrated();
  const { state } = useSnapshot();

  useEffect(() => {
    hydrate();
  }, []);

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
      <ScreenNav />
      {children}
      <OverlayHost />
    </div>
  );
}
