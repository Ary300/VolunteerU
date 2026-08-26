/* ==========================================================================
   supabase.js, the real backend client
   A single browser client for auth + data. The app is client-first (the store
   in store.js is the source of truth for the UI), so the session lives in
   localStorage and is read back on load. Screens never import this directly;
   they go through db.js, which keeps their calls identical to the design.
   ========================================================================== */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when the backend is configured. Lets the app degrade gracefully. */
export const backendConfigured = Boolean(url && anonKey);

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
