'use client';

/* ==========================================================================
   AppFrame.jsx — client boundary for every signed-in screen

   Every screen reads state that only exists in the browser (localStorage) and
   URL search params, so there is nothing meaningful for the server to render.
   Gating on mount gives one render path instead of two: no hydration mismatch,
   no postponed Suspense boundary to resume, and a real skeleton while the
   store hydrates.
   ========================================================================== */

import { Suspense, useEffect, useState } from 'react';
import { S } from '../lib/style.js';
import AppShell from './AppShell.jsx';
import { SkeletonRows } from './ui.jsx';

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function ScreenFallback({ bare }) {
  return (
    <div
      className={bare ? 'vu-fixed-width vu-fluid-mobile' : 'vu-pad-40'}
      style={S(bare ? 'min-width:1180px;padding:64px 40px' : 'padding:32px 40px 96px')}
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="vu-skel" style={S('height:34px;width:280px;border-radius:10px')} />
      <div className="vu-skel" style={S('margin-top:14px;height:16px;width:420px;border-radius:8px')} />
      <div style={S('margin-top:26px')}>
        <SkeletonRows n={4} h={120} />
      </div>
    </div>
  );
}

export default function AppFrame({ children }) {
  const mounted = useMounted();
  if (!mounted) return <ScreenFallback bare />;
  return (
    <AppShell>
      <Suspense fallback={<ScreenFallback />}>{children}</Suspense>
    </AppShell>
  );
}

/** Full-page screens with no app chrome (auth, onboarding, marketing). */
export function PlainFrame({ children }) {
  const mounted = useMounted();
  if (!mounted) return <ScreenFallback bare />;
  return <Suspense fallback={<ScreenFallback bare />}>{children}</Suspense>;
}
