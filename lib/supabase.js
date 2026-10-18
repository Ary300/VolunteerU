/* ==========================================================================
   supabase.js, the real backend client
   A single browser client for auth + data. The app is client-first (the store
   in store.js is the source of truth for the UI), so the session lives in
   localStorage and is read back on load. Screens never import this directly;
   they go through db.js, which keeps their calls identical to the design.
   ========================================================================== */

import { createClient } from '@supabase/supabase-js';
import { supabaseUrl as url, supabaseAnonKey as anonKey } from './supabaseConfig.js';

/** True when the backend is configured. Lets the app degrade gracefully. */
export const backendConfigured = Boolean(url && anonKey);

/* Read before the client is created: detectSessionInUrl consumes the hash, and
   the PASSWORD_RECOVERY event can fire before any listener is attached. auth.js
   uses this to forward a recovery link that landed off /reset. */
export const recoveryLinkOnLoad =
  typeof window !== 'undefined' &&
  /(^|[#&?])type=recovery(&|$)/.test(`${window.location.hash || ''}&${(window.location.search || '').replace(/^\?/, '')}`);

export const supabase = backendConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'volunteeru.auth',
      },
    })
  : null;
