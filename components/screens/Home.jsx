'use client';

/* ==========================================================================
   Home.jsx, the signed-in home (/app)
   Search comes first, then live opportunities near the student and registered
   nonprofits. Hours, upcoming shifts and the student's own project sit in the
   side column as short summaries. An organization account gets its programs
   and their application counts there instead of volunteer hours.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { Icon, ImageSlot, Pressable, SkeletonRows } from '../ui.jsx';
import VolunteerApplications from '../VolunteerApplications.jsx';
import MemberProjects from '../MemberProjects.jsx';
import WebNonprofits from '../WebNonprofits.jsx';
import HomeCharts from '../HomeCharts.jsx';
import { useSnapshot, getState, update } from '../../lib/store.js';
import { activeProject, taskProgress, getOpportunity } from '../../lib/db.js';
import { searchListings, loadMyApplications, loadOwnerApplications, loadListingsByIds, listingShifts, myShiftSignUps } from '../../lib/listings.js';
import { shiftDates } from '../../lib/calendar.js';
import { plural, startTime } from '../../lib/format.js';
import { nextShiftInfo, shiftLabel } from './JoinListing.jsx';

const MAX_ROWS = 4;

const H2 = 'margin:0;font:600 17px/1.25 Geist;letter-spacing:-0.02em;color:#1A1714';
const CARD = 'border-radius:14px;border:1px solid #E8E1D9;background:#fff';
const LINK = 'font:500 13px/1 Geist;color:#C2603C;text-decoration:none;flex:none';
const INPUT =
  'display:block;width:100%;height:44px;padding:0 14px;border-radius:11px;border:1px solid #E8E1D9;background:#FCFAF8;font:450 15px/1 Geist;color:#1A1714';

const APP_STATUS = {
  pending: { label: 'Applied', bg: '#FDF3E7', color: '#8A5A20' },
  accepted: { label: 'Accepted', bg: '#EAF3EC', color: '#3F6B4E' },
  declined: { label: 'Not accepted', bg: '#F5E7E0', color: '#A8482A' },
  withdrawn: { label: 'Withdrawn', bg: '#F6F2EE', color: '#8A8179' },
};

/* Turns the stored "Sat, Oct 24 · 1:00-4:00 PM" into "Sat, Oct 24 at 1–4 PM".
   A shift that already happened reads as "No upcoming shift posted yet". */
function sessionLabel(raw) {
  const info = nextShiftInfo(raw);
  if (!info) return '';
  return info.past ? 'No upcoming shift posted yet' : info.label;
}

/* True when the stored next session is set and still ahead of now. */
function hasUpcomingShift(raw) {
  const info = nextShiftInfo(raw);
  return Boolean(info && !info.past);
}

/* Start time in ms for sorting ("Sat, Oct 24" + "1:00-4:00 PM"); unknown
   times sort last. */
function startMs(d, t) {
  const dts = shiftDates({ d, t });
  return dts ? dts.start.getTime() : Number.MAX_SAFE_INTEGER;
}

/* A stored next shift ("Sat, Oct 24 · 1:00-4:00 PM") split into date and time. */
function splitSession(raw) {
  const m = /^(.+?)(?:\s*·\s*|\s+at\s+)(.+)$/.exec(String(raw || '').trim());
  return m ? [m[1], m[2]] : [String(raw || '').trim(), ''];
}

/* Applications that may hold shift sign-ups. A pending applicant can sign up
   for shifts before the organizer answers (the join page says so). */
const SIGNUP_STATUSES = ['pending', 'accepted'];

/* Accepted applications with no shift sign-ups at all whose stored next shift
   is still ahead. If their listing publishes no shift list, the volunteer is
   expected at that next shift, so Home needs the listing's shifts to tell. */
function fallbackCandidates(apps) {
  return (apps || []).filter(
    (a) => a.status === 'accepted' && a.listings && !myShiftSignUps(a).length && hasUpcomingShift(a.listings.next_session),
  );
}

/* The volunteer's upcoming shifts, soonest first:
   - every shift they signed up for (member_state.shifts) on a pending or
     accepted application that hasn't ended yet
   - for an accepted application on a listing with no shift list, the
     listing's next shift. `posted` maps listing id to its published shifts
     (only for those fallback candidates); a listing missing from it is skipped. */
function upcomingShifts(apps, posted) {
  const out = [];
  for (const a of apps || []) {
    if (!a.listings || !SIGNUP_STATUSES.includes(a.status)) continue;
    const href = `/join/${a.listing_id}`;
    for (const sh of myShiftSignUps(a)) {
      if (sh.past) continue;
      out.push({
        key: `${a.id}:${sh.id}`,
        title: a.listings.name,
        when: shiftLabel(sh),
        where: orgName(a.listings),
        href,
        pending: a.status === 'pending',
        start: startMs(sh.d, sh.t),
      });
    }
  }
  for (const a of fallbackCandidates(apps)) {
    const shifts = posted && posted.get(a.listing_id);
    if (!shifts || shifts.length) continue;
    const [d, t] = splitSession(a.listings.next_session);
    out.push({
      key: a.id,
      title: a.listings.name,
      when: sessionLabel(a.listings.next_session),
      where: orgName(a.listings),
      href: `/join/${a.listing_id}`,
      pending: false,
      start: startMs(d, t),
    });
  }
  return out.sort((x, y) => x.start - y.start);
}

/* Lowest "ages N+" across a listing's positions, or null when none is stated. */
function minAge(listing) {
  const ages = (listing.positions || [])
    .map((p) => /ages?\s*(\d{1,2})\s*\+/i.exec(String(p.m || '')))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  return ages.length ? Math.min(...ages) : null;
}

const orgName = (listing) => String(listing.site || '').split(',')[0].trim();

function SearchCard({ region }) {
  const router = useRouter();
  const [what, setWhat] = useState('');
  const [where, setWhere] = useState(region);
  useEffect(() => setWhere(region), [region]);

  function submit(e) {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (what.trim()) qs.set('q', what.trim());
    // Always pass near, even empty, so clearing "Where" searches everywhere
    // instead of Discover falling back to the saved location.
    qs.set('near', where.trim());
    router.push(`/discover?${qs.toString()}`);
  }

  return (
    <form role="search" aria-label="Search opportunities" onSubmit={submit} style={S(`${CARD};padding:16px;border-radius:16px`)}>
      <div className="vu-stack" style={S('display:flex;align-items:flex-end;gap:12px')}>
        <label style={S('flex:1.4;min-width:0;display:flex;flex-direction:column;gap:7px')}>
          <span style={S('font:500 13px/1 Geist;color:#57504A')}>What</span>
          <span style={S('position:relative;display:block')}>
            <span style={S('position:absolute;left:14px;top:14px;display:flex;color:#8A8179;pointer-events:none')}><Icon name="search" size={16} /></span>
            <input
              className={H.input}
              type="search"
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              placeholder="Food bank, tutoring, animal shelter"
              enterKeyHint="search"
              style={S(`${INPUT};padding-left:38px`)}
            />
          </span>
        </label>
        <label style={S('flex:1;min-width:0;display:flex;flex-direction:column;gap:7px')}>
          <span style={S('font:500 13px/1 Geist;color:#57504A')}>Where</span>
          <input
            className={H.input}
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            placeholder="City or ZIP"
            autoComplete="address-level2"
            style={S(INPUT)}
          />
        </label>
        <button
          type="submit"
          className={cx(H.press)}
          style={S('flex:none;display:inline-flex;align-items:center;justify-content:center;height:44px;padding:0 22px;border-radius:11px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 15px/1 Geist;cursor:pointer')}
        >
          Search
        </button>
      </div>
      <div style={S('margin-top:12px;display:flex;gap:18px;flex-wrap:wrap')}>
        <Link href="/discover?kind=student" className={H.link} style={S(LINK)}>Browse student projects</Link>
        <Link href="/discover" className={H.link} style={S(LINK)}>See all opportunities</Link>
      </div>
    </form>
  );
}

function ListingRow({ listing, app }) {
  const st = app ? APP_STATUS[app.status] : null;
  const age = minAge(listing);
  const meta = [orgName(listing), listing.cause].filter(Boolean).join(', ');
  const when = [listing.next_session ? sessionLabel(listing.next_session) : '', age ? `Ages ${age}+` : ''].filter(Boolean).join(', ');
  return (
    <Link
      href={`/join/${listing.id}`}
      className={cx(H.card, H.press)}
      style={S(`${CARD};display:flex;align-items:center;gap:14px;padding:12px;text-decoration:none;color:inherit;transition:border-color .16s ease`)}
    >
      <div aria-hidden="true" style={S('flex:none;width:72px;height:72px;border-radius:10px;overflow:hidden;background:#EFE9E2')}>
        {listing.cover ? <ImageSlot src={listing.cover} radius={10} placeholder="" alt="" /> : null}
      </div>
      <div style={S('min-width:0;flex:1')}>
        <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
          <span style={S('font:600 15px/1.25 Geist;letter-spacing:-0.01em;color:#1A1714')}>{listing.name}</span>
          {listing.org_class === 'student' ? (
            <span style={S('padding:3px 8px;border-radius:6px;background:#F6F2EE;font:500 11px/1.2 Geist;color:#57504A')}>Student project</span>
          ) : null}
          {st ? (
            <span style={S(`padding:3px 8px;border-radius:6px;background:${st.bg};font:500 11px/1.2 Geist;color:${st.color}`)}>{st.label}</span>
          ) : null}
        </div>
        {meta ? <div style={S('margin-top:4px;font:450 13px/1.4 Geist;color:#6B635C')}>{meta}</div> : null}
        {when ? <div style={S('margin-top:2px;font:450 13px/1.4 Geist;color:#8A8179')}>{when}</div> : null}
      </div>
    </Link>
  );
}

function OpenNearYou({ region, apps }) {
  const [res, setRes] = useState(null); // { rows, local } | { error: true }
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setRes(null);
    (async () => {
      try {
        const near = region ? await searchListings({ near: region }) : [];
        const rows = near.length ? near : await searchListings();
        if (alive) setRes({ rows, local: near.length > 0 });
      } catch (err) {
        console.error('Home: loading listings failed', err);
        if (alive) setRes({ error: true });
      }
    })();
    return () => { alive = false; };
  }, [region, attempt]);

  const byListing = new Map((apps || []).map((a) => [a.listing_id, a]));
  const heading = res && res.local && region ? `Open near ${region}` : 'Open on VolunteerU';
  // Things the student can still apply to come first; ones they already
  // applied to follow, and declined or withdrawn ones sink to the end.
  const rank = (l) => {
    const a = byListing.get(l.id);
    if (!a) return 0;
    return a.status === 'accepted' || a.status === 'pending' ? 1 : 2;
  };
  const rows = res && res.rows ? [...res.rows].sort((a, b) => rank(a) - rank(b)).slice(0, MAX_ROWS) : [];
  // searchListings returns one page (80 rows) and carries the exact match
  // count as rows.total; the page length is only a fallback.
  const total = res && res.rows ? (Number.isFinite(res.rows.total) ? res.rows.total : res.rows.length) : 0;
  const seeAll = region && res && res.local ? `/discover?near=${encodeURIComponent(region)}` : '/discover';

  return (
    <section aria-labelledby="home-open-h">
      <div style={S('display:flex;align-items:baseline;justify-content:space-between;gap:12px')}>
        <h2 id="home-open-h" style={S(H2)}>{heading}</h2>
        {total > 0 ? (
          <Link href={seeAll} className={H.link} style={S(LINK)}>{total > MAX_ROWS ? `See all ${total}` : 'See all'}</Link>
        ) : null}
      </div>
      {res && !res.local && region && total > 0 ? (
        <p style={S('margin:6px 0 0;font:450 13px/1.5 Geist;color:#8A8179')}>Nothing posted in {region} yet. These are open elsewhere.</p>
      ) : null}
      <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:10px')}>
        {res === null ? <SkeletonRows n={3} h={96} /> : null}
        {res && res.error ? (
          <div role="alert" style={S(`${CARD};padding:18px 20px`)}>
            <div style={S('font:450 14px/1.5 Geist;color:#57504A')}>Couldn't load opportunities. Check your connection and try again.</div>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className={cx(H.secondary, H.press)}
              style={S('margin-top:12px;height:36px;padding:0 14px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#1A1714;cursor:pointer')}
            >
              Try again
            </button>
          </div>
        ) : null}
        {res && !res.error && total === 0 ? (
          <div style={S(`${CARD};padding:20px`)}>
            <div style={S('font:600 15px/1.3 Geist;color:#1A1714')}>Nothing posted{region ? ` in ${region}` : ''} yet</div>
            <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#6B635C')}>Search registered nonprofits near you instead.</div>
            <Link href="/discover" className={cx(H.press)} style={S('margin-top:14px;display:inline-flex;align-items:center;height:38px;padding:0 16px;border-radius:10px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 13px/1 Geist;text-decoration:none')}>
              Search nonprofits
            </Link>
          </div>
        ) : null}
        {rows.map((l) => <ListingRow key={l.id} listing={l} app={byListing.get(l.id)} />)}
      </div>
    </section>
  );
}

/* Shown in place of a section whose applications didn't load, so an outage
   never reads as "you haven't signed up for anything". */
function LoadError({ text, onRetry }) {
  return (
    <div role="alert" style={S('margin-top:10px')}>
      <div style={S('font:450 13px/1.5 Geist;color:#57504A')}>{text}</div>
      <button
        type="button"
        onClick={onRetry}
        className={cx(H.secondary, H.press)}
        style={S('margin-top:12px;height:36px;padding:0 14px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#1A1714;cursor:pointer')}
      >
        Try again
      </button>
    </div>
  );
}

function Upcoming({ apps, posted, failed, onRetry, bookings, hideEmpty = false }) {
  const router = useRouter();
  const joined = upcomingShifts(apps, posted);
  const booked = (bookings || [])
    .map((b) => {
      const opp = getOpportunity(b.oppId);
      if (!opp) return null;
      const shift = opp.shifts.find((x) => x.id === b.shiftId) || opp.shifts[0];
      return { key: b.id, title: opp.title, when: `${shift.d} at ${startTime(shift.t)}`, where: opp.org, href: `/opportunity/${opp.id}` };
    })
    .filter(Boolean);
  const items = [...booked, ...joined];
  // An organization isn't signing up for shifts, so skip the empty invite.
  if (hideEmpty && apps !== null && posted !== null && !failed && !items.length) return null;

  return (
    <section aria-labelledby="home-upcoming-h" style={S(`${CARD};padding:20px`)}>
      <h2 id="home-upcoming-h" style={S('margin:0;font:600 15px/1.2 Geist;letter-spacing:-0.01em;color:#1A1714')}>Upcoming</h2>
      {apps === null || posted === null ? (
        <div style={S('margin-top:14px')}><SkeletonRows n={1} h={60} /></div>
      ) : failed && !items.length ? (
        <LoadError text="Couldn't load your shifts. Check your connection and try again." onRetry={onRetry} />
      ) : items.length ? (
        <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:10px')}>
          {items.map((it) => (
            <Pressable
              key={it.key}
              label={`${it.title}, ${it.when}${it.pending ? ', applied' : ''}`}
              onClick={() => router.push(it.href)}
              className={cx(H.cardSoft, H.press)}
              style={S('padding:12px 14px;border-radius:11px;border:1px solid #F1EBE4;background:#FCFAF8;cursor:pointer;transition:border-color .16s ease')}
            >
              <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                <span style={S('font:600 14px/1.3 Geist;letter-spacing:-0.01em;color:#1A1714')}>{it.title}</span>
                {it.pending ? (
                  <span style={S(`padding:3px 8px;border-radius:6px;background:${APP_STATUS.pending.bg};font:500 11px/1.2 Geist;color:${APP_STATUS.pending.color}`)}>{APP_STATUS.pending.label}</span>
                ) : null}
              </div>
              <div style={S('margin-top:4px;font:450 13px/1.4 Geist;color:#57504A')}>{it.when}</div>
              {it.where ? <div className="vu-trunc" style={S('margin-top:2px;font:450 12px/1.4 Geist;color:#8A8179')}>{it.where}</div> : null}
            </Pressable>
          ))}
        </div>
      ) : (
        <div style={S('margin-top:10px')}>
          <div style={S('font:450 13px/1.5 Geist;color:#6B635C')}>Shifts you sign up for show up here.</div>
          <Link href="/discover" className={H.link} style={S(`${LINK};display:inline-block;margin-top:10px`)}>Find a shift</Link>
        </div>
      )}
      {failed && items.length ? (
        <LoadError text="Couldn't load the rest of your shifts. Check your connection and try again." onRetry={onRetry} />
      ) : null}
    </section>
  );
}

function YourProject({ proj }) {
  const btn = 'margin-top:14px;display:inline-flex;align-items:center;height:36px;padding:0 14px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#1A1714;text-decoration:none;transition:background .16s ease, border-color .16s ease';
  if (!proj) {
    return (
      <section aria-labelledby="home-project-h" style={S(`${CARD};padding:20px`)}>
        <h2 id="home-project-h" style={S('margin:0;font:600 15px/1.2 Geist;letter-spacing:-0.01em;color:#1A1714')}>Run a student project</h2>
        <p style={S('margin:6px 0 0;font:450 13px/1.5 Geist;color:#6B635C')}>Post one and other students can apply to help.</p>
        <Link href="/create" className={cx(H.secondary, H.press)} style={S(btn)}>Start a student project</Link>
      </section>
    );
  }
  const progress = taskProgress(proj);
  const left = progress.total - progress.done;
  const tutorPos = (proj.positions || []).find((p) => p.t === 'Tutor');
  const short = tutorPos ? Math.max(0, tutorPos.slots - tutorPos.filledCount) : 0;
  const facts = [
    short ? `Needs ${short} more ${plural(short, 'tutor')}` : '',
    progress.total ? (left > 0 ? `${left} of ${progress.total} setup ${plural(progress.total, 'step')} left` : 'Setup steps done') : '',
  ].filter(Boolean);

  return (
    <section aria-labelledby="home-project-h" style={S(`${CARD};padding:20px`)}>
      <h2 id="home-project-h" style={S('margin:0;font:600 15px/1.2 Geist;letter-spacing:-0.01em;color:#1A1714')}>Your project</h2>
      <div style={S('margin-top:10px;font:600 16px/1.3 Geist;letter-spacing:-0.02em;color:#1A1714')}>{proj.name}</div>
      {facts.map((f) => <div key={f} style={S('margin-top:4px;font:450 13px/1.5 Geist;color:#6B635C')}>{f}</div>)}
      {progress.total ? (
        <div role="progressbar" aria-label="Setup steps done" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} style={S('margin-top:12px;height:6px;border-radius:4px;background:#F1EBE4')}>
          <div style={s(`width:${Math.round(progress.pct)}%`, 'height:100%;border-radius:4px;background:#C2603C;transition:width .36s cubic-bezier(.16,1,.3,1)')} />
        </div>
      ) : null}
      <Link href={`/lead/${proj.id}/overview`} className={cx(H.secondary, H.press)} style={S(btn)}>Open project</Link>
    </section>
  );
}

/* An organization account runs only official volunteer programs. It has no
   student project and, unless it logged some, no volunteer hours. */
function isOrgAccount(state) {
  const projects = state.projects || [];
  return projects.length > 0 && projects.every((p) => p.orgClass === 'official');
}

function hasAnyHours(state) {
  const st = state.stats || {};
  return Number(st.verifiedHours || 0) > 0 || Number(st.pendingVerification || 0) > 0 || (state.hoursLog || []).length > 0;
}

/* The organization's programs with their application counts, first in the
   side column so an organizer sees who's waiting before anything else. */
function OrgPrograms({ projects }) {
  const [apps, setApps] = useState(null); // rows | { error: true }
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setApps(null);
    const load = () =>
      loadOwnerApplications({ throwOnError: true })
        .then((rows) => { if (alive) setApps(rows || []); })
        .catch((err) => {
          console.error('Home: loading applications to your programs failed', err);
          if (alive) setApps({ error: true });
        });
    load();
    window.addEventListener('vu:applications-changed', load);
    return () => {
      alive = false;
      window.removeEventListener('vu:applications-changed', load);
    };
  }, [attempt]);

  const btn = 'display:inline-flex;align-items:center;height:36px;padding:0 14px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#1A1714;text-decoration:none;transition:background .16s ease, border-color .16s ease';
  const rows = Array.isArray(apps) ? apps : [];
  const counts = (p) => {
    const mine = rows.filter((a) => p.listingId && a.listing_id === p.listingId);
    return {
      waiting: mine.filter((a) => a.status === 'pending').length,
      accepted: mine.filter((a) => a.status === 'accepted').length,
    };
  };

  return (
    <section aria-labelledby="home-programs-h" style={S(`${CARD};padding:20px`)}>
      <h2 id="home-programs-h" style={S('margin:0;font:600 15px/1.2 Geist;letter-spacing:-0.01em;color:#1A1714')}>
        {projects.length === 1 ? 'Your program' : 'Your programs'}
      </h2>
      {apps && apps.error ? (
        <LoadError text="Couldn't load applications to your programs. Check your connection and try again." onRetry={() => setAttempt((n) => n + 1)} />
      ) : null}
      <div style={S('margin-top:4px;display:flex;flex-direction:column')}>
        {projects.map((p, i) => {
          const c = counts(p);
          const line = apps === null
            ? 'Loading applications'
            : apps.error
              ? ''
              : [
                  c.waiting ? `${c.waiting} ${plural(c.waiting, 'application')} waiting` : 'No applications waiting',
                  c.accepted ? `${c.accepted} accepted` : '',
                ].filter(Boolean).join(', ');
          return (
            <div key={p.id} data-testid="home-program" style={S(`padding:14px 0 2px;${i > 0 ? 'border-top:1px solid #F1EBE4;margin-top:12px' : ''}`)}>
              <div style={S('font:600 16px/1.3 Geist;letter-spacing:-0.02em;color:#1A1714')}>{p.name}</div>
              {line ? <div style={S('margin-top:4px;font:450 13px/1.5 Geist;color:#6B635C')}>{line}</div> : null}
              <div style={S('margin-top:12px;display:flex;gap:10px;flex-wrap:wrap')}>
                {c.waiting && !(apps && apps.error) ? (
                  <Link href={`/lead/${p.id}/applications`} className={cx(H.secondary, H.press)} style={S(btn)}>Review applications</Link>
                ) : null}
                <Link href={`/lead/${p.id}/overview`} className={cx(H.secondary, H.press)} style={S(btn)}>Open program</Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function Home() {
  const { state } = useSnapshot();
  const proj = activeProject();
  const [apps, setApps] = useState(null);
  const [appsFailed, setAppsFailed] = useState(false);
  // Listing id → its upcoming published shifts, for accepted applications
  // with no sign-ups (see upcomingShifts). null while loading.
  const [posted, setPosted] = useState(null);
  const [postedFailed, setPostedFailed] = useState(false);
  // Bumped by "Try again"; it also remounts the project and application
  // lists below so they fetch again.
  const [appsAttempt, setAppsAttempt] = useState(0);
  // Read once per visit: the greeting says "Welcome back" only after the
  // first time this account opened Home.
  const [returning] = useState(() => Boolean(getState().meta && getState().meta.homeVisitedAt));

  useEffect(() => {
    const meta = getState().meta || {};
    if (meta.homeVisitedAt) return;
    update((st) => { st.meta = { ...(st.meta || {}), homeVisitedAt: new Date().toISOString() }; });
  }, []);

  useEffect(() => {
    let alive = true;
    setApps(null);
    setAppsFailed(false);
    setPosted(null);
    setPostedFailed(false);
    (async () => {
      let rows;
      try {
        // throwOnError: a failed read must not look like "no shifts, no applications".
        rows = (await loadMyApplications({ throwOnError: true })) || [];
      } catch (err) {
        console.error('Home: loading applications failed', err);
        if (alive) { setAppsFailed(true); setApps([]); setPosted(new Map()); }
        return;
      }
      if (!alive) return;
      setApps(rows);
      const ids = [...new Set(fallbackCandidates(rows).map((a) => a.listing_id))];
      if (!ids.length) { setPosted(new Map()); return; }
      try {
        const listings = await loadListingsByIds(ids);
        if (alive) setPosted(new Map(listings.map((l) => [l.id, listingShifts(l)])));
      } catch (err) {
        console.error('Home: loading shift lists failed', err);
        if (alive) { setPostedFailed(true); setPosted(new Map()); }
      }
    })();
    return () => { alive = false; };
  }, [appsAttempt]);
  const retryApps = () => setAppsAttempt((n) => n + 1);

  const region = ((state.prefs && state.prefs.location) || String(state.account.city || '').split(',')[0] || '').trim();
  const zip = (state.onboarding && state.onboarding.zip) || state.account.zip || '';
  const nonprofitNear = [region, zip].filter(Boolean).join(' ');
  const org = isOrgAccount(state);
  // Their first name, else the first word of the full name; never a dangling comma.
  const greetName = ((state.account.firstName || '').trim() || (state.account.name || '').trim().split(/\s+/)[0] || '').trim();

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px')}>
      <h1 style={S('margin:0 0 18px;font:600 26px/1.1 Geist;letter-spacing:-0.035em;color:#1A1714')}>
        {[returning ? 'Welcome back' : 'Welcome', greetName].filter(Boolean).join(', ')}
      </h1>
      <SearchCard region={region} />

      {/* One grid so the side column can sit right after the opportunities on
          a phone (where .vu-split collapses to one column) and beside them on
          desktop. The side column spans the three main rows. */}
      <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 320px;gap:28px 24px;margin-top:28px;align-items:start')}>
        <OpenNearYou region={region} apps={apps} />
        <div style={S('grid-row:span 3;display:flex;flex-direction:column;gap:14px')}>
          {org ? (
            <>
              <OrgPrograms projects={state.projects} />
              <Upcoming apps={apps} posted={posted} failed={appsFailed || postedFailed} onRetry={retryApps} bookings={state.bookings} hideEmpty />
              {hasAnyHours(state) ? <HomeCharts /> : null}
            </>
          ) : (
            <>
              <Upcoming apps={apps} posted={posted} failed={appsFailed || postedFailed} onRetry={retryApps} bookings={state.bookings} />
              <HomeCharts />
              <YourProject proj={proj} />
            </>
          )}
        </div>
        <WebNonprofits
          near={nonprofitNear}
          causes={state.prefs.causes || []}
          heading={region ? `Nonprofits near ${region}` : 'Nonprofits near you'}
        />
        {appsFailed ? (
          <section aria-labelledby="home-apps-h" style={S(`${CARD};padding:20px`)}>
            <h2 id="home-apps-h" style={S('margin:0;font:600 16px/1.3 Geist;letter-spacing:-0.015em;color:#1A1714')}>Your projects and applications</h2>
            <LoadError text="Couldn't load your projects and applications. Check your connection and try again." onRetry={retryApps} />
          </section>
        ) : (
          <div key={appsAttempt} style={S('display:flex;flex-direction:column;gap:16px')}>
            <MemberProjects />
            <VolunteerApplications />
          </div>
        )}
      </div>
    </div>
  );
}
