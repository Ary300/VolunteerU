'use client';

/* ==========================================================================
   Discover.jsx — design screen: `isDiscover`
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Pressable, EmptyState, SkeletonRows, Chip, Select, Checkbox, PrimaryButton, SecondaryButton } from '../ui.jsx';
import MapPanel from '../MapPanel.jsx';
import DiscoverListings from '../DiscoverListings.jsx';
import WebNonprofits from '../WebNonprofits.jsx';
import { useSnapshot } from '../../lib/store.js';
import { openModal, toast } from '../../lib/overlays.js';
import {
  searchOpportunities, suggestionsFor, spotsLeft, spotsLabel, applicationFor, rememberSearch, clearSearches, claimSpot,
} from '../../lib/db.js';
import { CAUSES, WINDOWS } from '../../lib/seed.js';
import { word, startTime } from '../../lib/format.js';

const MONO = "'Geist Mono',monospace";

const CHIPS = [
  { k: 'all', t: 'All causes' },
  { k: 'Food & hunger', t: 'Food & hunger' },
  { k: 'Education', t: 'Education' },
  { k: 'Environment', t: 'Environment' },
  { k: 'Civic', t: 'Civic' },
  { k: 'Animals', t: 'Animals' },
  { k: 'win:Saturday afternoon', t: 'Sat afternoon' },
  { k: 'mi:5', t: '≤5 mi' },
];

const SORTS = [
  { v: 'match', l: 'Best match' },
  { v: 'distance', l: 'Closest first' },
  { v: 'soonest', l: 'Soonest' },
  { v: 'hours', l: 'Most hours' },
  { v: 'spots', l: 'Most spots left' },
];

const RADII = [
  { v: '', l: 'Any distance' },
  { v: '2', l: 'Within 2 miles' },
  { v: '5', l: 'Within 5 miles' },
  { v: '10', l: 'Within 10 miles' },
];

export default function Discover() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const q = params.get('q') || '';
  const causes = useMemo(() => (params.get('causes') || '').split('|').filter(Boolean), [params]);
  const windows = useMemo(() => (params.get('windows') || '').split('|').filter(Boolean), [params]);
  const maxMiles = params.get('mi') ? Number(params.get('mi')) : null;
  const sort = params.get('sort') || 'match';
  const savedOnly = params.get('saved') === '1';
  const tab = params.get('tab') === 'projects' ? 'projects' : 'openings';
  const place = ['person', 'online'].includes(params.get('place')) ? params.get('place') : 'all';
  const kind = ['student', 'official'].includes(params.get('kind')) ? params.get('kind') : 'all';
  const near = params.get('near') || '';

  const { state } = useSnapshot();
  const interest = (state.prefs && state.prefs.interest) || '';
  const matchNear = near || (state.prefs && state.prefs.location) || (state.account.city ? String(state.account.city).split(',')[0] : '');
  // For the IRS-registry cards: use the typed location as-is, else fall back to
  // saved location + onboarding ZIP so tiny towns still resolve to a state.
  const webNear = near || [(state.prefs && state.prefs.location) || (state.account.city || ''), state.onboarding?.zip || ''].filter(Boolean).join(' ');
  const [draftQuery, setDraftQuery] = useState(q);
  const [showSuggest, setShowSuggest] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchWrap = useRef(null);

  useEffect(() => setDraftQuery(q), [q]);

  // Close the suggestion panel on an outside click.
  useEffect(() => {
    if (!showSuggest) return undefined;
    const onDown = (e) => {
      if (searchWrap.current && !searchWrap.current.contains(e.target)) setShowSuggest(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showSuggest]);

  const setParams = (patch, opts = {}) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([k, v]) => {
      if (v === null || v === undefined || v === '' || v === false) next.delete(k);
      else next.set(k, String(v));
    });
    const qs = next.toString();
    router[opts.replace ? 'replace' : 'push'](qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const filters = { q, causes, windows, maxMiles, sort, savedOnly, place };
  const rows = searchOpportunities(filters);
  const nFilters = causes.length + windows.length + (maxMiles != null ? 1 : 0) + (savedOnly ? 1 : 0);
  const withinRadius = state.opportunities.filter((o) => o.distance <= state.prefs.radius).length;
  const closingSoon = state.opportunities.filter((o) => o.closesSoon).length;
  const suggestions = showSuggest ? suggestionsFor(draftQuery) : [];
  const peerRows = tab === 'projects' ? state.peerProjects : state.peerProjects.slice(0, 5);
  const weekBookings = state.bookings.slice(0, 2);
  const weekHours = weekBookings.reduce((a, b) => {
    const opp = state.opportunities.find((o) => o.id === b.oppId);
    return a + (opp ? opp.hours : 0);
  }, 0);

  function runSearch(value) {
    const v = value === undefined ? draftQuery : value;
    setShowSuggest(false);
    setSearching(true);
    rememberSearch(v);
    setParams({ q: v });
    setTimeout(() => setSearching(false), 260);
  }

  function toggleChip(k) {
    if (k === 'all') {
      setParams({ causes: null, windows: null, mi: null, saved: null });
      return;
    }
    if (k.startsWith('win:')) {
      const w = k.slice(4);
      const nextW = windows.includes(w) ? windows.filter((x) => x !== w) : [...windows, w];
      setParams({ windows: nextW.join('|') });
      return;
    }
    if (k.startsWith('mi:')) {
      const m = Number(k.slice(3));
      setParams({ mi: maxMiles === m ? null : m });
      return;
    }
    const nextC = causes.includes(k) ? causes.filter((x) => x !== k) : [...causes, k];
    setParams({ causes: nextC.join('|') });
  }

  const chipIsOn = (chip) => {
    if (chip.k === 'all') return !causes.length && !windows.length && maxMiles == null && !savedOnly;
    if (chip.k.startsWith('win:')) return windows.includes(chip.k.slice(4));
    if (chip.k.startsWith('mi:')) return maxMiles === Number(chip.k.slice(3));
    return causes.includes(chip.k);
  };

  function openFilters() {
    openModal({
      title: 'Filter openings',
      subtitle: 'Every filter applies to both accredited organizations and student projects.',
      size: 'wide',
      Body: function FilterBody({ api }) {
        const [local, setLocal] = useState({ causes: causes.slice(), windows: windows.slice(), mi: maxMiles ? String(maxMiles) : '', sort, savedOnly });
        const preview = searchOpportunities({
          q,
          causes: local.causes,
          windows: local.windows,
          maxMiles: local.mi ? Number(local.mi) : null,
          sort: local.sort,
          savedOnly: local.savedOnly,
        }).length;
        return (
          <div>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Causes</div>
            <div style={S('margin-top:12px;display:flex;flex-wrap:wrap;gap:8px')}>
              {CAUSES.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  role="checkbox"
                  on={local.causes.includes(c)}
                  py={9}
                  px={13}
                  fs={13}
                  onClick={() => setLocal((f) => ({ ...f, causes: f.causes.includes(c) ? f.causes.filter((x) => x !== c) : [...f.causes, c] }))}
                />
              ))}
            </div>
            <div style={S(`margin-top:22px;font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>When you are free</div>
            <div style={S('margin-top:12px;display:flex;flex-wrap:wrap;gap:8px')}>
              {WINDOWS.map((w) => (
                <Chip
                  key={w}
                  label={w}
                  role="checkbox"
                  on={local.windows.includes(w)}
                  py={9}
                  px={13}
                  fs={13}
                  onClick={() => setLocal((f) => ({ ...f, windows: f.windows.includes(w) ? f.windows.filter((x) => x !== w) : [...f.windows, w] }))}
                />
              ))}
            </div>
            <div className="vu-2col-keep" style={S('margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
              <Select label="Distance" value={local.mi} options={RADII} onChange={(v) => setLocal((f) => ({ ...f, mi: v }))} />
              <Select label="Sort by" value={local.sort} options={SORTS} onChange={(v) => setLocal((f) => ({ ...f, sort: v }))} />
            </div>
            <div style={S('margin-top:18px')}>
              <Checkbox checked={local.savedOnly} size={16} label="Only show my shortlist" onChange={(v) => setLocal((f) => ({ ...f, savedOnly: v }))} />
            </div>
            <div style={S('margin-top:22px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
              <div style={S('font:450 13px/1.4 Geist;color:#8A8179')}>
                {preview} {preview === 1 ? 'opening matches' : 'openings match'} these filters
              </div>
              <div style={S('display:flex;gap:10px')}>
                <SecondaryButton
                  h={40}
                  px={16}
                  r={11}
                  fs={14}
                  onClick={() => setLocal({ causes: [], windows: [], mi: '', sort: 'match', savedOnly: false })}
                >
                  Reset
                </SecondaryButton>
                <PrimaryButton
                  h={40}
                  px={18}
                  r={11}
                  fs={14}
                  onClick={() => {
                    setParams({
                      causes: local.causes.join('|'),
                      windows: local.windows.join('|'),
                      mi: local.mi || null,
                      sort: local.sort === 'match' ? null : local.sort,
                      saved: local.savedOnly ? '1' : null,
                    });
                    api.close();
                  }}
                >
                  Show {preview}
                </PrimaryButton>
              </div>
            </div>
          </div>
        );
      },
    });
  }

  function verifyInfo() {
    openModal({
      title: 'How we verify an organization',
      subtitle: 'A green check is never automatic.',
      body: (
        <div style={S('display:flex;flex-direction:column;gap:14px')}>
          {[
            ['Registration', 'We confirm the organization is a registered nonprofit, school, library or public agency in good standing.'],
            ['Insurance', 'General liability coverage has to be current and on file before a listing can go live.'],
            ['A named staff contact', 'Every shift lists a background-checked adult who is on site and reachable.'],
            ['Youth policy', 'Age minimums, guardian consent and the two-adult rule are enforced before a listing is shown to you.'],
            ['Re-checks', 'Verification is reviewed every term. A lapse pulls the listing until it is fixed.'],
          ].map(([t, b]) => (
            <div key={t} style={S('display:flex;gap:11px;align-items:flex-start')}>
              <span aria-hidden="true" style={S('color:#3F6B4E;margin-top:2px')}>✓</span>
              <div>
                <div style={S('font:600 14px/1.3 Geist')}>{t}</div>
                <div style={S('margin-top:5px;font:450 13px/1.55 Geist;color:#6B635C')}>{b}</div>
              </div>
            </div>
          ))}
          <div style={S('margin-top:4px;padding:14px;border-radius:12px;background:#FCFAF8;border:1px solid #F1EBE4;font:450 13px/1.55 Geist;color:#6B635C')}>
            Student projects do not carry the check themselves — they show the lead and the verified sponsor standing behind them.
          </div>
        </div>
      ),
    });
  }

  function expandMap() {
    openModal({
      title: 'Openings near you',
      subtitle: `${withinRadius} openings within ${state.prefs.radius} miles of ${state.account.zip}`,
      size: 'wide',
      body: (
        <div style={S('border-radius:14px;overflow:hidden;border:1px solid #E8E1D9')}>
          <MapPanel height={420} top={-120} left={-60} interactive />
        </div>
      ),
    });
  }

  function claim(id) {
    try {
      const { shift } = claimSpot(id);
      router.push(`/apply/${id}?shift=${shift.id}`);
    } catch (err) {
      if (err && err.code === 'FULL') {
        toast({
          title: 'Every shift is full',
          message: 'Join the waitlist and we will text you the moment a spot opens.',
          tone: 'warn',
          actionLabel: 'Open listing',
          onAction: () => router.push(`/opportunity/${id}`),
        });
      } else {
        toast({ title: 'That listing is gone', message: 'It was taken down while you were browsing.', tone: 'danger' });
      }
    }
  }

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px')}>
      <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:24px')}>
        <div>
          <h1 style={S('margin:0;font:600 30px/1.1 Geist;letter-spacing:-0.035em')}>Discover{state.account.firstName ? `, ${state.account.firstName}` : ''}</h1>
          <p style={S('margin:8px 0 0;font:450 15px/1.5 Geist;color:#6B635C')}>
            Search real student projects and nonprofits. Filter by cause, kind and where they run.
          </p>
        </div>
        <div style={S('display:flex;gap:10px')}>
          <Pressable
            label={`Filters${nFilters ? `, ${nFilters} active` : ''}`}
            expanded={false}
            onClick={openFilters}
            className={cx(H.secondaryLift, H.press)}
            style={s(
              'display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 16px;height:40px;border-radius:11px',
              `border:1px solid ${nFilters ? '#D8CEC3' : '#E4DDD4'}`,
              'background:#fff;font:600 14px/1 Geist;color:#1A1714;cursor:pointer;transition:background .16s ease, border-color .16s ease, transform .16s ease'
            )}
          >
            Filters
            {nFilters ? (
              <span style={S(`min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#F5E7E0;color:#A8482A;font:600 10px/18px ${MONO};text-align:center`)}>{nFilters}</span>
            ) : null}
          </Pressable>
          <Pressable
            label="Start a project"
            onClick={() => router.push('/create')}
            className={cx(H.primaryLift, H.press)}
            style={S('display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer;transition:transform .16s ease, box-shadow .16s ease, background .16s ease')}
          >
            <span aria-hidden="true" style={S('font-size:11px;opacity:.9')}>▷</span>
            Start a project
          </Pressable>
        </div>
      </div>

      <div style={S('margin-top:18px;display:flex;gap:6px')}>
        <span style={s('padding:8px 14px;border-radius:9px;font:600 13px/1 Geist', 'border:1px solid #C2603C;background:#FAF6F3;color:#A8482A')}>Find projects</span>
        <Pressable label="Find volunteers" onClick={() => router.push('/volunteers')} className={cx(H.press)} style={s('padding:8px 14px;border-radius:9px;cursor:pointer;font:600 13px/1 Geist', 'border:1px solid #E8E1D9;background:#fff;color:#57504A')}>Find volunteers</Pressable>
      </div>

      <div ref={searchWrap} style={S('position:relative')}>
        <div
          className={H.input}
          style={s(
            'margin-top:22px;display:flex;align-items:center;gap:10px;padding:13px 16px;border-radius:12px',
            `border:1px solid ${showSuggest ? '#D8CEC3' : '#E8E1D9'}`,
            'background:#fff;transition:border-color .16s ease'
          )}
        >
          <span aria-hidden="true" style={S('color:#BEB5AC;font-size:14px')}>⌕</span>
          <input
            id="vu-discover-search"
            type="search"
            role="combobox"
            aria-expanded={showSuggest}
            aria-controls="vu-suggest"
            aria-label="Search openings"
            autoComplete="off"
            value={draftQuery}
            placeholder="Search “Saturday afternoon, food bank, under 5 miles”"
            onChange={(e) => {
              setDraftQuery(e.target.value);
              setShowSuggest(true);
            }}
            onFocus={() => setShowSuggest(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch();
              if (e.key === 'Escape') {
                setShowSuggest(false);
                e.currentTarget.blur();
              }
            }}
            style={S('flex:1;min-width:0;font:450 15px/1 Geist;color:#1A1714;background:none;border:none;padding:0')}
          />
          {draftQuery ? (
            <button
              type="button"
              aria-label="Clear search"
              className={cx(H.icon, H.press)}
              onClick={() => {
                setDraftQuery('');
                runSearch('');
              }}
              style={S('flex:none;width:24px;height:24px;border-radius:7px;display:grid;place-items:center;color:#A9A097;font-size:12px;cursor:pointer;transition:background .16s ease')}
            >
              ✕
            </button>
          ) : null}
        </div>

        <div
          className={H.input}
          style={S('margin-top:10px;display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;border:1px solid #E8E1D9;background:#fff;max-width:420px;transition:border-color .16s ease')}
        >
          <span aria-hidden="true" style={S('color:#BEB5AC;font-size:14px')}>◎</span>
          <input
            type="text"
            aria-label="Filter by location"
            autoComplete="off"
            value={near}
            placeholder={`City or ZIP${state.account.city ? ` — e.g. ${String(state.account.city).split(',')[0]}` : ' — e.g. San Diego'}`}
            onChange={(e) => setParams({ near: e.target.value || null }, { replace: true })}
            style={S('flex:1;min-width:0;font:450 14px/1 Geist;color:#1A1714;background:none;border:none;padding:0')}
          />
          {near ? (
            <button
              type="button"
              aria-label="Clear location"
              className={cx(H.icon, H.press)}
              onClick={() => setParams({ near: null }, { replace: true })}
              style={S('flex:none;width:24px;height:24px;border-radius:7px;display:grid;place-items:center;color:#A9A097;font-size:12px;cursor:pointer;transition:background .16s ease')}
            >
              ✕
            </button>
          ) : null}
        </div>

        {showSuggest ? (
          <div
            id="vu-suggest"
            role="listbox"
            className="vu-screen"
            style={S('position:absolute;left:0;right:0;top:100%;margin-top:6px;z-index:70;border-radius:12px;border:1px solid #E8E1D9;background:#fff;box-shadow:0 22px 44px -22px rgba(60,40,25,.42), 0 1px 2px rgba(30,20,10,.06);overflow:hidden')}
          >
            {suggestions.length ? (
              <>
                <div style={S(`padding:10px 14px 6px;font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Suggestions</div>
                {suggestions.map((sg) => (
                  <Pressable
                    key={`${sg.kind}-${sg.id}-${sg.label}`}
                    role="option"
                    label={sg.label}
                    onClick={() => {
                      if (sg.kind === 'project') router.push(`/projects/${sg.id}`);
                      else router.push(`/opportunity/${sg.id}`);
                      setShowSuggest(false);
                    }}
                    className={cx(H.row, H.press)}
                    style={S('padding:10px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:background .16s ease')}
                  >
                    <span aria-hidden="true" style={S('font-size:11px;color:#C2603C;width:14px')}>
                      {sg.kind === 'org' ? '◎' : sg.kind === 'project' ? '◈' : '⌕'}
                    </span>
                    <span style={S('font:500 13px/1.3 Geist;color:#1A1714')}>{sg.label}</span>
                    <span style={S('font:450 12px/1.3 Geist;color:#A9A097')}>{sg.sub}</span>
                  </Pressable>
                ))}
              </>
            ) : null}
            {state.recentSearches.length ? (
              <>
                <div style={s('padding:10px 14px 6px;display:flex;align-items:center;justify-content:space-between', suggestions.length ? 'border-top:1px solid #F1EBE4' : '')}>
                  <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Recent</div>
                  <Pressable label="Clear recent searches" onClick={() => clearSearches()} className={H.link} style={S('font:500 11px/1 Geist;color:#C2603C;cursor:pointer')}>
                    Clear
                  </Pressable>
                </div>
                {state.recentSearches.map((r) => (
                  <Pressable
                    key={r}
                    role="option"
                    label={`Search ${r}`}
                    onClick={() => {
                      setDraftQuery(r);
                      runSearch(r);
                    }}
                    className={cx(H.row, H.press)}
                    style={S('padding:10px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:background .16s ease')}
                  >
                    <span aria-hidden="true" style={S('font-size:11px;color:#BEB5AC;width:14px')}>↺</span>
                    <span style={S('font:450 13px/1.3 Geist;color:#332D28')}>{r}</span>
                  </Pressable>
                ))}
              </>
            ) : null}
            {!suggestions.length && !state.recentSearches.length ? (
              <div style={S('padding:14px;font:450 13px/1.5 Geist;color:#8A8179')}>
                Try a cause, an organization, a day, or a distance — “Saturday afternoon, food bank, under 5 miles”.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {tab === 'openings' ? (
        <div role="group" aria-label="Kind of organization" style={S('margin-top:16px;display:flex;gap:6px')}>
          {[{ k: 'all', t: 'All projects' }, { k: 'student', t: 'Student-led' }, { k: 'official', t: 'Nonprofits' }].map((o) => {
            const on = kind === o.k;
            return (
              <Pressable
                key={o.k}
                role="radio"
                aria-checked={on}
                label={o.t}
                onClick={() => setParams({ kind: o.k === 'all' ? null : o.k })}
                className={cx(H.press)}
                style={s(
                  'padding:8px 14px;border-radius:9px',
                  `border:1px solid ${on ? '#C2603C' : '#E8E1D9'}`,
                  `background:${on ? '#FAF6F3' : '#FFFFFF'}`,
                  `color:${on ? '#A8482A' : '#57504A'}`,
                  'font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease, border-color .16s ease, color .16s ease'
                )}
              >
                {o.t}
              </Pressable>
            );
          })}
        </div>
      ) : null}

      {tab === 'openings' ? (
        <div role="group" aria-label="Where openings happen" style={S('margin-top:12px;display:flex;gap:6px')}>
          {[{ k: 'all', t: 'All' }, { k: 'person', t: 'In person' }, { k: 'online', t: 'Online' }].map((o) => {
            const on = place === o.k;
            return (
              <Pressable
                key={o.k}
                role="radio"
                aria-checked={on}
                label={o.t}
                onClick={() => setParams({ place: o.k === 'all' ? null : o.k })}
                className={cx(H.press)}
                style={s(
                  'padding:8px 14px;border-radius:9px',
                  `border:1px solid ${on ? '#1F1B18' : '#E8E1D9'}`,
                  `background:${on ? '#1F1B18' : '#FFFFFF'}`,
                  `color:${on ? '#FFFFFF' : '#57504A'}`,
                  'font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease, border-color .16s ease, color .16s ease'
                )}
              >
                {o.t}
              </Pressable>
            );
          })}
        </div>
      ) : null}

      <div role="group" aria-label="Quick filters" style={S('margin-top:14px;display:flex;flex-wrap:wrap;gap:8px')}>
        {CHIPS.map((c) => {
          const on = chipIsOn(c);
          return (
            <Pressable
              key={c.k}
              label={c.t}
              pressed={on}
              onClick={() => toggleChip(c.k)}
              className={cx(on ? H.link : H.chip, H.press)}
              style={s(
                'padding:8px 13px;border-radius:9px',
                `border:1px solid ${on ? '#1F1B18' : '#E8E1D9'}`,
                `background:${on ? '#1F1B18' : '#FFFFFF'}`,
                `color:${on ? '#FFFFFF' : '#57504A'}`,
                'font:500 13px/1 Geist;cursor:pointer;transition:background .16s ease, border-color .16s ease, color .16s ease'
              )}
            >
              {c.t}
            </Pressable>
          );
        })}
      </div>

      <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 312px;gap:24px;margin-top:26px;align-items:start')}>
        <div style={S('display:flex;flex-direction:column;gap:14px')}>
          {interest && !q && kind === 'all' && place === 'all' && !causes.length ? (
            <DiscoverListings mode="match" interest={interest} causes={state.prefs.causes || []} near={matchNear} />
          ) : null}
          <DiscoverListings q={q} causes={causes} kind={kind} place={place} near={near} sort={sort} />
          <WebNonprofits q={q} near={webNear} causes={causes.length ? causes : (state.prefs.causes || [])} kind={kind} />
        </div>

        <div style={S('display:flex;flex-direction:column;gap:14px')}>
          <Pressable
            label="Find volunteers"
            onClick={() => router.push('/volunteers')}
            className={cx(H.card, H.press)}
            style={S('text-align:left;padding:18px;border-radius:14px;border:1px solid #E8E1D9;background:#fff;cursor:pointer;transition:border-color .16s ease')}
          >
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Directory</div>
            <div style={S('margin-top:9px;font:600 15px/1.3 Geist;letter-spacing:-0.02em')}>Looking for people, not projects?</div>
            <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#6B635C')}>Search every volunteer by cause and city. →</div>
          </Pressable>

          <div style={S('padding:18px;border-radius:14px;border:1px solid #EFE3DC;background:#FAF6F3')}>
            <div style={S('font:600 15px/1.3 Geist;letter-spacing:-0.02em')}>What verified means</div>
            <div style={S('margin-top:7px;font:450 13px/1.5 Geist;color:#6B635C')}>
              A green check means the organization is a registered institution we confirmed, with insurance and a named staff contact on file.
            </div>
            <Pressable
              label="How we verify organizations"
              onClick={verifyInfo}
              className={cx(H.secondary, H.press)}
              style={S('margin-top:14px;display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;color:#1A1714;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
            >
              How we verify
            </Pressable>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ m, onOpen, onClaim }) {
  const app = applicationFor(m.id);
  const applied = app && app.st !== 'Withdrawn' && app.st !== 'Declined';
  const openShift = m.shifts.find((x) => spotsLeft(x) > 0);
  const full = !openShift;

  return (
    <div className={cx('vu-media-row', H.card)} style={S('display:grid;grid-template-columns:180px 1fr;border-radius:14px;border:1px solid #E8E1D9;background:#fff;overflow:hidden;transition:border-color .16s ease')}>
      <Pressable className={cx('vu-media-thumb', H.press)} label={`${m.title} at ${m.org}`} onClick={onOpen} style={S('min-height:168px;cursor:pointer')}>
        <ImageSlot src={m.img} shape="rect" placeholder={m.ph} alt={m.ph} />
      </Pressable>
      <div style={S('padding:18px 20px')}>
        <div style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:14px')}>
          <Pressable label={`Open ${m.title}`} onClick={onOpen} style={S('cursor:pointer')}>
            <div style={S('font:600 17px/1.25 Geist;letter-spacing:-0.025em')}>{m.title}</div>
            <div style={S('margin-top:5px;font:450 13px/1.4 Geist;color:#8A8179')}>
              {m.org} · {m.meta}
            </div>
          </Pressable>
          <div style={S('flex:none;display:flex;align-items:center;gap:6px')}>
            {m.verified ? <div style={S(`padding:5px 9px;border-radius:7px;background:#EAF3EC;font:500 11px/1 ${MONO};color:#3F6B4E`)}>✓ VERIFIED</div> : null}
            <div style={S(`padding:5px 9px;border-radius:7px;background:#F5E7E0;font:500 12px/1 ${MONO};color:#A8482A`)}>{m.score}%</div>
          </div>
        </div>
        <div style={S('margin-top:12px;display:flex;flex-wrap:wrap;gap:6px')}>
          {m.tags.map((t) => (
            <div key={t} style={S('padding:5px 9px;border-radius:7px;background:#F6F2EE;font:500 11px/1 Geist;color:#57504A')}>
              {t}
            </div>
          ))}
        </div>
        <div style={S('margin-top:12px;font:450 13px/1.45 Geist;color:#6B635C')}>{m.why}</div>
        <div className="vu-stack vu-stack-gap" style={S('margin-top:14px;display:flex;align-items:center;justify-content:space-between;gap:10px')}>
          <div style={S(`font:500 12px/1 ${MONO};color:#A9A097`)}>
            {m.hrs} · {openShift ? spotsLabel(openShift).replace(' left', ' spots left') : 'no spots left'}
          </div>
          {applied ? (
            <div style={S('display:inline-flex;align-items:center;gap:8px;padding:9px 15px;border-radius:10px;border:1px solid #E4DDD4;background:#FCFAF8;color:#57504A;font:600 13px/1 Geist')}>
              {app.st === 'Accepted' ? '✓ Confirmed' : 'Applied'}
            </div>
          ) : (
            <Pressable
              label={full ? 'Join the waitlist' : `Claim a spot for ${m.title}`}
              onClick={onClaim}
              className={cx(H.primaryLift, H.press)}
              style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:9px 15px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer;transition:transform .16s ease, box-shadow .16s ease, background .16s ease')}
            >
              <span aria-hidden="true" style={S('font-size:10px;opacity:.9')}>▷</span>
              {full ? 'Join waitlist' : 'Claim spot'}
            </Pressable>
          )}
        </div>
      </div>
    </div>
  );
}
