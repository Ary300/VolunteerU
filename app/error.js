'use client';

import { useEffect } from 'react';
import { S } from '../lib/style.js';
import { C, F } from '../lib/tokens.js';
import { Icon, Button } from '../components/ui.jsx';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('[VolunteerU] screen crashed:', error);
  }, [error]);

  return (
    <div role="alert" style={S('min-height:70vh;display:grid;place-items:center;padding:40px 16px')}>
      <div style={S('max-width:460px;text-align:center;display:flex;flex-direction:column;align-items:center')}>
        <div aria-hidden="true" style={S(`width:56px;height:56px;border-radius:50%;background:${C.emberTint};display:grid;place-items:center;color:${C.emberDeep}`)}>
          <Icon name="alert" size={24} />
        </div>
        <h1 style={S(`margin:18px 0 0;font:700 28px/1.1 ${F.display};letter-spacing:-0.022em;color:${C.ink}`)}>This page didn&apos;t load</h1>
        <p style={S(`margin:10px 0 0;font:400 15px/1.55 ${F.body};color:${C.ink2}`)}>
          Your saved work is still on this device. Try again, or go back to the home page.
        </p>
        <div style={S('margin-top:22px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap')}>
          <Button variant="primary" icon="refresh" onClick={reset}>
            Try again
          </Button>
          <Button variant="outline" href="/">
            Go to home page
          </Button>
        </div>
      </div>
    </div>
  );
}
