'use client';

/* ==========================================================================
   MyServiceHours.jsx, hours logged against projects the volunteer joined
   A member logs hours on a project (MemberProjects.jsx), the organizer
   confirms them (CrossMembers.jsx), and each entry shows here as confirmed or
   waiting. Profile passes the loaded data in; used on its own it loads it.
   Renders nothing until there are entries.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S, s } from '../lib/style.js';
import { Icon } from './ui.jsx';
import { loadMyServiceHours } from '../lib/listings.js';

const MONO = "'Geist Mono',monospace";

export function hrsShort(n) {
  const r = Math.round(Number(n || 0) * 10) / 10;
  return `${r} ${r === 1 ? 'hr' : 'hrs'}`;
}

export default function MyServiceHours({ data: given, error: givenError, onRetry }) {
  const controlled = given !== undefined || givenError !== undefined;
  const [own, setOwn] = useState(null);
  const [ownError, setOwnError] = useState(false);

  useEffect(() => {
    if (controlled) return undefined;
    let live = true;
    loadMyServiceHours()
      .then((d) => { if (live) setOwn(d); })
      .catch((e) => {
        console.error('loadMyServiceHours failed', e);
        if (live) setOwnError(true);
      });
    return () => { live = false; };
  }, [controlled]);

  const data = controlled ? given : own;
  const error = controlled ? givenError : ownError;

  if (error) {
    return (
      <div role="alert" style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 16px;border-radius:12px;border:1px solid #EBD3C8;background:#FDF6F2;font:450 13px/1.5 Geist;color:#8A3E22')}>
        <span>Couldn't load hours from your projects. Check your connection and try again.</span>
        {onRetry ? (
          <button type="button" onClick={onRetry} style={S('flex:none;padding:0 12px;height:32px;border-radius:9px;border:1px solid #E7C0AC;background:#fff;font:600 12px/1 Geist;color:#C2603C;cursor:pointer')}>
            Try again
          </button>
        ) : null}
      </div>
    );
  }
  if (!data || data.entries.length === 0) return null;

  return (
    <section aria-labelledby="vu-svc-h">
      <div style={S('display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
        <h2 id="vu-svc-h" style={S('margin:0;font:600 16px/1.2 Geist;letter-spacing:-0.01em;color:#1A1714')}>Hours from your projects</h2>
        <div style={S('font:450 12px/1.3 Geist;color:#8A8179')}>
          {hrsShort(data.verified)} confirmed{data.pending > 0 ? `, ${hrsShort(data.pending)} waiting` : ''}
        </div>
      </div>
      <div style={S('margin-top:10px;display:flex;flex-direction:column')}>
        {data.entries.slice(0, 6).map((h, i) => (
          <div key={`${h.applicationId || ''}-${h.id}-${i}`} style={s('display:flex;align-items:center;gap:10px;padding:12px 0', i ? 'border-top:1px solid #F1EBE4' : '')}>
            <div style={S('min-width:0;flex:1')}>
              <div className="vu-trunc" style={S('font:500 14px/1.3 Geist;color:#1A1714')}>{h.activity}</div>
              <div className="vu-trunc" style={S('margin-top:3px;font:450 12px/1.3 Geist;color:#8A8179')}>{[h.org, h.date].filter(Boolean).join(', ')}</div>
            </div>
            <span style={S(`flex:none;font:500 13px/1 ${MONO};color:#332D28`)}>{hrsShort(h.hrs)}</span>
            {h.verified ? (
              <span style={S('flex:none;display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:6px;background:#EAF3EC;font:500 11px/1 Geist;color:#3F6B4E')}>
                <Icon name="check" size={11} stroke={2.25} />
                Confirmed
              </span>
            ) : (
              <span style={S('flex:none;padding:4px 8px;border-radius:6px;background:#FDF3E7;font:500 11px/1 Geist;color:#8A5A20')}>Waiting</span>
            )}
          </div>
        ))}
      </div>
      {data.entries.length > 6 ? (
        <div style={S('margin-top:8px;font:450 12px/1.4 Geist;color:#8A8179')}>Showing 6 of {data.entries.length}. Download CSV for all of them.</div>
      ) : null}
    </section>
  );
}
