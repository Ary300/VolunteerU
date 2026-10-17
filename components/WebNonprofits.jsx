'use client';

/* ==========================================================================
   WebNonprofits.jsx, nonprofit search from IRS records (ProPublica proxy at
   /api/nonprofits). Rows open the nonprofit's detail (?ein= on Discover),
   which shows its address, IRS number and links to its website and filings.
   Hidden when Discover is set to student projects only.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { S, cx, H } from '../lib/style.js';
import { parseState } from '../lib/listings.js';
import { SkeletonRows, Icon } from './ui.jsx';

const MONO = "'Geist Mono',monospace";
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
   to the student's saved area on its own. */
function discoverHref({ q, near, causes }) {
  const params = new URLSearchParams();
  const term = String(q || '').trim();
  const city = String(near || '').replace(/\b\d{5}(?:-\d{4})?\b/g, '').replace(/\s+/g, ' ').trim();
  if (term) params.set('q', term);
  if (city) params.set('near', city);
  if ((causes || []).length) params.set('causes', causes.join('|'));
  const qs = params.toString();
  return `/discover${qs ? `?${qs}` : ''}#nonprofits`;
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

/**
 * `limit` caps the list for a preview (Home): only that many rows, no paging,
 * and a "See all nonprofits" link to Discover instead.
 */
export default function WebNonprofits({ q = '', near = '', causes = [], kind = 'all', heading = '', limit: cap = 0, onOpen, onClear, onCount, id }) {
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
  const queryKey = JSON.stringify(queries);

  // A new search starts back inside the student's own state.
  useEffect(() => {
    setAllStates(false);
  }, [q, near, causeKey]);

  useEffect(() => {
    let alive = true;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const signal = ctrl ? ctrl.signal : undefined;
    if (hidden || !queries.length) {
      setResult({ status: 'idle', orgs: [], total: 0, more: false, page: 0 });
      return undefined;
    }
    setResult((r) => ({ ...r, status: 'loading' }));
    setLimit(PAGE);
    const t = setTimeout(async () => {
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
    onCount(hidden || result.status !== 'done' ? null : { total: result.total, state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.status, result.total, hidden, state]);

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
  if (!queries.length) {
    if (!onClear) return null;
    return (
      <Section id={id} title={heading || 'Nonprofits'} count="">
        <Notice title="Search nonprofits by name or cause" body="Type a cause above, or enter a city or ZIP to see nonprofits in your state." />
      </Section>
    );
  }

  const term = String(q || '').trim();
  const where = state ? ` in ${stateName(state)}` : '';
  const title = heading || (term ? `Nonprofits for “${term}”${where}` : `Nonprofits${where || ' in every state'}`);
  const count = result.status === 'done' && result.total ? `${formatCount(result.total)} found` : '';

  return (
    <Section id={id} title={title} count={count}>
      {result.status === 'loading' || result.status === 'idle' ? (
        <div style={S('padding:16px 20px')} aria-busy="true" aria-label="Searching nonprofits">
          <SkeletonRows n={3} h={52} />
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
          <ul style={S('list-style:none;margin:0;padding:0')}>
            {result.orgs.slice(0, shown).map((o) => (
              <li key={o.ein} style={S('border-bottom:1px solid #F1EBE4')}>
                <button
                  type="button"
                  onClick={() => open(o)}
                  className={H.row}
                  aria-label={`${titleCase(o.name)}, ${[titleCase(o.city), o.state].filter(Boolean).join(', ')}`}
                  style={S('width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px 20px;text-align:left;background:none;border:0;cursor:pointer;color:inherit;transition:background .16s ease')}
                >
                  <span style={S('min-width:0;display:block')}>
                    <span style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                      <span style={S('font:600 15px/1.25 Geist;color:#1A1714')}>{titleCase(o.name)}</span>
                      <span style={S(`padding:3px 8px;border-radius:6px;background:#F6F2EE;font:500 10px/1 ${MONO};color:#57504A`)}>{o.cause}</span>
                    </span>
                    <span style={S('display:block;margin-top:5px;font:450 13px/1.4 Geist;color:#8A8179')}>
                      {[titleCase(o.city), o.state].filter(Boolean).join(', ')}
                    </span>
                  </span>
                  <Icon name="chevron-right" color="#BEB5AC" />
                </button>
              </li>
            ))}
          </ul>
          <div style={S('padding:13px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
            <div style={S('font:450 12px/1.5 Geist;color:#8A8179')}>
              From IRS nonprofit records. Open one to see its address and website.
            </div>
            {preview ? (
              <Link
                href={discoverHref({ q, near, causes })}
                className={cx(H.secondary, H.press)}
                style={S('flex:none;display:inline-flex;align-items:center;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#332D28;text-decoration:none')}
              >
                See all nonprofits
              </Link>
            ) : result.more || result.orgs.length > limit ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className={cx(H.secondary, H.press)}
                style={S('flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#332D28;cursor:pointer')}
              >
                {loadingMore ? 'Loading' : result.moreError ? 'Try again' : 'Show more nonprofits'}
              </button>
            ) : null}
          </div>
        </>
      )}
    </Section>
  );
}

function Section({ id, title, count, children }) {
  return (
    <section id={id} aria-label={title} style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden;scroll-margin-top:16px')}>
      <div style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
        <h2 style={S('margin:0;font:600 16px/1.3 Geist;letter-spacing:-0.02em;color:#1A1714')}>{title}</h2>
        {count ? <div style={S(`font:500 12px/1 ${MONO};color:#8A8179`)}>{count}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Notice({ title, body, action, onAction, alert }) {
  return (
    <div role={alert ? 'alert' : undefined} style={S('padding:26px 20px;text-align:center')}>
      <div style={S('font:600 15px/1.3 Geist;color:#1A1714')}>{title}</div>
      <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#8A8179')}>{body}</div>
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className={cx(H.secondary, H.press)}
          style={S('margin-top:14px;padding:0 16px;height:38px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer')}
        >
          {action}
        </button>
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
  const street = titleCase(o.address);
  const cityLine = [titleCase(o.city), [o.state, o.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const mapQuery = [street, cityLine].filter(Boolean).join(', ');
  const facts = [
    ['Cause', o.cause],
    ['Type', o.is501c3 ? '501(c)(3) charity' : 'Tax-exempt organization'],
    o.rulingYear ? ['Tax-exempt since', o.rulingYear] : null,
    o.revenue != null ? ['Revenue', `${formatMoney(o.revenue)}${o.revenueYear ? ` (${o.revenueYear})` : ''}`] : null,
    ['IRS #', formatEin(o.ein)],
  ].filter(Boolean);

  return (
    <div style={S('display:flex;flex-direction:column;gap:18px')}>
      <h3 style={S('margin:0;font:600 20px/1.25 Geist;letter-spacing:-0.025em;color:#1A1714')}>{titleCase(o.name)}</h3>
      {mapQuery ? (
        <div>
          <div style={S('font:500 12px/1 Geist;color:#8A8179')}>Address</div>
          <div style={S('margin-top:7px;font:450 15px/1.5 Geist;color:#1A1714')}>
            {street ? <div>{street}</div> : null}
            <div>{cityLine}</div>
          </div>
          <a
            href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(mapQuery)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={H.link}
            style={S('display:inline-block;margin-top:8px;font:500 13px/1 Geist;color:#C2603C;text-decoration:none')}
          >
            Open in OpenStreetMap
          </a>
        </div>
      ) : null}
      <dl style={S('margin:0;display:grid;grid-template-columns:auto 1fr;gap:10px 18px')}>
        {facts.map(([k, v]) => (
          <div key={k} style={S('display:contents')}>
            <dt style={S('font:450 13px/1.4 Geist;color:#8A8179')}>{k}</dt>
            <dd style={S('margin:0;font:500 13px/1.4 Geist;color:#1A1714')}>{v}</dd>
          </div>
        ))}
      </dl>
      <div style={S('font:450 13px/1.55 Geist;color:#6B635C')}>
        {titleCase(o.name)} doesn&apos;t post shifts on VolunteerU. Their website is the place to ask about volunteering.
      </div>
      <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>
        <a
          href={siteSearchUrl(o)}
          target="_blank"
          rel="noopener noreferrer"
          className={cx(H.primary, H.press)}
          style={S('display:inline-flex;align-items:center;padding:0 18px;height:44px;border-radius:12px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 14px/1 Geist;text-decoration:none')}
        >
          Find their website
        </a>
        <a
          href={o.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cx(H.secondary, H.press)}
          style={S('display:inline-flex;align-items:center;padding:0 16px;height:44px;border-radius:12px;border:1px solid #E4DDD4;background:#fff;color:#332D28;font:600 14px/1 Geist;text-decoration:none')}
        >
          View on ProPublica
        </a>
      </div>
    </div>
  );
}
