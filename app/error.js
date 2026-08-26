'use client';

import { useEffect } from 'react';
import { S } from '../lib/style.js';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('[VolunteerU] screen crashed:', error);
  }, [error]);

  return (
    <div role="alert" style={S('min-height:70vh;display:grid;place-items:center;padding:40px')}>
      <div style={S('max-width:460px;text-align:center')}>
        <div
          aria-hidden="true"
          style={S('width:44px;height:44px;margin:0 auto;border-radius:14px;background:#F5E7E0;border:1px solid #EFE3DC;display:grid;place-items:center;font:600 17px/1 Geist;color:#A8482A')}
        >
          !
        </div>
        <div style={S('margin-top:16px;font:600 22px/1.2 Geist;letter-spacing:-0.03em')}>This screen hit a problem</div>
        <div style={S('margin-top:10px;font:450 14px/1.6 Geist;color:#6B635C')}>
          Nothing you saved was lost, your record and projects are still on this device. Try the screen again, or go back home.
        </div>
        <div style={S('margin-top:20px;display:flex;gap:10px;justify-content:center')}>
          <button
            type="button"
            onClick={reset}
            style={S('display:inline-flex;align-items:center;gap:9px;padding:0 18px;height:44px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 15px/1 Geist;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3)')}
          >
            Try again
          </button>
          <a
            href="/"
            style={S('display:inline-flex;align-items:center;padding:0 18px;height:44px;border-radius:12px;border:1px solid #E4DDD4;background:#fff;color:#1A1714;font:600 15px/1 Geist')}
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
