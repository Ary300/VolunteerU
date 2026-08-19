'use client';

/* ==========================================================================
   WebNonprofits.jsx — real registered nonprofits from the web (no AI).
   Fetches ProPublica / IRS data via /api/nonprofits for the current search and
   renders them as cards. Clicking a card opens a detail panel that populates
   the org's real record (address, 501(c)(3) status, registered year, revenue,
   assets) fetched live by EIN. Real organizations, nothing generated.
   Hidden when the Discover toggle is set to "Student-led".
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S } from '../lib/style.js';
import { openModal } from '../lib/overlays.js';
import { searchWebNonprofits } from '../lib/listings.js';

const MONO = "'Geist Mono',monospace";

function titleCase(str) {
  return String(str || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function money(n) {
  const v = Number(n);
  if (!v || Number.isNaN(v)) return null;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${v}`;
}

function Stat({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div style={S('flex:1;min-width:120px;padding:14px 16px;border-radius:12px;border:1px solid #E8E1D9;background:#FCFAF8')}>
      <div style={S(`font:500 9px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>{label}</div>
      <div style={S('margin-top:7px;font:600 17px/1.15 Geist;letter-spacing:-0.02em;color:#1A1714')}>{value}</div>
    </div>
  );
}

function NonprofitDetail({ ein, seed }) {
  const [org, setOrg] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/nonprofits?ein=${ein}`)
      .then((r) => r.json())
      .then((d) => { if (alive) (d.organization ? setOrg(d.organization) : setFailed(true)); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [ein]);

  const o = org || seed || {};
  const loading = !org && !failed;
  const addr = [o.address, [titleCase(o.city), o.state].filter(Boolean).join(', '), o.zip].filter(Boolean).join(' · ');

  return (
    <div style={S('display:flex;flex-direction:column;gap:18px')}>
      <div style={S('display:flex;gap:12px;flex-wrap:wrap')}>
        {o.cause ? <span style={S(`padding:5px 10px;border-radius:8px;background:#EAF3EC;font:500 11px/1 ${MONO};color:#3F6B4E`)}>{o.cause}</span> : null}
        {o.is501c3 ? <span style={S(`padding:5px 10px;border-radius:8px;background:#F5E7E0;font:500 11px/1 ${MONO};color:#A8482A`)}>501(c)(3)</span> : null}
        {o.ein ? <span style={S(`padding:5px 10px;border-radius:8px;background:#F6F2EE;font:500 11px/1 ${MONO};color:#57504A`)}>EIN {o.ein}</span> : null}
      </div>

      {addr ? (
        <div>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Address</div>
          <div style={S('margin-top:8px;font:450 15px/1.5 Geist;color:#332D28')}>{addr}</div>
        </div>
      ) : loading ? (
        <div style={S('font:450 14px/1.5 Geist;color:#8A8179')}>Loading the public record…</div>
      ) : null}

      <div style={S('display:flex;gap:12px;flex-wrap:wrap')}>
        <Stat label="Registered since" value={o.rulingYear} />
        <Stat label={o.filingYear ? `Revenue (${o.filingYear})` : 'Revenue'} value={money(o.revenue)} />
        <Stat label="Total assets" value={money(o.assets)} />
      </div>

      <div style={S('padding:14px 16px;border-radius:12px;background:#FAF6F3;border:1px solid #EFE3DC;font:450 13px/1.5 Geist;color:#57504A')}>
        This is a real registered nonprofit from the public IRS registry. Open its full record to find contact details, then reach out to ask about volunteering.
      </div>

      <div style={S('display:flex;gap:12px;flex-wrap:wrap')}>
        <a
          href={o.url}
          target="_blank"
          rel="noopener noreferrer"
          style={S('display:inline-flex;align-items:center;gap:8px;padding:0 20px;height:44px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;text-decoration:none')}
        >
          View full record →
        </a>
      </div>
    </div>
  );
}

export default function WebNonprofits({ q = '', near = '', causes = [], kind = 'all' }) {
  const [orgs, setOrgs] = useState(null);
  const causeKey = (causes || []).join(',');
  const hidden = kind === 'student';

  useEffect(() => {
    let alive = true;
    if (hidden || (!q && !near && !causeKey)) { setOrgs([]); return undefined; }
    setOrgs(null);
    const t = setTimeout(async () => {
      const res = await searchWebNonprofits({ q, near, causes });
      if (alive) setOrgs(res);
    }, 350);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, near, causeKey, hidden]);

  if (hidden || !orgs || !orgs.length) return null;

  const open = (o) => {
    openModal({
      title: titleCase(o.name),
      subtitle: [titleCase(o.city), o.state].filter(Boolean).join(', ') || 'Registered nonprofit',
      Body: () => <NonprofitDetail ein={o.ein} seed={o} />,
    });
  };

  return (
    <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
      <div style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:center;justify-content:space-between')}>
        <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Registered nonprofits near you</div>
        <div style={S(`font:500 10px/1 ${MONO};color:#A9A097`)}>IRS registry</div>
      </div>
      {orgs.map((o) => (
        <button
          key={o.ein}
          type="button"
          onClick={() => open(o)}
          className="h-row"
          style={S('display:flex;width:100%;text-align:left;align-items:center;justify-content:space-between;gap:16px;padding:16px 20px;border:0;border-bottom:1px solid #F1EBE4;background:none;cursor:pointer;transition:background .16s ease')}
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
        </button>
      ))}
      <div style={S('padding:13px 20px;font:450 12px/1.5 Geist;color:#A9A097')}>
        Real organizations from the public IRS nonprofit registry. Click any to see its record.
      </div>
    </div>
  );
}
