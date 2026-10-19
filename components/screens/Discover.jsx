'use client';

/* ==========================================================================
   Discover.jsx, design screen: `isDiscover`
   Search opportunities posted on VolunteerU and nonprofits from IRS records
   in one place. Every filter lives in the URL, so a search can be shared and
   the back button works. A nonprofit opens its own page (/nonprofits/<ein>; an old ?ein= link moves there), ?view=nonprofits
   switches to the nonprofit list.

   Layout (photo-first system): the What / Where / When pill, the category
   row, Opportunities N / Nonprofits N, filter chips with the sort at their
   end, then the results. From 1320px the results share the row with a
   sticky map (components/MapPanel.jsx, Leaflet): day/time pins at the
   listings' real addresses and a popup for the picked one, with an Expand
   button for a full-screen map. Below that the full-screen map opens from a
   floating Map button, which sits above the tab bar on phones. On phones the pill collapses to the query with a filter
   button.
   ========================================================================== */

import { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { S, s } from '../../lib/style.js';
import { C, F, R, SH, CATEGORIES, causeOf, causeKey } from '../../lib/tokens.js';
import { Chip, Select, Checkbox, Button, Icon, Segmented, useHeldValue } from '../ui.jsx';
import CategoryRow from '../vu/CategoryRow.jsx';
import { WHEN_OPTIONS } from '../vu/SearchBar.jsx';
import DiscoverListings from '../DiscoverListings.jsx';
import { DiscoverMap } from '../MapPanel.jsx';
import WebNonprofits, { stateName, formatCount, cityOf } from '../WebNonprofits.jsx';
import { useSnapshot } from '../../lib/store.js';
import { openModal } from '../../lib/overlays.js';
import { rememberSearch, clearSearches, setPref } from '../../lib/db.js';
import { searchListings, searchListingsPage, parseState, townFromZip, nearTerm } from '../../lib/listings.js';
import { useLocation, usePlace, areaOf, pointOf, LOCATE_ERRORS } from '../../lib/location.js';
import NearYou from '../NearYou.jsx';
import { CAUSES, WINDOWS } from '../../lib/seed.js';

const SORTS = [
  { v: 'recent', l: 'Newest' },
  { v: 'established', l: 'Most events' },
];
/* With the visitor's own location known, Nearest leads and is the default. */
const SORTS_NEAR = [{ v: 'nearest', l: 'Nearest' }, ...SORTS];

/* Layout that must be right in the first paint, before any script runs: the
   map column from 1320px (the list beside it drops to two cards a row) and
   the floating Map button below that. Done in CSS so the server's HTML
   already has it and nothing moves when the page wakes up. */
const DISCOVER_CSS = `
.dz-side { display:none; }
.dz-near { margin-top:14px; }
@media (min-width: 1320px) {
  .dz-split { display:grid; grid-template-columns:minmax(0, 1fr) 480px; gap:28px; align-items:start; }
  .dz-side { display:block; position:sticky; top:24px; height:min(820px, calc(100vh - 112px)); min-height:520px; }
  .dz-side-wait { height:100%; border-radius:${R.photo}; background:${C.mist}; }
  .dz-split .dz-skel.vu-grid-3 { grid-template-columns:repeat(2, minmax(0, 1fr)); }
  .dz-split .dz-skel-match.vu-grid-3 > :nth-child(3) { display:none; }
  .dz-mappill { display:none !important; }
}
@media (max-width: 719px) { .dz-near { margin-top:10px; } }
`;

const KINDS = [
  { k: 'all', t: 'Everyone' },
  { k: 'official', t: 'Organizations' },
  { k: 'student', t: 'Student projects' },
];

const WHENS = WHEN_OPTIONS.map((o) => o.v).filter(Boolean);
const WHEN_PHRASE = { today: 'today', week: 'this week', weekend: 'this weekend', month: 'this month' };
// Free-time windows from onboarding and Settings, as the results line says them.
const FREE_PHRASE = {
  'Weekday after school': 'weekdays after school',
  'Weekday evenings': 'weekday evenings',
  'Saturday morning': 'Saturday mornings',
  'Saturday afternoon': 'Saturday afternoons',
  Sunday: 'Sundays',
  'School breaks': 'weekday daytimes',
};

/* Set for the rest of the visit once someone clears their causes, so the
   sidebar Discover link and other plain /discover links stop adding them back. */
const CLEARED_KEY = 'vu.discoverCleared';
function causesCleared() {
  try { return window.sessionStorage.getItem(CLEARED_KEY) === '1'; } catch { return false; }
}
function markCausesCleared() {
  try { window.sessionStorage.setItem(CLEARED_KEY, '1'); } catch { /* private mode: clearing lasts for this page only */ }
}

function plural(n, one, many) {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

function useMedia(query) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);
  return on;
}

/* How a cause reads in a sentence. Most labels work as a modifier ("food and
   hunger opportunities"); plural nouns do not ("animals opportunities"), so
   they get an adjective form or a trailing phrase instead. */
const WHERE_TEXT_MIN = 760;

/* With "Near you" picked and no location of their own, a visitor sees
   Indianapolis nonprofits, as on Landing, the region VolunteerU serves. */
const DEFAULT_AREA = { city: 'Indianapolis', state: 'IN' };
/* Towns offered as one-tap Where values on the Nonprofits tab around Indianapolis. */
const NEARBY_TOWNS = ['Indianapolis', 'Carmel', 'Fishers', 'Noblesville', 'Westfield', 'Zionsville', 'Greenwood', 'Lawrence', 'Speedway', 'Beech Grove', 'Avon', 'Plainfield', 'Brownsburg'];

/** The What hint, shortened as the bar narrows so it is never cut off. */
function whatPlaceholder(barW) {
  if (!barW || barW >= 900) return 'Food bank, tutoring, animal shelter';
  return barW >= 640 ? 'Food bank, tutoring' : 'Food bank';
}

const CAUSE_WORDING = {
  animals: { pre: 'animal', np: 'Animal nonprofits' },
  seniors: { post: 'with seniors', np: 'Nonprofits serving seniors' },
};

function causeWording(cause) {
  const key = causeKey(cause);
  const label = key === 'other' ? String(cause || '').trim() : causeOf(cause).label;
  const w = CAUSE_WORDING[key] || {};
  return {
    pre: w.post ? '' : w.pre || label.toLowerCase(),
    post: w.post || '',
    np: w.np || `${label.charAt(0).toUpperCase()}${label.slice(1)} nonprofits`,
  };
}

/** "6 food and hunger opportunities near Cedarbrook this weekend". Every part comes from the filters. */
function resultsLine({ count, causes, kind, place, near, when, windows = [], q, savedOnly }) {
  if (count === null || count === undefined) return '';
  const cause = causes.length === 1 ? causeWording(causes[0]) : { pre: '', post: '' };
  const noun = kind === 'student' ? (count === 1 ? 'student project' : 'student projects') : count === 1 ? 'opportunity' : 'opportunities';
  const parts = [`${formatCount(count)}${savedOnly ? ' saved' : ''}${cause.pre ? ` ${cause.pre}` : ''} ${noun}`];
  if (cause.post) parts.push(cause.post);
  if (kind === 'official') parts.push('from organizations');
  if (place === 'online') parts.push('online');
  if (place === 'person') parts.push('in person');
  if (q) parts.push(`for “${q}”`);
  if (near) parts.push(`near ${near}`);
  if (when && WHEN_PHRASE[when]) parts.push(WHEN_PHRASE[when]);
  if (windows.length) parts.push(`on ${windows.map((w) => FREE_PHRASE[w] || w).join(' or ')}`);
  return parts.join(' ');
}

export default function Discover() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const q = params.get('q') || '';
  const causes = useMemo(() => (params.get('causes') || '').split('|').filter(Boolean), [params]);
  // When the volunteer is free (the onboarding answer), as ?windows=Saturday morning|Sunday.
  const windows = useMemo(() => (params.get('windows') || '').split('|').filter((w) => WINDOWS.includes(w)), [params]);
  const sortParam = params.get('sort');
  const savedOnly = params.get('saved') === '1';
  const place = ['person', 'online'].includes(params.get('place')) ? params.get('place') : 'all';
  const kind = ['student', 'official'].includes(params.get('kind')) ? params.get('kind') : 'all';
  const when = WHENS.includes(params.get('when')) ? params.get('when') : '';
  const view = params.get('view') === 'nonprofits' ? 'np' : 'opp';
  const ein = (params.get('ein') || '').replace(/\D/g, '');

  const { state } = useSnapshot();
  // The volunteer's own area, from their saved location or city. With no ?near
  // at all we fall back to it synchronously, so there is no blank-then-jump.
  // Nonprofit search needs a state. Fold in the saved ZIP so a city name no
  // lookup knows ("Rivertown") still resolves to one. A lead who came in
  // through Start a project only gave a ZIP, so a known ZIP names the town
  // the default lists use.
  const savedZip = state.onboarding?.zip || (state.account && state.account.zip) || '';
  const zipHome = townFromZip(savedZip);
  // Where the visitor said they are on this browser (lib/location.js): from
  // "Use my location" or a ZIP or town they typed. A signed-in volunteer's
  // saved area comes first; picking a location here also saves it there.
  const loc = useLocation();
  const locSet = loc && loc.status === 'set' ? loc : null;
  const savedRegion = ((state.prefs && state.prefs.location) || (state.account && state.account.city ? String(state.account.city).split(',')[0] : '')).trim();
  const homeRegion = savedRegion || areaOf(locSet);
  const nearParam = params.get('near');
  // Online listings are open to anyone wherever they're based, so a bare
  // ?place=online (Home's Online link, the Online category) searches anywhere.
  // A Where typed alongside it still narrows them to that town.
  const near = nearParam !== null ? nearParam : place === 'online' ? '' : homeRegion;
  // With Near you on, no area of their own and nothing typed or picked,
  // opportunities are Indianapolis's, the same town the nonprofit preview and the
  // map show. A search word or a cause searches everywhere, as nonprofits do.
  // A cause keeps the area (as on the landing page); saved-only shows every
  // saved listing wherever it is unless a Where is set.
  const listNear = near || (nearParam === null && place !== 'online' && !q && !savedOnly ? zipHome || DEFAULT_AREA.city : '');
  // Distances are measured from the visitor's own point, and only while the
  // list is searching their own town (a typed Where elsewhere has no "you").
  const locArea = areaOf(locSet);
  const ownOrigin = locSet && pointOf(locSet) && listNear && nearTerm(listNear).toLowerCase() === nearTerm(locArea).toLowerCase() ? pointOf(locSet) : null;
  // A ZIP or town typed in Where (or a ?near link) is looked up too, so its
  // cards show miles from there, the same as one set in the Near you line.
  // Its own area is left to the visitor's point above.
  const typedNear = nearParam && !ownOrigin && (/^\s*\d{5}\s*$/.test(nearParam) || cityOf(nearParam)) ? nearParam.trim() : '';
  const typedPlace = usePlace(typedNear);
  const origin = ownOrigin || pointOf(typedPlace.rec);
  const sorts = origin ? SORTS_NEAR : SORTS;
  const defaultSort = origin ? 'nearest' : 'recent';
  const sort = sorts.some((o) => o.v === sortParam) ? sortParam : defaultSort;
  // The blue "you are here" dot is for a location from the browser only.
  const here = ownOrigin && locSet.source === 'gps' ? ownOrigin : null;
  // A bare ZIP we know searches its town, so both lists cover the same place.
  // A ZIP outside the built-in list uses the town its lookup found.
  const zipRec = typedPlace.rec && typedPlace.rec.town ? typedPlace.rec : null;
  const zipTown = /^\s*\d{5}\s*$/.test(near) ? townFromZip(near) || (zipRec ? zipRec.town : '') : '';
  const zipState = zipTown && !townFromZip(near) && zipRec ? zipRec.state || 'IN' : 'IN';
  // An explicitly empty Where field means anywhere, so the ZIP is left out then.
  const webNear = nearParam === '' ? '' : zipTown ? `${zipTown}, ${zipState}` : !near && zipHome ? `${zipHome}, IN` : [near, near === homeRegion ? savedZip : ''].filter(Boolean).join(' ');

  const [draftQuery, setDraftQuery] = useState(q);
  // Where is typed into local state and written to the URL after a short
  // pause, so fast typing never races a router update. `committedNear` is the
  // last value this screen wrote; any other change to `near` came from outside
  // (back button, a shared link) and replaces the draft.
  const [draftNear, setDraftNear] = useState(near);
  const committedNear = useRef(near);
  const nearTimer = useRef(null);
  // True while the visitor has typed in Where and it isn't in the URL yet.
  const whereDirty = useRef(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [listingCount, setListingCount] = useState(null);
  const [matchCount, setMatchCount] = useState(null);
  const [nonprofitCount, setNonprofitCount] = useState(null);
  // Cards shown in "Based on your causes and interests"; the main list
  // leaves them out so no listing shows twice. Its count still includes them.
  const [pickIds, setPickIds] = useState([]);
  // Those cards' rows and photos, so the map pins them as well.
  const [picks, setPicks] = useState({ list: [], photos: null });
  // What the map draws: the main list's rows and photos, and the nonprofits
  // listed under them. Hovering a card turns its pin ink; picking a pin
  // underlines its cards.
  const [rows, setRows] = useState({ list: [], photos: null });
  const [orgs, setOrgs] = useState([]);
  const [hoverId, setHoverId] = useState(null);
  const [pickedId, setPickedId] = useState(null);
  // Set once the visitor changes the URL themselves; saved causes are never
  // carried in after that (see the seeding effect below). `seeding` marks
  // the seeding's own URL write.
  const userTouched = useRef(false);
  const seeding = useRef(false);
  // A seeding write can be dropped when the sign-in redirect lands at the
  // same moment, so the seeding looks again shortly after (a few times).
  const [seedCheck, setSeedCheck] = useState(0);
  const seedTimer = useRef(null);
  const [moreOpen, setMoreOpen] = useState(false); // phones: Where / When / Search under the pill
  const searchWrap = useRef(null);
  const sumRef = useRef(null);
  const formRef = useRef(null);
  // The search bar's width. Below WHERE_TEXT_MIN the "Use Rivertown" link
  // turns into an icon so the Where field keeps room for its placeholder.
  const [barW, setBarW] = useState(0);
  const phone = useMedia('(max-width: 719px)');
  const wide = useMedia('(min-width: 1180px)');
  // The map gets its own column from 1320px, where the list beside it still
  // has room for two cards a row. Narrower screens open it from a button.
  const mapSide = useMedia('(min-width: 1320px)');
  // Tablets: the Filters button beside the bar drops its word so the bar's
  // fields keep room for their placeholders.
  const tablet = useMedia('(min-width: 720px) and (max-width: 899px)');

  useEffect(() => setDraftQuery(q), [q]);

  // The Nonprofits view doesn't mount the opportunity list, so its tab count
  // comes from one count-only query. Saved-only, When and free time can't be
  // counted that way, so those keep the last count the list reported.
  const causeParam = causes.join('|');
  useEffect(() => {
    if (view !== 'np' || savedOnly || when || windows.length) return undefined;
    let alive = true;
    searchListingsPage({ q, causes, kind, place, near: listNear, origin, limit: 1 })
      .then((res) => { if (alive && res && Number.isFinite(res.total)) setListingCount(res.total); })
      .catch(() => { /* the tab shows no number when the count can't load */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, q, causeParam, kind, place, listNear, savedOnly, when, windows.length]);

  useEffect(() => {
    const el = formRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setBarW(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    // Any URL write other than the seeding is the visitor's own choice, so
    // saved causes never override it afterwards.
    if (!seeding.current) userTouched.current = true;
    const qs = next.toString();
    router[opts.replace ? 'replace' : 'push'](qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Every URL write carries whatever is typed in Where, so a search or filter
  // change never drops it, even before its pause has passed.
  const setParams = (patch, opts = {}) => {
    clearTimeout(nearTimer.current);
    nearTimer.current = null;
    // Only a Where the visitor typed is carried. An empty draft never
    // replaces the default or home area.
    const carryNear = whereDirty.current && !('near' in patch) && draftNear !== near;
    whereDirty.current = false;
    const full = carryNear ? { ...patch, near: draftNear } : patch;
    const keepEmpty = carryNear ? [...(opts.keepEmpty || []), 'near'] : opts.keepEmpty || [];
    // Merge into the address bar's query, which is ahead of `params` while a
    // navigation is still rendering, so a quick second change (Clear search
    // right after Search) never brings back a value the first one replaced.
    const next = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : params.toString());
    Object.entries(full).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false || (v === '' && !keepEmpty.includes(k))) next.delete(k);
      else next.set(k, String(v));
    });
    if (!seeding.current && 'causes' in full && !next.get('causes')) markCausesCleared();
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
    whereDirty.current = true;
    setDraftNear(v);
    clearTimeout(nearTimer.current);
    nearTimer.current = setTimeout(() => {
      nearTimer.current = null;
      latestSetParams.current({ near: v }, { replace: true, keepEmpty: ['near'] });
    }, 400);
  }

  // Carry the volunteer's saved causes (from onboarding) into the visible
  // filters when they land here with no filters in the URL. Free time is
  // never carried in: one window no listing matches would empty the list on
  // every visit. Once causes are cleared they stay cleared for the visit. The
  // saved workspace can arrive after this screen mounts (a cold sign-in loads
  // it from the cloud, and the sign-in redirect can land after that), so this
  // runs whenever the saved values or the URL change, until the visitor picks
  // or clears a filter themselves. That keeps clearing sticky.
  const prefCauses = ((state.prefs && state.prefs.causes) || []).filter((c) => CAUSES.includes(c));
  const prefsKey = prefCauses.join('|');
  const paramsKey = params.toString();
  useEffect(() => {
    if (userTouched.current || causesCleared()) return;
    if (!prefCauses.length) return; // nothing saved yet; wait for the workspace
    const live = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : paramsKey);
    const untouched = !['q', 'causes', 'windows', 'near', 'kind', 'place', 'sort', 'saved', 'ein', 'when', 'view'].some((k) => live.get(k) !== null);
    if (!untouched) return;
    seeding.current = true;
    try {
      // near: null keeps the default (the volunteer's own area) rather than
      // carrying a Where draft that hasn't caught up with the workspace yet.
      setParams({ causes: prefCauses.join('|'), near: null }, { replace: true });
    } finally {
      seeding.current = false;
    }
    clearTimeout(seedTimer.current);
    if (seedCheck < 5) seedTimer.current = setTimeout(() => setSeedCheck((n) => n + 1), 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsKey, paramsKey, seedCheck]);
  useEffect(() => () => clearTimeout(seedTimer.current), []);

  /* ---- nonprofits open their own page --------------------------------------
     An older ?ein= link (from before /nonprofits/<ein> existed) moves to the
     nonprofit's page, keeping Discover's other filters in history. */
  useEffect(() => {
    if (!ein) return;
    router.replace(`/nonprofits/${ein}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ein]);

  const openNonprofit = (o) => {
    if (o && o.ein) router.push(`/nonprofits/${encodeURIComponent(String(o.ein))}`);
  };

  /* ---- search -------------------------------------------------------------- */
  const term = draftQuery.trim().toLowerCase();
  const causeSuggestions = showSuggest && term.length >= 2 ? CAUSES.filter((c) => (c.toLowerCase().includes(term) || causeOf(c).label.toLowerCase().includes(term)) && !causes.includes(c)).slice(0, 4) : [];
  // An empty field lists every recent search; typing narrows them to the ones that contain the text.
  const recent = (state.recentSearches || []).filter((r) => !term || r.toLowerCase().includes(term));
  // Focus always opens the list; with nothing to suggest it shows a one-line hint.
  const suggestOpen = showSuggest;
  const suggestHint = suggestOpen && !causeSuggestions.length && !recent.length;
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
    if (e.key === 'Enter') {
      // Enter runs the search on every layout, including phones where the
      // Search button sits folded under the pill.
      e.preventDefault();
      if (active >= 0) chooseOption(options[active]);
      else runSearch();
    }
  }

  function runSearch(value) {
    const v = (value === undefined ? draftQuery : value).trim();
    setShowSuggest(false);
    rememberSearch(v);
    setParams({ q: v });
    // Phones: fold Where / When back into the one-line summary so the results
    // are on screen, and park focus on that summary so the keyboard closes.
    if (moreOpen) {
      setMoreOpen(false);
      if (sumRef.current) sumRef.current.focus();
    }
  }

  function addCause(c) {
    setShowSuggest(false);
    setDraftQuery('');
    setParams({ q: null, causes: [...causes, c].join('|') });
  }

  // Clears every filter and keeps the Where value.
  function clearFilters() {
    clearTimeout(nearTimer.current);
    nearTimer.current = null;
    whereDirty.current = false;
    markCausesCleared();
    const keep = draftNear.trim();
    const next = new URLSearchParams();
    if (keep && keep !== homeRegion) next.set('near', keep);
    else if (nearParam === '' && !keep) next.set('near', '');
    const resolved = next.has('near') ? next.get('near') : homeRegion;
    committedNear.current = resolved;
    setDraftNear(resolved);
    pushQuery(next);
  }

  /* ---- the visitor's location ---------------------------------------------------
     A location picked in the Near you line becomes the Where: any Where in
     the URL gives way to it, and a signed-in volunteer's saved area moves
     too. A location the browser filled in quietly never replaces an area
     the volunteer saved themselves. */
  const [askLoc, setAskLoc] = useState(0);
  function onLocation(rec, how = {}) {
    // Filled in quietly: the Where follows by itself when the URL has none,
    // and a shared link's Where or a saved area is left alone.
    if (how.quiet) return;
    const area = areaOf(rec);
    if (state.session.authed && area && area !== savedRegion) setPref('location', area);
    setParams({ near: null });
    // This render's home area is the one before the pick, so the Where shows
    // the new one directly.
    const shown = state.session.authed ? area || savedRegion : savedRegion || area;
    committedNear.current = shown;
    setDraftNear(shown);
  }

  /* ---- category row ---------------------------------------------------------- */
  const catValue = (() => {
    if (causes.length === 1) {
      const it = CATEGORIES.find((c) => c.cause === causes[0]);
      return it ? it.key : null;
    }
    if (causes.length > 1) return null;
    if (place === 'online' && !near) return 'online';
    return near === homeRegion && !savedOnly ? 'near' : null;
  })();

  // The row and the In person / Online chips read the URL, which follows the
  // tap only once the route lands; these hold the tapped state until then.
  const [heldCat, holdCat] = useHeldValue(paramsKey);
  const [heldPlace, holdPlace] = useHeldValue(paramsKey);
  const shownCat = heldCat === undefined ? catValue : heldCat;
  const shownPlace = heldPlace === undefined ? place : heldPlace;
  // What the row shows once causes are cleared (Near you, Online or nothing).
  const catWithoutCause = place === 'online' && !near ? 'online' : near === homeRegion && !savedOnly ? 'near' : null;

  function pickCategory(key, item) {
    if (key === 'near') holdCat('near');
    else if (key === 'online') holdCat(catValue === 'online' ? (savedOnly ? null : 'near') : 'online');
    else holdCat(causes.length === 1 && causes[0] === item.cause ? catWithoutCause : key);
    if (key === 'near') {
      // With no location yet, Near you asks for one (the line under the bar).
      if (!homeRegion) setAskLoc((n) => n + 1);
      setParams({ causes: null, windows: null, saved: null, place: place === 'person' ? 'person' : null, near: null });
      return;
    }
    if (key === 'online') {
      // Online means anywhere; tapping it again goes back to the home area.
      if (catValue === 'online') setParams({ causes: null, place: null, near: null });
      else setParams({ causes: null, place: 'online', near: null });
      return;
    }
    // A second tap on the active cause clears it.
    const same = causes.length === 1 && causes[0] === item.cause;
    setParams({ causes: same ? null : item.cause });
  }

  // Causes the row doesn't carry (Disaster relief) stay reachable in Filters.
  const nFilters = causes.length + windows.length + (savedOnly ? 1 : 0) + (sort !== defaultSort ? 1 : 0);

  /* The In person / Online chips narrow the current Where, so they write it
     into the URL: an Online chip next to "Rivertown" means online listings
     based in Rivertown. The Online category above searches anywhere. */
  function togglePlace(k) {
    holdPlace(place === k ? 'all' : k);
    if (place === k) {
      setParams({ place: null });
      return;
    }
    // With no area of their own, the default town (Indianapolis) is the Where.
    setParams({ place: k, near: near || listNear }, { keepEmpty: ['near'] });
  }

  function toggleWindow(w) {
    setParams({ windows: windows.includes(w) ? windows.filter((x) => x !== w).join('|') : [...windows, w].join('|') });
  }

  function openFilters() {
    openModal({
      title: 'Filter opportunities',
      subtitle: 'Causes also narrow the nonprofit search.',
      size: 'wide',
      Body: function FilterBody({ api }) {
        const [local, setLocal] = useState({ causes: causes.slice(), windows: windows.slice(), sort, savedOnly });
        const [preview, setPreview] = useState({ n: null, failed: false });
        const localKey = `${local.causes.join('|')}#${local.windows.join('|')}#${local.sort}#${local.savedOnly}`;
        // Saved-only, a When window and free time can't be counted from one page of results, so they get no number.
        const uncountable = local.savedOnly || Boolean(when) || local.windows.length > 0;
        // The same area rule as the list's (listNear), so the button's count is the list's.
        const previewNear = near || (nearParam === null && place !== 'online' && !q && !local.savedOnly ? zipHome || DEFAULT_AREA.city : '');
        useEffect(() => {
          let alive = true;
          setPreview({ n: null, failed: false });
          if (uncountable) return undefined;
          const t = setTimeout(async () => {
            try {
              const found = await searchListings({ q, causes: local.causes, kind, place, near: previewNear, origin: previewNear === listNear ? origin : null, sort: local.sort === 'nearest' ? 'recent' : local.sort });
              const n = found.total ?? found.length;
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
        const toggleFree = (w) => setLocal((f) => ({ ...f, windows: f.windows.includes(w) ? f.windows.filter((x) => x !== w) : [...f.windows, w] }));
        const label = uncountable ? 'Show opportunities' : preview.n === null ? 'Show opportunities' : preview.n === 0 ? 'Show 0 opportunities' : `Show ${plural(preview.n, 'opportunity', 'opportunities')}`;
        return (
          <div>
            <div style={S(`font:600 13px/1.2 ${F.body};color:${C.ink}`)}>Causes</div>
            <div role="group" aria-label="Causes" style={S('margin-top:12px;display:flex;flex-wrap:wrap;gap:8px')}>
              {CAUSES.map((c) => (
                <Chip key={c} label={causeOf(c).label === 'Other' ? c : causeOf(c).label} role="checkbox" on={local.causes.includes(c)} py={8} px={14} fs={14} onClick={() => toggle(c)} />
              ))}
            </div>
            <div style={S(`margin-top:24px;font:600 13px/1.2 ${F.body};color:${C.ink}`)}>When you&apos;re free</div>
            <div role="group" aria-label="When you're free" style={S('margin-top:12px;display:flex;flex-wrap:wrap;gap:8px')}>
              {WINDOWS.map((w) => (
                <Chip key={w} label={w} on={local.windows.includes(w)} py={8} px={14} fs={14} onClick={() => toggleFree(w)} />
              ))}
            </div>
            <div style={S('margin-top:24px')}>
              <Select label="Sort by" value={local.sort} options={sorts} onChange={(v) => setLocal((f) => ({ ...f, sort: v }))} />
            </div>
            <div style={S('margin-top:18px')}>
              <Checkbox checked={local.savedOnly} label="Only show opportunities I saved" onChange={(v) => setLocal((f) => ({ ...f, savedOnly: v }))} />
            </div>
            <div style={S(`margin-top:24px;padding-top:18px;border-top:1px solid ${C.line};display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap`)}>
              {/* The count is printed once, on the Show button. A changed
                  button label isn't announced, so screen readers hear it here. */}
              <div aria-live="polite" style={S(`font:400 14px/1.4 ${F.body};color:${C.ink2}`)}>
                {uncountable ? null : preview.failed ? "Couldn't count matches right now." : (
                  <span className="vu-sr">{preview.n === null ? 'Counting matches' : plural(preview.n, 'opportunity matches', 'opportunities match')}</span>
                )}
              </div>
              <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>
                <Button onClick={() => setLocal({ causes: [], windows: [], sort: defaultSort, savedOnly: false })}>Reset</Button>
                <Button
                  variant="dark"
                  onClick={() => {
                    setParams({
                      causes: local.causes.join('|'),
                      windows: local.windows.join('|'),
                      sort: local.sort === defaultSort ? null : local.sort,
                      saved: local.savedOnly ? '1' : null,
                    });
                    api.close();
                  }}
                >
                  {label}
                </Button>
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
        <div style={S('display:flex;flex-direction:column;gap:16px')}>
          {[
            ['An organization asks for it', 'It sends a request from its project page with the name of a staff contact.'],
            ['A person reviews it', 'Someone at VolunteerU checks the request by hand.'],
            ["What it doesn't cover", "Verification isn't a background check. Read each listing's details before you apply."],
            ['Nonprofits from IRS records', "They're registered with the IRS. VolunteerU hasn't reviewed them."],
          ].map(([t, b]) => (
            <div key={t}>
              <div style={S(`font:600 15px/1.3 ${F.body};color:${C.ink}`)}>{t}</div>
              <div style={S(`margin-top:4px;font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>{b}</div>
            </div>
          ))}
        </div>
      ),
    });
  }

  /* ---- map ------------------------------------------------------------------- */
  // What they told us at sign-up, matched against listings by keyword. Shown
  // while nothing narrower (a search, a cause, a type or place) is picked.
  const interest = ((state.prefs && state.prefs.interest) || '').trim();
  const showMatch = view === 'opp' && Boolean(interest) && !q && !causes.length && kind === 'all' && place === 'all' && !savedOnly;
  // Every card listed is a pin: the "Based on your causes" picks above the
  // main list as well as the list itself.
  const mapListings = useMemo(() => {
    if (!showMatch || !picks.list.length) return rows.list;
    const seen = new Set(rows.list.map((l) => l.id));
    return [...picks.list.filter((l) => !seen.has(l.id)), ...rows.list];
  }, [showMatch, picks.list, rows.list]);
  const mapPhotos = useMemo(() => {
    if (!showMatch || !picks.photos) return rows.photos;
    return new Map([...(picks.photos instanceof Map ? picks.photos : []), ...(rows.photos instanceof Map ? rows.photos : [])]);
  }, [showMatch, picks.photos, rows.photos]);
  const mapProps = {
    listings: view === 'opp' ? mapListings : [],
    photos: mapPhotos,
    nonprofits: view === 'opp' && kind === 'student' ? [] : orgs,
    town: listNear,
    here,
  };

  // Phones and tablets: the floating Map pill opens the full-screen map.
  const [mapFull, setMapFull] = useState(false);

  /* ---- render -------------------------------------------------------------- */
  const suggestBox = suggestOpen ? (
    <div
      id="vu-suggest"
      role="listbox"
      aria-label="Suggestions"
      className="dz-suggest"
      onMouseDown={(e) => e.preventDefault()}
      style={S(`border-radius:${R.photo};background:#fff;box-shadow:${SH.menu};overflow:hidden;padding:6px 0`)}
    >
      {suggestHint ? (
        <div style={S(`padding:10px 18px;font:400 14px/1.45 ${F.body};color:${C.ink2}`)}>
          {term.length >= 2 ? 'Press Enter to search opportunities and nonprofits.' : 'Try a cause, like food bank or tutoring, or an organization’s name.'}
        </div>
      ) : null}
      {causeSuggestions.length ? (
        <>
          <div style={S(`padding:10px 18px 6px;font:600 13px/1.2 ${F.body};color:${C.ink}`)}>Causes</div>
          {causeSuggestions.map((c, i) => (
            <div
              key={c}
              id={optionId(i)}
              role="option"
              tabIndex={-1}
              aria-selected={active === i ? 'true' : 'false'}
              aria-label={`Filter by ${causeOf(c).label}`}
              onClick={() => addCause(c)}
              onMouseEnter={() => setActiveIdx(i)}
              className="dz-opt"
              style={s('padding:10px 18px;display:flex;align-items:center;gap:12px;cursor:pointer', active === i ? `background:${C.mist}` : '')}
            >
              <Icon name={causeOf(c).icon} size={18} color={C.ink2} />
              <span style={S(`font:400 15px/1.3 ${F.body};color:${C.ink}`)}>{causeOf(c).label}</span>
            </div>
          ))}
        </>
      ) : null}
      {recent.length ? (
        <>
          <div style={s('padding:10px 18px 6px;display:flex;align-items:center;justify-content:space-between', causeSuggestions.length ? `border-top:1px solid ${C.line};margin-top:6px` : '')}>
            <div style={S(`font:600 13px/1.2 ${F.body};color:${C.ink}`)}>Recent searches</div>
            <button type="button" aria-label="Clear recent searches" onClick={() => clearSearches()} className="vu-link-ul" style={S(`font:500 13px/1.2 ${F.body};color:${C.ink}`)}>
              Clear
            </button>
          </div>
          {recent.map((r, j) => {
            const i = causeSuggestions.length + j;
            return (
              <div
                key={r}
                id={optionId(i)}
                role="option"
                tabIndex={-1}
                aria-selected={active === i ? 'true' : 'false'}
                aria-label={`Search ${r}`}
                onClick={() => chooseOption({ kind: 'recent', v: r })}
                onMouseEnter={() => setActiveIdx(i)}
                className="dz-opt"
                style={s('padding:10px 18px;display:flex;align-items:center;gap:12px;cursor:pointer', active === i ? `background:${C.mist}` : '')}
              >
                <Icon name="clock" size={18} color={C.ink3} />
                <span style={S(`font:400 15px/1.3 ${F.body};color:${C.ink}`)}>{r}</span>
              </div>
            );
          })}
        </>
      ) : null}
    </div>
  ) : null;

  const showUseHome = Boolean(homeRegion) && draftNear !== homeRegion;
  // The volunteers directory needs an account; signed out, the link says so and starts one.
  const volunteersHref = state.session.authed ? '/volunteers' : `/signup?next=${encodeURIComponent('/volunteers')}`;
  const whereCompact = !phone && barW > 0 && barW < WHERE_TEXT_MIN;
  const whenText = (WHEN_OPTIONS.find((o) => o.v === when) || {}).l || 'Any day';
  // With nothing typed, the pill names the area the lists really cover
  // (Indianapolis for a signed-out visitor), and Anywhere only when they don't narrow.
  const summaryWhere = draftNear || (listNear ? (listNear === DEFAULT_AREA.city ? `${DEFAULT_AREA.city}, ${DEFAULT_AREA.state}` : listNear) : 'Anywhere');
  const summary = [summaryWhere, when ? whenText.toLowerCase() : 'any day'].join(', ');
  const showPreviewNp = view === 'opp' && kind !== 'student' && !savedOnly;
  const npTotal = nonprofitCount ? formatCount(nonprofitCount.total) : null;
  // No area of their own and no Where: nonprofits are Indianapolis's, like the
  // opportunities (a cause narrows them there, as on the landing page). A
  // search word searches every state.
  const npArea = nearParam === null && !webNear.trim() && !q && place !== 'online' && !savedOnly ? DEFAULT_AREA : null;
  // The preview is left out when there is nothing to list.
  const npCity = npArea ? npArea.city : cityOf(webNear);
  const npHasQuery = Boolean(q.trim() || causes.length || parseState(webNear) || npCity || npArea);
  // Where the search actually ran (the list reports it, e.g. a town with no
  // IRS records falls back to its state), else where it's about to run.
  const npWhere = nonprofitCount
    ? nonprofitCount.city ? `in ${nonprofitCount.city}` : nonprofitCount.state ? `in ${stateName(nonprofitCount.state)}` : 'in every state'
    : npCity ? `in ${npCity}` : parseState(webNear) ? `in ${stateName(parseState(webNear))}` : 'in IRS records';
  const npHeading = q ? `Nonprofits for “${q}” ${npWhere}` : causes.length === 1 ? `${causeWording(causes[0]).np} ${npWhere}` : `Nonprofits ${npWhere}`;
  // Around Indianapolis, the towns next to it are one tap away, with the
  // visitor's own town first when it isn't one of them.
  const ownTown = locSet && locSet.town ? locSet.town : cityOf(savedRegion);
  const towns = ownTown && !NEARBY_TOWNS.some((t) => t.toLowerCase() === ownTown.toLowerCase()) ? [ownTown, ...NEARBY_TOWNS] : NEARBY_TOWNS;
  const showTowns = view === 'np' && towns.some((t) => t.toLowerCase() === String(npCity || '').toLowerCase());
  const line = resultsLine({ count: listingCount, causes, kind, place, near: listNear, when, windows, q, savedOnly });

  return (
    <div className="vu-page dz-page">
      <style dangerouslySetInnerHTML={{ __html: DISCOVER_CSS }} />

      <div className="dz-head">
        <h1 className="dz-h1">Discover</h1>
        <div className="dz-head-act">
          <button type="button" className="vu-link-ul" onClick={() => router.push(volunteersHref)} style={S(`font:500 14px/1.3 ${F.body};color:${C.ink}`)}>
            {state.session.authed ? 'Find volunteers' : 'Sign up to find volunteers'}
          </button>
          <Button size="sm" icon="plus" onClick={() => router.push(state.session.authed ? '/create' : '/signup?intent=start')}>
            Start a student project
          </Button>
        </div>
      </div>

      <div className="dz-searchrow" ref={searchWrap}>
        <form
          role="search"
          aria-label="Search opportunities and nonprofits"
          ref={formRef}
          className="vu-sb vu-sb--bar-only dz-sb"
          data-open={moreOpen ? 'true' : 'false'}
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
        >
          <span className="dz-ic" aria-hidden="true">
            <Icon name="search" size={20} />
          </span>
          <label className="vu-sb-seg vu-sb-seg--what" htmlFor="vu-discover-search">
            <span className="vu-sb-body">
              <span className="vu-sb-label">What</span>
              <span style={S('display:flex;align-items:center;gap:6px')}>
                <input
                  id="vu-discover-search"
                  type="search"
                  role="combobox"
                  className="vu-sb-input"
                  aria-expanded={suggestOpen}
                  aria-controls={suggestOpen ? 'vu-suggest' : undefined}
                  aria-activedescendant={active >= 0 ? optionId(active) : undefined}
                  aria-autocomplete="list"
                  aria-label="What: cause, organization or nonprofit name"
                  autoComplete="off"
                  enterKeyHint="search"
                  value={draftQuery}
                  placeholder={phone ? 'Search opportunities' : whatPlaceholder(barW)}
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
                />
                {draftQuery ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    className="dz-x"
                    onClick={() => {
                      setDraftQuery('');
                      runSearch('');
                    }}
                  >
                    <Icon name="x" size={16} />
                  </button>
                ) : null}
              </span>
            </span>
          </label>
          <button type="button" ref={sumRef} className="dz-sum" aria-expanded={moreOpen} aria-controls="dz-where" onClick={() => setMoreOpen((v) => !v)}>
            <span className="vu-trunc">{summary}</span>
            <Icon name={moreOpen ? 'chevron-up' : 'chevron-down'} size={16} />
          </button>
          <button type="button" className="vu-sb-filter dz-filt-m" onClick={openFilters} aria-label={`Filters${nFilters ? `, ${nFilters} active` : ''}`}>
            <Icon name="sliders" size={18} />
            {nFilters ? <i aria-hidden="true">{nFilters}</i> : null}
          </button>
          {phone ? suggestBox : null}

          <label
            className="vu-sb-seg vu-sb-seg--where"
            id="dz-where"
            htmlFor="dz-where-input"
            // With "Use Rivertown" beside it, Where takes a bigger share of the
            // bar so the placeholder still fits on laptops and tablets.
            style={showUseHome && !phone ? { flex: whereCompact ? '1.1 1 0' : '1.05 1 0' } : undefined}
          >
            <span className="vu-sb-ic" aria-hidden="true"><Icon name="pin" size={20} /></span>
            <span className="vu-sb-body">
              <span className="vu-sb-label">Where</span>
              <span style={S('display:flex;align-items:center;gap:8px')}>
                <input
                  id="dz-where-input"
                  type="text"
                  className="vu-sb-input"
                  aria-label="Where: city or ZIP. Leave empty to search anywhere."
                  autoComplete="off"
                  value={draftNear}
                  placeholder="City or ZIP"
                  onChange={(e) => typeNear(e.target.value)}
                  onFocus={() => setShowSuggest(false)}
                />
                {showUseHome && whereCompact ? (
                  <button
                    type="button"
                    aria-label={`Use ${homeRegion}`}
                    title={`Use ${homeRegion}`}
                    onClick={() => setParams({ near: null }, { replace: true })}
                    style={S(`flex:none;display:inline-grid;place-items:center;width:28px;height:20px;margin:0 -6px 0 0;border:0;border-radius:999px;background:none;color:${C.ink};cursor:pointer`)}
                  >
                    <Icon name="navigation" size={16} />
                  </button>
                ) : showUseHome ? (
                  <button type="button" className="vu-link-ul" onClick={() => setParams({ near: null }, { replace: true })} style={S(`flex:none;margin-top:3px;font:500 13px/1.2 ${F.body};color:${C.ink};white-space:nowrap`)}>
                    Use {homeRegion}
                  </button>
                ) : null}
              </span>
            </span>
          </label>

          <label className="vu-sb-seg vu-sb-seg--when" htmlFor="dz-when">
            <span className="vu-sb-ic" aria-hidden="true"><Icon name="calendar" size={20} /></span>
            <span className="vu-sb-body">
              <span className="vu-sb-label">When</span>
              <select
                id="dz-when"
                className="vu-sb-input vu-sb-select"
                data-set={when ? 'true' : 'false'}
                value={when}
                onChange={(e) => setParams({ when: e.target.value || null })}
              >
                {WHEN_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <button type="submit" className="vu-sb-go">
            <Icon name="search" size={20} />
            <span>Search</span>
          </button>
          {!phone ? suggestBox : null}
        </form>

        <button type="button" className="dz-fbtn" onClick={openFilters} aria-label={`Filters${nFilters ? `, ${nFilters} active` : ''}`} style={tablet ? { padding: '0 18px' } : undefined}>
          <Icon name="sliders" size={18} />
          {tablet ? null : 'Filters'}
          {nFilters ? <span className="dz-fbtn-n" aria-hidden="true">{nFilters}</span> : null}
        </button>
      </div>

      <NearYou className="dz-near" area={homeRegion} fallback={DEFAULT_AREA.city} ask={askLoc} onChange={onLocation} />
      {typedPlace.status === 'notfound' ? (
        <p role="alert" style={S(`margin:6px 0 0;font:400 13px/1.45 ${F.body};color:${C.emberDeep};max-width:640px`)}>
          {`${LOCATE_ERRORS.notfound.replace('that place', `“${typedNear}”`)} `}
          <button type="button" className="vu-link-ul" onClick={() => setParams({ near: null }, { replace: true })} style={S(`font:500 13px/1.45 ${F.body};color:${C.ink}`)}>
            Search near {homeRegion || `${DEFAULT_AREA.city}, ${DEFAULT_AREA.state}`}
          </button>
        </p>
      ) : null}

      <CategoryRow className="dz-cats" value={shownCat} onChange={pickCategory} short={phone} label="Causes" />

      <div className="dz-split">
        <div className="dz-list">
          {/* The sort shares the row with the Opportunities / Nonprofits
              switch, at its right end, so it never needs a row of its own
              (the chip row below fills the list column beside the map). On
              phones that row has no room left; sorting is in Filters there. */}
          <div style={S('display:flex;align-items:center;gap:12px;min-width:0')}>
            <Segmented
              label="Show"
              value={view}
              onChange={(v) => setParams({ view: v === 'np' ? 'nonprofits' : null })}
              options={[
                { v: 'opp', l: 'Opportunities', count: listingCount === null ? null : formatCount(listingCount), panelId: 'dz-panel' },
                { v: 'np', l: 'Nonprofits', count: npTotal, panelId: 'dz-panel' },
              ]}
            />
            {view === 'opp' && !phone ? (
              <label className="dz-sort" style={S('margin-left:auto')}>
                <span className="vu-sr">Sort opportunities by</span>
                <select value={sort} onChange={(e) => setParams({ sort: e.target.value === defaultSort ? null : e.target.value })}>
                  {sorts.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.l}
                    </option>
                  ))}
                </select>
                <Icon name="chevron-down" size={16} />
              </label>
            ) : null}
          </div>

          <div id="dz-panel" role="tabpanel" aria-label={view === 'opp' ? 'Opportunities' : 'Nonprofits'}>
            {view === 'opp' ? (
              <>
                <div className="dz-chips">
                  <div role="radiogroup" aria-label="Who posted it" className="dz-chipgroup">
                    {KINDS.map((o) => {
                      const on = kind === o.k;
                      return (
                        <button key={o.k} type="button" role="radio" aria-checked={on} className="dz-chip" onClick={() => setParams({ kind: o.k === 'all' ? null : o.k })}>
                          {o.t}
                        </button>
                      );
                    })}
                  </div>
                  <span className="dz-chipsep" aria-hidden="true" />
                  <div role="group" aria-label="Where it happens" className="dz-chipgroup">
                    {[
                      { k: 'person', t: 'In person' },
                      { k: 'online', t: 'Online' },
                    ].map((o) => {
                      const on = shownPlace === o.k;
                      return (
                        <button key={o.k} type="button" aria-pressed={on} className="dz-chip" onClick={() => togglePlace(o.k)}>
                          {o.t}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* The count is on the Opportunities tab above, so the
                    sentence is said to screen readers only, as results change. */}
                <span aria-live="polite" className="vu-sr">
                  {line}
                </span>
                {windows.length ? (
                  // The free time saved at sign-up, on its own row so it's
                  // never scrolled out of sight. Tapping one drops it.
                  <div role="group" aria-label="When you're free" className="dz-chips" style={S('margin-top:10px')}>
                    {windows.map((w) => (
                      <button key={w} type="button" aria-pressed="true" className="dz-chip" title={`Stop filtering by ${w.toLowerCase()}`} onClick={() => toggleWindow(w)} style={S('display:inline-flex;align-items:center;gap:6px;flex:none')}>
                        {w}
                        <Icon name="x" size={14} />
                      </button>
                    ))}
                  </div>
                ) : null}

                {showMatch ? (
                  <div style={S('margin-top:28px')}>
                    <DiscoverListings
                      mode="match"
                      interest={interest}
                      causes={((state.prefs && state.prefs.causes) || []).filter((c) => CAUSES.includes(c))}
                      near={listNear}
                      origin={origin}
                      when={when}
                      windows={windows}
                      initial={phone || (wide && !mapSide) ? 3 : 2}
                      cols={mapSide ? 2 : 3}
                      highlight={pickedId}
                      onHover={setHoverId}
                      onCount={setMatchCount}
                      onRows={(list, photos) => {
                        setPickIds(list.map((l) => l.id));
                        setPicks({ list, photos });
                      }}
                    />
                  </div>
                ) : null}

                {/* Drawn while the match block loads too (matchCount null), so the list under it doesn't move when it lands. */}
                {showMatch && matchCount !== 0 ? <div aria-hidden="true" style={S(`margin-top:40px;border-top:1px solid ${C.line}`)} /> : null}

                <DiscoverListings
                  bare
                  q={q}
                  causes={causes}
                  kind={kind}
                  place={place}
                  near={listNear}
                  sort={sort}
                  origin={origin}
                  when={when}
                  windows={windows}
                  savedOnly={savedOnly}
                  initial={6}
                  cols={mapSide ? 2 : 3}
                  highlight={pickedId}
                  onHover={setHoverId}
                  onClearFilters={clearFilters}
                  onAnywhere={() => setParams({ near: '' }, { keepEmpty: ['near'] })}
                  onCount={setListingCount}
                  onRows={(list, photos) => setRows({ list, photos })}
                  excludeIds={showMatch ? pickIds : []}
                />
              </>
            ) : null}

            <div className={view === 'opp' ? 'dz-np-preview' : 'dz-np-full'} hidden={view === 'opp' && (!showPreviewNp || !npHasQuery)}>
              {showTowns ? (
                <div role="group" aria-label="Nearby towns" className="dz-chips" style={S('margin-bottom:24px')}>
                  <span aria-hidden="true" style={S(`flex:none;margin-right:4px;font:400 13px/1.2 ${F.body};color:${C.ink2}`)}>Nearby</span>
                  {towns.map((t) => {
                    const on = t.toLowerCase() === String(npCity || '').toLowerCase();
                    return (
                      <button key={t} type="button" aria-pressed={on} className="dz-chip" onClick={() => setParams({ near: `${t}, ${t === ownTown && locSet && locSet.state ? locSet.state : 'IN'}` })}>
                        {t}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <WebNonprofits
                id="nonprofits"
                q={q}
                near={webNear}
                causes={causes}
                kind="all"
                area={npArea}
                origin={pointOf(locSet)}
                limit={view === 'opp' ? 4 : 0}
                heading={npHeading}
                onClear={() => runSearch('')}
                onCount={setNonprofitCount}
                onResults={setOrgs}
                mapNotes={!(view === 'opp' && kind === 'student')}
                onSeeAll={() => {
                  setParams({ view: 'nonprofits' });
                  if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
                }}
              />
            </div>
          </div>

          <div className="dz-foot">
            <p>
              <Icon name="badge-check" size={16} color={C.confirmed} />
              <span>
                A green check means a VolunteerU reviewer checked the organization by hand. Student projects don&apos;t carry one.{' '}
                <button type="button" className="vu-link-ul" onClick={verifyInfo}>
                  How verification works
                </button>
              </span>
            </p>
            <p>
              <span>
                Need people for your own project?{' '}
                <button type="button" className="vu-link-ul" onClick={() => router.push(volunteersHref)}>
                  {state.session.authed ? 'Find volunteers' : 'Sign up to find volunteers'}
                </button>
              </span>
            </p>
          </div>
        </div>

        {/* Always in the page so the column is there from the first paint
            (DISCOVER_CSS shows it from 1320px); the map itself mounts once
            the screen is known to be that wide. Its height is 24px sticky
            top plus the page's 88px bottom padding, so the stuck map is
            never clipped at the end of the list. */}
        <aside className="dz-side" aria-label="Map">
          {mapSide ? (
            <DiscoverMap
              {...mapProps}
              highlight={hoverId}
              onPick={setPickedId}
              onOpenNonprofit={openNonprofit}
              style={{ height: '100%' }}
            />
          ) : (
            <div className="dz-side-wait" aria-hidden="true" />
          )}
        </aside>
      </div>

      {!mapSide ? (
        <DiscoverMap {...mapProps} inline={false} expanded={mapFull} onExpandedChange={setMapFull} />
      ) : null}

      {!mapSide ? (
        <button
          type="button"
          onClick={() => setMapFull(true)}
          aria-haspopup="dialog"
          style={S(`position:fixed;left:50%;transform:translateX(-50%);bottom:calc(var(--vu-tabbar-h, 0px) + 16px);z-index:40;height:46px;padding:0 20px;border-radius:${R.pill};background:${C.ink};color:#fff;display:inline-flex;align-items:center;gap:8px;font:600 15px/1 ${F.body};box-shadow:0 6px 20px rgba(30,36,33,.3);cursor:pointer`)}
          className="dz-mappill"
        >
          <Icon name="map" size={18} />
          Map
        </button>
      ) : null}
    </div>
  );
}

