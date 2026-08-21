'use client';

/* ==========================================================================
   AnalyticsProvider.jsx — boots PostHog once and records a pageview on every
   client route change (the App Router doesn't fire one on SPA navigation).
   Renders nothing. Mounted once by Providers.
   ========================================================================== */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { initAnalytics, capturePageview } from '../lib/analytics.js';

export default function AnalyticsProvider() {
  const pathname = usePathname();

  useEffect(() => { initAnalytics(); }, []);

  useEffect(() => {
    if (pathname) capturePageview();
  }, [pathname]);

  return null;
}
