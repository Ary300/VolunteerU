'use client';

/* ==========================================================================
   Discover.jsx, design screen: `isDiscover`
   Search opportunities posted on VolunteerU and nonprofits from IRS records
   in one place. Every filter lives in the URL, so a search can be shared and
   the back button works. ?ein= opens a nonprofit's detail.
   ========================================================================== */

import { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { Pressable, Chip, Select, Checkbox, PrimaryButton, SecondaryButton, Icon } from '../ui.jsx';
import DiscoverListings from '../DiscoverListings.jsx';
import WebNonprofits, { NonprofitDetail, stateName, formatCount } from '../WebNonprofits.jsx';
import { useSnapshot } from '../../lib/store.js';
import { openModal, closeModal } from '../../lib/overlays.js';
import { rememberSearch, clearSearches } from '../../lib/db.js';
import { searchListings } from '../../lib/listings.js';
import { CAUSES } from '../../lib/seed.js';

const MONO = "'Geist Mono',monospace";

const QUICK_CAUSES = ['Food & hunger', 'Education', 'Homelessness', 'Environment', 'Animals'];

const SORTS = [
  { v: 'recent', l: 'Newest' },
  { v: 'established', l: "Most events (lead's count)" },
];

const KINDS = [
  { k: 'all', t: 'All' },
  { k: 'student', t: 'Student projects' },
  { k: 'official', t: 'Nonprofits' },
];

const PLACES = [
  { k: 'all', t: 'Anywhere' },
  { k: 'person', t: 'In person' },
  { k: 'online', t: 'Online' },
];

function plural(n, one, many) {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

export default function Discover() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const q = params.get('q') || '';
  const causes = useMemo(() => (params.get('causes') || '').split('|').filter(Boolean), [params]);
  const sort = params.get('sort') === 'established' ? 'established' : 'recent';
  const savedOnly = params.get('saved') === '1';
  const place = ['person', 'online'].includes(params.get('place')) ? params.get('place') : 'all';
  const kind = ['student', 'official'].includes(params.get('kind')) ? params.get('kind') : 'all';
  const ein = (params.get('ein') || '').replace(/\D/g, '');

  const { state } = useSnapshot();
  // The volunteer's own area, from their saved location or city. With no ?near
  // at all we fall back to it synchronously, so there is no blank-then-jump.
  const homeRegion = ((state.prefs && state.prefs.location) || (state.account.city ? String(state.account.city).split(',')[0] : '')).trim();
  const nearParam = params.get('near');
  const near = nearParam !== null ? nearParam : homeRegion;
  // Nonprofit search needs a state. Fold in the saved ZIP so a city name no
  // lookup knows ("Rivertown") still resolves to one. An explicitly empty
  // Where field means anywhere, so the ZIP is left out then.
  const savedZip = state.onboarding?.zip || (state.account && state.account.zip) || '';
  const webNear = nearParam === '' ? '' : [near, near === homeRegion ? savedZip : ''].filter(Boolean).join(' ');

  const [draftQuery, setDraftQuery] = useState(q);
  // Where is typed into local state and written to the URL after a short
  // pause, so fast typing never races a router update. `committedNear` is the
  // last value this screen wrote; any other change to `near` came from outside
  // (back button, a shared link) and replaces the draft.
  const [draftNear, setDraftNear] = useState(near);
  const committedNear = useRef(near);
  const nearTimer = useRef(null);
  const [showSuggest, setShowSuggest] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [listingCount, setListingCount] = useState(null);
  const [nonprofitCount, setNonprofitCount] = useState(null);
  const searchWrap = useRef(null);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(max-width: 1179px)');
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => setDraftQuery(q), [q]);

  useEffect(() => {
    if (near === committedNear.current) return;
    committedNear.current = near;
    clearTimeout(nearTimer.current);
    nearTimer.current = null;
    setDraftNear(near);
  }, [near]);

  useEffect(() => () => clearTimeout(nearTimer.current), []);

  // Close the suggestion panel on an outside click.
  useEffect(() => {
    if (!showSuggest) return undefined;
    const onDown = (e) => {
      if (searchWrap.current && !searchWrap.current.contains(e.target)) setShowSuggest(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showSuggest]);

  const pushQuery = (next, opts = {}) => {
    const qs = next.toString();
    router[opts.replace ? 'replace' : 'push'](qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Every URL write carries whatever is typed in Where, so a search or filter
  // change never drops it, even before its pause has passed.
  const setParams = (patch, opts = {}) => {
    clearTimeout(nearTimer.current);
    nearTimer.current = null;
    const carryNear = !('near' in patch) && draftNear !== near;
    const full = carryNear ? { ...patch, near: draftNear } : patch;
    const keepEmpty = carryNear ? [...(opts.keepEmpty || []), 'near'] : opts.keepEmpty || [];
    const next = new URLSearchParams(params.toString());
    Object.entries(full).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false || (v === '' && !keepEmpty.includes(k))) next.delete(k);
      else next.set(k, String(v));
    });
    if ('near' in full) {
      const resolved = next.has('near') ? next.get('near') : homeRegion;
      committedNear.current = resolved;
      setDraftNear(resolved);
    }
    pushQuery(next, opts);
  };
  const latestSetParams = useRef(setParams);
  latestSetParams.current = setParams;

  function typeNear(v) {
    setDraftNear(v);
    clearTimeout(nearTimer.current);
    nearTimer.current = setTimeout(() => {
      nearTimer.current = null;
      latestSetParams.current({ near: v }, { replace: true, keepEmpty: ['near'] });
    }, 400);
  }

  // Carry the volunteer's saved causes (from onboarding) into the visible
  // filters the first time they land here. One-shot, so clearing sticks.
  const prefsSeeded = useRef(false);
  useEffect(() => {
    if (prefsSeeded.current) return;
    prefsSeeded.current = true;
    const untouched = !['q', 'causes', 'near', 'kind', 'place', 'sort', 'saved', 'ein'].some((k) => params.get(k) !== null);
    const pc = ((state.prefs && state.prefs.causes) || []).filter((c) => CAUSES.includes(c));
    if (untouched && pc.length) setParams({ causes: pc.join('|') }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- nonprofit detail, driven by ?ein= ---------------------------------- */
  const einModal = useRef(null); // { ein, id }
  useEffect(() => {
    const cur = einModal.current;
    if (cur && cur.ein !== ein) {
      einModal.current = null;
      closeModal(cur.id, 'route');
    }
    if (!ein || (einModal.current && einModal.current.ein === ein)) return;
    const api = openModal({
      title: 'Nonprofit',
      size: 'wide',
      Body: function NonprofitBody() {
        return <NonprofitDetail ein={ein} />;
      },
      onClose: () => {
        if (!einModal.current || einModal.current.ein !== ein) return; // closed by a route change
        einModal.current = null;
        const next = new URLSearchParams(window.location.search);
        next.delete('ein');
        pushQuery(next, { replace: true });
      },
    });
    einModal.current = { ein, id: api.id };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ein]);

  // Leaving Discover closes the dialog it opened.
  useEffect(() => () => {
    const cur = einModal.current;
    einModal.current = null;
    if (cur) closeModal(cur.id, 'unmount');
  }, []);

  const openNonprofit = (o) => setParams({ ein: o.ein });

  /* ---- search -------------------------------------------------------------- */
  const term = draftQuery.trim().toLowerCase();
  const causeSuggestions = showSuggest && term.length >= 2 ? CAUSES.filter((c) => c.toLowerCase().includes(term) && !causes.includes(c)).slice(0, 4) : [];
  // An empty field lists every recent search; typing narrows them to the ones that contain the text.
  const recent = (state.recentSearches || []).filter((r) => !term || r.toLowerCase().includes(term));
  const suggestOpen = showSuggest && (causeSuggestions.length > 0 || recent.length > 0);
  // One flat list for the keyboard: cause suggestions first, then recent searches.
  const options = suggestOpen ? [...causeSuggestions.map((v) => ({ kind: 'cause', v })), ...recent.map((v) => ({ kind: 'recent', v }))] : [];
  const active = activeIdx >= 0 && activeIdx < options.length ? activeIdx : -1;
  const optionId = (i) => `vu-suggest-opt-${i}`;

  useEffect(() => {
    if (!suggestOpen) setActiveIdx(-1);
  }, [suggestOpen]);

  function chooseOption(o) {
    if (o.kind === 'cause') addCause(o.v);
    else {
      setDraftQuery(o.v);
      runSearch(o.v);
    }
  }

  function onQueryKeyDown(e) {
    if (e.key === 'Escape') {
      // Close the list without the browser also wiping the field.
      e.preventDefault();
      setShowSuggest(false);
      e.currentTarget.blur();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!suggestOpen) {
        setShowSuggest(true);
        return;
      }
      const n = options.length;
      if (!n) return;
      if (e.key === 'ArrowDown') setActiveIdx(active < 0 || active >= n - 1 ? 0 : active + 1);
      else setActiveIdx(active <= 0 ? n - 1 : active - 1);
      return;
    }
    if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      chooseOption(options[active]);
    }
  }

  function runSearch(value) {
    const v = (value === undefined ? draftQuery : value).trim();
    setShowSuggest(false);
    rememberSearch(v);
    setParams({ q: v });
  }

  function addCause(c) {
    setShowSuggest(false);
    setDraftQuery('');
    setParams({ q: null, causes: [...causes, c].join('|') });
  }

  function toggleCause(c) {
    const nextC = causes.includes(c) ? causes.filter((x) => x !== c) : [...causes, c];
    setParams({ causes: nextC.join('|') });
  }

  function clearFilters() {
    clearTimeout(nearTimer.current);
    nearTimer.current = null;
    committedNear.current = '';
    setDraftNear('');
    const next = new URLSearchParams();
    next.set('near', '');
    pushQuery(next);
  }

  const nFilters = causes.length + (savedOnly ? 1 : 0) + (sort !== 'recent' ? 1 : 0);

  function openFilters() {
    openModal({
      title: 'Filter opportunities',
      subtitle: 'Causes also narrow the nonprofit search.',
      size: 'wide',
      Body: function FilterBody({ api }) {
        const [local, setLocal] = useState({ causes: causes.slice(), sort, savedOnly });
        const [preview, setPreview] = useState({ n: null, failed: false });
        const localKey = `${local.causes.join('|')}#${local.sort}#${local.savedOnly}`;
        useEffect(() => {
          let alive = true;
          setPreview({ n: null, failed: false });
          // Saved-only can't be counted from one page of results, so it gets no number.
          if (local.savedOnly) return undefined;
          const t = setTimeout(async () => {
            try {
              const rows = await searchListings({ q, causes: local.causes, kind, place, near, sort: local.sort });
              const n = rows.total ?? rows.length;
              if (alive) setPreview({ n, failed: false });
            } catch (err) {
              console.error('[discover] filter preview failed', err);
              if (alive) setPreview({ n: null, failed: true });
            }
          }, 200);
          return () => {
            alive = false;
            clearTimeout(t);
          };
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [localKey]);
        const toggle = (c) => setLocal((f) => ({ ...f, causes: f.causes.includes(c) ? f.causes.filter((x) => x !== c) : [...f.causes, c] }));
        const label = local.savedOnly ? 'Show saved opportunities' : preview.n === null ? 'Show opportunities' : preview.n === 0 ? 'Show 0 opportunities' : `Show ${plural(preview.n, 'opportunity', 'opportunities')}`;
        return (
          <div>
            <div style={S('font:600 14px/1.2 Geist;color:#1A1714')}>Causes</div>
            <div role="group" aria-label="Causes" style={S('margin-top:12px;display:flex;flex-wrap:wrap;gap:8px')}>
              {CAUSES.map((c) => (
                <Chip key={c} label={c} role="checkbox" on={local.causes.includes(c)} py={9} px={13} fs={13} onClick={() => toggle(c)} />
              ))}
            </div>
            <div style={S('margin-top:22px')}>
              <Select label="Sort by" value={local.sort} options={SORTS} onChange={(v) => setLocal((f) => ({ ...f, sort: v }))} />
            </div>
            <div style={S('margin-top:18px')}>
              <Checkbox checked={local.savedOnly} size={16} label="Only show opportunities I saved" onChange={(v) => setLocal((f) => ({ ...f, savedOnly: v }))} />
            </div>
            <div style={S('margin-top:22px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
              <div aria-live="polite" style={S('font:450 13px/1.4 Geist;color:#8A8179')}>
                {local.savedOnly ? '' : preview.failed ? "Couldn't count matches right now." : preview.n === null ? 'Counting matches' : `${plural(preview.n, 'opportunity matches', 'opportunities match')}`}
              </div>
              <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>
                <SecondaryButton h={40} px={16} r={11} fs={14} onClick={() => setLocal({ causes: [], sort: 'recent', savedOnly: false })}>
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
                      sort: local.sort === 'recent' ? null : local.sort,
                      saved: local.savedOnly ? '1' : null,
                    });
                    api.close();
                  }}
                >
                  {label}
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
      title: 'How verification works',
      body: (
        <div style={S('display:flex;flex-direction:column;gap:14px')}>
          {[
            ['An organization asks for it', 'It sends a request from its project page with the name of a staff contact.'],
            ['A person reviews it', 'Someone at VolunteerU checks the request by hand.'],
            ["What it doesn't cover", "Verification isn't a background check. Read each listing's details before you apply."],
            ['Nonprofits from IRS records', "They're registered with the IRS. VolunteerU hasn't reviewed them."],
          ].map(([t, b]) => (
            <div key={t}>
              <div style={S('font:600 14px/1.3 Geist')}>{t}</div>
              <div style={S('margin-top:5px;font:450 13px/1.55 Geist;color:#6B635C')}>{b}</div>
            </div>
          ))}
        </div>
      ),
    });
  }

  // On narrow screens the fields stack, so the list sits in the flow under
  // What instead of covering Where and the Search button.
  const suggestBox = suggestOpen ? (
    <div
      id="vu-suggest"
      role="listbox"
      aria-label="Suggestions"
      onMouseDown={(e) => e.preventDefault()}
      style={s(
        narrow ? 'position:relative' : 'position:absolute;left:0;right:0;top:56px;z-index:70;max-width:640px',
        'border-radius:12px;border:1px solid #E8E1D9;background:#fff;box-shadow:0 18px 40px -22px rgba(60,40,25,.35), 0 1px 2px rgba(30,20,10,.06);overflow:hidden'
      )}
    >
      {causeSuggestions.length ? (
        <>
          <div style={S('padding:12px 14px 6px;font:600 12px/1 Geist;color:#8A8179')}>Causes</div>
          {causeSuggestions.map((c, i) => (
            <Pressable
              key={c}
              id={optionId(i)}
              role="option"
              tabIndex={-1}
              aria-selected={active === i ? 'true' : 'false'}
              label={`Filter by ${c}`}
              onClick={() => addCause(c)}
              onMouseEnter={() => setActiveIdx(i)}
              className={cx(H.row, H.press)}
              style={s('padding:10px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:background .16s ease', active === i ? 'background:#F6F2EE' : '')}
            >
              <Icon name="filter" size={13} color="#C2603C" />
              <span style={S('font:500 13px/1.3 Geist;color:#1A1714')}>{c}</span>
            </Pressable>
          ))}
        </>
      ) : null}
      {recent.length ? (
        <>
          <div style={s('padding:12px 14px 6px;display:flex;align-items:center;justify-content:space-between', causeSuggestions.length ? 'border-top:1px solid #F1EBE4' : '')}>
            <div style={S('font:600 12px/1 Geist;color:#8A8179')}>Recent searches</div>
            <Pressable label="Clear recent searches" onClick={() => clearSearches()} className={H.link} style={S('font:500 12px/1 Geist;color:#C2603C;cursor:pointer')}>
              Clear
            </Pressable>
          </div>
          {recent.map((r, j) => {
            const i = causeSuggestions.length + j;
            return (
            <Pressable
              key={r}
              id={optionId(i)}
              role="option"
              tabIndex={-1}
              aria-selected={active === i ? 'true' : 'false'}
              label={`Search ${r}`}
              onClick={() => chooseOption({ kind: 'recent', v: r })}
              onMouseEnter={() => setActiveIdx(i)}
              className={cx(H.row, H.press)}
              style={s('padding:10px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:background .16s ease', active === i ? 'background:#F6F2EE' : '')}
            >
              <Icon name="clock" size={13} color="#A9A097" />
              <span style={S('font:450 13px/1.3 Geist;color:#332D28')}>{r}</span>
            </Pressable>
            );
          })}
        </>
      ) : null}
    </div>
  ) : null;

  const showNonprofits = kind !== 'student' && !savedOnly;
  const nonprofitWhere = nonprofitCount && nonprofitCount.state ? ` in ${stateName(nonprofitCount.state)}` : '';

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px')}>
      <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:center;justify-content:space-between;gap:24px')}>
        <h1 style={S('margin:0;font:600 30px/1.1 Geist;letter-spacing:-0.035em')}>Discover</h1>
        <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>
          <Pressable
            label={`Filters${nFilters ? `, ${nFilters} active` : ''}`}
            onClick={openFilters}
            className={cx(H.secondaryLift, H.press)}
            style={s(
              'display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 16px;height:40px;border-radius:11px',
              `border:1px solid ${nFilters ? '#D8CEC3' : '#E4DDD4'}`,
              'background:#fff;font:600 14px/1 Geist;color:#1A1714;cursor:pointer;transition:background .16s ease, border-color .16s ease, transform .16s ease'
            )}
          >
            <Icon name="filter" size={15} />
            Filters
            {nFilters ? (
              <span style={S(`min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#F5E7E0;color:#A8482A;font:600 10px/18px ${MONO};text-align:center`)}>{nFilters}</span>
            ) : null}
          </Pressable>
          <Pressable
            label="Start a student project"
            onClick={() => router.push('/create')}
            className={cx(H.primaryLift, H.press)}
            style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 14px/1 Geist;cursor:pointer;transition:transform .16s ease, background .16s ease')}
          >
            <Icon name="plus" size={15} />
            Start a student project
          </Pressable>
        </div>
      </div>

      <div style={S('margin-top:18px;display:flex;gap:6px;flex-wrap:wrap')}>
        <span aria-current="page" style={s('padding:8px 14px;border-radius:9px;font:600 13px/1 Geist', 'border:1px solid #C2603C;background:#FAF6F3;color:#A8482A')}>Find opportunities</span>
        <Pressable label="Find volunteers" onClick={() => router.push('/volunteers')} className={cx(H.press)} style={s('padding:8px 14px;border-radius:9px;cursor:pointer;font:600 13px/1 Geist', 'border:1px solid #E8E1D9;background:#fff;color:#57504A')}>Find volunteers</Pressable>
      </div>

      <form
        ref={searchWrap}
        role="search"
        aria-label="Search opportunities and nonprofits"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        style={S('position:relative;margin-top:22px')}
      >
        <div className="vu-stack vu-stack-gap" style={S('display:flex;gap:10px;align-items:stretch')}>
          <label
            className={H.input}
            style={s(
              // min-height keeps the field 50px tall when phones stack the row
              // into a column, where flex:1.4 would set its height basis to 0.
              'flex:1.4;min-width:0;display:flex;align-items:center;gap:10px;padding:0 14px 0 16px;height:50px;min-height:50px;border-radius:12px;cursor:text',
              `border:1px solid ${showSuggest ? '#D8CEC3' : '#E8E1D9'}`,
              'background:#fff;transition:border-color .16s ease'
            )}
          >
            <span style={S('flex:none;font:600 12px/1 Geist;color:#57504A')}>What</span>
            <Icon name="search" size={15} color="#A9A097" />
            <input
              id="vu-discover-search"
              type="search"
              role="combobox"
              aria-expanded={suggestOpen}
              aria-controls={suggestOpen ? 'vu-suggest' : undefined}
              aria-activedescendant={active >= 0 ? optionId(active) : undefined}
              aria-autocomplete="list"
              aria-label="What: cause, organization or nonprofit name"
              autoComplete="off"
              enterKeyHint="search"
              value={draftQuery}
              placeholder="Food bank, tutoring, animal shelter"
              onChange={(e) => {
                setDraftQuery(e.target.value);
                setShowSuggest(true);
                setActiveIdx(-1);
              }}
              onFocus={() => setShowSuggest(true)}
              onClick={() => setShowSuggest(true)}
              onBlur={(e) => {
                // Moving within the search form (to the Search button, say) keeps
                // the list put, so the layout doesn't jump under the pointer.
                const to = e.relatedTarget;
                if (!to || !(searchWrap.current && searchWrap.current.contains(to))) setShowSuggest(false);
              }}
              onKeyDown={onQueryKeyDown}
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
                style={S('flex:none;width:28px;height:28px;border-radius:8px;display:grid;place-items:center;color:#8A8179;cursor:pointer;transition:background .16s ease')}
              >
                <Icon name="x" size={13} />
              </button>
            ) : null}
          </label>
          {narrow ? suggestBox : null}

          <label
            className={H.input}
            style={S('flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:0 14px 0 16px;height:50px;min-height:50px;border-radius:12px;border:1px solid #E8E1D9;background:#fff;cursor:text;transition:border-color .16s ease')}
          >
            <span style={S('flex:none;font:600 12px/1 Geist;color:#57504A')}>Where</span>
            <Icon name="pin" size={15} color="#A9A097" />
            <input
              type="text"
              aria-label="Where: city or ZIP. Leave empty to search anywhere."
              autoComplete="off"
              value={draftNear}
              placeholder="City or ZIP, or anywhere"
              onChange={(e) => typeNear(e.target.value)}
              onFocus={() => setShowSuggest(false)}
              style={S('flex:1;min-width:0;font:450 15px/1 Geist;color:#1A1714;background:none;border:none;padding:0')}
            />
            {homeRegion && draftNear !== homeRegion ? (
              <button
                type="button"
                className={cx(H.link, H.press)}
                onClick={() => setParams({ near: null }, { replace: true })}
                style={S('flex:none;font:500 12px/1 Geist;color:#C2603C;cursor:pointer;white-space:nowrap;background:none;border:0;padding:4px')}
              >
                Use {homeRegion}
              </button>
            ) : null}
          </label>

          <button
            type="submit"
            className={cx(H.primary, H.press)}
            style={S('flex:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 20px;height:50px;border-radius:12px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 15px/1 Geist;cursor:pointer')}
          >
            <Icon name="search" size={15} />
            Search
          </button>
        </div>

        {!narrow ? suggestBox : null}
      </form>

      <div className="vu-stack vu-stack-gap" style={S('margin-top:16px;display:flex;gap:18px;flex-wrap:wrap;align-items:center')}>
        <div role="radiogroup" aria-label="Who posted it" style={S('display:flex;gap:6px;flex-wrap:wrap')}>
          {KINDS.map((o) => {
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
        <div role="radiogroup" aria-label="Where it happens" style={S('display:flex;gap:6px;flex-wrap:wrap')}>
          {PLACES.map((o) => {
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
      </div>

      <div role="group" aria-label="Causes" style={S('margin-top:12px;display:flex;flex-wrap:wrap;gap:8px')}>
        {[{ k: 'all', t: 'All causes' }, ...Array.from(new Set([...QUICK_CAUSES, ...causes])).map((c) => ({ k: c, t: c }))].map((c) => {
          const on = c.k === 'all' ? !causes.length : causes.includes(c.k);
          return (
            <Pressable
              key={c.k}
              label={c.t}
              pressed={on}
              onClick={() => (c.k === 'all' ? setParams({ causes: null }) : toggleCause(c.k))}
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

      {listingCount !== null || (showNonprofits && nonprofitCount) ? (
        <div aria-live="polite" style={S('margin-top:20px;display:flex;align-items:baseline;gap:6px 12px;flex-wrap:wrap;font:450 14px/1.4 Geist;color:#57504A')}>
          <span>
            {listingCount !== null ? plural(listingCount, 'opportunity', 'opportunities') + ' on VolunteerU' : ''}
            {listingCount !== null && showNonprofits && nonprofitCount ? ', ' : ''}
            {showNonprofits && nonprofitCount ? `${plural(nonprofitCount.total, 'nonprofit', 'nonprofits')}${nonprofitWhere}` : ''}
          </span>
          {showNonprofits && nonprofitCount && nonprofitCount.total ? (
            <a href="#nonprofits" className={H.link} style={S('font:500 13px/1 Geist;color:#C2603C;text-decoration:none')}>
              Jump to nonprofits
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 312px;gap:24px;margin-top:18px;align-items:start')}>
        <div style={S('display:flex;flex-direction:column;gap:14px')}>
          <DiscoverListings
            q={q}
            causes={causes}
            kind={kind}
            place={place}
            near={near}
            sort={sort}
            savedOnly={savedOnly}
            onClearFilters={clearFilters}
            onCount={setListingCount}
          />
          <WebNonprofits
            id="nonprofits"
            q={q}
            near={webNear}
            causes={causes}
            kind={showNonprofits ? kind : 'student'}
            onOpen={openNonprofit}
            onClear={() => runSearch('')}
            onCount={setNonprofitCount}
          />
        </div>

        <div style={S('display:flex;flex-direction:column;gap:14px')}>
          <Pressable
            label="Find volunteers"
            onClick={() => router.push('/volunteers')}
            className={cx(H.card, H.press)}
            style={S('text-align:left;padding:18px;border-radius:14px;border:1px solid #E8E1D9;background:#fff;cursor:pointer;transition:border-color .16s ease')}
          >
            <div style={S('font:600 15px/1.3 Geist;letter-spacing:-0.02em')}>Looking for people to help with your project?</div>
            <div style={S('margin-top:6px;display:flex;align-items:center;gap:6px;font:450 13px/1.5 Geist;color:#6B635C')}>
              Search volunteers by cause and city
              <Icon name="arrow-right" size={13} />
            </div>
          </Pressable>

          <div style={S('padding:18px;border-radius:14px;border:1px solid #EFE3DC;background:#FAF6F3')}>
            <div style={S('font:600 15px/1.3 Geist;letter-spacing:-0.02em')}>What verified means</div>
            <div style={S('margin-top:7px;font:450 13px/1.5 Geist;color:#6B635C')}>
              A green check means a VolunteerU reviewer checked the organization by hand. Student projects don&apos;t carry one.
            </div>
            <Pressable
              label="How verification works"
              onClick={verifyInfo}
              className={cx(H.secondary, H.press)}
              style={S('margin-top:14px;display:inline-flex;align-items:center;white-space:nowrap;flex:none;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E7C0AC;background:#fff;font:600 14px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
            >
              How verification works
            </Pressable>
          </div>
        </div>
      </div>
    </div>
  );
}
