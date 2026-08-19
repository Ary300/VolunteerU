'use client';

/* ==========================================================================
   WebNonprofits.jsx — real registered nonprofits from the web (no AI).
   Fetches ProPublica / IRS data via /api/nonprofits for the current search and
   renders them as cards. These are real organizations (each with an EIN) a
   volunteer can look up and reach out to directly, so Discover is useful even
   before any org has posted an in-app opening.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S } from '../lib/style.js';
import { searchWebNonprofits } from '../lib/listings.js';

const MONO = "'Geist Mono',monospace";

function titleCase(str) {
  return String(str || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function WebNonprofits({ q = '', near = '', causes = [] }) {
  const [orgs, setOrgs] = useState(null);
  const causeKey = (causes || []).join(',');

  useEffect(() => {
    let alive = true;
    if (!q && !near && !causeKey) { setOrgs([]); return undefined; }
    setOrgs(null);
    const t = setTimeout(async () => {
      const res = await searchWebNonprofits({ q, near, causes });
      if (alive) setOrgs(res);
    }, 350);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, near, causeKey]);

  if (!orgs || !orgs.length) return null;

  return (
    <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
      <div style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:center;justify-content:space-between')}>
        <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Registered nonprofits near you</div>
        <div style={S(`font:500 10px/1 ${MONO};color:#A9A097`)}>IRS registry</div>
      </div>
      {orgs.map((o) => (
        <a
          key={o.ein}
          href={o.url}
          target="_blank"
          rel="noopener noreferrer"
          className="h-row"
          style={S('display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 20px;border-bottom:1px solid #F1EBE4;text-decoration:none;color:inherit;transition:background .16s ease')}
        >
          <div style={S('min-width:0')}>
            <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
              <div style={S('font:600 15px/1.25 Geist;color:#1A1714')}>{titleCase(o.name)}</div>
              <span style={S(`padding:3px 8px;border-radius:6px;background:#EAF3EC;font:500 10px/1 ${MONO};color:#3F6B4E`)}>{o.cause}</span>
            </div>
            <div style={S('margin-top:5px;font:450 13px/1.4 Geist;color:#8A8179')}>
              {[titleCase(o.city), o.state].filter(Boolean).join(', ')}{o.ein ? ` · EIN ${o.ein}` : ''}
            </div>
          </div>
          <span style={S('font:500 12px/1 Geist;color:#C2603C;flex:none')}>View →</span>
        </a>
      ))}
      <div style={S('padding:13px 20px;font:450 12px/1.5 Geist;color:#A9A097')}>
        Real organizations from the public IRS nonprofit registry. Reach out directly to volunteer.
      </div>
    </div>
  );
}
