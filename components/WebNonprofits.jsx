'use client';

/* ==========================================================================
   WebNonprofits.jsx, nonprofit search from IRS records (ProPublica proxy at
   /api/nonprofits). Rows open the nonprofit's detail (?ein= on Discover),
   which shows its address, IRS number and links to its website and filings.
   Hidden when Discover is set to student projects only.

   Rows are NonprofitRow (name, then "cause · City, ST"), in two columns on
   wide screens. No logo or initials: we don't have their logos. The IRS
   source line is said once per section, never per row.

   With nothing to search by (no words, cause or state), an `area` such as
   { city: 'Carmel', state: 'IN' } lists that town's nonprofits, the same
   rows Landing shows signed-out visitors. Without one, a preview shows
   nothing and the full list asks for a search.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { S } from '../lib/style.js';
import { C, F } from '../lib/tokens.js';
import { parseState } from '../lib/listings.js';
import { SkeletonRows, Icon, Button } from './ui.jsx';
import NonprofitRow from './vu/NonprofitRow.jsx';

const PAGE = 10; // rows shown per step

/* Search words for a cause chip when the student hasn't typed anything. */
const CAUSE_KEYWORD = {
  'Food & hunger': 'food bank', Education: 'education', Homelessness: 'homeless shelter',
  Environment: 'conservation', Animals: 'animal rescue', Civic: 'community',
  Health: 'health', Seniors: 'senior', Arts: 'arts', 'Disaster relief': 'disaster relief',
};

/* ProPublica's NTEE major groups, used to narrow a typed search by cause. */
const CAUSE_NTEE = {
  Arts: '1', Education: '2', Environment: '3', Animals: '3', Health: '4',
  'Food & hunger': '5', Homelessness: '5', Seniors: '5', 'Disaster relief': '5', Civic: '7',
};

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'Washington, DC', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii',
  ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

export function stateName(abbr) {
  return STATE_NAMES[abbr] || abbr || '';
}

export function titleCase(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Of|The|And|For|In|At|To)\b/g, (w, _m, i) => (i === 0 ? w : w.toLowerCase()));
}

export function formatCount(n) {
  if (n >= 10000) return '10,000+';
  return Number(n || 0).toLocaleString('en-US');
}

/** The cause as a row reads it: "Food and hunger", or '' for the catch-all. */
function causeText(cause) {
  const c = String(cause || '').trim();
  if (!c || c === 'Nonprofit') return '';
  return c.replace(/\s*&\s*/g, ' and ');
}

/** "Food and hunger, Indianapolis, IN" under a nonprofit's name. */
export function nonprofitSub(o) {
  return [causeText(o.cause), titleCase(o.city), o.state].filter(Boolean).join(', ');
}

/** "Indianapolis, IN", or '' when the record has neither. */
function placeText(o) {
  return [titleCase(o.city), o.state].filter(Boolean).join(', ');
}

/* A web search that surfaces the org's own website and volunteer page. */
export function siteSearchUrl(o) {
  const terms = [titleCase(o.name), titleCase(o.city), o.state, 'volunteer'].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(terms)}`;
}

/* A full page navigation cancels in-flight fetches with "Failed to fetch".
   That's routine, so it isn't logged as a search failure. */
let unloading = false;
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    unloading = true;
  });
  window.addEventListener('pageshow', () => {
    unloading = false;
  });
}

function isCancelled(err, signal) {
  return unloading || (signal && signal.aborted) || (err && err.name === 'AbortError');
}

/* Discover link for "See all nonprofits". Discover's Where field takes a
   city, so a trailing ZIP is dropped; with no city left Discover falls back
   to the student's saved area on its own. Opens Discover's Nonprofits tab. */
function discoverHref({ q, near, causes }) {
  const params = new URLSearchParams();
  const term = String(q || '').trim();
  const city = String(near || '').replace(/\b\d{5}(?:-\d{4})?\b/g, '').replace(/\s+/g, ' ').trim();
  if (term) params.set('q', term);
  if (city) params.set('near', city);
  if ((causes || []).length) params.set('causes', causes.join('|'));
  params.set('view', 'nonprofits');
  return `/discover?${params.toString()}`;
}

/** One upstream request. Throws on failure so callers can tell it from "0 found". */
async function fetchSearch({ q, state, ntee, page }, signal) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (state) params.set('state', state);
  if (ntee) params.set('ntee', ntee);
  if (page) params.set('page', String(page));
  const res = await fetch(`/api/nonprofits?${params.toString()}`, { signal });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || !data || data.error) throw new Error((data && data.error) || `status ${res.status}`);
  return data;
}

/** Turn the Discover inputs into one search per cause (at most 4). */
function buildQueries({ q, causes, state }) {
  const term = String(q || '').trim();
  const list = (causes || []).slice(0, 4);
  if (term) {
    const ntees = Array.from(new Set(list.map((c) => CAUSE_NTEE[c]).filter(Boolean)));
    return ntees.length ? ntees.map((ntee) => ({ q: term, ntee, state })) : [{ q: term, state }];
  }
  if (list.length) return list.map((c) => ({ q: CAUSE_KEYWORD[c] || c, state }));
  if (state) return [{ state }];
  return [];
}

/* Round-robin merge so two cause searches share the top of the list. */
function interleave(lists) {
  const out = [];
  const seen = new Set();
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const l of lists) {
      const o = l[i];
      if (o && !seen.has(o.ein)) {
        seen.add(o.ein);
        out.push(o);
      }
    }
  }
  return out;
}

/* A town's own nonprofits: ProPublica's pages for the town's name in its
   state, kept to rows whose city is that town. Churches, political groups,
   sports clubs and boosters are left out since they rarely take student
   volunteers; a search still finds them. The same rules as Landing's
   Carmel list, so both screens show the same rows. */
const AREA_PAGES = [0, 1, 2];
const AREA_SKIP = /church|baptist|baha|lutheran|methodist|presbyterian|wesleyan|catholic|assembly|ministr|democrat|republican|building corp|golf|lacrosse|baseball|hockey|rugby|wrestling|swim|basketball|soccer|football|runners|teachers assoc|fop|lodge|\bpto\b|booster|club|diwali|christkindl/i;
const AREA_CAUSES = ['Environment', 'Education', 'Human services', 'Youth', 'Health', 'Arts', 'Civic', 'Disaster relief', 'Food & hunger', 'Homelessness', 'Animals', 'Nonprofit'];

/** The town's nonprofits, one per cause in turn so the list mixes causes. */
async function fetchArea({ city, state }, signal) {
  const pages = await Promise.all(AREA_PAGES.map((page) => fetchSearch({ q: city, state, page }, signal)));
  const town = String(city).toLowerCase();
  const seen = new Set();
  const rows = pages.flatMap((d) => d.organizations || []).filter((o) => {
    if (!o || seen.has(o.ein)) return false;
    seen.add(o.ein);
    return String(o.city || '').toLowerCase() === town && o.cause !== 'Religion' && !AREA_SKIP.test(o.name || '');
  });
  const byCause = new Map();
  for (const o of rows) {
    const k = AREA_CAUSES.includes(o.cause) ? o.cause : 'Nonprofit';
    byCause.set(k, [...(byCause.get(k) || []), o]);
  }
  const queues = AREA_CAUSES.map((k) => byCause.get(k) || []).filter((l) => l.length);
  const out = [];
  for (let i = 0; queues.some((l) => l[i]); i++) {
    for (const l of queues) if (l[i]) out.push(l[i]);
  }
  return out;
}

/**
 * `limit` caps the list for a preview: only that many rows, no paging, and a
 * "See all" action instead. The action is a link to Discover's Nonprofits tab,
 * or `onSeeAll` when the caller switches tabs itself (Discover).
 * `onResults(orgs)` hands the loaded rows to a caller (Discover's map dots).
 */
export default function WebNonprofits({ q = '', near = '', causes = [], kind = 'all', heading = '', limit: cap = 0, area = null, onOpen, onClear, onCount, onResults, onSeeAll, id }) {
  const router = useRouter();
  const [allStates, setAllStates] = useState(false);
  const [result, setResult] = useState({ status: 'idle', orgs: [], total: 0, more: false, page: 0 });
  const [loadingMore, setLoadingMore] = useState(false);
  const preview = Number(cap) > 0 ? Math.floor(Number(cap)) : 0;
  const [limit, setLimit] = useState(PAGE);
  const shown = preview || limit;
  const [nonce, setNonce] = useState(0);

  const causeKey = (causes || []).join('|');
  const hidden = kind === 'student';
  const homeState = parseState(near);
  const state = allStates ? '' : homeState;
  const queries = buildQueries({ q, causes, state });
  // The town list stands in only when there is nothing else to search by.
  const town = !queries.length && area && area.city && area.state ? { city: String(area.city), state: String(area.state) } : null;
  const queryKey = JSON.stringify(town ? { town } : queries);

  // A new search starts back inside the student's own state.
  useEffect(() => {
    setAllStates(false);
  }, [q, near, causeKey]);

  useEffect(() => {
    let alive = true;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const signal = ctrl ? ctrl.signal : undefined;
    if (hidden || (!queries.length && !town)) {
      setResult({ status: 'idle', orgs: [], total: 0, more: false, page: 0 });
      return undefined;
    }
    setResult((r) => ({ ...r, status: 'loading' }));
    setLimit(PAGE);
    const t = setTimeout(async () => {
      if (town) {
        try {
          const orgs = await fetchArea(town, signal);
          if (!alive || isCancelled(null, signal)) return;
          // Every row is on hand, so the count is exact and nothing pages upstream.
          setResult({ status: 'done', orgs, total: orgs.length, more: false, page: 0 });
        } catch (err) {
          if (!alive || isCancelled(err, signal)) return;
          console.error('[nonprofits] town list failed', town, err);
          setResult({ status: 'error', orgs: [], total: 0, more: false, page: 0 });
        }
        return;
      }
      const settled = await Promise.allSettled(queries.map((x) => fetchSearch({ ...x, page: 0 }, signal)));
      if (!alive || isCancelled(null, signal)) return;
      const ok = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      if (!ok.length) {
        if (settled.some((r) => r.status === 'rejected' && isCancelled(r.reason, signal))) return;
        settled.forEach((r) => r.status === 'rejected' && console.error('[nonprofits] search failed', r.reason));
        setResult({ status: 'error', orgs: [], total: 0, more: false, page: 0 });
        return;
      }
      setResult({
        status: 'done',
        orgs: interleave(ok.map((d) => d.organizations || [])),
        total: ok.reduce((a, d) => a + (Number(d.total) || 0), 0),
        more: ok.some((d) => (d.pages || 0) > 1),
        page: 0,
      });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
      if (ctrl) ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, hidden, nonce]);

  useEffect(() => {
    if (!onCount) return;
    onCount(hidden || result.status !== 'done' ? null : { total: result.total, state: town ? town.state : state, city: town ? town.city : '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.status, result.total, hidden, state, town && town.city]);

  useEffect(() => {
    if (!onResults) return;
    onResults(hidden || result.status !== 'done' ? [] : result.orgs.slice(0, shown));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.status, result.orgs, hidden, shown]);

  async function loadMore() {
    if (loadingMore) return;
    // Rows already fetched are shown first; the next upstream page comes after.
    if (result.orgs.length >= limit + PAGE || (!result.more && result.orgs.length > limit)) {
      setLimit((l) => l + PAGE);
      return;
    }
    setLoadingMore(true);
    const page = result.page + 1;
    const settled = await Promise.allSettled(queries.map((x) => fetchSearch({ ...x, page })));
    const ok = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    setLoadingMore(false);
    if (unloading) return;
    if (!ok.length) {
      setResult((r) => ({ ...r, moreError: true }));
      return;
    }
    setResult((r) => ({
      ...r,
      moreError: false,
      orgs: interleave([r.orgs, interleave(ok.map((d) => d.organizations || []))]),
      more: ok.some((d) => (d.pages || 0) > page + 1),
      page,
    }));
    setLimit((l) => l + PAGE);
  }

  function open(o) {
    if (onOpen) onOpen(o);
    else router.push(`/discover?ein=${o.ein}`);
  }

  if (hidden) return null;
  if (!queries.length && !town) {
    // A preview with nothing to search by is left out; the full list asks for a search.
    if (!onClear || preview) return null;
    return (
      <Section id={id} title={heading || 'Nonprofits'}>
        <Notice title="Search nonprofits by name or cause" body="Type a cause above, or enter a city or ZIP to see nonprofits in your state." />
      </Section>
    );
  }

  const term = String(q || '').trim();
  const where = state ? ` in ${stateName(state)}` : '';
  const title = heading || (town ? `Nonprofits in ${town.city}` : term ? `Nonprofits for “${term}”${where}` : `Nonprofits${where || ' in every state'}`);
  const source = town ? `${town.city}, ${stateName(town.state)}` : state ? stateName(state) : '';
  const done = result.status === 'done' && result.orgs.length > 0;
  // A town preview that found nothing has nothing to say, so it's left out.
  if (town && preview && result.status === 'done' && !result.orgs.length) return null;
  const seeAllLabel = result.total ? `See all ${formatCount(result.total)}` : 'See all nonprofits';
  const seeAll = !preview || !done ? null : onSeeAll ? (
    <button type="button" onClick={onSeeAll} className="vu-link-ul" style={S(`flex:none;background:none;border:0;padding:0;cursor:pointer;font:500 14px/1.3 ${F.body};color:${C.ink}`)}>
      {seeAllLabel}
    </button>
  ) : (
    <Link href={discoverHref({ q, near, causes })} className="vu-link-ul" style={S(`flex:none;font:500 14px/1.3 ${F.body};color:${C.ink}`)}>
      {seeAllLabel}
    </Link>
  );

  return (
    <Section id={id} title={title} action={seeAll} note={done ? `From IRS nonprofit records${source ? ` for ${source}` : ''}.` : ''}>
      {result.status === 'loading' || result.status === 'idle' ? (
        <div style={S('padding-top:8px')} aria-busy="true" aria-label="Searching nonprofits">
          <SkeletonRows n={3} h={56} />
        </div>
      ) : result.status === 'error' ? (
        <Notice
          alert
          title="Nonprofit search is down right now"
          body="Opportunities on VolunteerU still work. Try again in a minute."
          action="Try again"
          onAction={() => setNonce((n) => n + 1)}
        />
      ) : !result.orgs.length ? (
        <Notice
          title={term ? `Nothing for “${term}”${where}` : `No nonprofits found${where}`}
          body={state ? 'Try a shorter word, or search every state.' : 'Try a shorter word or a different spelling.'}
          action={state ? 'Search all states' : onClear ? 'Clear search' : ''}
          onAction={state ? () => setAllStates(true) : onClear}
        />
      ) : (
        <>
          <ul className="vu-np-grid" style={S('list-style:none;margin:12px 0 0;padding:0')}>
            {result.orgs.slice(0, shown).map((o) => (
              <li key={o.ein} style={S('min-width:0')}>
                <NonprofitRow name={titleCase(o.name)} parts={[causeText(o.cause), placeText(o)]} onClick={() => open(o)} />
              </li>
            ))}
          </ul>
          {!preview && (result.more || result.orgs.length > limit) ? (
            <div style={S('margin-top:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap')}>
              <Button size="sm" onClick={loadMore} busy={loadingMore}>
                {loadingMore ? 'Loading nonprofits' : result.moreError ? 'Try again' : 'Show more nonprofits'}
              </Button>
              {result.moreError ? (
                <span role="alert" style={S(`font:400 13px/1.45 ${F.body};color:${C.emberDeep}`)}>
                  More nonprofits didn&apos;t load. Check your connection and try again.
                </span>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Section>
  );
}

function Section({ id, title, action, note, children }) {
  return (
    <section id={id} aria-label={title} style={S('min-width:0;scroll-margin-top:24px')}>
      <div className="vu-sec-head">
        <h2 style={S(`margin:0;min-width:0;font:650 22px/1.15 ${F.display};letter-spacing:-0.02em;color:${C.ink};overflow-wrap:anywhere`)}>{title}</h2>
        {action || null}
      </div>
      {note ? <p style={S(`margin:6px 0 4px;font:400 13px/1.45 ${F.body};color:${C.ink2}`)}>{note}</p> : null}
      {children}
    </section>
  );
}

function Notice({ title, body, action, onAction, alert }) {
  return (
    <div role={alert ? 'alert' : undefined} style={S(`margin-top:12px;padding:20px 0 4px;border-top:1px solid ${C.line}`)}>
      <div style={S(`font:600 16px/1.3 ${F.body};color:${C.ink}`)}>{title}</div>
      <div style={S(`margin-top:4px;font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>{body}</div>
      {action && onAction ? (
        <div style={S('margin-top:14px')}>
          <Button size="sm" icon={alert ? 'refresh' : undefined} onClick={onAction}>
            {action}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ---- detail (?ein=) --------------------------------------------------------- */

function formatEin(ein) {
  const s = String(ein || '').padStart(9, '0');
  return `${s.slice(0, 2)}-${s.slice(2)}`;
}

/** "$77,000", "$1.2 million", rounded to two significant figures. */
export function formatMoney(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  const round2 = (v) => Number(v.toPrecision(2));
  if (abs >= 1e9) return `$${round2(n / 1e9)} billion`;
  if (abs >= 1e6) return `$${round2(n / 1e6)} million`;
  if (abs >= 1000) return `$${round2(n).toLocaleString('en-US')}`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

const LINK = `font:500 14px/1.3 ${F.body};color:${C.ink}`;

/** Nonprofit detail, loaded from /api/nonprofits?ein=. Rendered inside a dialog on Discover. */
export function NonprofitDetail({ ein }) {
  const [st, setSt] = useState({ status: 'loading', org: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    setSt({ status: 'loading', org: null });
    (async () => {
      try {
        const res = await fetch(`/api/nonprofits?ein=${encodeURIComponent(ein)}`, { signal: ctrl ? ctrl.signal : undefined });
        const data = await res.json().catch(() => null);
        if (!alive) return;
        if (res.status === 404 || res.status === 400) return setSt({ status: 'missing', org: null });
        if (!res.ok || !data || !data.organization) throw new Error((data && data.error) || `status ${res.status}`);
        setSt({ status: 'done', org: data.organization });
      } catch (err) {
        if (!alive || isCancelled(err, ctrl && ctrl.signal)) return;
        console.error('[nonprofits] detail failed', ein, err);
        setSt({ status: 'error', org: null });
      }
    })();
    return () => {
      alive = false;
      if (ctrl) ctrl.abort();
    };
  }, [ein, nonce]);

  if (st.status === 'loading') {
    return (
      <div aria-busy="true" aria-label="Loading nonprofit">
        <SkeletonRows n={3} h={44} />
      </div>
    );
  }
  if (st.status === 'missing') {
    return <Notice title="We couldn't find that nonprofit" body={`No IRS record matches # ${formatEin(ein)}. Search for it by name instead.`} />;
  }
  if (st.status === 'error') {
    return <Notice alert title="We couldn't load this nonprofit" body="Check your connection and try again." action="Try again" onAction={() => setNonce((n) => n + 1)} />;
  }

  const o = st.org;
  const name = titleCase(o.name);
  const street = titleCase(o.address);
  const cityLine = [titleCase(o.city), [o.state, o.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const mapQuery = [street, cityLine].filter(Boolean).join(', ');
  const facts = [
    causeText(o.cause) ? ['Cause', causeText(o.cause)] : null,
    ['Type', o.is501c3 ? '501(c)(3) charity' : 'Tax-exempt organization'],
    o.rulingYear ? ['Tax-exempt since', o.rulingYear] : null,
    o.revenue != null ? ['Revenue', `${formatMoney(o.revenue)}${o.revenueYear ? ` (${o.revenueYear})` : ''}`] : null,
    ['IRS #', formatEin(o.ein)],
  ].filter(Boolean);

  return (
    <div style={S('display:flex;flex-direction:column;gap:20px;min-width:0')}>
      <div style={S('min-width:0')}>
        <h3 style={S(`margin:0;font:600 22px/1.2 ${F.display};letter-spacing:-0.015em;color:${C.ink};overflow-wrap:anywhere`)}>{name}</h3>
        <div style={S(`margin-top:4px;font:400 14px/1.4 ${F.body};color:${C.ink2}`)}>
          {[placeText(o), causeText(o.cause)].filter(Boolean).map((t, i) => (
            <span key={t}>
              {i ? <span className="vu-sep" aria-hidden="true">{' · '}</span> : null}
              {t}
            </span>
          ))}
        </div>
      </div>
      {mapQuery ? (
        <div>
          <div style={S(`font:600 13px/1.2 ${F.body};color:${C.ink}`)}>Address</div>
          <div style={S(`margin-top:6px;font:400 15px/1.5 ${F.body};color:${C.ink}`)}>
            {street ? <div>{street}</div> : null}
            <div>{cityLine}</div>
          </div>
          <a
            href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(mapQuery)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="vu-link-ul"
            style={S(`display:inline-flex;align-items:center;gap:6px;margin-top:8px;${LINK}`)}
          >
            Open in OpenStreetMap <Icon name="external" size={14} />
          </a>
        </div>
      ) : null}
      <dl style={S(`margin:0;display:grid;grid-template-columns:auto 1fr;gap:10px 20px;padding-top:16px;border-top:1px solid ${C.line}`)}>
        {facts.map(([k, v]) => (
          <div key={k} style={S('display:contents')}>
            <dt style={S(`font:400 14px/1.4 ${F.body};color:${C.ink2}`)}>{k}</dt>
            <dd style={S(`margin:0;font:500 14px/1.4 ${F.body};color:${C.ink};font-variant-numeric:tabular-nums`)}>{v}</dd>
          </div>
        ))}
      </dl>
      <div style={S(`font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>
        {name} is listed from IRS records and doesn&apos;t post shifts on VolunteerU. Their website is the place to ask about volunteering.
      </div>
      <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>
        <Button variant="primary" href={siteSearchUrl(o)} target="_blank" rel="noopener noreferrer" icon="external">
          Find their website
        </Button>
        <Button href={o.url} target="_blank" rel="noopener noreferrer">
          View on ProPublica
        </Button>
      </div>
    </div>
  );
}
