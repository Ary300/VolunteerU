'use client';

/* ==========================================================================
   MyRatings.jsx, how organizers have rated this volunteer
   Each rating was written by an organizer on the volunteer's application
   (CrossMembers.jsx) and shows here on the volunteer's own profile. Renders
   nothing until rated.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S, s } from '../lib/style.js';
import { Icon } from './ui.jsx';
import { loadMyRatings } from '../lib/listings.js';

function Stars({ n }) {
  const full = Math.round(Number(n) || 0);
  return (
    <span role="img" aria-label={`${Math.round((Number(n) || 0) * 10) / 10} out of 5`} style={S('display:inline-flex;align-items:center;gap:2px')}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name="star" size={14} filled={i <= full} color={i <= full ? '#C2603C' : '#D9D0C6'} />
      ))}
    </span>
  );
}

/** `divider` (style string) draws a rule after the block, only when it renders. */
export default function MyRatings({ divider } = {}) {
  const [ratings, setRatings] = useState(null);
  useEffect(() => {
    let live = true;
    loadMyRatings()
      .then((r) => { if (live) setRatings(r); })
      .catch((e) => {
        console.error('loadMyRatings failed', e);
        if (live) setRatings([]);
      });
    return () => { live = false; };
  }, []);

  if (ratings === null || ratings.length === 0) return null;
  const avg = ratings.reduce((a, r) => a + Number(r.stars || 0), 0) / ratings.length;

  return (
    <section aria-labelledby="vu-ratings-h">
      <div style={S('display:flex;align-items:baseline;justify-content:space-between;gap:12px')}>
        <h2 id="vu-ratings-h" style={S('margin:0;font:600 16px/1.2 Geist;letter-spacing:-0.01em;color:#1A1714')}>Ratings from organizers</h2>
        <div style={S('font:450 12px/1 Geist;color:#8A8179')}>{ratings.length} {ratings.length === 1 ? 'rating' : 'ratings'}</div>
      </div>
      <div style={S('margin-top:12px;display:flex;align-items:center;gap:12px')}>
        <div style={S(`font:600 30px/1 Geist;letter-spacing:-0.03em;font-variant-numeric:tabular-nums`)}>{avg.toFixed(1)}</div>
        <Stars n={avg} />
      </div>
      <div style={S('margin-top:14px;display:flex;flex-direction:column')}>
        {ratings.slice(0, 5).map((r, i) => (
          <div key={`${r.org}-${r.ratedAt || ''}-${i}`} style={s('padding:12px 0', i ? 'border-top:1px solid #F1EBE4' : '')}>
            <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap')}>
              <div style={S('font:600 13px/1.2 Geist;color:#1A1714;min-width:0')}>{r.org}</div>
              <div style={S('display:flex;align-items:center;gap:8px')}>
                <Stars n={r.stars} />
                {r.reliability ? <span style={S('font:500 12px/1 Geist;color:#3F6B4E')}>{r.reliability}</span> : null}
              </div>
            </div>
            {r.note ? <div className="vu-break" style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#57504A')}>“{r.note}”</div> : null}
          </div>
        ))}
      </div>
      {divider ? <div aria-hidden="true" style={S(divider)} /> : null}
    </section>
  );
}
