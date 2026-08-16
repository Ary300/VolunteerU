'use client';

/* ==========================================================================
   MyRatings.jsx — how organizers have rated this volunteer
   Real cross-user reputation: each rating was written by a nonprofit leader on
   the volunteer's application and lands here on the volunteer's own profile, so
   the next organizer can see how they show up. Renders nothing until rated.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S, s } from '../lib/style.js';
import { loadMyRatings } from '../lib/listings.js';

const MONO = "'Geist Mono',monospace";

function Stars({ n }) {
  return (
    <span aria-label={`${n} out of 5`} style={S('letter-spacing:2px')}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={s('font-size:14px', `color:${i <= Math.round(n) ? '#C2603C' : '#E0D8CF'}`)}>★</span>
      ))}
    </span>
  );
}

export default function MyRatings() {
  const [ratings, setRatings] = useState(null);
  useEffect(() => {
    loadMyRatings().then(setRatings).catch(() => setRatings([]));
  }, []);

  if (ratings === null || ratings.length === 0) return null;
  const avg = ratings.reduce((a, r) => a + Number(r.stars || 0), 0) / ratings.length;

  return (
    <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
      <div style={S('display:flex;align-items:baseline;justify-content:space-between;gap:12px')}>
        <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>How organizers rate you</div>
        <div style={S(`font:500 11px/1 ${MONO};color:#8A8179`)}>{ratings.length} rating{ratings.length === 1 ? '' : 's'}</div>
      </div>
      <div style={S('margin-top:14px;display:flex;align-items:center;gap:14px')}>
        <div style={S('font:600 34px/1 Geist;letter-spacing:-0.04em')}>{avg.toFixed(1)}</div>
        <div>
          <Stars n={avg} />
          <div style={S('margin-top:4px;font:450 12px/1 Geist;color:#8A8179')}>Organizations see this when you apply.</div>
        </div>
      </div>
      <div style={S('margin-top:16px;display:flex;flex-direction:column;gap:10px')}>
        {ratings.slice(0, 5).map((r, i) => (
          <div key={i} style={S('padding:13px 15px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8')}>
            <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px')}>
              <div style={S('font:600 13px/1.2 Geist;color:#1A1714')}>{r.org}</div>
              <div style={S('display:flex;align-items:center;gap:8px')}>
                <Stars n={r.stars} />
                {r.reliability ? <span style={S(`font:500 11px/1 ${MONO};color:#3F6B4E`)}>{r.reliability}</span> : null}
              </div>
            </div>
            {r.note ? <div style={S('margin-top:7px;font:450 13px/1.5 Geist;color:#57504A')}>“{r.note}”</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
