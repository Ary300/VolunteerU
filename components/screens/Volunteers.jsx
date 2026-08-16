'use client';

/* ==========================================================================
   Volunteers.jsx — the volunteer directory (find people, not projects)
   The flip side of Discover: search every listed volunteer across accounts by
   name/skills, cause and city. Real server-side search over volunteer_directory.
   A founder recruiting, or a volunteer finding peers, lands here.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Pressable, SkeletonRows } from '../ui.jsx';
import { openModal } from '../../lib/overlays.js';
import { CAUSES } from '../../lib/seed.js';
import { searchVolunteers } from '../../lib/listings.js';

const MONO = "'Geist Mono',monospace";

export default function Volunteers() {
  const [q, setQ] = useState('');
  const [causes, setCauses] = useState([]);
  const [near, setNear] = useState('');
  const [rows, setRows] = useState(null);

  const causeKey = causes.join('|');
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const r = await searchVolunteers({ q, causes, near });
        if (alive) setRows(r);
      } catch {
        if (alive) setRows([]);
      }
    };
    const t = setTimeout(run, (q || near) ? 280 : 0);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, causeKey, near]);

  const toggleCause = (c) => setCauses((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  const active = Boolean(q || causes.length || near);

  function view(v) {
    openModal({
      title: v.name || 'Volunteer',
      subtitle: [v.city, v.grade ? `Grade ${v.grade}` : null].filter(Boolean).join(' · ') || 'Volunteer',
      Body: () => (
        <div style={S('display:flex;flex-direction:column;gap:16px')}>
          <div style={S('display:flex;align-items:center;gap:14px')}>
            <div style={S('width:56px;height:56px;border-radius:50%;overflow:hidden;flex:none')}>
              <ImageSlot src={`https://picsum.photos/seed/${v.user_id}/200/200?grayscale`} shape="circle" placeholder="face" />
            </div>
            <div>
              <div style={S('font:600 18px/1.2 Geist;letter-spacing:-0.02em')}>{v.name}</div>
              <div style={S('margin-top:4px;font:450 13px/1.3 Geist;color:#8A8179')}>{[v.city, v.grade ? `Grade ${v.grade}` : null].filter(Boolean).join(' · ') || '—'}</div>
            </div>
            <div style={S('margin-left:auto;text-align:right;flex:none')}>
              <div style={S('font:600 24px/1 Geist;letter-spacing:-0.03em;color:#1A1714')}>{v.verified_hours || 0}</div>
              <div style={S(`margin-top:4px;font:500 10px/1 ${MONO};color:#3F6B4E`)}>Verified hrs</div>
            </div>
          </div>
          {v.bio ? <div style={S('font:400 14px/1.6 Geist;color:#332D28')}>{v.bio}</div> : null}
          {(v.causes || []).length ? (
            <div>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>Causes</div>
              <div style={S('margin-top:8px;display:flex;gap:6px;flex-wrap:wrap')}>
                {v.causes.map((c) => <span key={c} style={S('padding:5px 9px;border-radius:7px;background:#F6F2EE;font:500 11px/1 Geist;color:#57504A')}>{c}</span>)}
              </div>
            </div>
          ) : null}
          {v.skills ? (
            <div>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>Skills</div>
              <div style={S('margin-top:6px;font:450 14px/1.5 Geist;color:#57504A')}>{v.skills}</div>
            </div>
          ) : null}
          <div style={S('padding:12px 14px;border-radius:11px;background:#FAF6F3;border:1px solid #EFE3DC;font:450 12px/1.5 Geist;color:#8A5A20')}>
            To bring them on, share your project’s join link — they apply, and you accept them into your workspace.
          </div>
        </div>
      ),
    });
  }

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px')}>
      <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:24px')}>
        <div>
          <h1 style={S('margin:0;font:600 30px/1.1 Geist;letter-spacing:-0.035em')}>Find volunteers</h1>
          <p style={S('margin:8px 0 0;font:450 15px/1.5 Geist;color:#6B635C')}>Search everyone on VolunteerU by name, cause and city. Share your link to bring them on.</p>
        </div>
      </div>

      {/* mode toggle */}
      <div style={S('margin-top:20px;display:flex;gap:6px')}>
        <Link href="/discover" style={s('padding:8px 14px;border-radius:9px;text-decoration:none;font:600 13px/1 Geist', 'border:1px solid #E8E1D9;background:#fff;color:#57504A')}>Find projects</Link>
        <span style={s('padding:8px 14px;border-radius:9px;font:600 13px/1 Geist', 'border:1px solid #C2603C;background:#FAF6F3;color:#A8482A')}>Find volunteers</span>
      </div>

      {/* search */}
      <div className={H.input} style={S('margin-top:18px;display:flex;align-items:center;gap:10px;padding:13px 16px;border-radius:12px;border:1px solid #E8E1D9;background:#fff')}>
        <span aria-hidden="true" style={S('color:#BEB5AC;font-size:14px')}>⌕</span>
        <input type="search" aria-label="Search volunteers" autoComplete="off" value={q} placeholder="Search by name, skill or interest" onChange={(e) => setQ(e.target.value)} style={S('flex:1;min-width:0;font:450 15px/1 Geist;color:#1A1714;background:none;border:none;padding:0')} />
        {q ? <button type="button" aria-label="Clear" onClick={() => setQ('')} style={S('flex:none;width:24px;height:24px;border-radius:7px;display:grid;place-items:center;color:#A9A097;font-size:12px;cursor:pointer;border:0;background:none')}>✕</button> : null}
      </div>
      <div className={H.input} style={S('margin-top:10px;display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;border:1px solid #E8E1D9;background:#fff;max-width:420px')}>
        <span aria-hidden="true" style={S('color:#BEB5AC;font-size:14px')}>◎</span>
        <input type="text" aria-label="Filter by city" autoComplete="off" value={near} placeholder="City or ZIP — e.g. San Diego" onChange={(e) => setNear(e.target.value)} style={S('flex:1;min-width:0;font:450 14px/1 Geist;color:#1A1714;background:none;border:none;padding:0')} />
        {near ? <button type="button" aria-label="Clear location" onClick={() => setNear('')} style={S('flex:none;width:24px;height:24px;border-radius:7px;display:grid;place-items:center;color:#A9A097;font-size:12px;cursor:pointer;border:0;background:none')}>✕</button> : null}
      </div>

      {/* cause chips */}
      <div role="group" aria-label="Filter by cause" style={S('margin-top:14px;display:flex;flex-wrap:wrap;gap:8px')}>
        {CAUSES.map((c) => {
          const on = causes.includes(c);
          return (
            <Pressable key={c} label={c} pressed={on} onClick={() => toggleCause(c)} className={cx(H.press)} style={s('padding:8px 13px;border-radius:9px;cursor:pointer;font:500 13px/1 Geist', `border:1px solid ${on ? '#1F1B18' : '#E8E1D9'}`, `background:${on ? '#1F1B18' : '#fff'}`, `color:${on ? '#fff' : '#57504A'}`)}>{c}</Pressable>
          );
        })}
      </div>

      {/* results */}
      <div style={S('margin-top:24px')}>
        {rows === null ? (
          <SkeletonRows n={4} h={96} />
        ) : rows.length === 0 ? (
          <div style={S('padding:34px 24px;text-align:center;border-radius:16px;border:1px dashed #E0D8CF;background:#FCFAF8')}>
            <div style={S('font:600 16px/1.3 Geist;color:#1A1714')}>{active ? 'No volunteers match that' : 'No volunteers listed yet'}</div>
            <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#8A8179')}>{active ? 'Try a broader search or clear a filter.' : 'As people join VolunteerU, they show up here.'}</div>
          </div>
        ) : (
          <>
            <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097;margin-bottom:12px`)}>{rows.length} volunteer{rows.length === 1 ? '' : 's'}</div>
            <div className="vu-3col" style={S('display:grid;grid-template-columns:repeat(3,1fr);gap:14px')}>
              {rows.map((v) => (
                <Pressable key={v.user_id} label={`View ${v.name}`} onClick={() => view(v)} className={cx(H.card, H.press)} style={S('text-align:left;padding:18px;border-radius:14px;border:1px solid #E8E1D9;background:#fff;cursor:pointer;transition:border-color .16s ease')}>
                  <div style={S('display:flex;align-items:center;gap:12px')}>
                    <div style={S('width:44px;height:44px;border-radius:50%;overflow:hidden;flex:none')}>
                      <ImageSlot src={`https://picsum.photos/seed/${v.user_id}/200/200?grayscale`} shape="circle" placeholder="face" />
                    </div>
                    <div style={S('min-width:0;flex:1')}>
                      <div className="vu-trunc" style={S('font:600 15px/1.2 Geist;color:#1A1714')}>{v.name}</div>
                      <div className="vu-trunc" style={S('margin-top:3px;font:450 12px/1.3 Geist;color:#8A8179')}>{[v.city, v.grade ? `Grade ${v.grade}` : null].filter(Boolean).join(' · ') || 'Volunteer'}</div>
                    </div>
                    <div style={S('text-align:right;flex:none')}>
                      <div style={S('font:600 17px/1 Geist;letter-spacing:-0.02em')}>{v.verified_hours || 0}</div>
                      <div style={S(`margin-top:3px;font:500 9px/1 ${MONO};color:#3F6B4E`)}>hrs</div>
                    </div>
                  </div>
                  {v.bio ? <div style={S('margin-top:12px;font:450 13px/1.5 Geist;color:#57504A;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden')}>{v.bio}</div> : null}
                  {(v.causes || []).length ? (
                    <div style={S('margin-top:11px;display:flex;gap:6px;flex-wrap:wrap')}>
                      {v.causes.slice(0, 3).map((c) => <span key={c} style={S('padding:3px 8px;border-radius:6px;background:#F6F2EE;font:500 10px/1 Geist;color:#57504A')}>{c}</span>)}
                    </div>
                  ) : null}
                </Pressable>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
