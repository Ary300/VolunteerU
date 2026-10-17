'use client';

/* ==========================================================================
   Landing.jsx, design screen: `isLanding`
   The hero searches live data for everyone, signed in or not: opportunities
   from the listings table (live rows are public) and registered nonprofits
   from /api/nonprofits (ProPublica / IRS records). Everything below the hero
   is product illustration with sample names, and it makes no claim the code
   can't back up.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Avatar, Icon } from '../ui.jsx';
import { MarketingHeader, MarketingFooter, useMarketingLinks, scrollToAnchor } from '../Marketing.jsx';
import { searchListings, searchWebNonprofits, parseState } from '../../lib/listings.js';
import { PEXELS } from '../../lib/seed.js';
import { nextShiftInfo } from './JoinListing.jsx';

const MONO = "'Geist Mono',monospace";
const MAX_OPPS = 3;
const MAX_ORGS = 4;

/* Stock photo for a listing posted without a cover, by cause. A cause with no
   fitting photo gets no thumbnail rather than an empty image box. */
const CAUSE_PHOTO = {
  'Food & hunger': PEXELS.food2,
  Education: PEXELS.reading3,
  Environment: PEXELS.trail,
  Homelessness: PEXELS.shelter,
  Seniors: PEXELS.seniors,
};

const CAUSE_CHIPS = ['Food & hunger', 'Education', 'Environment', 'Animals', 'Homelessness', 'Seniors', 'Health', 'Arts'];

/* Responsive rules live in classes, so they hold after a client-side
   navigation too (inline-style attribute selectors only match server HTML). */
const LANDING_CSS = `
.lp-hero { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,500px); gap:52px; align-items:start; }
.lp-search { display:grid; grid-template-columns:minmax(0,1.45fr) minmax(0,1fr) auto; }
.lp-search-field + .lp-search-field { border-left:1px solid #EFE9E2; }
.lp-search-field { position:relative; }
.lp-search-field:focus-within::after { content:''; position:absolute; inset:4px; border:2px solid #C2603C; border-radius:12px; pointer-events:none; }
.lp-section { padding:140px 32px 150px; }
.lp-big { font:600 104px/.94 Geist; letter-spacing:-0.06em; }
.lp-2col { display:grid; grid-template-columns:1fr 1fr; }
.lp-3col { display:grid; grid-template-columns:repeat(3,1fr); }
.lp-4col { display:grid; grid-template-columns:repeat(4,1fr); }
.lp-split { display:grid; grid-template-columns:1fr 1fr; gap:48px; align-items:center; }
.lp-steps { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:28px 36px; }
.lp-step { display:grid; grid-template-columns:30px minmax(0,1fr); align-items:baseline; }
.lp-attend { display:grid; grid-template-columns:1.6fr 1fr .6fr; gap:10px; align-items:center; }
.lp-block-top { padding-top:130px; }
.lp-band-gap { margin-top:130px; }
@media (max-width: 1179px) {
  .lp-hero { grid-template-columns:1fr; gap:36px; }
  .lp-section { padding:88px 24px 96px; }
  .lp-big { font-size:64px; }
  .lp-4col, .lp-steps { grid-template-columns:1fr 1fr; }
  .lp-block-top { padding-top:80px; }
  .lp-band-gap { margin-top:80px; }
}
@media (max-width: 900px) {
  .lp-2col, .lp-3col, .lp-split { grid-template-columns:1fr; }
  .lp-split { gap:28px; }
  .lp-col-rule { border-right:0 !important; border-bottom:1px solid #F1EBE4; }
}
@media (max-width: 720px) {
  .lp-search { grid-template-columns:1fr; }
  .lp-search-field + .lp-search-field { border-left:0; border-top:1px solid #EFE9E2; }
  .lp-search-go { margin:0 8px 8px !important; width:auto !important; }
  .lp-section { padding:64px 16px 72px; }
  .lp-hero-wrap { padding:40px 16px 48px !important; }
  .lp-pad { padding-left:16px !important; padding-right:16px !important; }
  .lp-big { font-size:44px; }
  .lp-h1 { font-size:38px !important; }
  .lp-h2 { font-size:32px !important; }
  .lp-4col, .lp-steps { grid-template-columns:1fr; }
  .lp-steps { gap:20px; }
  .lp-tight { padding:16px !important; }
  .lp-cta { padding:40px 20px !important; }
  .lp-block-top { padding-top:56px; }
  .lp-band-gap { margin-top:56px; }
  .lp-final { padding-top:56px !important; padding-bottom:56px !important; }
}
`;

/* ProPublica returns names in capitals. */
function titleCase(str) {
  return String(str || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/* "Sat, Oct 24 · 1:00-4:00 PM" reads "Sat, Oct 24 at 1–4 PM", the same label
   the join page shows. A shift that already happened isn't shown as next. */
function sessionLabel(label) {
  const shift = nextShiftInfo(label);
  if (!shift) return '';
  return shift.past ? 'No upcoming shift posted yet' : shift.label;
}

function describeSearch({ q, near, cause }) {
  const what = cause || (q ? `“${q}”` : 'Everything');
  return near ? `${what} near ${near}` : what;
}

/* ---- FAQ ------------------------------------------------------------------ */

const FAQS = [
  {
    q: 'Is it free?',
    a: 'Yes. Students and organizations don’t pay anything to use VolunteerU.',
  },
  {
    q: 'Where do the nonprofits come from?',
    a: 'IRS records, through ProPublica’s Nonprofit Explorer. Each one links to its ProPublica page with the address, so you can contact them about volunteering.',
  },
  {
    q: 'How do my hours get confirmed?',
    a: 'After a shift, log your hours on that project. Once the organizer approves them, they count as confirmed. Hours you log on your own stay in a separate total.',
  },
  {
    q: 'Do I need a 501(c)(3) to start a student project?',
    a: 'No. Anyone 13 or older can start one. If a school, library or nonprofit supervises it, you can ask for a verified badge from your project page.',
  },
  {
    q: 'What does the verified badge mean?',
    a: 'Someone on the VolunteerU team reviewed the organization and its staff contact by hand. Owners can’t give themselves the badge.',
  },
];

/* A plain, standard FAQ accordion. One row open at a time. */
function Faq({ items }) {
  const [open, setOpen] = useState(0);
  return (
    <div style={S('border-top:1px solid #E8E1D9')}>
      {items.map((f, i) => {
        const on = open === i;
        const panelId = `lp-faq-${i}`;
        return (
          <div key={f.q} style={S('border-bottom:1px solid #E8E1D9')}>
            <h3 style={S('margin:0')}>
              <button
                type="button"
                aria-expanded={on}
                aria-controls={panelId}
                onClick={() => setOpen(on ? -1 : i)}
                className={H.press}
                style={S('display:flex;width:100%;align-items:center;justify-content:space-between;gap:24px;padding:22px 6px;background:none;border:0;cursor:pointer;text-align:left;color:#1A1714')}
              >
                <span style={S('font:600 19px/1.3 Geist;letter-spacing:-0.025em')}>{f.q}</span>
                <span aria-hidden="true" style={s('color:#C2603C;flex:none;transition:transform .2s ease', on ? 'transform:rotate(45deg)' : '')}>
                  <Icon name="plus" size={20} />
                </span>
              </button>
            </h3>
            <div id={panelId} role="region" hidden={!on}>
              <div style={S('padding:0 6px 24px;font:450 16px/1.65 Geist;color:#57504A;max-width:720px;text-wrap:pretty')}>{f.a}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- hero result rows ------------------------------------------------------ */

function ListingRow({ l }) {
  const when = sessionLabel(l.next_session);
  const student = l.org_class === 'student' || l.is_student_led;
  const photo = l.cover || CAUSE_PHOTO[l.cause] || '';
  return (
    <Link
      href={`/join/${l.id}`}
      className="lp-row"
      style={S('display:flex;align-items:center;gap:14px;padding:14px 18px;border-top:1px solid #F1EBE4;color:inherit;text-decoration:none;transition:background .16s ease')}
    >
      {photo ? (
        <div style={S('width:52px;height:52px;border-radius:11px;overflow:hidden;flex:none')}>
          <ImageSlot src={photo} shape="rounded" radius={11} alt="" />
        </div>
      ) : null}
      <div style={S('min-width:0;flex:1')}>
        <div style={S('display:flex;align-items:center;gap:8px;min-width:0')}>
          <div className="vu-trunc" style={S('font:600 16px/1.25 Geist;letter-spacing:-0.02em;color:#1A1714')}>{l.name}</div>
          {l.verified ? (
            <span style={S('display:inline-flex;align-items:center;gap:4px;flex:none;font:500 12px/1 Geist;color:#3F6B4E')}>
              <Icon name="check-circle" size={13} />
              Verified
            </span>
          ) : null}
        </div>
        <div className="vu-trunc" style={S('margin-top:5px;font:450 13px/1.35 Geist;color:#6B635C')}>
          {[student ? 'Student project' : '', l.site || l.location || ''].filter(Boolean).join(', ')}
        </div>
        {when ? <div style={S('margin-top:4px;font:450 13px/1.35 Geist;color:#6B635C')}>{when}</div> : null}
      </div>
      <span aria-hidden="true" style={S('color:#A9A097;flex:none')}>
        <Icon name="chevron-right" size={16} />
      </span>
    </Link>
  );
}

function NonprofitRow({ o }) {
  const place = [titleCase(o.city), o.state].filter(Boolean).join(', ');
  return (
    <a
      href={o.url || `https://projects.propublica.org/nonprofits/organizations/${o.ein}`}
      target="_blank"
      rel="noopener noreferrer"
      className="lp-row"
      style={S('display:flex;align-items:center;gap:14px;padding:13px 18px;border-top:1px solid #F1EBE4;color:inherit;text-decoration:none;transition:background .16s ease')}
    >
      <span aria-hidden="true" style={S('width:36px;height:36px;border-radius:10px;background:#F6F2EE;color:#8A8179;display:grid;place-items:center;flex:none')}>
        <Icon name="building" size={16} />
      </span>
      <div style={S('min-width:0;flex:1')}>
        <div className="vu-trunc" style={S('font:600 15px/1.25 Geist;letter-spacing:-0.015em;color:#1A1714')}>{titleCase(o.name)}</div>
        <div className="vu-trunc" style={S('margin-top:4px;font:450 13px/1.35 Geist;color:#6B635C')}>
          {[place, o.cause && o.cause !== 'Nonprofit' ? o.cause : ''].filter(Boolean).join(', ')}
        </div>
      </div>
      <span style={S('display:inline-flex;align-items:center;gap:4px;flex:none;font:500 12px/1 Geist;color:#A8482A')}>
        ProPublica
        <Icon name="external" size={13} label="opens in a new tab" />
      </span>
    </a>
  );
}

function SkeletonList({ n = 3 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={S('display:flex;align-items:center;gap:14px;padding:14px 18px;border-top:1px solid #F1EBE4')}>
          <div style={S('width:52px;height:52px;border-radius:11px;background:#F3EEE8;flex:none')} />
          <div style={S('flex:1')}>
            <div style={S('height:13px;width:62%;border-radius:4px;background:#F1EBE4')} />
            <div style={S('margin-top:9px;height:11px;width:44%;border-radius:4px;background:#F6F2EE')} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ListLabel({ children }) {
  return <div style={S('padding:14px 18px 10px;font:600 13px/1.2 Geist;color:#57504A')}>{children}</div>;
}

/* ---- the page ------------------------------------------------------------- */

export default function Landing() {
  const router = useRouter();
  const links = useMarketingLinks();
  const whatRef = useRef(null);
  const resultsRef = useRef(null);
  const reqRef = useRef(0);

  const [what, setWhat] = useState('');
  const [where, setWhere] = useState('');
  const [hint, setHint] = useState('');
  const [latest, setLatest] = useState(null); // null while loading
  const [result, setResult] = useState(null); // { status, opps, orgs, ran }

  useEffect(() => {
    let alive = true;
    searchListings({})
      .then((rows) => { if (alive) setLatest((rows || []).slice(0, MAX_OPPS)); })
      .catch((err) => {
        console.error('[landing] could not load newest listings', err);
        if (alive) setLatest([]);
      });
    return () => { alive = false; };
  }, []);

  const showResults = () => {
    const el = resultsRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    if (rect.top < 64 || rect.top > window.innerHeight * 0.6) {
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  };

  async function runSearch({ q = '', near = '', cause = '' }) {
    const term = q.trim();
    const place = near.trim();
    if (!term && !place && !cause) {
      setHint('Enter a cause, a kind of place or a city.');
      if (whatRef.current) whatRef.current.focus();
      return;
    }
    setHint('');
    const id = ++reqRef.current;
    const ran = { q: term, near: place, cause };
    setResult({ status: 'loading', opps: [], orgs: [], ran });
    showResults();
    try {
      const [opps, orgs] = await Promise.all([
        searchListings({ q: cause ? '' : term, causes: cause ? [cause] : [], near: place }),
        searchWebNonprofits({ q: cause ? '' : term, near: place, causes: cause ? [cause] : [] }),
      ]);
      if (id !== reqRef.current) return;
      setResult({ status: 'done', opps: (opps || []).slice(0, MAX_OPPS), orgs: (orgs || []).slice(0, MAX_ORGS), ran });
    } catch (err) {
      console.error('[landing] search failed', err);
      if (id !== reqRef.current) return;
      setResult({ status: 'error', opps: [], orgs: [], ran });
    }
  }

  const onSubmit = (e) => {
    e.preventDefault();
    runSearch({ q: what, near: where });
  };

  const searchCause = (cause) => {
    setWhat('');
    runSearch({ q: '', near: where, cause });
  };

  const clearSearch = () => {
    reqRef.current += 1;
    setResult(null);
    setWhat('');
    setWhere('');
    if (whatRef.current) whatRef.current.focus();
  };

  /* "Search opportunities" buttons: signed in, open Discover; signed out,
     bring the hero search into view and put the cursor in it. */
  const goSearch = (e) => {
    if (links.authed) { router.push('/discover'); return; }
    scrollToAnchor(e, '/#search');
  };

  const discoverHref = (() => {
    const r = result && result.ran;
    if (!r) return '/discover';
    const p = new URLSearchParams();
    if (r.q) p.set('q', r.q);
    if (r.cause) p.set('causes', r.cause);
    if (r.near) p.set('near', r.near);
    const qs = p.toString();
    return qs ? `/discover?${qs}` : '/discover';
  })();

  const primaryBtn = 'display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;flex:none;border-radius:12px;font:600 15px/1 Geist;letter-spacing:-0.01em;cursor:pointer';

  /* ---- hero card body ---- */
  let cardTitle = 'Newest on VolunteerU';
  let cardBody;
  if (!result) {
    if (latest === null) cardBody = <SkeletonList n={3} />;
    else if (latest.length) cardBody = latest.map((l) => <ListingRow key={l.id} l={l} />);
    else {
      cardBody = (
        <div style={S('padding:22px 18px 24px;border-top:1px solid #F1EBE4')}>
          <div style={S('font:600 16px/1.3 Geist')}>Nothing posted yet</div>
          <div style={S('margin-top:6px;font:450 14px/1.5 Geist;color:#6B635C')}>Search nonprofits near you instead.</div>
          <button
            type="button"
            onClick={() => { setWhat('food bank'); runSearch({ q: 'food bank', near: where }); }}
            className={cx('lp-btn', H.press)}
            style={S(`${primaryBtn};margin-top:14px;height:40px;padding:0 16px;font-size:14px`)}
          >
            Search food banks
          </button>
        </div>
      );
    }
  } else {
    cardTitle = describeSearch(result.ran);
    if (result.status === 'loading') {
      cardBody = <SkeletonList n={3} />;
    } else if (result.status === 'error') {
      cardBody = (
        <div style={S('padding:22px 18px 24px;border-top:1px solid #F1EBE4')}>
          <div style={S('font:600 16px/1.3 Geist')}>Search didn’t go through</div>
          <div style={S('margin-top:6px;font:450 14px/1.5 Geist;color:#6B635C')}>Check your connection and try again.</div>
          <button type="button" onClick={() => runSearch(result.ran)} className={cx('lp-btn', H.press)} style={S(`${primaryBtn};margin-top:14px;height:40px;padding:0 16px;font-size:14px`)}>
            Try again
          </button>
        </div>
      );
    } else if (!result.opps.length && !result.orgs.length) {
      const r = result.ran;
      cardBody = (
        <div style={S('padding:22px 18px 24px;border-top:1px solid #F1EBE4')}>
          <div style={S('font:600 16px/1.3 Geist')}>Nothing for {describeSearch(r)}</div>
          <div style={S('margin-top:6px;font:450 14px/1.5 Geist;color:#6B635C')}>
            {r.near ? 'Try another word, or search every state.' : 'Try a broader word, like “food bank” or “library”.'}
          </div>
          {r.near ? (
            <button type="button" onClick={() => { setWhere(''); runSearch({ ...r, near: '' }); }} className={cx('lp-btn', H.press)} style={S(`${primaryBtn};margin-top:14px;height:40px;padding:0 16px;font-size:14px`)}>
              Search all states
            </button>
          ) : (
            <button type="button" onClick={clearSearch} className={cx('lp-btn', H.press)} style={S(`${primaryBtn};margin-top:14px;height:40px;padding:0 16px;font-size:14px`)}>
              Clear search
            </button>
          )}
        </div>
      );
    } else {
      cardBody = (
        <>
          {result.opps.length ? (
            <div>
              <ListLabel>Opportunities on VolunteerU</ListLabel>
              {result.opps.map((l) => <ListingRow key={l.id} l={l} />)}
            </div>
          ) : null}
          {result.orgs.length ? (
            <div style={S(result.opps.length ? 'border-top:1px solid #F1EBE4' : '')}>
              <ListLabel>{result.ran.near && !parseState(result.ran.near) ? 'Nonprofits from IRS records, all states' : 'Nonprofits from IRS records'}</ListLabel>
              {result.orgs.map((o) => <NonprofitRow key={o.ein} o={o} />)}
            </div>
          ) : null}
        </>
      );
    }
  }

  return (
    <div className="vu-screen vu-landing" style={S('width:100%;overflow-x:clip;padding-bottom:56px')}>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <MarketingHeader />

      {/* ---- hero ---- */}
      <div id="vu-main" className="lp-hero-wrap" style={S('max-width:1180px;margin:0 auto;padding:96px 32px 104px')}>
        <div className="lp-hero">
          <div id="search" style={S('scroll-margin-top:96px;padding-top:24px')}>
            <h1 className="lp-h1" style={S('margin:0;font:600 60px/1.02 Geist;letter-spacing:-0.045em;text-wrap:balance;max-width:560px')}>
              Find somewhere to volunteer this week
            </h1>
            <p style={S('margin:22px 0 0;max-width:480px;font:400 18px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
              Search nonprofits and open volunteer spots near you, from food banks to tutoring circles other students run.
            </p>

            <form role="search" aria-label="Search opportunities and nonprofits" onSubmit={onSubmit} noValidate style={S('margin-top:32px')}>
              <div className="lp-search" style={S('border-radius:16px;border:1px solid #E4DDD4;background:#fff;box-shadow:0 1px 2px rgba(30,20,10,.05);align-items:center')}>
                <label className="lp-search-field" htmlFor="lp-what" style={S('display:block;padding:12px 16px;cursor:text;min-width:0')}>
                  <span style={S('display:block;font:600 12px/1 Geist;color:#1A1714')}>What</span>
                  <input
                    id="lp-what"
                    ref={whatRef}
                    type="search"
                    value={what}
                    onChange={(e) => { setWhat(e.target.value); if (hint) setHint(''); }}
                    placeholder="Food bank, tutoring, shelter"
                    aria-describedby={hint ? 'lp-search-hint' : undefined}
                    autoComplete="off"
                    enterKeyHint="search"
                    style={S('display:block;width:100%;margin-top:6px;padding:0;border:0;outline:none;background:transparent;font:450 15px/1.3 Geist;color:#1A1714')}
                  />
                </label>
                <label className="lp-search-field" htmlFor="lp-where" style={S('display:block;padding:12px 16px;cursor:text;min-width:0')}>
                  <span style={S('display:block;font:600 12px/1 Geist;color:#1A1714')}>Where</span>
                  <input
                    id="lp-where"
                    type="text"
                    value={where}
                    onChange={(e) => { setWhere(e.target.value); if (hint) setHint(''); }}
                    placeholder="City, state or ZIP"
                    autoComplete="address-level2"
                    enterKeyHint="search"
                    style={S('display:block;width:100%;margin-top:6px;padding:0;border:0;outline:none;background:transparent;font:450 15px/1.3 Geist;color:#1A1714')}
                  />
                </label>
                <button
                  type="submit"
                  className={cx('lp-btn lp-search-go', H.press)}
                  style={S(`${primaryBtn};height:48px;padding:0 20px;margin:0 8px 0 4px`)}
                >
                  <Icon name="search" size={16} stroke={2} />
                  {result && result.status === 'loading' ? 'Searching' : 'Search'}
                </button>
              </div>
              <div id="lp-search-hint" aria-live="polite" style={S('min-height:20px;margin-top:8px;font:500 13px/1.4 Geist;color:#A8482A')}>
                {hint}
              </div>
            </form>

            <div style={S('margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:450 15px/1.4 Geist;color:#57504A')}>
              <Link href={links.startProject} className="lp-link" style={S('display:inline-flex;align-items:center;gap:5px;font-weight:600')}>
                Or start a student project
                <Icon name="arrow-right" size={14} />
              </Link>
            </div>

            <div style={S('display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-top:28px;font:450 13px/1.4 Geist;color:#6B635C')}>
              {['Free for students', 'For ages 13 and up'].map((t) => (
                <div key={t} style={S('display:flex;align-items:center;gap:7px')}>
                  <span style={S('color:#C2603C')}>
                    <Icon name="check" size={14} stroke={2.25} />
                  </span>
                  {t}
                </div>
              ))}
            </div>
          </div>

          <div ref={resultsRef} id="lp-results" style={S('scroll-margin-top:88px;min-width:0')}>
            <div style={S('border-radius:20px;overflow:hidden;background:#fff;border:1px solid #E8E1D9;box-shadow:0 30px 60px -40px rgba(70,45,28,.35), 0 2px 6px rgba(70,45,28,.05)')}>
              <div style={S('padding:12px 16px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;background:#FCFAF8')}>
                <div aria-hidden="true" style={S('display:flex;align-items:center;gap:8px')}>
                  <div style={S('width:9px;height:9px;border-radius:50%;background:#E4DAD0')} />
                  <div style={S('width:9px;height:9px;border-radius:50%;background:#E4DAD0')} />
                  <div style={S('width:9px;height:9px;border-radius:50%;background:#E4DAD0')} />
                </div>
                <div aria-hidden="true" style={S(`font:500 11px/1 ${MONO};color:#8A8179`)}>volunteeru / discover</div>
                <div style={S('width:44px')} />
              </div>
              <div aria-live="polite" aria-busy={(result && result.status === 'loading') || (!result && latest === null) ? 'true' : 'false'}>
                <div style={S('padding:18px 18px 12px;display:flex;align-items:baseline;justify-content:space-between;gap:12px')}>
                  <h2 className="vu-trunc" style={S('margin:0;font:600 19px/1.25 Geist;letter-spacing:-0.03em;min-width:0')}>{cardTitle}</h2>
                  {result ? (
                    <button type="button" onClick={clearSearch} className="lp-link" style={S('flex:none;background:none;border:0;padding:4px 0;cursor:pointer;font:500 13px/1 Geist')}>
                      Clear
                    </button>
                  ) : null}
                </div>
                {cardBody}
              </div>
              <div style={S('padding:14px 18px;border-top:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
                <div style={S('font:450 13px/1.4 Geist;color:#6B635C')}>
                  {links.authed ? 'Discover filters by cause, who posted it and in person or online.' : 'Sign up to apply and save opportunities.'}
                </div>
                <Link href={links.authed ? discoverHref : links.signUp} className="lp-link" style={S('display:inline-flex;align-items:center;gap:5px;font:600 13px/1 Geist')}>
                  {links.authed ? 'Open in Discover' : 'Sign up to apply'}
                  <Icon name="arrow-right" size={13} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- browse by cause (replaces the testimonial strip) ---- */}
      <div style={S('padding:30px 0 32px;border-top:1px solid #EFE9E2;border-bottom:1px solid #EFE9E2;background:#fff')}>
        <div className="lp-pad" style={S('max-width:1180px;margin:0 auto;padding:0 32px;display:flex;align-items:center;gap:20px;flex-wrap:wrap')}>
          <h2 style={S('margin:0;font:600 15px/1.2 Geist;color:#1A1714;flex:none')}>Browse by cause</h2>
          <div style={S('display:flex;gap:8px;flex-wrap:wrap')}>
            {CAUSE_CHIPS.map((c) => {
              const on = Boolean(result && result.ran && result.ran.cause === c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => searchCause(c)}
                  className={cx('lp-chip', H.press)}
                  style={s(
                    'padding:9px 14px;border-radius:999px;font:500 14px/1 Geist;cursor:pointer;transition:background .16s ease, border-color .16s ease',
                    on ? 'background:#1F1B18;border:1px solid #1F1B18;color:#fff' : 'background:#FCFAF8;border:1px solid #E8E1D9;color:#332D28'
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---- two ways in ---- */}
      <div className="lp-pad lp-block-top" style={S('max-width:1180px;margin:0 auto;padding-left:32px;padding-right:32px')}>
        <div style={S('text-align:center;max-width:680px;margin:0 auto')}>
          <h2 className="lp-h2" style={S('margin:0;font:600 52px/1.02 Geist;letter-spacing:-0.05em')}>Volunteer or lead</h2>
          <p style={S('margin:16px auto 0;max-width:460px;font:400 17px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
            Most students start by signing up for a shift. Some go on to run a student project of their own.
          </p>
        </div>
        <div className="lp-2col" style={S('gap:18px;margin-top:40px')}>
          {[
            {
              key: 'join',
              t: 'Sign up for a shift',
              b: 'Search opportunities posted by organizations and other students, plus nonprofits from IRS records.',
              img: PEXELS.reading,
              rows: ['Filter by cause, and by in person or online', 'See who runs it and whether we’ve verified them', 'Log your hours afterward for the organizer to confirm'],
              cta: 'Search opportunities',
              onClick: goSearch,
            },
            {
              key: 'start',
              t: 'Run a student project',
              b: 'Start a tutoring circle, a cleanup or a food drive, then publish it so students nearby can apply.',
              img: PEXELS.outdoor,
              rows: ['Add positions and choose who you accept', 'Take attendance and approve hours', 'Assign tasks and message your team'],
              cta: 'Start a student project',
              onClick: () => router.push(links.startProject),
            },
          ].map((p) => (
            <div key={p.key} className={H.card} style={S('border-radius:18px;border:1px solid #E8E1D9;background:#fff;padding:20px;display:flex;flex-direction:column;transition:border-color .16s ease')}>
              <div style={S('height:220px;border-radius:12px;overflow:hidden')}>
                <ImageSlot src={p.img} shape="rounded" radius={12} alt="" />
              </div>
              <h3 style={S('margin:20px 0 0;font:600 26px/1.08 Geist;letter-spacing:-0.038em')}>{p.t}</h3>
              <div style={S('margin-top:10px;font:450 15px/1.55 Geist;color:#6B635C;text-wrap:pretty')}>{p.b}</div>
              <ul style={S('margin:18px 0 0;padding:16px 0 0;list-style:none;border-top:1px solid #F1EBE4;display:flex;flex-direction:column;gap:10px;flex:1')}>
                {p.rows.map((r) => (
                  <li key={r} style={S('display:flex;gap:10px;align-items:flex-start;font:450 14px/1.5 Geist;color:#332D28')}>
                    <span style={S('color:#C2603C;margin-top:3px')}>
                      <Icon name="check" size={14} stroke={2.25} />
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={p.onClick}
                className={cx('lp-btn', H.press)}
                style={S(`${primaryBtn};margin-top:20px;height:46px;padding:0 18px;font-size:14px`)}
              >
                {p.cta}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ---- how it works ---- */}
      <div id="how-it-works" className="lp-band-gap" style={S('border-top:1px solid #EFE9E2;scroll-margin-top:72px')}>
        <div className="lp-section" style={S('max-width:1180px;margin:0 auto')}>
          <h2 className="lp-big" style={S('margin:0;max-width:900px')}>How it works</h2>
          <p style={S('margin:28px 0 0;max-width:560px;font:400 20px/1.55 Geist;color:#57504A;text-wrap:pretty')}>
            Pick an opportunity, go, and the organizer confirms your hours afterward.
          </p>

          <ol className="lp-3col" style={S('gap:20px;margin:56px 0 0;padding:0;list-style:none')}>
            {[
              { n: '1', t: 'Search', b: 'Type a cause or a place. You’ll see opportunities posted on VolunteerU and registered nonprofits nearby.' },
              { n: '2', t: 'Apply', b: 'Pick a position, add a note if you want, and send it. The organizer accepts you or passes.' },
              { n: '3', t: 'Log your hours', b: 'After the shift, log your hours on the project. They count as confirmed once the organizer approves them.' },
            ].map((c) => (
              <li key={c.n} className="lp-tight" style={S('padding:28px 26px;border-radius:18px;background:#FCFAF8;border:1px solid #F1EBE4')}>
                <div style={S(`font:500 13px/1 ${MONO};color:#A8482A`)}>{c.n}</div>
                <h3 style={S('margin:16px 0 0;font:600 26px/1.08 Geist;letter-spacing:-0.04em')}>{c.t}</h3>
                <div style={S('margin-top:12px;font:450 16px/1.6 Geist;color:#6B635C;text-wrap:pretty')}>{c.b}</div>
              </li>
            ))}
          </ol>

          {/* hours, secondary */}
          <div className="lp-split" style={S('margin-top:110px')}>
            <div>
              <h3 className="lp-h2" style={S('margin:0;font:600 40px/1.04 Geist;letter-spacing:-0.04em')}>Your hours, in one place</h3>
              <p style={S('margin:16px 0 0;max-width:440px;font:400 17px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
                Confirmed hours and hours you logged on your own are kept as separate totals. Download them as a spreadsheet from Settings whenever you need them.
              </p>
              <button
                type="button"
                onClick={goSearch}
                className={cx('lp-btn', H.press)}
                style={S(`${primaryBtn};margin-top:28px;height:48px;padding:0 22px`)}
              >
                <Icon name="search" size={16} stroke={2} />
                Search opportunities
              </button>
            </div>
            <div aria-label="Example of the hours list" role="img" style={S('border-radius:18px;border:1px solid #E8E1D9;overflow:hidden;background:#fff')}>
              <div style={S('padding:18px 22px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
                <div style={S('font:600 16px/1.2 Geist')}>Your hours</div>
                <div style={S(`font:500 13px/1 ${MONO};color:#57504A`)}>4 confirmed, 2 waiting</div>
              </div>
              {[
                { org: 'Riverbend Food Bank', d: 'Sat, Oct 10', hrs: '3', ok: true },
                { org: 'Northside Reading Circle', d: 'Sat, Oct 3', hrs: '1', ok: true },
                { org: 'Millbrook Park Cleanup', d: 'Sun, Sep 27', hrs: '2', ok: false },
              ].map((e) => (
                <div key={e.org} style={S('padding:15px 22px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:12px')}>
                  <div style={S('min-width:0')}>
                    <div className="vu-trunc" style={S('font:500 14px/1.3 Geist;color:#1A1714')}>{e.org}</div>
                    <div style={S('margin-top:4px;font:450 12px/1 Geist;color:#6B635C')}>{e.d}</div>
                  </div>
                  <div style={S('display:flex;align-items:center;gap:10px;flex:none')}>
                    <span style={s('display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:7px;font:500 12px/1 Geist', e.ok ? 'background:#EAF3EC;color:#3F6B4E' : 'background:#FDF3E7;color:#8A5A20')}>
                      {e.ok ? <Icon name="check" size={12} stroke={2.25} /> : <Icon name="clock" size={12} />}
                      {e.ok ? 'Confirmed' : 'Waiting on organizer'}
                    </span>
                    <span style={S(`font:600 14px/1 ${MONO};color:#1A1714;min-width:44px;text-align:right`)}>{e.hrs} h</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ---- student projects ---- */}
      <div id="student-projects" style={S('border-top:1px solid #EFE9E2;background:#fff;scroll-margin-top:72px')}>
        <div className="lp-section" style={S('max-width:1180px;margin:0 auto')}>
          <h2 className="lp-big" style={S('margin:0;max-width:940px')}>Start a student project</h2>
          <p style={S('margin:28px 0 0;max-width:600px;font:400 20px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
            Run a tutoring circle, a cleanup or a drive with friends. You don’t need a 501(c)(3). Set it up, add the positions you need, and publish it so other students can find it.
          </p>

          <ol className="lp-steps" style={S('margin:52px 0 0;padding:0;list-style:none')}>
            {[
              { n: '1', t: 'Describe it', b: 'Name, cause and where it happens.' },
              { n: '2', t: 'Add positions', b: 'Each role, how many people you need and what they’ll do.' },
              { n: '3', t: 'Publish', b: 'It shows up in Discover, and you get a link to share.' },
              { n: '4', t: 'Run it', b: 'Take attendance at each shift, then approve everyone’s hours.' },
            ].map((t) => (
              <li key={t.n} className="lp-step">
                <div aria-hidden="true" style={S(`font:500 15px/1 ${MONO};color:#A8482A`)}>{t.n}</div>
                <div>
                  <h3 style={S('margin:0;font:600 19px/1.25 Geist;letter-spacing:-0.025em')}>{t.t}</h3>
                  <div style={S('margin-top:6px;font:450 15px/1.55 Geist;color:#6B635C;text-wrap:pretty')}>{t.b}</div>
                </div>
              </li>
            ))}
          </ol>

          {/* found in discover */}
          <div className="lp-split" style={S('margin-top:96px')}>
            <div aria-label="Example of a student project page" role="img" style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
              <div style={S('padding:20px')}>
                <div style={S('height:170px;border-radius:12px;overflow:hidden')}>
                  <ImageSlot src={PEXELS.reading2} shape="rounded" radius={12} alt="" />
                </div>
                <div style={S('margin-top:16px;font:600 20px/1.2 Geist;letter-spacing:-0.03em')}>Northside Reading Circle</div>
                <div style={S('margin-top:6px;font:450 13px/1.4 Geist;color:#6B635C')}>Student project, Rivertown Public Library</div>
                <div style={S('margin-top:16px;display:flex;gap:8px;flex-wrap:wrap')}>
                  {['Tutor, 3 open', 'Photos, 1 open', '1 hour a week'].map((c, i) => (
                    <span key={c} style={s('padding:6px 10px;border-radius:8px;font:500 12px/1 Geist', i === 2 ? 'background:#F5E7E0;color:#A8482A' : 'background:#F6F2EE;color:#57504A')}>{c}</span>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <h3 className="lp-h2" style={S('margin:0;font:600 36px/1.06 Geist;letter-spacing:-0.045em')}>Students find it in Discover</h3>
              <p style={S('margin:14px 0 0;max-width:430px;font:400 17px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
                Publishing puts your project in Discover for students searching nearby. You also get one link to post in a group chat or on a flyer.
              </p>
            </div>
          </div>

          {/* verification */}
          <div className="lp-split" style={S('margin-top:72px')}>
            <div>
              <h3 className="lp-h2" style={S('margin:0;font:600 36px/1.06 Geist;letter-spacing:-0.045em')}>Ask for a verified badge</h3>
              <p style={S('margin:14px 0 0;max-width:430px;font:400 17px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
                If a school, library or nonprofit supervises your project, add their name and a staff contact, then request a review. Someone on our team checks it by hand. Until then your project shows without the badge.
              </p>
            </div>
            <div aria-label="Example of a verification request" role="img" style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
              <div style={S('padding:16px 22px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;font:600 15px/1.2 Geist')}>Verification</div>
              {[
                { l: 'Supervising organization', v: 'Rivertown Public Library' },
                { l: 'Staff contact', v: 'Ms. Alvarez, branch librarian' },
              ].map((r) => (
                <div key={r.l} style={S('padding:15px 22px;border-bottom:1px solid #F1EBE4')}>
                  <div style={S('font:450 12px/1.2 Geist;color:#6B635C')}>{r.l}</div>
                  <div style={S('margin-top:5px;font:500 15px/1.3 Geist;color:#1A1714')}>{r.v}</div>
                </div>
              ))}
              <div style={S('padding:15px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px')}>
                <div style={S('font:450 13px/1.3 Geist;color:#6B635C')}>Status</div>
                <span style={S('display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:7px;background:#FDF3E7;color:#8A5A20;font:500 12px/1 Geist')}>
                  <Icon name="clock" size={12} />
                  Waiting for review
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- running a project ---- */}
      <div style={S('background:#fff;border-top:1px solid #EFE9E2')}>
        <div className="lp-section" style={S('max-width:1180px;margin:0 auto')}>
          <div style={S('text-align:center;max-width:660px;margin:0 auto')}>
            <h2 className="lp-h2" style={S('margin:0;font:600 56px/1.02 Geist;letter-spacing:-0.045em')}>Run your project</h2>
            <p style={S('margin:20px auto 0;max-width:520px;font:400 19px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
              Applications, your roster, attendance and hours sit in one place. When you approve someone’s hours, they show up on that volunteer’s profile.
            </p>
          </div>

          <div aria-label="Example of the applications and attendance views" role="img" style={S('margin-top:56px;border-radius:20px;border:1px solid #E8E1D9;overflow:hidden;background:#fff')}>
            <div style={S('padding:18px 24px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;font:600 15px/1.2 Geist')}>Northside Reading Circle</div>
            <div className="lp-2col">
              <div className="lp-col-rule" style={S('border-right:1px solid #F1EBE4')}>
                <div style={S('padding:14px 24px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between')}>
                  <div style={S('font:600 13px/1 Geist;color:#57504A')}>New applications</div>
                  <div style={S(`font:500 12px/1 ${MONO};color:#A8482A`)}>4</div>
                </div>
                {[
                  { n: 'Ana Ruiz', role: 'Tutor', when: '2 hours ago' },
                  { n: 'Marcus Bell', role: 'Tutor', when: 'Yesterday' },
                  { n: 'Sofia Chen', role: 'Photos', when: 'Yesterday' },
                  { n: 'Noah Kim', role: 'Tutor', when: '2 days ago' },
                ].map((a) => (
                  <div key={a.n} style={S('padding:14px 24px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:14px')}>
                    <div style={S('display:flex;align-items:center;gap:12px;min-width:0')}>
                      <div style={S('width:32px;height:32px;border-radius:50%;overflow:hidden;flex:none')}>
                        <Avatar name={a.n} fs={12} />
                      </div>
                      <div style={S('min-width:0')}>
                        <div style={S('font:500 14px/1.2 Geist')}>{a.n}</div>
                        <div style={S('margin-top:4px;font:450 12px/1.2 Geist;color:#6B635C')}>{a.role}, {a.when}</div>
                      </div>
                    </div>
                    <span style={S('flex:none;padding:5px 9px;border-radius:7px;background:#F5E7E0;color:#A8482A;font:500 12px/1 Geist')}>New</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={S('padding:14px 24px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between')}>
                  <div style={S('font:600 13px/1 Geist;color:#57504A')}>Attendance, Sat, Oct 10</div>
                  <div style={S('font:500 12px/1 Geist;color:#3F6B4E')}>Hours approved</div>
                </div>
                {[
                  { n: 'Ana Ruiz', st: 'Present', tone: 'ok', hrs: '1.0' },
                  { n: 'Marcus Bell', st: 'Present', tone: 'ok', hrs: '1.0' },
                  { n: 'Grace Liu', st: 'Late', tone: 'warn', hrs: '0.8' },
                  { n: 'Jalen Brooks', st: 'Present', tone: 'ok', hrs: '1.0' },
                  { n: 'Priya Shah', st: 'Absent', tone: 'bad', hrs: '0.0' },
                ].map((a) => (
                  <div key={a.n} className="lp-attend" style={S('padding:13px 24px;border-bottom:1px solid #F1EBE4')}>
                    <div style={S('font:500 14px/1.2 Geist')}>{a.n}</div>
                    <div>
                      <span style={s('padding:4px 8px;border-radius:6px;font:500 12px/1 Geist', a.tone === 'ok' ? 'background:#EAF3EC;color:#3F6B4E' : a.tone === 'warn' ? 'background:#FDF3E7;color:#8A5A20' : 'background:#F5E7E0;color:#A8482A')}>{a.st}</span>
                    </div>
                    <div style={S(`font:500 13px/1 ${MONO};text-align:right`)}>{a.hrs} h</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lp-4col" style={S('gap:24px 36px;margin-top:40px')}>
            {[
              { t: 'Applications', b: 'Read each application, then accept or decline it.' },
              { t: 'Roster', b: 'Everyone on your team, with their position and hours.' },
              { t: 'Attendance', b: 'Mark who came to each shift and how long they stayed.' },
              { t: 'Hours', b: 'Approve logged hours so they count as confirmed.' },
            ].map((a) => (
              <div key={a.t}>
                <h3 style={S('margin:0;font:600 19px/1.25 Geist;letter-spacing:-0.025em')}>{a.t}</h3>
                <div style={S('margin-top:6px;font:450 15px/1.55 Geist;color:#6B635C;text-wrap:pretty')}>{a.b}</div>
              </div>
            ))}
          </div>

          {/* task board */}
          <div style={S('max-width:620px;margin:130px auto 0;text-align:center')}>
            <h3 className="lp-h2" style={S('margin:0;font:600 42px/1.04 Geist;letter-spacing:-0.04em')}>Assign the work</h3>
            <p style={S('margin:16px auto 0;max-width:480px;font:400 17px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
              Set up roles with a short briefing, then give each task an owner. Everyone sees what they own and what’s left.
            </p>
          </div>
          <div aria-label="Example task board" role="img" style={S('margin-top:48px;border-radius:20px;border:1px solid #E8E1D9;overflow:hidden;background:#fff')}>
            <div style={S('padding:18px 24px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
              <div style={S('font:600 15px/1.2 Geist')}>Fall fundraiser</div>
              <div style={S(`font:500 12px/1 ${MONO};color:#57504A`)}>6 tasks, 3 roles</div>
            </div>
            <div className="lp-3col">
              {[
                { name: 'Tutoring', color: '#5B6BB0', brief: 'Run the reading sessions', tasks: [
                  { t: 'Prep the week 3 worksheets', who: 'Ana Ruiz', st: 'Doing', tone: 'warn' },
                  { t: 'Pair up the new tutors', who: 'You', st: 'Done', tone: 'ok' },
                ] },
                { name: 'Outreach', color: '#C2603C', brief: 'Recruit and post', tasks: [
                  { t: 'Post to 3 school pages', who: 'Marcus Bell', st: 'Doing', tone: 'warn' },
                  { t: 'Email the library contact', who: 'Sofia Chen', st: 'To do', tone: 'mute' },
                ] },
                { name: 'Photos', color: '#3F6B4E', brief: 'Take pictures on the day', tasks: [
                  { t: 'Shoot the Saturday session', who: 'Jalen Brooks', st: 'To do', tone: 'mute' },
                  { t: 'Upload to the shared drive', who: 'Jalen Brooks', st: 'Done', tone: 'ok' },
                ] },
              ].map((role, i) => (
                <div key={role.name} className={i < 2 ? 'lp-col-rule' : undefined} style={S(`padding:24px 22px 32px${i < 2 ? ';border-right:1px solid #F1EBE4' : ''}`)}>
                  <div style={S('display:flex;align-items:center;gap:9px')}>
                    <span aria-hidden="true" style={s('width:8px;height:8px;border-radius:50%;flex:none', `background:${role.color}`)} />
                    <div style={S('font:600 15px/1 Geist')}>{role.name}</div>
                    <div style={S(`margin-left:auto;font:500 12px/1 ${MONO};color:#6B635C`)}>{role.tasks.length}</div>
                  </div>
                  <div style={S('margin-top:8px;font:450 13px/1.4 Geist;color:#6B635C')}>{role.brief}</div>
                  <div style={S('margin-top:16px;display:flex;flex-direction:column;gap:12px')}>
                    {role.tasks.map((t) => (
                      <div key={t.t} style={S('padding:18px 16px;border-radius:14px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                        <div style={S('font:500 14px/1.35 Geist;color:#1A1714')}>{t.t}</div>
                        <div style={S('margin-top:14px;display:flex;align-items:center;justify-content:space-between;gap:8px')}>
                          <div style={S('display:flex;align-items:center;gap:7px;min-width:0')}>
                            <div style={S('width:20px;height:20px;border-radius:50%;overflow:hidden;flex:none')}>
                              <Avatar name={t.who} fs={9} />
                            </div>
                            <div className="vu-trunc" style={S('font:450 12px/1 Geist;color:#6B635C')}>{t.who}</div>
                          </div>
                          <span style={s('padding:4px 8px;border-radius:6px;font:500 12px/1 Geist;flex:none', t.tone === 'ok' ? 'background:#EAF3EC;color:#3F6B4E' : t.tone === 'warn' ? 'background:#FDF3E7;color:#8A5A20' : 'background:#F6F2EE;color:#57504A')}>{t.st}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* messaging */}
          <div style={S('max-width:620px;margin:130px auto 0;text-align:center')}>
            <h3 className="lp-h2" style={S('margin:0;font:600 42px/1.04 Geist;letter-spacing:-0.04em')}>Keep your team posted</h3>
            <p style={S('margin:16px auto 0;max-width:480px;font:400 17px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
              Post announcements to your whole team, and message any applicant directly.
            </p>
          </div>
          <div aria-label="Example team announcements" role="img" style={S('margin:48px auto 0;max-width:760px;border-radius:20px;border:1px solid #E8E1D9;overflow:hidden;background:#fff')}>
            <div style={S('padding:16px 24px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;font:600 15px/1.2 Geist')}>Team announcements</div>
            <div className="lp-tight" style={S('padding:24px;display:flex;flex-direction:column;gap:16px;background:#FCFAF8')}>
              {[
                { who: 'Ana Ruiz', text: 'Rooms are booked for all 4 Saturdays.', w: '9:14 AM' },
                { you: true, text: 'Thanks. I posted the sign-up link under Outreach.', w: '9:16 AM' },
                { who: 'Marcus Bell', text: '2 new tutors applied overnight. Should I accept them?', w: '9:20 AM' },
                { you: true, text: 'Yes, accept both and add them to Tutoring.', w: '9:21 AM' },
              ].map((m, i) => (m.you ? (
                <div key={i} style={S('align-self:flex-end;max-width:78%')}>
                  <div style={S('padding:12px 16px;border-radius:16px 16px 4px 16px;background:#C2603C;color:#fff;font:450 14px/1.45 Geist')}>{m.text}</div>
                  <div style={S('margin-top:5px;text-align:right;font:450 12px/1 Geist;color:#6B635C')}>You, {m.w}</div>
                </div>
              ) : (
                <div key={i} style={S('align-self:flex-start;max-width:78%;display:flex;gap:10px')}>
                  <div style={S('width:28px;height:28px;border-radius:50%;overflow:hidden;flex:none')}>
                    <Avatar name={m.who} fs={11} />
                  </div>
                  <div>
                    <div style={S('padding:12px 16px;border-radius:16px 16px 16px 4px;background:#fff;border:1px solid #EDE6DE;font:450 14px/1.45 Geist;color:#332D28')}>{m.text}</div>
                    <div style={S('margin-top:5px;font:450 12px/1 Geist;color:#6B635C')}>{m.who}, {m.w}</div>
                  </div>
                </div>
              )))}
            </div>
          </div>

          <div style={S('margin-top:56px;display:flex;justify-content:center')}>
            <button
              type="button"
              onClick={() => router.push(links.startProject)}
              className={cx('lp-btn', H.press)}
              style={S(`${primaryBtn};height:50px;padding:0 26px;font-size:16px`)}
            >
              Start a student project
            </button>
          </div>
        </div>
      </div>

      {/* ---- questions ---- */}
      <div className="lp-pad lp-block-top" style={S('max-width:860px;margin:0 auto;padding-left:32px;padding-right:32px')}>
        <h2 className="lp-h2" style={S('margin:0 0 28px;font:600 46px/1.02 Geist;letter-spacing:-0.05em;text-align:center')}>Questions</h2>
        <Faq items={FAQS} />
      </div>

      {/* ---- final CTA ---- */}
      <div className="lp-pad lp-final" style={S('max-width:1180px;margin:0 auto;padding:96px 32px')}>
        <div className="lp-cta" style={S('border-radius:26px;border:1px solid #EDE6DE;background:#fff;padding:60px 48px;text-align:center')}>
          <h2 className="lp-h2" style={S('margin:0;font:600 44px/1.06 Geist;letter-spacing:-0.045em;text-wrap:balance')}>
            Search opportunities near you
          </h2>
          <p style={S('margin:16px auto 0;max-width:470px;font:400 17px/1.6 Geist;color:#57504A')}>
            Free for students. You need to be 13 or older to sign up.
          </p>
          <div style={S('display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:28px')}>
            <button type="button" onClick={goSearch} className={cx('lp-btn', H.press)} style={S(`${primaryBtn};height:48px;padding:0 24px`)}>
              <Icon name="search" size={16} stroke={2} />
              Search opportunities
            </button>
            {links.authed ? null : (
              <button type="button" onClick={() => router.push(links.signUp)} className={cx('lp-btn-ghost', H.press)} style={S(`${primaryBtn};height:48px;padding:0 24px`)}>
                Sign up free
              </button>
            )}
          </div>
        </div>
      </div>

      <MarketingFooter />
    </div>
  );
}
