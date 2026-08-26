'use client';

/* ==========================================================================
   OfflineBanner.jsx, only rendered while the network is actually down, so it
   never changes the default appearance of any screen.
   ========================================================================== */

import { S } from '../lib/style.js';
import { useSnapshot, storageAvailable } from '../lib/store.js';

export default function OfflineBanner() {
  const { ephemeral } = useSnapshot();
  if (!ephemeral.hydrated) return null;

  const offline = !ephemeral.online;
  const noStorage = !storageAvailable();
  // Online, but the cloud sync keeps failing (flaky WiFi / server). Local data
  // is safe; we keep retrying, but tell the user rather than pretend it saved.
  const syncTrouble = !offline && ephemeral.saveStatus === 'error';
  if (!offline && !noStorage && !syncTrouble) return null;

  const text = offline
    ? 'You are offline. Your changes are saved on this device and will sync automatically when you reconnect.'
    : noStorage
      ? 'This browser is blocking local storage, so changes will not survive a reload.'
      : 'Trouble saving to the cloud, your changes are safe on this device and we are retrying.';

  return (
    <div
      role="status"
      className="vu-noprint"
      style={S(
        'position:fixed;z-index:90;top:0;left:0;right:0;padding:9px 16px;text-align:center;background:#1F1B18;color:#F1EBE4;font:500 12px/1.4 Geist;letter-spacing:-0.01em'
      )}
    >
      {text}
    </div>
  );
}
