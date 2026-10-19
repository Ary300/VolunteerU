'use client';

/* ==========================================================================
   Nonprofit.jsx, a registered nonprofit's page (/nonprofits/<ein>).

   Everything on it is real: the IRS record from ProPublica (address, cause,
   501(c) type, the year it became tax-exempt, its latest filed return), the
   website and phone from their latest IRS e-filed return (or Wikidata), the
   volunteer page their own homepage links to (lib/nonprofitLinks.js), a map
   of the street address, and VolunteerU listings it posted (by EIN) or
   that name it. No mission sentence or number is made up. A field no source
   has is left out, and when there's no way to reach them the page says so.

   Actions, in the order a volunteer needs them: Volunteer with them (their
   volunteer page; Visit website when only their homepage is known, the
   name the map's popup uses too), Visit website, Call, Directions,
   Save (into the same saved list as listings, as "np:<ein>") and Share
   (the phone's share sheet, or copies this page's link). Open VolunteerU
   shifts with this organization come first on the page, each with Sign up.
   Starting a student project with them is a quieter link under the shifts.

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
import { directionsHref, distanceMiles } from '../../lib/geo.js';
import { useLocation, pointOf, milesLabel } from '../../lib/location.js';
import { useNonprofitPlace } from '../../lib/nonprofitPlaces.js';
import { useSnapshot } from '../../lib/store.js';
import { toggleSaved, copyText } from '../../lib/db.js';
import { toast } from '../../lib/overlays.js';
import { searchListings, listingsForNonprofit } from '../../lib/listings.js';
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
.np-acts { margin-top:24px; display:flex; flex-wrap:wrap; align-items:center; gap:10px; }
.np-acts .vu-btn { white-space:nowrap; }
.np-acts-skel { display:inline-block; height:44px; border-radius:999px; }
.np-reach { margin:12px 0 0; max-width:620px; font:400 14px/1.5 var(--f-body); color:var(--ink-2); }
.np-reach a { font-weight:600; color:var(--ink); }
.np-more { margin-top:14px; display:flex; flex-wrap:wrap; gap:6px 20px; }
.np-more a { display:inline-flex; align-items:center; gap:6px; font:600 14px/1.3 var(--f-body); color:var(--ink); }
.np-signup { margin-top:10px; }
.np-shift + .np-shift { margin-top:0; }
.np-grid { margin-top:44px; display:grid; grid-template-columns:minmax(0, 1fr) 340px; gap:56px; align-items:start; }
.np-sec + .np-sec { margin-top:56px; }
.np-h2 { margin:0; font:650 22px/1.15 var(--f-display); letter-spacing:-0.02em; color:var(--ink); }
.np-addr { margin-top:14px; font:400 15px/1.5 var(--f-body); color:var(--ink); }
.np-addr-links { margin-top:8px; display:flex; flex-wrap:wrap; gap:8px 18px; }
.np-addr-links a { display:inline-flex; align-items:center; gap:6px; font:600 14px/1.3 var(--f-body); color:var(--ink); }
.np-map { margin-top:16px; }
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
  .np-acts { display:grid; grid-template-columns:1fr 1fr; grid-auto-flow:row dense; }
  .np-acts .np-act-main { grid-column:1 / -1; }
  .np-acts .vu-btn { width:100%; min-width:0; padding-left:10px; padding-right:10px; }
  .np-acts .np-act-wide { grid-column:1 / -1; }
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

/**
 * VolunteerU listings with this nonprofit: the ones it posted under its EIN
 * (nonprofit_ein), and the ones whose own name, site or address names it.
 * Both lists are merged, posted ones first, each listing once.
 */
function useShiftsHere(name, ein) {
  const [st, setSt] = useState({ status: 'loading', rows: [] });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    const key = norm(name);
    const byName = key.length >= 4;
    if (!byName && !ein) {
      setSt({ status: 'done', rows: [] });
      return undefined;
    }
    setSt({ status: 'loading', rows: [] });
    Promise.allSettled([
      ein ? listingsForNonprofit(ein) : Promise.resolve([]),
      // The search also reads missions and bios; only a listing whose own
      // name, site or address names the organization counts as theirs.
      byName ? searchListings({ q: name }).then((rows) => (rows || []).filter((l) => [l.name, l.site, l.location].some((f) => norm(f).includes(key)))) : Promise.resolve([]),
    ]).then(([posted, named]) => {
      if (!alive) return;
      if (posted.status === 'rejected' && named.status === 'rejected') {
        console.error('[nonprofit] listings failed', name, posted.reason, named.reason);
        setSt({ status: 'error', rows: [] });
        return;
      }
      [posted, named].forEach((r) => r.status === 'rejected' && console.error('[nonprofit] listings failed', name, r.reason));
      const seen = new Set();
      const rows = [...(posted.value || []), ...(named.value || [])].filter((l) => l && l.id && !seen.has(l.id) && seen.add(l.id));
      setSt({ status: 'done', rows });
    });
    return () => {
      alive = false;
    };
  }, [name, ein, nonce]);
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

const LINK_KEYS = ['website', 'volunteerUrl', 'phone', 'phoneTel', 'linkSource'];
const hasLinks = (o) => Boolean(o) && 'volunteerUrl' in o;

/* A lookup whose sources failed and found nothing reads as an error with
   Try again, never as "they have no website". */
const failedEmpty = (o) => Boolean(o && o.lookupFailed) && !o.website && !o.phoneTel;

/**
 * Website, volunteer page and phone (/api/nonprofits?ein=&links=1). The
 * server sends them with the page when it already knows them; otherwise
 * they load here while the rest of the page is already up. Try again asks
 * with fresh=1, so a failure the server cached for a minute or two is
 * looked up again. A 429 (too many lookups from this connection) is an
 * error with its own line; the rest of the page works without the links.
 */
function useLinks(org) {
  const ready = hasLinks(org);
  const [st, setSt] = useState(() =>
    ready ? (failedEmpty(org) ? { status: 'error', links: null, why: 'failed' } : { status: 'done', links: pick(org) }) : { status: 'loading', links: null }
  );
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (ready && nonce === 0) return undefined;
    let alive = true;
    const ctrl = new AbortController();
    setSt({ status: 'loading', links: null });
    (async () => {
      try {
        const res = await fetch(`/api/nonprofits?ein=${encodeURIComponent(org.ein)}&links=1${nonce ? '&fresh=1' : ''}`, { signal: ctrl.signal });
        const data = await res.json().catch(() => null);
        if (!alive) return;
        if (res.status === 429) return setSt({ status: 'error', links: null, why: 'busy' });
        if (!res.ok || !data || !data.organization) throw new Error((data && data.error) || `status ${res.status}`);
        if (failedEmpty(data.organization)) return setSt({ status: 'error', links: null, why: 'failed' });
        setSt({ status: 'done', links: pick(data.organization) });
      } catch (err) {
        if (!alive || (err && err.name === 'AbortError')) return;
        console.error('[nonprofit] links failed', org.ein, err);
        setSt({ status: 'error', links: null, why: 'failed' });
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [org.ein, ready, nonce]);
  return [st, () => setNonce((n) => n + 1)];
}

function pick(o) {
  return Object.fromEntries(LINK_KEYS.map((k) => [k, typeof o[k] === 'string' ? o[k] : '']));
}

/** Only http(s) links reach an href. */
const safeHttp = (u) => (/^https?:\/\/[^\s"<>]+$/i.test(String(u || '')) ? String(u) : '');
const safeTel = (t) => (/^\+1\d{10}$/.test(String(t || '')) ? String(t) : '');
const hostOf = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/[/?#].*$/, '');

/**
 * "2.7 mi" from the visitor to this nonprofit's street address, when the
 * visitor has shared a location and the address could be placed; else ''.
 */
function useMilesAway(ein) {
  const loc = useLocation();
  const spot = useNonprofitPlace(ein);
  const from = pointOf(loc);
  if (!from || !spot || typeof spot !== 'object') return '';
  return milesLabel(distanceMiles(from, spot));
}

function ExtButton({ href, children, icon = 'external', variant = 'outline', className }) {
  return (
    <Button variant={variant} href={href} target="_blank" rel="noopener noreferrer" icon={icon} className={className}>
      {children}
      <span className="vu-sr"> (opens in a new tab)</span>
    </Button>
  );
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
  const [shifts, retryShifts] = useShiftsHere(findName, o.ein);
  const photos = usePhotoPicker(shifts.rows);
  const [linkSt, retryLinks] = useLinks(o);
  const links = linkSt.links || {};
  const website = safeHttp(links.website);
  const volunteerUrl = safeHttp(links.volunteerUrl);
  const tel = safeTel(links.phoneTel);
  const phone = tel ? links.phone : '';
  const createHref = partnerHref({ name: findName || name, street: poBox ? '' : street, city, state: o.state, ein: o.ein });
  const areaHref = city && o.state ? `/discover?${new URLSearchParams({ view: 'nonprofits', near: `${city}, ${o.state}` }).toString()}` : '/discover?view=nonprofits';
  const hasShifts = shifts.status === 'done' && shifts.rows.length > 0;
  const away = useMilesAway(mappable ? o.ein : '');
  // The point Discover's map uses for this org, so the page's map and
  // Directions land on the same spot as its dot.
  const spot = useNonprofitPlace(mappable ? o.ein : '');
  const spotPt = spot && typeof spot === 'object' ? spot : null;
  // On a phone the actions are two to a row; Call is long, so it takes a
  // whole row, and a last button left alone does too.
  const halves = [volunteerUrl && website, mappable, true, true].filter(Boolean).length;
  const lastWide = halves % 2 === 1 ? 'np-act-wide' : undefined;

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
    // Phones get their share sheet; a computer copies the link.
    const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (touch && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: name, text: place ? `${name}, ${place}` : name, url });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    const ok = await copyText(url);
    if (ok) setCopied(true);
    else toast({ title: "Couldn't copy", message: `Copy this link yourself: ${url}`, tone: 'warn' });
  }

  const filing = o.filing || null;
  const facts = [
    cause ? ['Cause', o.nteeCode ? `${cause} (NTEE ${o.nteeCode})` : cause] : null,
    o.orgType ? ['Type', o.orgType] : o.subsection ? ['Type', `${o.subsection} tax-exempt organization`] : null,
    o.rulingYear ? ['Tax-exempt since', o.rulingYear] : null,
    // ProPublica's filing PDFs sit behind a bot check that stops many
    // browsers, so the return is named here and "View IRS filings" below
    // opens the page that lists it.
    filing && filing.year ? ['Latest filing', `${filing.year} Form ${filing.form || '990'}`] : null,
    filing && filing.revenue !== null && filing.revenue !== undefined ? [`Revenue${filing.year ? ` (${filing.year})` : ''}`, formatMoney(filing.revenue)] : null,
    filing && filing.expenses !== null && filing.expenses !== undefined ? [`Expenses${filing.year ? ` (${filing.year})` : ''}`, formatMoney(filing.expenses)] : null,
    website
      ? ['Website', (
          <a href={website} target="_blank" rel="noopener noreferrer" className="vu-link-ul">
            {hostOf(website)}
          </a>
        )]
      : null,
    phone ? ['Phone', <a href={`tel:${tel}`} className="vu-link-ul">{phone}</a>] : null,
    ['EIN', formatEin(o.ein)],
  ].filter(Boolean);

  const source = links.linkSource === 'wikidata' ? 'website from Wikidata' : website || phone ? 'website and phone from their latest e-filed return' : '';
  const nothing = linkSt.status === 'done' && !website && !phone;

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
          {cause || place || away ? (
            <p className="np-sub">
              {[cause, place, away ? `${away} from you` : ''].filter(Boolean).map((t, i) => (
                <span key={t}>
                  {i ? <Sep /> : null}
                  {t}
                </span>
              ))}
            </p>
          ) : null}
          <div className="np-acts" aria-busy={linkSt.status === 'loading' ? 'true' : undefined}>
            {hasShifts ? (
              <Button variant="primary" href="#np-shifts-h" icon="calendar" className="np-act-main">
                {shifts.rows.length === 1 ? 'See the open shift' : `See ${shifts.rows.length} open shifts`}
              </Button>
            ) : null}
            {linkSt.status === 'loading' ? (
              <>
                <span className="vu-skel np-acts-skel np-act-main" style={S('width:200px')} aria-hidden="true" />
                <span className="vu-skel np-acts-skel" style={S('width:150px')} aria-hidden="true" />
                <span className="vu-sr">Looking up their website and phone</span>
              </>
            ) : null}
            {volunteerUrl || website ? (
              <ExtButton href={volunteerUrl || website} variant={hasShifts ? 'outline' : 'primary'} className={hasShifts ? 'np-act-wide' : 'np-act-main'}>
                {volunteerUrl ? 'Volunteer with them' : 'Visit website'}
              </ExtButton>
            ) : null}
            {volunteerUrl && website ? (
              <ExtButton href={website} icon="globe">
                Visit website
              </ExtButton>
            ) : null}
            {phone ? (
              <Button variant="outline" href={`tel:${tel}`} icon="phone" aria-label={`Call ${name} at ${phone}`} className="np-act-wide">
                {`Call ${phone}`}
              </Button>
            ) : null}
            {mappable ? (
              <ExtButton href={directionsHref(full)} icon="navigation">
                Directions
              </ExtButton>
            ) : null}
            <Button variant="outline" icon="bookmark" onClick={save} aria-pressed={saved} aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}>
              {saved ? 'Saved' : 'Save'}
            </Button>
            <Button variant="outline" icon={copied ? 'check' : 'share'} onClick={share} className={lastWide}>
              {copied ? 'Link copied' : 'Share'}
            </Button>
          </div>
          <span className="vu-sr" aria-live="polite">
            {copied ? 'Link copied' : ''}
          </span>
          {linkSt.status === 'done' && website && !volunteerUrl ? (
            <p className="np-reach">
              Their website has no volunteer page we could find, so Visit website opens their homepage.
              {phone ? ` Call ${phone} and ask how to help.` : ' Look for a contact form or e-mail there and ask how to help.'}
            </p>
          ) : null}
          {nothing ? (
            <p className="np-reach">
              We couldn&apos;t find a website or phone number for {name}.{' '}
              <a href={siteSearchUrl(o)} target="_blank" rel="noopener noreferrer" className="vu-link-ul">
                Find their website
                <span className="vu-sr"> (web search, opens in a new tab)</span>
              </a>
            </p>
          ) : null}
          {linkSt.status === 'error' ? (
            <p className="np-reach" role="alert">
              {linkSt.why === 'busy' ? "Too many lookups from this connection just now, so their website and phone didn't load." : "Their website and phone didn't load."}{' '}
              <button type="button" onClick={retryLinks} className="vu-link-ul" style={S(`background:none;border:0;padding:0;cursor:pointer;font:600 14px/1.5 ${F.body};color:${C.ink}`)}>
                Try again
              </button>
            </p>
          ) : null}
        </header>

        <div className="np-grid">
          <div style={S('min-width:0')}>
            <section className="np-sec" aria-labelledby="np-shifts-h">
              <h2 id="np-shifts-h" className="np-h2" style={S('scroll-margin-top:24px')}>Open shifts on VolunteerU</h2>
              {shifts.status === 'loading' ? (
                <div style={S('margin-top:16px')}>
                  <SkeletonRows n={2} h={64} />
                </div>
              ) : shifts.status === 'error' ? (
                <ErrorState title="Shifts didn't load" body="Check your connection and try again." onRetry={retryShifts} />
              ) : shifts.rows.length ? (
                <>
                  <div className="vu-grid-2 np-cards">
                    {shifts.rows.map((l) => {
                      const props = liveCardProps(l);
                      return (
                        <div key={l.id} className="np-shift" style={S('min-width:0')}>
                          <ListingCard {...props} photo={photos.get(l.id)} />
                          <div className="np-signup">
                            <Button variant="dark" size="sm" href={props.href} icon="arrow-right" aria-label={`Sign up for ${l.name}`}>
                              Sign up
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="np-src">
                    Running your own drive with them?{' '}
                    <Link href={createHref} className="vu-link-ul" style={S(`font-weight:600;color:${C.ink}`)}>
                      Start a student project
                    </Link>
                  </p>
                </>
              ) : (
                <p className="np-empty">
                  Nobody has posted a shift with {name} on VolunteerU yet.{' '}
                  {volunteerUrl || website || phone ? 'Reach them directly with the buttons above, or ' : ''}
                  <Link href={createHref} className="vu-link-ul">
                    {volunteerUrl || website || phone ? 'start a student project with them' : 'Start a student project with them'}
                  </Link>{' '}
                  and it shows up here.
                </p>
              )}
            </section>

            <section className="np-sec" aria-labelledby="np-where-h">
              <h2 id="np-where-h" className="np-h2">
                {poBox ? 'Mailing address' : 'Where they are'}
              </h2>
              {mappable ? (
                // Directions is in the actions at the top, so the map keeps only Open in Maps.
                <div className="np-map">
                  <AddressMap address={full} lat={spotPt ? spotPt.lat : null} lng={spotPt ? spotPt.lng : null} directions={false} />
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
              IRS data through ProPublica Nonprofit Explorer{source ? `, ${source}` : ''}. VolunteerU hasn&apos;t reviewed this organization.
            </p>
            <div className="np-more">
              <a href={o.url} target="_blank" rel="noopener noreferrer" className="vu-link-ul">
                View IRS filings
                <Icon name="external" size={14} />
                <span className="vu-sr">(opens ProPublica in a new tab)</span>
              </a>
              {linkSt.status === 'done' && !website && !nothing ? (
                <a href={siteSearchUrl(o)} target="_blank" rel="noopener noreferrer" className="vu-link-ul">
                  Find their website
                  <Icon name="external" size={14} />
                  <span className="vu-sr">(web search, opens in a new tab)</span>
                </a>
              ) : null}
            </div>
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
