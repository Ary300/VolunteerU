'use client';

import { useEffect } from 'react';
import { S } from '../lib/style.js';
import { Icon } from '../components/ui.jsx';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('[VolunteerU] screen crashed:', error);
  }, [error]);

  return (
    <div role="alert" style={S('min-height:70vh;display:grid;place-items:center;padding:40px')}>
      <div style={S('max-width:460px;text-align:center')}>
        <div
          aria-hidden="true"
          style={S('width:44px;height:44px;margin:0 auto;border-radius:14px;background:#F5E7E0;display:grid;place-items:center;color:#A8482A')}
        >
          <Icon name="alert" size={20} />
        </div>
        <div style={S('margin-top:16px;font:600 22px/1.2 Geist;letter-spacing:-0.03em')}>This page didn't load</div>
        <div style={S('margin-top:10px;font:450 14px/1.6 Geist;color:#6B635C')}>
          Your saved work is still on this device. Try again, or go back to the home page.
        </div>
        <div style={S('margin-top:20px;display:flex;gap:10px;justify-content:center')}>
          <button
            type="button"
            onClick={reset}
            className="h-primary h-press"
            style={S('display:inline-flex;align-items:center;gap:9px;padding:0 18px;height:44px;border-radius:12px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 15px/1 Geist;cursor:pointer')}
          >
            Try again
          </button>
          <a
            href="/"
            className="h-secondary h-press"
            style={S('display:inline-flex;align-items:center;padding:0 18px;height:44px;border-radius:12px;border:1px solid #E4DDD4;background:#fff;color:#1A1714;font:600 15px/1 Geist')}
          >
            Go to home page
          </a>
        </div>
      </div>
    </div>
  );
}
