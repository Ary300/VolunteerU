'use client';

/* /projects has no page of its own. Signed in, it opens Lead, where student
   projects are run. Signed out, it shows the student projects on Discover
   instead of sending the visitor to a sign-in form. */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSnapshot, useHydrated } from '../lib/store.js';
import { ScreenFallback } from './AppFrame.jsx';

export default function ProjectsRedirect() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { state } = useSnapshot();
  const authed = !!(state && state.session && state.session.authed);
  useEffect(() => {
    if (!hydrated) return;
    router.replace(authed ? '/lead' : '/discover?kind=student');
  }, [hydrated, authed, router]);
  return <ScreenFallback bare />;
}
