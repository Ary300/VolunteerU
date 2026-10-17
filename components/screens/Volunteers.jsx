'use client';

/* ==========================================================================
   Volunteers.jsx, the volunteer directory (find people, not projects)
   The flip side of Discover: search every listed volunteer across accounts by
   name/skills, cause and city. Real server-side search over volunteer_directory.
   A student lead recruiting, or a volunteer finding peers, lands here.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { Avatar, Pressable, SkeletonRows, ErrorState, Icon } from '../ui.jsx';
import { openModal, toast } from '../../lib/overlays.js';
import { CAUSES } from '../../lib/seed.js';
import { searchVolunteersPage } from '../../lib/listings.js';
import { copyText } from '../../lib/db.js';
import { useStore } from '../../lib/store.js';

const BTN_SECONDARY = 'flex:none;display:inline-flex;align-items:center;gap:6px;padding:0 13px;height:34px;border-radius:9px;border:1px solid #E7C0AC;background:#fff;font:600 12px/1 Geist;color:#C2603C;cursor:pointer;text-decoration:none';
const MAX_INVITE_PROJECTS = 3;
// Cards per page in the directory; "Show more volunteers" loads the next page.
const DIRECTORY_PAGE_SIZE = 24;

const selectProjects = (st) => st.projects;

/* Search state lives in the URL (?q=, ?near=, ?causes=a|b) so Back and reload
   bring the same results back, the way Discover does. */
function readFilters(params) {
  return {
    q: params.get('q') || '',
    near: params.get('near') || '',
    causes: (params.get('causes') || '').split('|').filter((c) => CAUSES.includes(c)),
  };
}

function filtersQuery({ q, near, causes }) {
  const next = new URLSearchParams();
  if (q) next.set('q', q);
  if (near) next.set('near', near);
  if (causes.length) next.set('causes', causes.join('|'));
  return next.toString();
}

const LABEL = 'font:600 13px/1.2 Geist;letter-spacing:-0.01em;color:#6B635C';
const CLEAR_BTN = 'flex:none;width:28px;height:28px;border-radius:7px;display:grid;place-items:center;color:#8A8179;cursor:pointer;border:0;background:none';

/** Other students show as first name plus last initial ("Owen P."). */
export function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Volunteer';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** "Rivertown, grade 11" from whatever the card has. */
function metaLine(v) {
  return [v.city, v.grade ? `grade ${v.grade}` : null].filter(Boolean).join(', ');
}

function hoursLabel(n) {
  const h = Math.round(Number(n || 0) * 10) / 10;
  return `${h} ${h === 1 ? 'hr' : 'hrs'} confirmed`;
}

function joinUrl(listingId) {
  return `${window.location.origin}/join/${listingId}`;
}

/** What the viewer can do to bring this volunteer onto a project: copy a
    published project's join link, open an unpublished one, or start one. */
function InviteActions({ first, api }) {
  const projects = useStore(selectProjects) || [];
  const mine = projects.filter((p) => p && !p.archived);
  const live = mine.filter((p) => p.listingId).slice(0, MAX_INVITE_PROJECTS);
  const draft = mine.find((p) => !p.listingId);

  async function copy(p) {
    const link = joinUrl(p.listingId);
    const ok = await copyText(link);
    toast(ok
      ? { title: 'Join link copied', message: 'Anyone with the link can see the project and apply.', tone: 'ok' }
      : { title: 'Copy this link', message: link, tone: 'warn' });
  }

  const box = 'padding:12px 14px;border-radius:11px;background:#FAF6F3;border:1px solid #EFE3DC;font:450 13px/1.5 Geist;color:#6B4A1E';

  if (live.length) {
    return (
      <div style={S(box)}>
        <div>Anyone with the join link can apply to {live.length === 1 ? live[0].name : 'that project'}, {first} included. You accept applications from your project page.</div>
        <div style={S('margin-top:10px;display:flex;flex-direction:column;gap:8px')}>
          {live.map((p) => (
            <div key={p.id} style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap')}>
              {live.length > 1 ? <span className="vu-break" style={S('min-width:0;flex:1;font:500 13px/1.3 Geist;color:#332D28')}>{p.name}</span> : null}
              <Pressable
                label={live.length > 1 ? `Copy join link for ${p.name}` : 'Copy join link'}
                onClick={() => copy(p)}
                className={cx(H.secondary, H.press)}
                style={S(BTN_SECONDARY)}
              >
                <Icon name="copy" size={14} />
                Copy join link
              </Pressable>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (draft) {
    return (
      <div style={S(box)}>
        <div>Publish {draft.name} to turn on its join link. Anyone with the link, {first} included, can then apply.</div>
        <Link href={`/lead/${draft.id}`} onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(`margin-top:10px;${BTN_SECONDARY}`)}>
          Open your project
        </Link>
      </div>
    );
  }

  return (
    <div style={S(box)}>
      <div>Start a student project to get a join link. Anyone with the link, {first} included, can apply.</div>
      <Link href="/create" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(`margin-top:10px;${BTN_SECONDARY}`)}>
        Start a student project
      </Link>
    </div>
  );
}

function VolunteerDetail({ v, api }) {
  const name = shortName(v.name);
  const meta = metaLine(v);
  return (
    <div style={S('display:flex;flex-direction:column;gap:16px')}>
      <div style={S('display:flex;align-items:center;gap:14px')}>
        <div style={S('width:56px;height:56px;border-radius:50%;overflow:hidden;flex:none')}>
          <Avatar name={v.name} src={v.avatar} fs={20} />
        </div>
        <div style={S('min-width:0')}>
          <div style={S('font:450 14px/1.3 Geist;color:#57504A')}>{meta || 'Volunteer'}</div>
          {Number(v.verified_hours) > 0 ? <div style={S('margin-top:4px;font:450 12px/1.3 Geist;color:#3F6B4E')}>{hoursLabel(v.verified_hours)}</div> : null}
        </div>
      </div>
      {v.bio ? <div className="vu-break" style={S('font:400 14px/1.6 Geist;color:#332D28')}>{v.bio}</div> : null}
      {(v.causes || []).length ? (
        <div>
          <div style={S(LABEL)}>Causes</div>
          <div style={S('margin-top:8px;display:flex;gap:6px;flex-wrap:wrap')}>
            {v.causes.map((c) => <span key={c} style={S('padding:5px 9px;border-radius:7px;background:#F6F2EE;font:500 12px/1 Geist;color:#57504A')}>{c}</span>)}
          </div>
        </div>
      ) : null}
      {v.skills ? (
        <div>
          <div style={S(LABEL)}>Skills</div>
          <div className="vu-break" style={S('margin-top:6px;font:450 14px/1.5 Geist;color:#57504A')}>{v.skills}</div>
        </div>
      ) : null}
      <InviteActions first={name.split(' ')[0]} api={api} />
    </div>
  );
}

export default function Volunteers() {
  const params = useSearchParams();
  const initial = useRef(null);
  if (initial.current === null) initial.current = readFilters(params);
  const [q, setQ] = useState(initial.current.q);
  const [causes, setCauses] = useState(initial.current.causes);
  const [near, setNear] = useState(initial.current.near);
  // The query string this screen last wrote, so a URL change it made itself
  // isn't read back as an outside navigation.
  const written = useRef(params.toString());
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // `total` is the exact match count (null when the server sent none) and
  // `hasMore` says another page exists past the rows loaded so far.
  const [page, setPage] = useState({ total: null, hasMore: false });
  const [moreState, setMoreState] = useState('idle'); // idle | loading | failed
  // Bumped on every new search, so a "Show more" page for older filters is dropped.
  const searchKey = useRef(0);

  const causeKey = causes.join('|');
  useEffect(() => {
    let alive = true;
    const key = ++searchKey.current;
    setMoreState('idle');
    const run = async () => {
      try {
        const res = await searchVolunteersPage({ q, causes, near, limit: DIRECTORY_PAGE_SIZE });
        if (alive && key === searchKey.current) {
          setRows(res.rows);
          setPage({ total: res.total, hasMore: res.hasMore });
          setFailed(false);
        }
      } catch (err) {
        console.error('[volunteers] search failed', err);
        if (alive && key === searchKey.current) { setRows([]); setPage({ total: null, hasMore: false }); setFailed(true); }
      }
    };
    const t = setTimeout(run, (q || near) ? 280 : 0);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, causeKey, near, attempt]);

  // Mirror the filters into the URL (replace, so typing doesn't stack history).
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = filtersQuery({ q: q.trim(), near: near.trim(), causes });
      if (qs === written.current) return;
      written.current = qs;
      window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }, (q || near) ? 280 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, causeKey, near]);

  // A link to /volunteers with other (or no) filters, such as the nav item,
  // resets the fields to match the URL.
  const paramKey = params.toString();
  useEffect(() => {
    if (paramKey === written.current) return;
    written.current = paramKey;
    const f = readFilters(params);
    setQ(f.q);
    setNear(f.near);
    setCauses(f.causes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramKey]);

  /* Appends the next page of the same search. Rows already shown are skipped,
     so a directory change between pages can't show anyone twice. */
  async function loadMore() {
    if (!rows || moreState === 'loading') return;
    const key = searchKey.current;
    setMoreState('loading');
    try {
      const res = await searchVolunteersPage({ q, causes, near, limit: DIRECTORY_PAGE_SIZE, offset: rows.length });
      if (key !== searchKey.current) return;
      setRows((prev) => {
        const seen = new Set((prev || []).map((v) => v.user_id));
        return [...(prev || []), ...res.rows.filter((v) => !seen.has(v.user_id))];
      });
      setPage({ total: res.total, hasMore: res.hasMore && res.rows.length > 0 });
      setMoreState('idle');
    } catch (err) {
      console.error('[volunteers] loading more failed', err);
      if (key === searchKey.current) setMoreState('failed');
    }
  }

  const toggleCause = (c) => setCauses((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  const active = Boolean(q.trim() || causes.length || near.trim());
  const clearAll = () => { setQ(''); setNear(''); setCauses([]); };

  // The real match count when the server sent one, else what's loaded.
  const shownTotal = rows && page.total !== null ? Math.max(page.total, rows.length) : (rows ? rows.length : 0);

  function view(v) {
    openModal({
      title: shortName(v.name),
      Body: ({ api }) => <VolunteerDetail v={v} api={api} />,
    });
  }

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px')}>
      <h1 style={S('margin:0;font:600 30px/1.1 Geist;letter-spacing:-0.035em')}>Find volunteers</h1>
      <p style={S('margin:8px 0 0;font:450 15px/1.5 Geist;color:#6B635C')}>Students who chose to list themselves. Search by name, skill, cause or city.</p>

      {/* mode toggle */}
      <div style={S('margin-top:20px;display:flex;gap:6px;flex-wrap:wrap')}>
        <Link href="/discover" className={cx(H.press)} style={s('padding:8px 14px;border-radius:9px;text-decoration:none;font:600 13px/1 Geist', 'border:1px solid #E8E1D9;background:#fff;color:#57504A')}>Find opportunities</Link>
        <span aria-current="page" style={s('padding:8px 14px;border-radius:9px;font:600 13px/1 Geist', 'border:1px solid #C2603C;background:#FAF6F3;color:#A8482A')}>Find volunteers</span>
      </div>

      {/* search */}
      <div className={H.input} style={S('margin-top:18px;display:flex;align-items:center;gap:10px;padding:11px 12px 11px 16px;border-radius:12px;border:1px solid #E8E1D9;background:#fff')}>
        <span style={S('color:#A9A097')}><Icon name="search" size={16} /></span>
        <input type="search" aria-label="Search volunteers" autoComplete="off" value={q} placeholder="Name, skill or interest" onChange={(e) => setQ(e.target.value)} style={S('flex:1;min-width:0;font:450 15px/1.4 Geist;color:#1A1714;background:none;border:none;padding:2px 0')} />
        {q ? <button type="button" aria-label="Clear search" onClick={() => setQ('')} className={cx(H.press)} style={S(CLEAR_BTN)}><Icon name="x" size={14} /></button> : null}
      </div>
      <div className={H.input} style={S('margin-top:10px;display:flex;align-items:center;gap:10px;padding:10px 12px 10px 16px;border-radius:12px;border:1px solid #E8E1D9;background:#fff;max-width:420px')}>
        <span style={S('color:#A9A097')}><Icon name="pin" size={16} /></span>
        <input type="text" aria-label="Filter by city" autoComplete="off" value={near} placeholder="City, e.g. Rivertown" onChange={(e) => setNear(e.target.value)} style={S('flex:1;min-width:0;font:450 14px/1.4 Geist;color:#1A1714;background:none;border:none;padding:2px 0')} />
        {near ? <button type="button" aria-label="Clear city" onClick={() => setNear('')} className={cx(H.press)} style={S(CLEAR_BTN)}><Icon name="x" size={14} /></button> : null}
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
        ) : failed ? (
          <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <ErrorState title="Couldn't search volunteers" body="Check your connection and try again." onRetry={() => setAttempt((n) => n + 1)} />
          </div>
        ) : rows.length === 0 ? (
          <div style={S('padding:34px 24px;text-align:center;border-radius:16px;border:1px dashed #E0D8CF;background:#FCFAF8')}>
            <div style={S('font:600 16px/1.3 Geist;color:#1A1714')}>{active ? 'No volunteers match that' : 'No one is listed yet'}</div>
            <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#8A8179')}>
              {active ? 'Try a shorter search or fewer causes.' : 'Students show up here once they list themselves.'}
            </div>
            {active ? (
              <button type="button" onClick={clearAll} className={cx(H.secondary, H.press)} style={S('margin-top:14px;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer')}>
                Clear filters
              </button>
            ) : (
              <Link href="/discover" className={cx(H.secondary, H.press)} style={S('margin-top:14px;display:inline-flex;align-items:center;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;text-decoration:none')}>
                Find opportunities
              </Link>
            )}
          </div>
        ) : (
          <>
            <div style={S('margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:12px')}>
              <div aria-live="polite" style={S(LABEL)}>{shownTotal} {shownTotal === 1 ? 'volunteer' : 'volunteers'}</div>
              {active ? (
                <button type="button" onClick={clearAll} className={cx(H.press)} style={S('border:0;background:none;padding:4px 2px;font:600 13px/1 Geist;color:#C2603C;cursor:pointer')}>
                  Clear filters
                </button>
              ) : null}
            </div>
            <div className="vu-3col" style={S('display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:start')}>
              {rows.map((v) => {
                const meta = metaLine(v);
                return (
                  <Pressable key={v.user_id} label={`View ${shortName(v.name)}`} onClick={() => view(v)} className={cx(H.card, H.press)} style={S('min-width:0;text-align:left;padding:18px;border-radius:14px;border:1px solid #E8E1D9;background:#fff;cursor:pointer;transition:border-color .16s ease')}>
                    <div style={S('display:flex;align-items:center;gap:12px')}>
                      <div style={S('width:44px;height:44px;border-radius:50%;overflow:hidden;flex:none')}>
                        <Avatar name={v.name} src={v.avatar} fs={16} />
                      </div>
                      <div style={S('min-width:0;flex:1')}>
                        <div className="vu-trunc" style={S('font:600 15px/1.2 Geist;color:#1A1714')}>{shortName(v.name)}</div>
                        <div className="vu-trunc" style={S('margin-top:3px;font:450 12px/1.3 Geist;color:#8A8179')}>{meta || 'Volunteer'}</div>
                      </div>
                    </div>
                    {v.bio ? <div style={S('margin-top:12px;font:450 13px/1.5 Geist;color:#57504A;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere')}>{v.bio}</div> : null}
                    {(v.causes || []).length ? (
                      <div style={S('margin-top:11px;display:flex;gap:6px;flex-wrap:wrap')}>
                        {v.causes.slice(0, 3).map((c) => <span key={c} style={S('padding:4px 8px;border-radius:6px;background:#F6F2EE;font:500 11px/1 Geist;color:#57504A')}>{c}</span>)}
                      </div>
                    ) : null}
                  </Pressable>
                );
              })}
            </div>
            {page.hasMore ? (
              <div style={S('margin-top:14px')}>
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={moreState === 'loading'}
                  aria-busy={moreState === 'loading' ? 'true' : undefined}
                  className={cx(H.secondary, H.press)}
                  style={S('width:100%;padding:0 16px;height:42px;border-radius:12px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#332D28;cursor:pointer')}
                >
                  {moreState === 'loading' ? 'Loading more volunteers' : 'Show more volunteers'}
                </button>
                <div aria-live="polite" style={S('margin-top:8px;text-align:center;font:450 12px/1.4 Geist;color:#8A8179')}>
                  {moreState === 'failed'
                    ? "Couldn't load more volunteers. Check your connection and try again."
                    : page.total ? `Showing ${rows.length} of ${page.total}` : ''}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
