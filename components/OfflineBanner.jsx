'use client';

/* ==========================================================================
   OfflineBanner.jsx, only rendered while the network is actually down, so it
   never changes the default appearance of any screen.
   ========================================================================== */

import { useLayoutEffect, useRef } from 'react';
import { S } from '../lib/style.js';
import { C, F } from '../lib/tokens.js';
import { useSnapshot, storageAvailable } from '../lib/store.js';

/* Publishes the banner's height as --vu-banner-h on <html>, so the mobile bar,
   the nav drawer and the page start below the banner rather than under it.
   Without this the banner covered the menu button on phones. */
function useBannerHeight(ref, shown) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!shown || !el) {
      root.style.removeProperty('--vu-banner-h');
      return undefined;
    }
    const apply = () => root.style.setProperty('--vu-banner-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    if (ro) ro.observe(el);
    return () => {
      if (ro) ro.disconnect();
      root.style.removeProperty('--vu-banner-h');
    };
  }, [ref, shown]);
}

export default function OfflineBanner() {
  const { ephemeral } = useSnapshot();
  const ref = useRef(null);
  const offline = ephemeral.hydrated && !ephemeral.online;
  const noStorage = ephemeral.hydrated && !storageAvailable();
  // Online, but the cloud sync keeps failing (flaky WiFi / server). Local data
  // is safe; we keep retrying, but tell the user rather than pretend it saved.
  const syncTrouble = ephemeral.hydrated && !offline && ephemeral.saveStatus === 'error';
  const shown = offline || noStorage || syncTrouble;
  useBannerHeight(ref, shown);
  if (!shown) return null;

  const text = offline
    ? "You're offline. Changes are saved on this device and sync when you reconnect."
    : noStorage
      ? "This browser is blocking storage, so changes won't survive a reload."
      : "Changes aren't reaching the server. They're saved on this device and we'll keep trying.";

  return (
    <div
      ref={ref}
      role="status"
      className="vu-noprint"
      style={S(
        `position:fixed;z-index:90;top:0;left:0;right:0;padding:10px 16px;text-align:center;background:${C.ink};color:#fff;font:500 13px/1.4 ${F.body}`
      )}
    >
      {text}
    </div>
  );
}
