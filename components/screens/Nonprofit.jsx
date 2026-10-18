'use client';

/* ==========================================================================
   Nonprofit.jsx, a registered nonprofit's page (/nonprofits/<ein>).

   Everything on it is real: the IRS record from ProPublica (address, cause,
   501(c) type, the year it became tax-exempt, its latest filed return), a
   website only when Wikidata lists one, a map of the street address, and
   VolunteerU listings that name this organization. No mission sentence or
   number is made up. A field the record lacks is left out.

   Actions: Start a student project with them (opens /create with this
   nonprofit as the site), Save (into the same saved list as listings, as
   "np:<ein>"), Share (copies this page's link) and View IRS filings.

   Layout follows CARDS.md: the name leads, facts are a plain definition
   list beside the map, open shifts are ordinary listing cards.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { S } from '../../lib/style.js';
import { C, F } from '../../lib/tokens.js';
import { Button, Icon, ErrorState, SkeletonRows } from '../ui.jsx';
import { ListingCard, Sep } from '../vu/index.js';
import { AddressMap } from '../MapPanel.jsx';
import { useSnapshot } from '../../lib/store.js';
import { toggleSaved, copyText } from '../../lib/db.js';
import { toast } from '../../lib/overlays.js';
import { searchListings } from '../../lib/listings.js';
import { usePhotoPicker } from '../../lib/photos.js';
import { partnerHref } from '../../lib/partnerPrefill.js';
import { liveCardProps } from './Misc.jsx';
import { titleCase, causeText, siteSearchUrl, formatEin, formatMoney } from '../WebNonprofits.jsx';

const COPIED_MS = 2500;
/* Corporate suffixes dropped before matching listings by name. */
const SUFFIX_RX = /[\s,]+(inc\.?|incorporated|corp\.?|corporation|co\.?|ltd\.?|llc|nfp|n\.f\.p\.)$/i;

/** The saved-list id for a nonprofit, kept apart from listing ids. */
export const savedNonprofitId = (ein) => `np:${ein}`;

/** "Carmel Youth Assistance" from "CARMEL YOUTH ASSISTANCE INC". */
export function matchName(name) {
  let s = titleCase(name).trim();
  for (let i = 0; i < 2; i++) s = s.replace(SUFFIX_RX, '').trim();
  return s;
}

const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* IRS street lines are in capitals; title case them, but keep PO Box. */
function streetText(address) {
  return titleCase(address).replace(/\bP\.?\s*O\.?\s*Box\b/i, 'PO Box');
}

const NP_CSS = `
.np-wrap { max-width:1120px; }
.np-crumb { font:500 14px/1.3 var(--f-body); color:var(--ink); }
.np-h1 { margin:14px 0 0; font:700 40px/1.06 var(--f-display); letter-spacing:-0.03em; color:var(--ink); overflow-wrap:anywhere; text-wrap:balance; }
.np-sub { margin:8px 0 0; font:400 16px/1.45 var(--f-body); color:var(--ink-2); }
.np-acts { margin-top:24px; display:flex; flex-wrap:wrap; align-items:center; gap:10px 12px; }
.np-acts .np-irs { margin-left:4px; display:inline-flex; align-items:center; gap:6px; font:600 14px/1.3 var(--f-body); color:var(--ink); }
.np-grid { margin-top:44px; display:grid; grid-template-columns:minmax(0, 1fr) 340px; gap:56px; align-items:start; }
.np-sec + .np-sec { margin-top:56px; }
.np-h2 { margin:0; font:650 22px/1.15 var(--f-display); letter-spacing:-0.02em; color:var(--ink); }
.np-addr { margin-top:14px; font:400 15px/1.5 var(--f-body); color:var(--ink); }
.np-addr-links { margin-top:8px; display:flex; flex-wrap:wrap; gap:8px 18px; }
.np-addr-links a { display:inline-flex; align-items:center; gap:6px; font:600 14px/1.3 var(--f-body); color:var(--ink); }
.np-map { margin-top:16px; border-radius:16px; overflow:hidden; }
.np-facts { padding-top:4px; }
.np-dl { margin:14px 0 0; padding:0; }
.np-dl > div { display:grid; grid-template-columns:132px minmax(0, 1fr); gap:12px; padding:12px 0; border-bottom:1px solid var(--line); }
.np-dl > div:first-child { border-top:1px solid var(--line); }
.np-dl dt { font:400 14px/1.4 var(--f-body); color:var(--ink-2); }
.np-dl dd { margin:0; font:500 14px/1.4 var(--f-body); color:var(--ink); font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
.np-dl dd a { font-weight:600; }
.np-src { margin:14px 0 0; font:400 13px/1.45 var(--f-body); color:var(--ink-2); }
.np-empty { margin:14px 0 0; max-width:560px; font:400 15px/1.5 var(--f-body); color:var(--ink-2); }
.np-empty a { font-weight:600; color:var(--ink); }
.np-cards { margin-top:16px; }
@media (max-width:1023px) {
  .np-grid { grid-template-columns:minmax(0, 1fr); gap:44px; }
}
@media (max-width:719px) {
  .np-h1 { font-size:30px; }
  .np-grid { margin-top:32px; }
  .np-sec + .np-sec { margin-top:44px; }
  .np-dl > div { grid-template-columns:120px minmax(0, 1fr); }
}
`;

/** Loads the record in the browser when the server couldn't (ProPublica was down). */
function useOrganization(ein, initial) {
  const [st, setSt] = useState(() => (initial ? { status: 'done', org: initial } : { status: 'loading', org: null }));
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (initial && nonce === 0) return undefined;
    let alive = true;
    const ctrl = new AbortController();
    setSt({ status: 'loading', org: null });
    (async () => {
      try {
        const res = await fetch(`/api/nonprofits?ein=${encodeURIComponent(ein)}`, { signal: ctrl.signal });
        const data = await res.json().catch(() => null);
        if (!alive) return;
        if (res.status === 404 || res.status === 400) return setSt({ status: 'missing', org: null });
        if (!res.ok || !data || !data.organization) throw new Error((data && data.error) || `status ${res.status}`);
        setSt({ status: 'done', org: data.organization });
      } catch (err) {
        if (!alive || (err && err.name === 'AbortError')) return;
        console.error('[nonprofit] load failed', ein, err);
        setSt({ status: 'error', org: null });
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [ein, initial, nonce]);
  return [st, () => setNonce((n) => n + 1)];
}

/** VolunteerU listings whose name or site names this nonprofit. */
function useShiftsHere(name) {
  const [st, setSt] = useState({ status: 'loading', rows: [] });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    const key = norm(name);
    if (key.length < 4) {
      setSt({ status: 'done', rows: [] });
      return undefined;
    }
    setSt({ status: 'loading', rows: [] });
    searchListings({ q: name })
      .then((rows) => {
        if (!alive) return;
        // The search also reads missions and bios; only a listing whose own
        // name, site or address names the organization counts as theirs.
        const mine = (rows || []).filter((l) => [l.name, l.site, l.location].some((f) => norm(f).includes(key)));
        setSt({ status: 'done', rows: mine });
      })
      .catch((err) => {
        console.error('[nonprofit] listings failed', name, err);
        if (alive) setSt({ status: 'error', rows: [] });
      });
    return () => {
      alive = false;
    };
  }, [name, nonce]);
  return [st, () => setNonce((n) => n + 1)];
}

export default function Nonprofit({ ein, initial = null }) {
  const [st, retry] = useOrganization(ein, initial);

  if (st.status === 'loading') {
    return (
      <div className="vu-page" aria-busy="true" aria-label="Loading nonprofit">
        <div className="vu-skel" style={S('height:40px;width:min(520px, 80%);border-radius:10px')} />
        <div className="vu-skel" style={S('margin-top:14px;height:16px;width:min(260px, 60%);border-radius:10px')} />
        <div style={S('margin-top:40px')}>
          <SkeletonRows n={4} h={44} />
        </div>
      </div>
    );
  }
  if (st.status === 'missing') return <NonprofitMissing />;
  if (st.status === 'error') {
    return (
      <div className="vu-page">
        <ErrorState title="We couldn't load this nonprofit" body="The IRS records service didn't answer. Check your connection and try again." onRetry={retry} />
      </div>
    );
  }
  return <NonprofitBody org={st.org} />;
}

function NonprofitBody({ org: o }) {
  const { state } = useSnapshot();
  const name = titleCase(o.name);
  const city = titleCase(o.city);
  const place = [city, o.state].filter(Boolean).join(', ');
  const cause = causeText(o.cause);
  const street = streetText(o.address);
  const poBox = /\bPO Box\b/.test(street);
  const zip5 = String(o.zip || '').slice(0, 5);
  const full = [street, city, [o.state, zip5].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const mappable = Boolean(street && city && !poBox);
  const savedId = savedNonprofitId(o.ein);
  const saved = (state.saved || []).includes(savedId);
  const [copied, setCopied] = useState(false);
  const findName = matchName(o.name);
  const [shifts, retryShifts] = useShiftsHere(findName);
  const photos = usePhotoPicker(shifts.rows);
  const createHref = partnerHref({ name: findName || name, street: poBox ? '' : street, city, state: o.state, ein: o.ein });
  const areaHref = city && o.state ? `/discover?${new URLSearchParams({ view: 'nonprofits', near: `${city}, ${o.state}` }).toString()}` : '/discover?view=nonprofits';

  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);

  function save() {
    const now = toggleSaved(savedId);
    toast({
      title: now ? 'Saved' : 'Removed from saved',
      message: name,
      tone: now ? 'ok' : 'brand',
      actionLabel: 'Undo',
      onAction: () => toggleSaved(savedId),
    });
  }

  async function share() {
    const url = `${window.location.origin}/nonprofits/${o.ein}`;
    const ok = await copyText(url);
    if (ok) setCopied(true);
    else toast({ title: "Couldn't copy", message: `Copy this link yourself: ${url}`, tone: 'warn' });
  }

  const filing = o.filing || null;
  const facts = [
    cause ? ['Cause', o.nteeCode ? `${cause} (NTEE ${o.nteeCode})` : cause] : null,
    o.orgType ? ['Type', o.orgType] : o.subsection ? ['Type', `${o.subsection} tax-exempt organization`] : null,
    o.rulingYear ? ['Tax-exempt since', o.rulingYear] : null,
    filing && filing.year
      ? ['Latest filing', filing.pdfUrl ? (
          <a href={filing.pdfUrl} target="_blank" rel="noopener noreferrer" className="vu-link-ul">
            {`${filing.year} Form ${filing.form || '990'}`}
            <span className="vu-sr"> (PDF, opens in a new tab)</span>
          </a>
        ) : `${filing.year} Form ${filing.form || '990'}`]
      : null,
    filing && filing.revenue !== null && filing.revenue !== undefined ? [`Revenue${filing.year ? ` (${filing.year})` : ''}`, formatMoney(filing.revenue)] : null,
    filing && filing.expenses !== null && filing.expenses !== undefined ? [`Expenses${filing.year ? ` (${filing.year})` : ''}`, formatMoney(filing.expenses)] : null,
    o.website
      ? ['Website', (
          <a href={o.website} target="_blank" rel="noopener noreferrer" className="vu-link-ul">
            {o.website.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')}
          </a>
        )]
      : null,
    ['EIN', formatEin(o.ein)],
  ].filter(Boolean);

  return (
    <div className="vu-page np-page">
      <style dangerouslySetInnerHTML={{ __html: NP_CSS }} />
      <div className="np-wrap">
        <nav aria-label="Breadcrumb">
          <Link href={areaHref} className="vu-link-ul np-crumb">
            {city ? `Nonprofits in ${city}` : 'Nonprofits'}
          </Link>
        </nav>

        <header>
          <h1 className="np-h1">{name}</h1>
          {cause || place ? (
            <p className="np-sub">
              {[cause, place].filter(Boolean).map((t, i) => (
                <span key={t}>
                  {i ? <Sep /> : null}
                  {t}
                </span>
              ))}
            </p>
          ) : null}
          <div className="np-acts">
            <Button variant="primary" href={createHref} icon="plus">
              Start a student project with them
            </Button>
            <Button variant="outline" icon="bookmark" onClick={save} aria-pressed={saved} aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}>
              {saved ? 'Saved' : 'Save'}
            </Button>
            <Button variant="outline" icon={copied ? 'check' : 'share'} onClick={share}>
              {copied ? 'Link copied' : 'Share'}
            </Button>
            <span className="vu-sr" aria-live="polite">
              {copied ? 'Link copied' : ''}
            </span>
            <a href={o.url} target="_blank" rel="noopener noreferrer" className="vu-link-ul np-irs">
              View IRS filings
              <Icon name="external" size={14} />
            </a>
          </div>
        </header>

        <div className="np-grid">
          <div style={S('min-width:0')}>
            <section className="np-sec" aria-labelledby="np-where-h">
              <h2 id="np-where-h" className="np-h2">
                {poBox ? 'Mailing address' : 'Where they are'}
              </h2>
              {mappable ? (
                // The map shows the address under it with Directions and Open in Maps.
                <div className="np-map">
                  <AddressMap address={full} />
                </div>
              ) : full ? (
                <>
                  <div className="np-addr">
                    {street ? <div>{street}</div> : null}
                    <div>{[city, [o.state, zip5].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</div>
                  </div>
                  {poBox ? <p className="np-src">The IRS has a PO box for them, so there&apos;s no street address to map.</p> : null}
                </>
              ) : (
                <p className="np-empty">The IRS record has no address for them.</p>
              )}
            </section>

            <section className="np-sec" aria-labelledby="np-shifts-h">
              <h2 id="np-shifts-h" className="np-h2">Open shifts here</h2>
              {shifts.status === 'loading' ? (
                <div style={S('margin-top:16px')}>
                  <SkeletonRows n={2} h={64} />
                </div>
              ) : shifts.status === 'error' ? (
                <ErrorState title="Shifts didn't load" body="Check your connection and try again." onRetry={retryShifts} />
              ) : shifts.rows.length ? (
                <div className="vu-grid-2 np-cards">
                  {shifts.rows.map((l) => (
                    <ListingCard key={l.id} {...liveCardProps(l)} photo={photos.get(l.id)} />
                  ))}
                </div>
              ) : (
                <p className="np-empty">
                  Nobody has posted a shift with {name} on VolunteerU yet.{' '}
                  <Link href={createHref} className="vu-link-ul">
                    Start a student project with them
                  </Link>{' '}
                  and it shows up here.
                </p>
              )}
            </section>
          </div>

          <aside className="np-facts" aria-labelledby="np-facts-h">
            <h2 id="np-facts-h" className="np-h2">From IRS records</h2>
            <dl className="np-dl">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="np-src">
              IRS data through ProPublica Nonprofit Explorer{o.website ? ', website from Wikidata' : ''}. VolunteerU hasn&apos;t reviewed this organization.
            </p>
            {!o.website ? (
              <p className="np-src" style={S('margin-top:8px')}>
                <a href={siteSearchUrl(o)} target="_blank" rel="noopener noreferrer" className="vu-link-ul" style={S(`font:500 13px/1.45 ${F.body};color:${C.ink}`)}>
                  Find their website
                </a>
              </p>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

/** The page for a malformed or unknown EIN. */
export function NonprofitMissing() {
  return (
    <div className="vu-page">
      <div style={S('max-width:640px')}>
        <h1 className="vu-t-h1">We couldn&apos;t find that nonprofit</h1>
        <p style={S(`margin:12px 0 0;font:400 16px/1.5 ${F.body};color:${C.ink2}`)}>
          No IRS record matches this link. It may have a typo, or the organization may no longer be tax-exempt.
        </p>
        <div style={S('margin-top:24px')}>
          <Button variant="dark" href="/discover?view=nonprofits" icon="search">
            Search nonprofits
          </Button>
        </div>
      </div>
    </div>
  );
}
