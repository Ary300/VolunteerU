'use client';

/* ==========================================================================
   HomeCharts.jsx — two small at-a-glance charts on Home, both from real data:
   where the volunteer's hours go (by category) and the split between verified
   and still-pending hours. No fake series — it reflects exactly what they have
   logged. Renders a gentle prompt until there is something to chart.
   ========================================================================== */

import { S, s } from '../lib/style.js';
import { useSnapshot } from '../lib/store.js';

const MONO = "'Geist Mono',monospace";

// A small, on-palette rotation for category bars.
const CAT_COLORS = ['#C2603C', '#5B6BB0', '#3F6B4E', '#8A5A20', '#A8482A', '#6B7Fb0', '#7A8C5A', '#B07A3C'];

function round1(n) { return Math.round(Number(n || 0) * 10) / 10; }

export default function HomeCharts() {
  const { state } = useSnapshot();
  const log = state.hoursLog || [];

  // hours by category
  const byCat = {};
  log.forEach((h) => {
    const c = (h.category || '').trim() || 'Uncategorized';
    byCat[c] = (byCat[c] || 0) + Number(h.hrs || 0);
  });
  const cats = Object.entries(byCat).map(([name, hrs]) => ({ name, hrs: round1(hrs) })).sort((a, b) => b.hrs - a.hrs).slice(0, 6);
  const catMax = Math.max(1, ...cats.map((c) => c.hrs));

  const verified = round1(state.stats.verifiedHours);
  const pending = round1(state.stats.pendingVerification);
  const total = verified + pending;
  const vPct = total > 0 ? Math.round((verified / total) * 100) : 0;

  const hasAny = log.length > 0 || total > 0;

  return (
    <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px')}>
      {/* where hours go */}
      <div style={S('padding:20px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
        <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Where your hours go</div>
        {cats.length ? (
          <div style={S('margin-top:16px;display:flex;flex-direction:column;gap:12px')}>
            {cats.map((c, i) => (
              <div key={c.name}>
                <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;font:450 12px/1 Geist;color:#57504A')}>
                  <span className="vu-trunc" style={S('min-width:0')}>{c.name}</span>
                  <span style={S(`font:500 12px/1 ${MONO};color:#1A1714;flex:none`)}>{c.hrs} hrs</span>
                </div>
                <div style={S('margin-top:6px;height:8px;border-radius:5px;background:#F4EDE7;overflow:hidden')}>
                  <div style={s(`width:${Math.max(4, Math.round((c.hrs / catMax) * 100))}%`, 'height:100%;border-radius:5px', `background:${CAT_COLORS[i % CAT_COLORS.length]}`, 'transition:width .5s cubic-bezier(.16,1,.3,1)')} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={S('margin-top:16px;font:450 13px/1.6 Geist;color:#8A8179')}>
            Log volunteering with a category and this fills in — you will see exactly where your time goes.
          </div>
        )}
      </div>

      {/* verified vs pending */}
      <div style={S('padding:20px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
        <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Hours status</div>
        {hasAny ? (
          <>
            <div style={S('margin-top:16px;display:flex;align-items:baseline;gap:8px')}>
              <div style={S('font:600 34px/1 Geist;letter-spacing:-0.04em;color:#1A1714')}>{total}</div>
              <div style={S('font:450 13px/1 Geist;color:#8A8179')}>total hrs · {vPct}% verified</div>
            </div>
            <div style={S('margin-top:14px;height:14px;border-radius:7px;background:#F4EDE7;overflow:hidden;display:flex')}>
              <div title={`${verified} verified`} style={s(`width:${total > 0 ? (verified / total) * 100 : 0}%`, 'height:100%;background:#3F6B4E;transition:width .5s cubic-bezier(.16,1,.3,1)')} />
              <div title={`${pending} pending`} style={s(`width:${total > 0 ? (pending / total) * 100 : 0}%`, 'height:100%;background:#D9A64A;transition:width .5s cubic-bezier(.16,1,.3,1)')} />
            </div>
            <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:9px')}>
              <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px')}>
                <span style={S('display:flex;align-items:center;gap:8px;font:450 13px/1 Geist;color:#57504A')}>
                  <span aria-hidden="true" style={S('width:10px;height:10px;border-radius:3px;background:#3F6B4E')} /> Verified
                </span>
                <span style={S(`font:500 13px/1 ${MONO};color:#1A1714`)}>{verified} hrs</span>
              </div>
              <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px')}>
                <span style={S('display:flex;align-items:center;gap:8px;font:450 13px/1 Geist;color:#57504A')}>
                  <span aria-hidden="true" style={S('width:10px;height:10px;border-radius:3px;background:#D9A64A')} /> Awaiting confirmation
                </span>
                <span style={S(`font:500 13px/1 ${MONO};color:#1A1714`)}>{pending} hrs</span>
              </div>
            </div>
          </>
        ) : (
          <div style={S('margin-top:16px;font:450 13px/1.6 Geist;color:#8A8179')}>
            When you log hours and an organizer confirms them, this shows how much of your record is verified.
          </div>
        )}
      </div>
    </div>
  );
}
