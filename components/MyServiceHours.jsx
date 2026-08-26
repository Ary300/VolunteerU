'use client';

/* ==========================================================================
   MyServiceHours.jsx, the volunteer's real, org-confirmed hours
   The other end of the verified-hours loop: a volunteer logs hours against a
   project they joined, the organizer confirms them, and confirmed hours show
   here on the record as verified. Renders nothing until they've logged any.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S, s } from '../lib/style.js';
import { loadMyServiceHours } from '../lib/listings.js';

const MONO = "'Geist Mono',monospace";

export default function MyServiceHours() {
  const [data, setData] = useState(null);
  useEffect(() => {
    loadMyServiceHours().then(setData).catch(() => setData({ verified: 0, pending: 0, entries: [] }));
  }, []);

  if (data === null || data.entries.length === 0) return null;

  return (
    <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
      <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Verified service hours</div>
      <div style={S('margin-top:14px;display:flex;align-items:baseline;gap:18px;flex-wrap:wrap')}>
        <div>
          <div style={S('font:600 34px/1 Geist;letter-spacing:-0.04em;color:#3F6B4E')}>{data.verified}</div>
          <div style={S(`margin-top:4px;font:500 10px/1 ${MONO};letter-spacing:.06em;text-transform:uppercase;color:#A9A097`)}>Confirmed by orgs</div>
        </div>
        {data.pending > 0 ? (
          <div>
            <div style={S('font:600 22px/1 Geist;letter-spacing:-0.03em;color:#8A5A20')}>{data.pending}</div>
            <div style={S(`margin-top:5px;font:500 10px/1 ${MONO};letter-spacing:.06em;text-transform:uppercase;color:#A9A097`)}>Awaiting confirmation</div>
          </div>
        ) : null}
      </div>
      <div style={S('margin-top:16px;display:flex;flex-direction:column;gap:8px')}>
        {data.entries.slice(0, 6).map((h) => (
          <div key={h.id} style={S('display:flex;align-items:center;gap:10px;padding:11px 13px;border-radius:11px;border:1px solid #F1EBE4;background:#FCFAF8')}>
            <div style={S('min-width:0;flex:1')}>
              <div className="vu-trunc" style={S('font:500 13.5px/1.3 Geist;color:#1A1714')}>{h.activity}</div>
              <div className="vu-trunc" style={S('margin-top:3px;font:450 12px/1.3 Geist;color:#8A8179')}>{[h.org, h.date].filter(Boolean).join(' · ')}</div>
            </div>
            <span style={s('font:500 12px/1', 'font-family:' + MONO, 'color:#57504A')}>{h.hrs} hrs</span>
            {h.verified ? (
              <span style={s('padding:4px 8px;border-radius:6px;font:500 10px/1', 'font-family:' + MONO, 'background:#EAF3EC;color:#3F6B4E')}>Verified</span>
            ) : (
              <span style={s('padding:4px 8px;border-radius:6px;font:500 10px/1', 'font-family:' + MONO, 'background:#FDF3E7;color:#8A5A20')}>Pending</span>
            )}
          </div>
        ))}
      </div>
      <div style={S('margin-top:12px;font:450 12px/1.55 Geist;color:#8A8179')}>
        Confirmed hours are verified by the organization that ran the work, the record a school or scholarship can trust.
      </div>
    </div>
  );
}
