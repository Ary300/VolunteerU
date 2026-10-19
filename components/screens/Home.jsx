'use client';

/* ==========================================================================
   Home.jsx, the signed-in home (/app)
   Search and the category row come first, then a photo grid of live
   opportunities near the student. The right rail holds upcoming shifts, a
   short hours summary and the student's own project. Under the grid: the
   projects the student is in, registered nonprofits nearby and their
   applications. An organization account gets its programs in the rail
   instead of volunteer hours.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { S } from '../../lib/style.js';
import { C, F, R, CATEGORIES } from '../../lib/tokens.js';
import { Button, Pressable } from '../ui.jsx';
import { SearchBar, CategoryRow, ListingCard, StatusText, DateBlock, dateParts, Sep } from '../vu/index.js';
import MemberProjects from '../MemberProjects.jsx';
import WebNonprofits from '../WebNonprofits.jsx';
import HomeCharts from '../HomeCharts.jsx';
import { inWindow } from '../DiscoverListings.jsx';
import { useSnapshot } from '../../lib/store.js';
import { usePhotoPicker } from '../../lib/photos.js';
import { toast } from '../../lib/overlays.js';
import { activeProject, taskProgress, getOpportunity, toggleSaved } from '../../lib/db.js';
import { searchListings, loadMyApplications, loadOwnerApplications, loadListingsByIds, listingShifts, myShiftSignUps } from '../../lib/listings.js';
import { shiftDates } from '../../lib/calendar.js';
import { plural, startTime, splitWhen } from '../../lib/format.js';
import { nextShiftInfo, shiftLabel } from './JoinListing.jsx';

const MAX_CARDS = 6;
const PHONE_QUERY = '(max-width: 719px)';
// Between 900 and 1179px the rail drops below, so three cards still fit.
const THREE_UP_QUERY = '(min-width: 900px) and (max-width: 1179px)';
// Card width in the phone scroller (CARDS.md 1.7): one card plus a peek of the next.
const PHONE_CARD = '248px';

const RAIL_H2 = `margin:0;font:600 17px/1.2 ${F.display};letter-spacing:-0.01em;color:${C.ink}`;
const SEC_H2 = `margin:0;font:650 22px/1.15 ${F.display};letter-spacing:-0.02em;color:${C.ink}`;
const SMALL = `font:400 13px/1.45 ${F.body};color:${C.ink2}`;
const LINK = 'vu-link-ul';

/* The category row on Home filters the grid in place. Same causes as the
   mockup, plus student projects, which used to be a separate link. */
const HOME_CATEGORIES = [
  ...CATEGORIES.filter((c) => !['arts', 'civic'].includes(c.key)),
  { key: 'student', label: 'Student projects', short: 'Students', icon: 'users', cause: null },
];

/* The photo badge for the viewer's own application (CARDS.md 1.4): accepted
   reads "You're in", pending reads "Applied", anything else shows nothing. */
const APP_BADGE = { accepted: 'in', pending: 'applied' };

/* Viewport bucket for the grid: 'phone' (sideways scroller), 'three'
   (900 to 1179px: globals.css drops vu-grid-3 to 2 columns under 1180px,
   Home keeps 3 so six photos don't stack three screens tall), or 'wide'. Starts
   'wide' so server and first client render agree; listings load after
   mount, so the switch happens before any card shows. */
function useGridMode() {
  const [mode, setMode] = useState('wide');
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const phone = window.matchMedia(PHONE_QUERY);
    const three = window.matchMedia(THREE_UP_QUERY);
    const sync = () => setMode(phone.matches ? 'phone' : three.matches ? 'three' : 'wide');
    sync();
    phone.addEventListener('change', sync);
    three.addEventListener('change', sync);
    return () => {
      phone.removeEventListener('change', sync);
      three.removeEventListener('change', sync);
    };
  }, []);
  return mode;
}

/* True while the rail sits beside the main column (globals.css stacks
   .vu-layout-rail to one column under 1180px). Starts true so server and
   first client render agree. */
const RAIL_BESIDE_QUERY = '(min-width: 1180px)';
function useRailBeside() {
  const [beside, setBeside] = useState(true);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(RAIL_BESIDE_QUERY);
    const sync = () => setBeside(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return beside;
}

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

/* Start of a listing's next session in ms, or MAX when unknown or past. */
function nextStart(listing) {
  if (!hasUpcomingShift(listing.next_session)) return Number.MAX_SAFE_INTEGER;
  const [d, t] = splitSession(listing.next_session);
  return startMs(d, t);
}

/* Applications that may hold shift sign-ups. A pending applicant can sign up
   for shifts before the organizer answers (the join page says so). */
const SIGNUP_STATUSES = ['pending', 'accepted'];

/* Accepted applications with no shift sign-ups at all whose stored next shift
   is still ahead. If their listing publishes no shift list, the volunteer is
   expected at that next shift, so Home needs the listing's shifts to tell. */
function fallbackCandidates(apps) {
  return (apps || []).filter(
    (a) => a.status === 'accepted' && a.listings && !a.listings.unlisted && !myShiftSignUps(a).length && hasUpcomingShift(a.listings.next_session),
  );
}

const orgName = (listing) => String(listing.site || '').split(',')[0].trim();

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
    // An archived project's listing is hidden from members, so only the saved
    // copy comes back, marked unlisted: it has no more shifts to go to.
    if (a.listings.unlisted) continue;
    const href = `/join/${a.listing_id}`;
    for (const sh of myShiftSignUps(a)) {
      if (sh.past) continue;
      out.push({
        key: `${a.id}:${sh.id}`,
        title: a.listings.name,
        when: shiftLabel(sh),
        date: sh.d,
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
      date: d,
      where: orgName(a.listings),
      href: `/join/${a.listing_id}`,
      pending: false,
      start: startMs(d, t),
    });
  }
  return out.sort((x, y) => x.start - y.start);
}

/* What the grid asks searchListings for, per category. `local` filters by
   the saved place first and falls back to everywhere when nothing matches. */
function queryFor(cat, region) {
  if (cat.key === 'online') return { filters: { place: 'online' }, local: false };
  if (cat.key === 'student') return { filters: { kind: 'student' }, local: Boolean(region) };
  if (cat.cause) return { filters: { causes: [cat.cause] }, local: Boolean(region) };
  return { filters: {}, local: Boolean(region) };
}

/* Discover link carrying the same filters as the grid. near is always set:
   the saved place when the grid was local, empty otherwise, so Discover
   doesn't re-apply the saved location to a grid that fell back to
   everywhere (or ignored location, as Online does). A "this week" grid
   links with when=week, so Discover lists and counts the same week. */
function discoverHref(cat, region, local, week) {
  const qs = new URLSearchParams();
  qs.set('near', local && region ? region : '');
  if (week) qs.set('when', 'week');
  if (cat.key === 'online') qs.set('place', 'online');
  if (cat.key === 'student') qs.set('kind', 'student');
  if (cat.cause) qs.set('causes', cat.cause);
  const s = qs.toString();
  return s ? `/discover?${s}` : '/discover';
}

/* Section heading for the grid. "this week" only when every card shown has
   its next session in the coming 7 days. */
function gridHeading(cat, region, local, allThisWeek) {
  const week = allThisWeek ? ' this week' : '';
  if (cat.key === 'online') return `Online and remote${week}`;
  const place = local && region ? ` near ${region}` : '';
  if (cat.key === 'student') return `Student projects${place || ' on VolunteerU'}${week}`;
  if (cat.cause) return `${cat.label}${place || ' on VolunteerU'}${week}`;
  return place ? `Open${place}${week}` : `Open on VolunteerU${week}`;
}

/* Empty grid heading, per category. Cause labels are nouns ("Animals",
   "Seniors"), so they follow "for" instead of sitting in front of
   "opportunities". */
function emptyTitle(cat, region) {
  if (cat.key === 'near') return `Nothing posted${region ? ` in ${region}` : ''} yet`;
  if (cat.key === 'student') return 'No student projects posted yet';
  if (cat.key === 'online') return 'No online opportunities posted yet';
  return `Nothing posted for ${cat.label.toLowerCase()} yet`;
}

function GridSkeleton({ phone }) {
  return (
    <div className={phone ? 'vu-hscroll' : 'vu-grid-3'} aria-hidden="true" style={phone ? S(`margin:0 -16px;padding:0 16px;display:grid;grid-auto-flow:column;grid-auto-columns:${PHONE_CARD}`) : undefined}>
      {Array.from({ length: phone ? 2 : 3 }, (_, i) => (
        <div key={i}>
          <div className="vu-skel" style={S(`aspect-ratio:4/3;border-radius:${R.photo}`)} />
          <div className="vu-skel" style={S(`margin-top:10px;height:16px;width:70%;border-radius:${R.pill}`)} />
          <div className="vu-skel" style={S(`margin-top:8px;height:13px;width:50%;border-radius:${R.pill}`)} />
        </div>
      ))}
    </div>
  );
}

function OpenNearYou({ region, apps, cat, mode }) {
  const phone = mode === 'phone';
  const threeUp = mode === 'three';
  const { state } = useSnapshot();
  const [res, setRes] = useState(null); // { rows, local } | { error: true }
  const [attempt, setAttempt] = useState(0);
  const saved = state.saved || [];

  useEffect(() => {
    let alive = true;
    setRes(null);
    const { filters, local } = queryFor(cat, region);
    (async () => {
      try {
        const near = local ? await searchListings({ ...filters, near: region }) : [];
        const rows = near.length ? near : await searchListings(filters);
        if (alive) setRes({ rows, local: near.length > 0 });
      } catch (err) {
        console.error('Home: loading listings failed', err);
        if (alive) setRes({ error: true });
      }
    })();
    return () => { alive = false; };
  }, [region, attempt, cat]);

  const byListing = new Map((apps || []).map((a) => [a.listing_id, a]));
  // Things the student can still apply to come first, soonest session first;
  // ones they already applied to follow, and declined or withdrawn ones sink.
  const rank = (l) => {
    const a = byListing.get(l.id);
    if (!a) return 0;
    return a.status === 'accepted' || a.status === 'pending' ? 1 : 2;
  };
  const rows = res && res.rows
    ? [...res.rows].sort((a, b) => rank(a) - rank(b) || nextStart(a) - nextStart(b)).slice(0, MAX_CARDS)
    : [];
  // Same rule as Discover and the /join page: a listing shows its own photo or
  // its cause tile, never a stock photo, so the card matches its detail page.
  const photos = usePhotoPicker(rows, { seed: false });
  // searchListings returns one page (80 rows) and carries the exact match
  // count as rows.total; the page length is only a fallback.
  const total = res && res.rows ? (Number.isFinite(res.rows.total) ? res.rows.total : res.rows.length) : 0;
  const local = Boolean(res && res.local);
  // "this week" uses Discover's own When rule (inWindow), so the heading,
  // the count on "See all" and the page it opens all mean the same week.
  const now = new Date();
  const allThisWeek = rows.length > 0 && rows.every((l) => inWindow(l, 'week', now));
  const heading = gridHeading(cat, region, local, allThisWeek);
  const seeAll = discoverHref(cat, region, local, allThisWeek);
  // Under a "this week" heading the number counts this week's listings. That
  // is exact only when the loaded page holds every match; otherwise the link
  // carries no number and Discover counts them.
  const pageComplete = Boolean(res && res.rows && !res.rows.hasMore && res.rows.length >= total);
  const seeAllCount = allThisWeek
    ? (pageComplete ? res.rows.filter((l) => inWindow(l, 'week', now)).length : null)
    : total;
  const fellBack = res && !res.error && !local && region && cat.key !== 'online' && total > 0;

  function save(listing) {
    const now2 = toggleSaved(listing.id);
    toast(now2
      ? { title: 'Saved', message: listing.name, tone: 'ok', actionLabel: 'Undo', onAction: () => toggleSaved(listing.id) }
      : { title: 'Removed from saved', message: listing.name, tone: 'brand', actionLabel: 'Undo', onAction: () => toggleSaved(listing.id) });
  }

  return (
    <section aria-labelledby="home-open-h" aria-busy={res === null ? 'true' : undefined}>
      <div className="vu-sec-head">
        <h2 id="home-open-h" style={S(`${SEC_H2};font-size:clamp(20px, 5.2vw, 22px)`)}>{heading}</h2>
        {total > 0 ? (
          <Link href={seeAll} className={LINK} style={S(`flex:none;font:600 15px/1.2 ${F.body}`)}>
            {seeAllCount !== null && seeAllCount > rows.length ? `See all ${seeAllCount}` : 'See all'}
          </Link>
        ) : null}
      </div>
      {fellBack ? (
        <p style={S(`margin:6px 0 0;${SMALL}`)}>Nothing posted in {region} yet. These are open elsewhere.</p>
      ) : null}

      <div style={S('margin-top:18px')}>
        {res === null ? <GridSkeleton phone={phone} /> : null}
        {res && res.error ? (
          <div role="alert">
            <p style={S(`margin:0;font:400 15px/1.5 ${F.body};color:${C.ink2}`)}>Couldn't load opportunities. Check your connection and try again.</p>
            <div style={S('margin-top:12px')}>
              <Button size="sm" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
            </div>
          </div>
        ) : null}
        {res && !res.error && total === 0 ? (
          <div>
            <p style={S(`margin:0;font:400 15px/1.5 ${F.body};color:${C.ink2}`)}>
              {emptyTitle(cat, region)}. Search registered nonprofits near you instead.
            </p>
            <div style={S('margin-top:12px')}>
              <Button size="sm" href="/discover">Search nonprofits</Button>
            </div>
          </div>
        ) : null}
        {rows.length ? (
          <div
            className={phone ? 'vu-hscroll' : 'vu-grid-3'}
            style={phone
              ? S(`margin:0 -16px;padding:0 16px;scroll-padding:0 16px;display:grid;grid-auto-flow:column;grid-auto-columns:${PHONE_CARD}`)
              : threeUp ? S('grid-template-columns:repeat(3, minmax(0, 1fr))') : undefined}
          >
            {rows.map((l) => {
              const app = byListing.get(l.id);
              const isSaved = saved.includes(l.id);
              // The card reads date and time from the stored label. A past or
              // missing next shift falls back to the first published shift,
              // else no date (the tile then says "No dates yet").
              const shifts = listingShifts(l);
              const when = hasUpcomingShift(l.next_session) ? l.next_session : shifts[0] ? shiftLabel(shifts[0]) : '';
              return (
                <ListingCard
                  key={l.id}
                  href={`/join/${l.id}`}
                  title={l.name}
                  org={orgName(l)}
                  verified={Boolean(l.verified)}
                  studentProject={l.org_class === 'student'}
                  when={when}
                  moreDates={when && shifts.length > 1 ? shifts.length - 1 : 0}
                  online={l.delivery === 'remote'}
                  photo={photos.get(l.id)}
                  cause={l.cause}
                  saved={isSaved}
                  onToggleSave={() => save(l)}
                  headingLevel={3}
                  badge={app ? APP_BADGE[app.status] || '' : ''}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* Shown in place of a section whose data didn't load, so an outage never
   reads as "you haven't signed up for anything". */
function LoadError({ text, onRetry }) {
  return (
    <div role="alert" style={S('margin-top:10px')}>
      <p style={S(`margin:0;${SMALL}`)}>{text}</p>
      <div style={S('margin-top:12px')}>
        <Button size="sm" icon="refresh" onClick={onRetry}>Try again</Button>
      </div>
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
      return { key: b.id, title: opp.title, when: `${shift.d} at ${startTime(shift.t)}`, date: shift.d, where: opp.org, href: `/opportunity/${opp.id}` };
    })
    .filter(Boolean);
  const items = [...booked, ...joined];
  // An organization isn't signing up for shifts, so skip the empty invite.
  if (hideEmpty && apps !== null && posted !== null && !failed && !items.length) return null;

  return (
    <section aria-labelledby="home-upcoming-h" className="vu-rail-sec">
      <h2 id="home-upcoming-h" style={S(RAIL_H2)}>Upcoming</h2>
      {apps === null || posted === null ? (
        <div aria-hidden="true" style={S('margin-top:14px;display:flex;gap:16px;align-items:center')}>
          <div className="vu-skel" style={S(`width:56px;height:60px;border-radius:${R.control}`)} />
          <div style={S('flex:1')}>
            <div className="vu-skel" style={S(`height:14px;width:80%;border-radius:${R.pill}`)} />
            <div className="vu-skel" style={S(`margin-top:8px;height:12px;width:55%;border-radius:${R.pill}`)} />
          </div>
        </div>
      ) : failed && !items.length ? (
        <LoadError text="Couldn't load your shifts. Check your connection and try again." onRetry={onRetry} />
      ) : items.length ? (
        <div style={S('margin-top:4px')}>
          {items.map((it, i) => {
            // The date block carries the weekday, day and month, so the meta
            // line is the time and place. Without the month a Nov 7 shift
            // read as a bare "Sat 7".
            const { time } = splitWhen(it.when);
            const dated = Boolean(dateParts(it.date || it.when));
            const last = i === items.length - 1;
            return (
              <Pressable
                key={it.key}
                label={`${it.title}, ${it.when}${it.pending ? ', applied' : ''}`}
                onClick={() => router.push(it.href)}
                className={dated ? 'vu-row vu-home-up' : 'vu-row vu-row--nolead vu-home-up'}
                style={S(`cursor:pointer;${last ? 'border-bottom:0;padding-bottom:0' : ''}`)}
              >
                {dated ? <DateBlock date={it.date || it.when} size="md" month /> : null}
                <span style={S('display:block;min-width:0')}>
                  <span className="vu-row-t vu-home-up-t">{it.title}</span>
                  <span className="vu-row-m">
                    {time || (dated ? '' : it.when)}
                    {(time || !dated) && it.where ? <Sep /> : null}
                    {it.where}
                  </span>
                  {it.pending ? (
                    <span style={S('display:block;margin-top:8px')}><StatusText tone="wait">Applied</StatusText></span>
                  ) : null}
                </span>
              </Pressable>
            );
          })}
        </div>
      ) : (
        (() => {
          // Applications still waiting on an answer, with no shift picked yet:
          // say so, so the student can see they've already done something.
          const waiting = (apps || []).filter((a) => a && a.listings && !a.listings.unlisted && (a.status === 'pending' || a.status === 'waitlisted')).length;
          return (
            <div style={S('margin-top:8px')}>
              <p style={S(`margin:0;${SMALL}`)}>
                {waiting
                  ? `${waiting === 1 ? '1 application is' : `${waiting} applications are`} waiting to hear back. Shifts you sign up for show up here.`
                  : 'Shifts you sign up for show up here.'}
              </p>
              <span style={S('display:flex;gap:8px 20px;flex-wrap:wrap;margin-top:12px')}>
                {waiting ? <Link href="/profile?focus=applications" className={LINK} style={S(`display:inline-block;font:600 14px/1.2 ${F.body}`)}>See your applications</Link> : null}
                <Link href="/discover" className={LINK} style={S(`display:inline-block;font:600 14px/1.2 ${F.body}`)}>Find a shift</Link>
              </span>
            </div>
          );
        })()
      )}
      {failed && items.length ? (
        <LoadError text="Couldn't load the rest of your shifts. Check your connection and try again." onRetry={onRetry} />
      ) : null}
    </section>
  );
}

function YourProject({ proj }) {
  if (!proj) {
    return (
      <section aria-labelledby="home-project-h" className="vu-rail-sec">
        <h2 id="home-project-h" style={S(RAIL_H2)}>Run a student project</h2>
        <p style={S(`margin:6px 0 12px;${SMALL}`)}>Post one and other students can apply to help.</p>
        <Button variant="dark" size="sm" href="/create">Start a student project</Button>
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
    <section aria-labelledby="home-project-h" className="vu-rail-sec">
      <h2 id="home-project-h" style={S(RAIL_H2)}>Your project</h2>
      <div style={S(`margin-top:10px;font:600 16px/1.3 ${F.body};color:${C.ink}`)}>{proj.name}</div>
      {facts.map((f) => <div key={f} style={S(`margin-top:2px;${SMALL}`)}>{f}</div>)}
      {progress.total ? (
        <div role="progressbar" aria-label="Setup steps done" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} style={S(`margin-top:12px;height:6px;border-radius:${R.pill};background:${C.line};overflow:hidden`)}>
          <div style={S(`width:${Math.round(progress.pct)}%;height:100%;border-radius:${R.pill};background:${C.ink};transition:width .36s cubic-bezier(.16,1,.3,1)`)} />
        </div>
      ) : null}
      <Button size="sm" href={`/lead/${proj.id}/overview`} extra="margin-top:14px">Open project</Button>
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
   rail so an organizer sees who's waiting before anything else. */
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

  const rows = Array.isArray(apps) ? apps : [];
  const counts = (p) => {
    const mine = rows.filter((a) => p.listingId && a.listing_id === p.listingId);
    return {
      waiting: mine.filter((a) => a.status === 'pending').length,
      accepted: mine.filter((a) => a.status === 'accepted').length,
    };
  };

  return (
    <section aria-labelledby="home-programs-h" className="vu-rail-sec">
      <h2 id="home-programs-h" style={S(RAIL_H2)}>
        {projects.length === 1 ? 'Your program' : 'Your programs'}
      </h2>
      {apps && apps.error ? (
        <LoadError text="Couldn't load applications to your programs. Check your connection and try again." onRetry={() => setAttempt((n) => n + 1)} />
      ) : null}
      <div style={S('margin-top:4px')}>
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
          const review = c.waiting && !(apps && apps.error);
          const last = i === projects.length - 1;
          // One row per program: the name opens it, and the single button is
          // the next thing to do (review waiting applications, else open it).
          return (
            <div key={p.id} data-testid="home-program" className="vu-row vu-row--nolead" style={S(`grid-template-columns:minmax(0,1fr);row-gap:12px;${last ? 'border-bottom:0;padding-bottom:0' : ''}`)}>
              <div style={S('min-width:0')}>
                <Link href={`/lead/${p.id}/overview`} className="vu-row-t vu-home-up-t" style={S('text-decoration-line:none')}>{p.name}</Link>
                {line ? <span className="vu-row-m">{line}</span> : null}
              </div>
              <div className="vu-row-end" style={S('grid-column:1;justify-content:flex-start')}>
                {review ? (
                  <Button variant="dark" size="sm" href={`/lead/${p.id}/applications`}>Review applications</Button>
                ) : (
                  <Button size="sm" href={`/lead/${p.id}/overview`}>Open program</Button>
                )}
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
  const router = useRouter();
  const mode = useGridMode();
  const phone = mode === 'phone';
  const railBeside = useRailBeside();
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
  // The rail's "Your hours" is the one hours summary on Home. MemberProjects
  // is told so it lists each project's entries without a second summary.
  const railHours = !org || hasAnyHours(state);
  // Projects the student is in get their own slot in the layout grid, so on
  // a phone (one column) they come right after the opportunities and before
  // the rail. A failed read shows its error in the same slot.
  const memberSlot = appsFailed || (Array.isArray(apps) && apps.some((a) => a.status === 'accepted'));
  // The project blocks list each project's hours with their own Log hours
  // button, so the rail drops its own Log hours button while they show.
  const projectsShown = !appsFailed && Array.isArray(apps) && apps.some((a) => a.status === 'accepted');

  const [what, setWhat] = useState('');
  const [where, setWhere] = useState(region);
  useEffect(() => setWhere(region), [region]);
  const [when, setWhen] = useState('');
  const [catKey, setCatKey] = useState('near');
  const cat = HOME_CATEGORIES.find((c) => c.key === catKey) || HOME_CATEGORIES[0];

  function search({ what: w, where: p, when: t }) {
    const qs = new URLSearchParams();
    if (w) qs.set('q', w);
    // Always pass near, even empty, so clearing "Where" searches everywhere
    // instead of Discover falling back to the saved location.
    qs.set('near', p);
    // Discover filters on the next shift falling inside this window.
    if (t) qs.set('when', t);
    router.push(`/discover?${qs.toString()}`);
  }

  return (
    <div className="vu-page vu-screen">
      <h1 className="vu-sr">{region ? `Find volunteer work near ${region}` : 'Find volunteer work'}</h1>
      <SearchBar
        what={what}
        onWhat={setWhat}
        where={where}
        onWhere={setWhere}
        when={when}
        onWhen={setWhen}
        onSubmit={search}
      />
      <div style={S('margin-top:28px')}>
        <CategoryRow
          value={catKey}
          items={HOME_CATEGORIES}
          short={phone}
          label="Show opportunities for"
          onChange={(key) => setCatKey(key)}
        />
      </div>

      {/* One grid. Beside the rail (1180px and up) the main column holds the
          opportunities, the projects the student is in and then everything
          else, and the rail spans all three rows. Stacked (under 1180px) the
          DOM order holds: opportunities, projects you're in, the rail, then
          nonprofits and applications. */}
      <div className="vu-layout-rail" style={S('margin-top:36px;row-gap:56px')}>
        <div style={S(`min-width:0;${railBeside ? 'grid-column:1' : ''}`)}>
          <OpenNearYou region={region} apps={apps} cat={cat} mode={mode} />
        </div>
        {memberSlot ? (
          <div style={S(`min-width:0;${railBeside ? 'grid-column:1' : ''}`)}>
            {appsFailed ? (
              <section aria-labelledby="home-apps-h">
                <h2 id="home-apps-h" style={S(SEC_H2)}>Your projects and applications</h2>
                <LoadError text="Couldn't load your projects and applications. Check your connection and try again." onRetry={retryApps} />
              </section>
            ) : (
              <MemberProjects key={`m${appsAttempt}`} hoursInRail={railHours} />
            )}
          </div>
        ) : null}
        <aside
          aria-label="Your shifts, hours and project"
          style={S(`min-width:0;${railBeside ? `grid-column:2;grid-row:1 / span ${memberSlot ? 3 : 2}` : ''}`)}
        >
          {org ? (
            <>
              <OrgPrograms projects={state.projects} />
              <Upcoming apps={apps} posted={posted} failed={appsFailed || postedFailed} onRetry={retryApps} bookings={state.bookings} hideEmpty />
              {railHours ? <HomeCharts projectsShown={projectsShown} /> : null}
            </>
          ) : (
            <>
              <Upcoming apps={apps} posted={posted} failed={appsFailed || postedFailed} onRetry={retryApps} bookings={state.bookings} />
              <HomeCharts projectsShown={projectsShown} />
              <YourProject proj={proj} />
            </>
          )}
        </aside>
        {/* Nonprofits nearby. The full applications list lives on My crew
            and Profile; Home only surfaces pending ones in Upcoming. */}
        <div style={S(`min-width:0;display:flex;flex-direction:column;gap:56px;${railBeside ? 'grid-column:1' : ''}`)}>
          <WebNonprofits
            near={nonprofitNear}
            causes={state.prefs.causes || []}
            /* No heading: the list comes from IRS records for the whole
               state, so WebNonprofits titles it from the scope it searched
               ("Nonprofits in Indiana"), the same as Discover. */
          />
        </div>
      </div>
    </div>
  );
}
