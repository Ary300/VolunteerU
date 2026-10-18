'use client';

/* ==========================================================================
   Volunteers.jsx, the volunteer directory (find people, not projects)
   The flip side of Discover: search every listed volunteer across accounts by
   name/skills, cause and city. Real server-side search over volunteer_directory,
   with the exact match count and "Show more volunteers" for the next page.
   A student lead recruiting, or a volunteer finding peers, lands here.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { S } from '../../lib/style.js';
import { C, F, causeOf } from '../../lib/tokens.js';
import { Avatar, Button, Chip, CauseDot, EmptyState, ErrorState, Icon, SkeletonRows } from '../ui.jsx';
import { Sep } from '../vu/ListingCard.jsx';
import { openModal, toast } from '../../lib/overlays.js';
import { CAUSES } from '../../lib/seed.js';
import { searchVolunteersPage } from '../../lib/listings.js';
import { copyText } from '../../lib/db.js';
import { useStore } from '../../lib/store.js';

const MAX_INVITE_PROJECTS = 3;
// Rows per page in the directory; "Show more volunteers" loads the next page.
const DIRECTORY_PAGE_SIZE = 24;
// Causes shown on a result row; the profile dialog lists all of them.
const ROW_CAUSES = 3;

/* Display name for a stored cause. The app stores "Food & hunger"; every
   screen shows "Food and hunger". Free text a student typed stays as typed. */
function causeName(c) {
  return CAUSES.includes(c) ? (causeOf(c) || {}).label || c : c;
}

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

const H3 = `margin:0;font:600 15px/1.3 ${F.body};color:${C.ink}`;
const CLEAR_BTN = `flex:none;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;color:${C.ink2};cursor:pointer;border:0;background:none`;

/** Other students show as first name plus last initial ("Owen P."). */
export function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Volunteer';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** ["Rivertown", "Grade 11"] from whatever the row has. */
function metaParts(v) {
  return [v.city, v.grade ? `Grade ${v.grade}` : null].filter(Boolean);
}

/** Parts joined by the house middle dot. */
function Dotted({ parts }) {
  return parts.map((p, i) => <span key={i}>{i ? <Sep /> : null}{p}</span>);
}

function roundHours(n) {
  return Math.round(Number(n || 0) * 10) / 10;
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

  // A plain section under a rule (the dialog is already the box).
  const panel = `padding-top:20px;border-top:1px solid ${C.line};font:400 14px/1.5 ${F.body};color:${C.ink2}`;

  if (live.length) {
    return (
      <div style={S(panel)}>
        <div>Anyone with the join link can apply to {live.length === 1 ? live[0].name : 'your projects'}, {first} included. You accept applications from your project page.</div>
        <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:8px')}>
          {live.map((p) => (
            <div key={p.id} style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap')}>
              {live.length > 1 ? <span className="vu-break" style={S(`min-width:0;flex:1;font:600 14px/1.3 ${F.body};color:${C.ink}`)}>{p.name}</span> : null}
              <Button
                size="sm"
                icon="copy"
                onClick={() => copy(p)}
                aria-label={live.length > 1 ? `Copy join link for ${p.name}` : 'Copy join link'}
              >
                Copy join link
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (draft) {
    return (
      <div style={S(panel)}>
        <div>Publish {draft.name} to turn on its join link. Anyone with the link, {first} included, can then apply.</div>
        <div style={S('margin-top:12px')}>
          <Button size="sm" href={`/lead/${draft.id}`} onClick={() => api.close()}>Open your project</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={S(panel)}>
      <div>Start a student project to get a join link. Anyone with the link, {first} included, can apply.</div>
      <div style={S('margin-top:12px')}>
        <Button size="sm" variant="dark" href="/create" onClick={() => api.close()}>Start a student project</Button>
      </div>
    </div>
  );
}

function VolunteerDetail({ v, api }) {
  const name = shortName(v.name);
  const meta = metaParts(v);
  const h = roundHours(v.verified_hours);
  return (
    <div style={S('display:flex;flex-direction:column;gap:20px')}>
      <div style={S('display:flex;align-items:center;gap:16px')}>
        <div style={S('width:56px;height:56px;border-radius:50%;overflow:hidden;flex:none')}>
          <Avatar name={v.name} src={v.avatar} fs={19} />
        </div>
        <div style={S('min-width:0;flex:1')}>
          <div style={S(`font:400 15px/1.4 ${F.body};color:${C.ink2}`)}>{meta.length ? <Dotted parts={meta} /> : 'Volunteer'}</div>
          <p style={S(`margin:2px 0 0;font:400 15px/1.4 ${F.body};color:${C.ink2};font-variant-numeric:tabular-nums`)}>
            <b style={S(`font-weight:600;color:${C.ink}`)}>{h}</b> {h === 1 ? 'hr' : 'hrs'} confirmed by organizers
          </p>
        </div>
      </div>
      {v.bio ? <p className="vu-break" style={S(`margin:0;font:400 15px/1.55 ${F.body};color:${C.ink}`)}>{v.bio}</p> : null}
      {(v.causes || []).length ? (
        <div>
          <h3 style={S(H3)}>Causes</h3>
          <ul style={S(`margin:8px 0 0;padding:0;list-style:none;display:flex;gap:6px 16px;flex-wrap:wrap;font:400 15px/1.4 ${F.body};color:${C.ink}`)}>
            {v.causes.map((c) => (
              <li key={c} style={S('display:inline-flex;align-items:center;gap:7px')}>
                <CauseDot cause={c} />
                {causeName(c)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {v.skills ? (
        <div>
          <h3 style={S(H3)}>Skills</h3>
          <p className="vu-break" style={S(`margin:6px 0 0;font:400 15px/1.5 ${F.body};color:${C.ink}`)}>{v.skills}</p>
        </div>
      ) : null}
      <InviteActions first={name.split(' ')[0]} api={api} />
    </div>
  );
}

/* One result, a plain row: initials, name, place and grade, the first
   causes, confirmed hours and a chevron. The whole row opens the profile. */
const ROW_BTN = `width:100%;text-align:left;font:inherit;color:inherit;background:none;border:0;border-bottom:1px solid ${C.line};cursor:pointer;grid-template-columns:auto minmax(0,1fr) auto;align-items:start`;

function VolunteerRow({ v, onOpen }) {
  const meta = metaParts(v);
  const causes = v.causes || [];
  const h = roundHours(v.verified_hours);
  const extra = causes.length - ROW_CAUSES;
  return (
    <button type="button" aria-label={`View ${shortName(v.name)}`} onClick={onOpen} className="vu-row" style={S(ROW_BTN)}>
      <span className="vu-row-avatar"><Avatar name={v.name} src={v.avatar} fs={13} /></span>
      <span style={S('display:block;min-width:0')}>
        <span className="vu-row-t">{shortName(v.name)}</span>
        <span className="vu-row-m">{meta.length ? <Dotted parts={meta} /> : 'Volunteer'}</span>
        {causes.length ? (
          <span className="vu-row-m">
            <Dotted parts={causes.slice(0, ROW_CAUSES).map(causeName)} />
            {extra > 0 ? <><Sep />{`${extra} more`}</> : null}
          </span>
        ) : null}
      </span>
      <span style={S('display:flex;align-items:center;gap:8px;align-self:center')}>
        {h > 0 ? <span className="vu-row-num">{h} {h === 1 ? 'hr' : 'hrs'}</span> : null}
        <span className="vu-np-chev" aria-hidden="true"><Icon name="chevron-right" size={18} /></span>
      </span>
    </button>
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
    <div className="vu-page vu-screen">
      <div style={S('max-width:1040px')}>
        <header style={S('display:flex;align-items:flex-end;justify-content:space-between;gap:12px 24px;flex-wrap:wrap')}>
          <div style={S('min-width:0')}>
            <h1 className="vu-t-h1" style={S(`color:${C.ink}`)}>Find volunteers</h1>
            <p style={S(`margin:8px 0 0;font:400 15px/1.45 ${F.body};color:${C.ink2}`)}>Students who chose to list themselves on VolunteerU.</p>
          </div>
          <Link href="/discover" className="vu-link-ul" style={S(`font:600 14px/1.3 ${F.body}`)}>Find opportunities</Link>
        </header>

        {/* who / where, live search */}
        <div role="search" aria-label="Volunteer search" className="vu-sb" style={S('margin-top:28px;padding:8px')}>
          <label className="vu-sb-seg">
            <span className="vu-sb-ic"><Icon name="search" size={20} /></span>
            <span className="vu-sb-body">
              <span className="vu-sb-label">Who</span>
              <input type="search" aria-label="Search volunteers" autoComplete="off" value={q} placeholder="Name, skill or interest" onChange={(e) => setQ(e.target.value)} className="vu-sb-input" />
            </span>
            {q ? <button type="button" aria-label="Clear search" onClick={() => setQ('')} className="vu-iconbtn" style={S(CLEAR_BTN)}><Icon name="x" size={16} /></button> : null}
          </label>
          <label className="vu-sb-seg vu-sb-seg--where">
            <span className="vu-sb-ic"><Icon name="pin" size={20} /></span>
            <span className="vu-sb-body">
              <span className="vu-sb-label">Where</span>
              <input type="text" aria-label="Filter by city" autoComplete="off" value={near} placeholder="City, e.g. Carmel" onChange={(e) => setNear(e.target.value)} className="vu-sb-input" />
            </span>
            {near ? <button type="button" aria-label="Clear city" onClick={() => setNear('')} className="vu-iconbtn" style={S(CLEAR_BTN)}><Icon name="x" size={16} /></button> : null}
          </label>
        </div>

        {/* cause chips */}
        <div role="group" aria-label="Filter by cause" style={S('margin:20px -16px 0;padding:2px 16px 4px;display:flex;gap:8px;overflow-x:auto;scrollbar-width:none')}>
          {CAUSES.map((c) => (
            <Chip key={c} label={causeName(c)} on={causes.includes(c)} onClick={() => toggleCause(c)} py={8} px={14} />
          ))}
        </div>

        {/* results */}
        <div style={S('margin-top:32px')}>
          {rows === null ? (
            <SkeletonRows n={4} h={72} />
          ) : failed ? (
            <ErrorState title="Couldn't search volunteers" body="Check your connection and try again." onRetry={() => setAttempt((n) => n + 1)} />
          ) : rows.length === 0 ? (
            <EmptyState
              compact
              title={active ? 'No volunteers match that' : 'No one is listed yet'}
              body={active ? 'Try a shorter search or fewer causes.' : 'Students show up here once they list themselves.'}
              cta={active ? 'Clear filters' : 'Find opportunities'}
              onCta={active ? clearAll : undefined}
              ctaHref={active ? undefined : '/discover'}
            />
          ) : (
            <>
              <div className="vu-sec-head" style={S('align-items:center')}>
                <h2 aria-live="polite" style={S(`margin:0;font:650 22px/1.15 ${F.display};letter-spacing:-0.02em;color:${C.ink};font-variant-numeric:tabular-nums`)}>
                  {shownTotal.toLocaleString('en-US')} {shownTotal === 1 ? 'volunteer' : 'volunteers'}
                </h2>
                {active ? (
                  <button type="button" onClick={clearAll} className="vu-link-ul" style={S(`border:0;background:none;padding:4px 0;font:600 14px/1 ${F.body};cursor:pointer`)}>
                    Clear filters
                  </button>
                ) : null}
              </div>
              <div className="vu-np-grid" style={S(`margin-top:8px;border-top:1px solid ${C.line}`)}>
                {rows.map((v) => <VolunteerRow key={v.user_id} v={v} onOpen={() => view(v)} />)}
              </div>
              {page.hasMore ? (
                <div style={S('margin-top:24px;display:flex;align-items:center;gap:16px;flex-wrap:wrap')}>
                  <Button
                    onClick={loadMore}
                    busy={moreState === 'loading'}
                    aria-busy={moreState === 'loading' ? 'true' : undefined}
                  >
                    {moreState === 'loading' ? 'Loading more volunteers' : 'Show more volunteers'}
                  </Button>
                  <span aria-live="polite" style={S(`font:400 13px/1.4 ${F.body};color:${C.ink2};font-variant-numeric:tabular-nums`)}>
                    {moreState === 'failed'
                      ? "Couldn't load more volunteers. Check your connection and try again."
                      : page.total ? `Showing ${rows.length.toLocaleString('en-US')} of ${page.total.toLocaleString('en-US')}` : ''}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
