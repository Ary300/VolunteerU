'use client';

/* ==========================================================================
   AppFrame.jsx, client boundary for every signed-in screen

   Every screen reads state that only exists in the browser (localStorage) and
   URL search params, so the server has nothing useful to render.
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

/* Skeleton radii come from the scale: pill for the search bar, 16px for
   photo frames, 10px for text lines. Bare routes (auth, onboarding, schools)
   are text pages, so they get a heading bar and three lines instead of a
   listings grid. */
export function ScreenFallback({ bare }) {
  if (bare) {
    return (
      <div className="vu-page" style={S('max-width:720px;margin:0 auto;padding-top:56px')} aria-busy="true" aria-label="Loading">
        <div className="vu-skel" style={S('height:36px;width:min(360px, 70%);border-radius:10px')} />
        <div className="vu-skel" style={S('margin-top:24px;height:14px;width:100%;border-radius:10px')} />
        <div className="vu-skel" style={S('margin-top:12px;height:14px;width:92%;border-radius:10px')} />
        <div className="vu-skel" style={S('margin-top:12px;height:14px;width:64%;border-radius:10px')} />
      </div>
    );
  }
  return (
    <div className="vu-page" aria-busy="true" aria-label="Loading">
      <div className="vu-skel" style={S('height:60px;max-width:880px;border-radius:999px')} />
      <div className="vu-skel" style={S('margin-top:28px;height:16px;width:min(420px, 80%);border-radius:10px')} />
      <div className="vu-grid-3" style={S('margin-top:24px')}>
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div className="vu-skel" style={S('aspect-ratio:4/3;border-radius:16px')} />
            <div className="vu-skel" style={S('margin-top:12px;height:14px;width:70%;border-radius:10px')} />
            <div className="vu-skel" style={S('margin-top:8px;height:12px;width:45%;border-radius:10px')} />
          </div>
        ))}
      </div>
      <div style={S('margin-top:32px')}>
        <SkeletonRows n={2} h={64} />
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
