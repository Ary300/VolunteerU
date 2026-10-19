'use client';

/* ==========================================================================
   Profile.jsx, the student's profile and hours
   The one screen where hours are the hero. Totals are kept apart on purpose:
   - confirmed: hours an organizer confirmed on a project the student joined
   - waiting: hours logged on a joined project the organizer hasn't confirmed
   - logged on your own: entries from the Log hours form (nobody can confirm)
   Layout: identity row, then a section nav (Hours, Applications, Notes from
   organizers, About) of in-page links that jump to each section on one page
   and only shows when the page is long enough to need it, with badges and the
   counselor download in the right rail. No boxes: each
   section is a heading plus rows, and numbers read as sentences.
   ========================================================================== */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { S, s as sx, cx } from '../../lib/style.js';
import { C, F, R } from '../../lib/tokens.js';
import { ImageSlot, Avatar, Field, TextArea, Icon, Button } from '../ui.jsx';
import { HoursSummary, ShareHoursCard, Sep, fmtHours } from '../vu/index.js';
import { safeUrl } from '../MemberProjects.jsx';
import { track } from '../../lib/analytics.js';
import { useSnapshot } from '../../lib/store.js';
import { openModal, toast, confirmDialog } from '../../lib/overlays.js';
import { download, updateAccount, removeHoursLog, syncMyServiceHours, csvDate, csvHourStatus } from '../../lib/db.js';
import { loadMyApplications, memberHourEntries, removeMemberHours } from '../../lib/listings.js';
import { badges as BADGE_DEFS } from '../../lib/seed.js';
import { openLogHours, sortByLogDate, causeLabel } from '../LogHoursForm.jsx';
import MyRatings, { ratingsFrom, averageStars, starsLabel } from '../MyRatings.jsx';
import MyServiceHours, { hrsShort, shiftRows, NoShifts, nextSignUpDate, Attendance, helpedPlaces, Helped } from '../MyServiceHours.jsx';
import VolunteerApplications from '../VolunteerApplications.jsx';

const SHIFT_PREVIEW = 6;
const NAV_GAP = 32; // the section nav's margin-top
const NAV_MIN_SCROLL = 240; // px of scroll below which the section nav is left out
/* A ghost Button used as an inline text link: no side padding or border, so
   the underlined text lines up with the text column above it. */
const INLINE_LINK = 'height:auto;padding:0;border:0';
const H2 = `margin:0;font:650 24px/1.15 ${F.display};letter-spacing:-0.02em;color:${C.ink}`;
const H2_RAIL = `margin:0;font:600 19px/1.2 ${F.display};letter-spacing:-0.01em;color:${C.ink}`;


const round1 = (n) => Math.round(Number(n || 0) * 10) / 10;
const hoursWord = (n) => `${round1(n)} ${round1(n) === 1 ? 'hour' : 'hours'}`;
const lower = (v) => String(v || '').trim().toLowerCase();

/* ---- pure helpers -------------------------------------------------------- */

/** Org-logged hours from the volunteer's accepted applications, plus the
    listing's cause for the cause rows. Two sources:
    - member_state.hoursLog: hours the volunteer logged. Once the lead confirms
      one, its hours come from the lead's snapshot in
      assignment.confirmedHours (memberHourEntries), never from the log, which
      the volunteer can still edit after the confirmation.
    - assignment.attendanceHours: shifts the lead posted in Attendance; the lead
      wrote them, so they are confirmed */
export function summarizeService(apps) {
  const out = { verified: 0, pending: 0, entries: [] };
  for (const app of apps || []) {
    if (app.status !== 'accepted' || !app.listings) continue;
    const assignment = app.assignment || {};
    const posted = Array.isArray(assignment.attendanceHours) ? assignment.attendanceHours.filter((h) => h && h.id) : [];
    const base = { org: app.listings.name || 'A project', cause: app.listings.cause || '', applicationId: app.id };
    for (const h of memberHourEntries(app)) {
      const verified = !!h.confirmed;
      const hrs = Number(h.hrs) || 0;
      // Hours the organizer chose not to confirm aren't waiting on anyone.
      if (verified) out.verified += hrs; else if (!h.declined) out.pending += hrs;
      // `id` is unique across applications (hour ids repeat between them);
      // `hourId` is the id inside this application's log.
      out.entries.push({ ...h, ...base, id: `${app.id}:${h.id}`, hourId: h.id, hrs, verified });
    }
    for (const h of posted) {
      const hrs = Number(h.hrs) || 0;
      if (hrs <= 0) continue;
      out.verified += hrs;
      out.entries.push({ ...h, ...base, id: `${app.id}:${h.id}`, hourId: h.id, activity: h.activity || 'Shift', hrs, verified: true, source: 'attendance' });
    }
  }
  out.verified = round1(out.verified);
  out.pending = round1(out.pending);
  // Confirmed first, newest first within each group.
  out.entries = sortByLogDate(out.entries).sort((a, b) => Number(b.verified) - Number(a.verified));
  return out;
}

/** Hours per cause across project hours and self-logged categories. */
export function causeTotals(serviceEntries, hoursLog) {
  const m = new Map();
  const add = (name, hrs) => {
    const k = (name || '').trim();
    if (!k) return;
    m.set(k, round1((m.get(k) || 0) + (Number(hrs) || 0)));
  };
  // Hours the organizer didn't confirm don't count toward any cause.
  for (const e of serviceEntries || []) if (!e.declined) add(e.cause, e.hrs);
  for (const h of hoursLog || []) add(h.category, h.hrs);
  return [...m.entries()].map(([name, n]) => ({ name, n })).filter((b) => b.n > 0).sort((a, b) => b.n - a.n);
}

/** Badge progress computed from data, never from stored "earned" strings. */
export function badgeStatus(b, facts) {
  const have = b.kind === 'hours' ? facts.confirmed : b.kind === 'orgs' ? facts.orgs : b.kind === 'causes' ? facts.causes : facts.projects;
  const need = Number(b.need) || 0;
  const pct = need > 0 ? Math.min(100, Math.round((have / need) * 100)) : 0;
  if (have >= need) return { on: true, line: 'Earned', pct: 100 };
  const left = round1(need - have);
  if (b.kind === 'hours') return { on: false, line: `${hoursWord(left)} to go`, pct };
  if (b.kind === 'orgs') return { on: false, line: `${left} more ${left === 1 ? 'organization' : 'organizations'}`, pct };
  if (b.kind === 'causes') return { on: false, line: `${left} more ${left === 1 ? 'cause' : 'causes'}`, pct };
  return { on: false, line: 'Run 1 student project', pct };
}

/* Activity and organization names are typed by the student and by project
   leads, so a text cell that starts like a formula (=, +, -, @, tab, CR) gets a
   leading quote and every cell is quoted before a spreadsheet opens the file.
   Plain numbers pass through as numbers. Same rule as the lead roster export;
   switch to the shared helper once lib/ has one (see db.hoursCSV). */
function csvEscape(v) {
  const raw = String(v == null ? '' : v);
  const plainNumber = typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(raw);
  const t = !plainNumber && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${t.replace(/"/g, '""')}"`;
}

/** Every hour on the profile, with its status spelled out, newest first. */
export function hoursCSV(serviceEntries, hoursLog) {
  const head = ['Date', 'Activity', 'Organization', 'Hours', 'Status'];
  const all = [
    ...(serviceEntries || []).map((e) => ({ date: e.date, row: [csvDate(e.date), e.activity || e.name, e.org, e.hrs, csvHourStatus(e)] })),
    ...(hoursLog || []).map((h) => ({ date: h.date, row: [csvDate(h.date), h.name, h.org, h.hrs, 'Logged on your own'] })),
  ];
  const rows = sortByLogDate(all).map((x) => x.row);
  return { count: rows.length, text: [head, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n') };
}

function shareLink() {
  return typeof window !== 'undefined' ? window.location.origin : 'https://volunteeru.app';
}

/* ---- screen -------------------------------------------------------------- */

export default function Profile() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { state } = useSnapshot();
  const badgesRef = useRef(null);
  const tabsRef = useRef(null);
  const pinRef = useRef({ v: '', until: 0 });

  const [apps, setApps] = useState(null);
  const [svc, setSvc] = useState(null);
  const [svcError, setSvcError] = useState(false);
  const [tab, setTab] = useState('hours');
  // The section nav only earns its place when the page scrolls far enough
  // for a jump to move the content. On a short page (a new account) every
  // section is already on screen, so the links would only move an underline.
  const [navOn, setNavOn] = useState(true);
  const navOnRef = useRef(true);

  const loadService = useCallback(async () => {
    setSvcError(false);
    try {
      const rows = await loadMyApplications({ throwOnError: true });
      setApps(rows);
      setSvc(summarizeService(rows));
    } catch (e) {
      console.error('Profile: loading project hours failed', e);
      setSvcError(true);
    }
  }, []);

  useEffect(() => { loadService(); }, [loadService]);

  const a = state.account;
  const isolated = params.get('cause') || '';
  const showAll = params.get('history') === 'all';
  const focus = params.get('focus');

  const svcEntries = svc ? svc.entries : [];
  // No useMemo on state.hoursLog: db.logHours/removeHoursLog change that array
  // in place, so its reference stays the same after a new entry.
  const selfLog = sortByLogDate(state.hoursLog || []);
  // Confirmed means an organizer wrote it on the application (assignment).
  // hoursLog is the volunteer's own editable slice, so nothing in it counts as
  // confirmed, even an old entry stored with verified: true.
  const ownLogged = round1(selfLog.reduce((t, h) => t + Number(h.hrs || 0), 0));
  const confirmed = round1(svc ? svc.verified : Number(state.stats.verifiedHours) || 0);
  const waiting = svc ? svc.pending : 0;

  const causes = causeTotals(svcEntries, selfLog);
  const orgCount = new Set([...svcEntries.map((e) => e.org), ...selfLog.map((h) => h.org)].map(lower).filter(Boolean)).size;
  const studentProjects = (state.projects || []).filter((p) => p.orgClass !== 'official').length;
  const facts = { confirmed, orgs: orgCount, causes: causes.length, projects: studentProjects };
  const topConfirmedCause = causeTotals(svcEntries.filter((e) => e.verified), [])[0];

  const allRows = shiftRows(svcEntries, selfLog);
  const filteredRows = isolated ? allRows.filter((r) => (r.cause || '') === isolated) : allRows;
  const rows = showAll ? filteredRows : filteredRows.slice(0, SHIFT_PREVIEW);
  const ratings = apps ? ratingsFrom(apps) : [];
  const notes = state.leadFeedback || [];
  const noteCount = ratings.length + notes.length;
  const helped = helpedPlaces(apps, svcEntries, selfLog);

  const sections = [
    { v: 'hours', l: 'Hours', id: 'vu-sec-hours' },
    { v: 'apps', l: 'Applications', id: 'vu-applications', count: apps ? apps.length : undefined },
    ...(noteCount ? [{ v: 'notes', l: 'Notes from organizers', id: 'vu-sec-notes', count: noteCount }] : []),
    { v: 'about', l: 'About', id: 'vu-sec-about' },
  ];
  const sectionKey = sections.map((x) => x.id).join('|');

  /* Show the nav only when the page, measured without the nav itself, scrolls
     more than NAV_MIN_SCROLL. Re-measured whenever the page changes height
     (project hours and applications load after the first paint). */
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const doc = document.documentElement;
        const bar = tabsRef.current;
        const own = navOnRef.current && bar ? bar.offsetHeight + NAV_GAP : 0;
        const need = doc.scrollHeight - own - window.innerHeight > NAV_MIN_SCROLL;
        if (need !== navOnRef.current) { navOnRef.current = need; setNavOn(need); }
      });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(document.body);
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); if (ro) ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  /* The link under the sticky bar follows the scroll position. */
  useEffect(() => {
    let raf = 0;
    const ids = sectionKey.split('|');
    const keys = sections.map((x) => x.v);
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // A tab the user just picked stays picked while its jump settles,
        // even when a short last section can't scroll to the top.
        if (Date.now() < pinRef.current.until) { setTab(pinRef.current.v); return; }
        const bar = tabsRef.current && navOnRef.current ? tabsRef.current.getBoundingClientRect().bottom : 0;
        let cur = keys[0];
        ids.forEach((id, i) => {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top - bar <= 64) cur = keys[i];
        });
        // Scrolled to the very end, a short last section counts as current. At
        // the top of a page that already fits the window, the first one does.
        const doc = document.documentElement;
        if (window.scrollY > 8 && window.innerHeight + window.scrollY >= doc.scrollHeight - 4) cur = keys[keys.length - 1];
        setTab(cur);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey]);

  const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function goTab(v) {
    const sec = sections.find((x) => x.v === v);
    const el = sec && document.getElementById(sec.id);
    setTab(v);
    pinRef.current = { v, until: Date.now() + 1000 };
    if (el) el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  // The sections above Applications fill in once project hours load, so the
  // jump waits for that load (or its failure); scrolling earlier lands short.
  const sectionsReady = apps !== null || svcError;
  const focusedRef = useRef('');
  useEffect(() => {
    if (focus !== 'badges' && focus !== 'applications') { focusedRef.current = ''; return undefined; }
    if (!sectionsReady || focusedRef.current === focus) return undefined;
    // Wait a beat so a route change's own scroll-to-top doesn't cancel ours.
    const t = setTimeout(() => {
      focusedRef.current = focus;
      const behavior = reduceMotion() ? 'auto' : 'smooth';
      if (focus === 'badges' && badgesRef.current) badgesRef.current.scrollIntoView({ behavior, block: 'center' });
      if (focus === 'applications') {
        const el = document.getElementById('vu-applications');
        if (el) el.scrollIntoView({ behavior, block: 'start' });
      }
    }, 150);
    return () => clearTimeout(t);
  }, [focus, sectionsReady]);

  const setParam = (k, v) => {
    const next = new URLSearchParams(params.toString());
    if (!v) next.delete(k);
    else next.set(k, v);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  function downloadCSV() {
    const { count, text } = hoursCSV(svcEntries, selfLog);
    if (!count) {
      toast({ title: 'Nothing to download yet', message: 'Log hours first, then download them here.', tone: 'warn' });
      return;
    }
    const slug = (a.name || 'me').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'me';
    download(`volunteeru-hours-${slug}.csv`, text);
    toast({ title: 'Hours downloaded', message: `${count} ${count === 1 ? 'row' : 'rows'}, each marked confirmed, waiting or logged on your own.`, tone: 'ok' });
  }

  function editProfile() {
    openModal({
      title: 'Edit your profile',
      subtitle: 'Organizers see this when you apply.',
      Body: ({ api }) => <ProfileEditForm api={api} account={a} />,
    });
  }

  const shareProps = { name: a.name, grade: a.grade, school: a.school, confirmed, mainCause: topConfirmedCause ? topConfirmedCause.name : '', link: shareLink() };

  function shareHours() {
    openModal({
      title: 'Share your hours',
      subtitle: confirmed > 0 ? "Your contact details aren't on the card or in the caption." : undefined,
      body: <ShareHoursCard {...shareProps} />,
    });
  }

  function savePdf() {
    toast({ title: 'Opening the print dialog', message: 'Pick "Save as PDF" as the destination.', tone: 'brand' });
    // Print once the toast has painted; the dialog blocks the page after that.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  /* A shift row's trash. Hours logged on your own come out of your saved
     workspace; hours logged on a project you joined (still waiting on the
     organizer) come out of that application, the same way My crew removes
     them. Confirmed and attendance hours have no trash. */
  function removeRow(row) {
    if (row.source === 'self') return removeEntry(row.raw);
    if (row.removable) return removeProjectHours(row.raw);
    return undefined;
  }

  async function removeProjectHours(e) {
    const ok = await confirmDialog({
      title: 'Remove these hours?',
      body: `${e.activity || 'Shift'}${e.date ? `, ${e.date}` : ''} (${hoursWord(e.hrs)}) comes off your hours for ${e.org}. You can log it again later.`,
      confirmLabel: 'Remove hours',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!ok) return;
    const res = await removeMemberHours(e.applicationId, e.hourId);
    if (res && res.ok) {
      await loadService();
      syncMyServiceHours().catch(() => { /* the next navigation resyncs Home's totals */ });
      toast({ title: 'Hours removed', message: `${e.activity || 'Shift'}, ${hrsShort(e.hrs)}.`, tone: 'ok' });
    } else {
      console.error('Profile: removing project hours failed', res && res.error);
      toast({ title: "Couldn't remove those hours", message: 'Check your connection and try again.', tone: 'danger' });
    }
  }

  async function removeEntry(r) {
    const ok = await confirmDialog({
      title: 'Remove these hours?',
      body: `${r.name}, ${hrsShort(r.hrs)}${r.date ? ` on ${r.date}` : ''} comes off your profile.`,
      confirmLabel: 'Remove hours',
      cancelLabel: 'Keep it',
    });
    if (!ok) return;
    const gone = removeHoursLog(r.id);
    toast(gone ? { title: 'Hours removed', message: `${r.name}, ${hrsShort(r.hrs)}.`, tone: 'ok' } : { title: "Couldn't remove those hours", message: 'Reload the page and try again.', tone: 'danger' });
  }

  const hasHours = confirmed + waiting + ownLogged > 0;
  const metaLine = [a.grade ? `Grade ${a.grade}` : null, a.school, a.city].filter(Boolean).join(', ');
  const avg = averageStars(ratings);

  return (
    <div className="vu-screen vu-page" style={S('max-width:1240px')}>
      <h1 className="vu-sr">Profile</h1>

      {/* identity */}
      <header className="vu-pf-top">
        <div className="vu-pf-avatar" style={S('border-radius:50%;overflow:hidden;flex:none')}>
          {a.avatar ? <ImageSlot src={a.avatar} shape="circle" placeholder="portrait" alt="" /> : <Avatar name={a.name} fs={34} />}
        </div>
        <div style={S('min-width:0')}>
          <h2 className="vu-pf-name vu-break" style={S(`margin:0;font:700 40px/1.05 ${F.display};letter-spacing:-0.03em;color:${C.ink}`)}>{a.name}</h2>
          {metaLine ? (
            <div style={S(`margin-top:6px;font:400 15px/1.4 ${F.body};color:${C.ink2}`)}>{metaLine}</div>
          ) : (
            <p className="vu-noprint" style={S(`margin:6px 0 0;font:400 15px/1.4 ${F.body};color:${C.ink2}`)}>Add your city and school so organizers know where you're from.</p>
          )}
          {/* The one Edit profile on the page. It keeps its name with or
              without a school and city, and sits after the facts sentence. */}
          <div style={S(`margin-top:${metaLine ? 10 : 8}px;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 16px`)}>
            {allRows.length || ratings.length ? (
              <p style={S(`margin:0;font:400 15px/1.5 ${F.body};color:${C.ink2}`)}>
                <FactSentence shifts={allRows.filter((r) => r.status !== 'declined').length} orgs={orgCount} rating={ratings.length ? starsLabel(avg) : ''} raters={ratings.length} />
              </p>
            ) : null}
            <span className="vu-noprint">
              <Button variant="ghost" size="sm" onClick={editProfile} extra={`${INLINE_LINK};font-size:15px`}>Edit profile</Button>
            </span>
          </div>
        </div>
        {/* Sharing and saving only make sense once there's an hour to show. */}
        {hasHours ? (
          <div className="vu-pf-actions vu-noprint" style={S('display:flex;gap:10px;align-self:start')}>
            <Button variant="outline" icon="share" onClick={shareHours} aria-label="Share your hours">Share hours</Button>
            <Button variant="primary" icon="download" onClick={savePdf} aria-label="Save your profile as a PDF">Save as PDF</Button>
          </div>
        ) : null}
      </header>

      {navOn ? (
        <div ref={tabsRef} className="vu-pf-tabs vu-noprint" style={S(`margin-top:${NAV_GAP}px`)}>
          <SectionNav sections={sections} value={tab} onPick={goTab} />
        </div>
      ) : null}

      <div className="vu-pf-cols" style={S('margin-top:36px')}>
        <div style={S('min-width:0')}>
          {/* hours */}
          <section id="vu-sec-hours" className="vu-pf-sec" aria-labelledby="vu-hours-h">
            <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
              <h2 id="vu-hours-h" style={S(H2)}>Your hours</h2>
              <Button variant="outline" size="sm" icon="plus" onClick={() => openLogHours()} className="vu-noprint">Log hours</Button>
            </div>
            <HoursSummary
              className="vu-pf-summary"
              confirmed={confirmed}
              waiting={waiting}
              own={ownLogged}
              caption={`${round1(confirmed) === 1 ? 'hour' : 'hours'} confirmed by organizers`}
            />
            {causes.length ? (
              <CauseRows causes={causes} isolated={isolated} onPick={(name) => setParam('cause', isolated === name ? '' : name)} />
            ) : null}
          </section>

          {helped.length ? (
            <section className="vu-pf-sec" aria-labelledby="vu-helped-h">
              <h2 id="vu-helped-h" style={S(H2)}>Where you've helped</h2>
              <Helped places={helped} />
            </section>
          ) : null}

          <section className="vu-pf-sec" aria-labelledby="vu-shifts-h">
            <div style={S('display:flex;align-items:baseline;justify-content:space-between;gap:8px 16px;flex-wrap:wrap')}>
              <h2 id="vu-shifts-h" style={S(H2)}>{isolated ? `Shifts in ${causeLabel(isolated)}` : 'Shifts'}</h2>
              <span className="vu-noprint" style={S('display:inline-flex;gap:16px;align-items:center')}>
                {isolated ? <Button variant="ghost" size="sm" onClick={() => setParam('cause', '')} aria-label="Show all causes" extra={INLINE_LINK}>Show all</Button> : null}
              </span>
            </div>
            <MyServiceHours
              rows={rows}
              total={filteredRows.length}
              preview={SHIFT_PREVIEW}
              showAll={showAll}
              onToggleAll={() => setParam('history', showAll ? '' : 'all')}
              onRemove={removeRow}
              error={svcError}
              onRetry={loadService}
              empty={<NoShifts isolated={causeLabel(isolated)} nextShift={nextSignUpDate(apps)} />}
            />
            {state.myAttendance && state.myAttendance.length ? <Attendance rows={state.myAttendance} /> : null}
          </section>

          <section id="vu-applications" className="vu-pf-sec">
            <VolunteerApplications showEmpty bare />
          </section>

          {noteCount ? (
            <section id="vu-sec-notes" className="vu-pf-sec" aria-labelledby="vu-ratings-h">
              <MyRatings ratings={ratings} notes={notes} headingId="vu-ratings-h" />
            </section>
          ) : null}

          <section id="vu-sec-about" className="vu-pf-sec" aria-labelledby="vu-about-h">
            <About a={a} />
          </section>
        </div>

        {/* rail */}
        <aside className="vu-pf-rail" aria-label="Badges and counselor">
          <section ref={badgesRef} aria-labelledby="vu-badges-h">
            <h2 id="vu-badges-h" style={S(H2_RAIL)}>Badges</h2>
            <Badges facts={facts} goal={Math.max(0, Math.round(Number(state.prefs?.hoursGoal || 0)))} />
          </section>
          <section className="vu-noprint" aria-labelledby="vu-counselor-h">
            <h2 id="vu-counselor-h" style={S(H2_RAIL)}>For your counselor</h2>
            <p style={S(`margin:8px 0 0;font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>There's no counselor login yet. Download your hours and send the file to your counselor.</p>
            <div style={S('margin-top:14px')}>
              <Button variant="outline" size="sm" icon="download" onClick={downloadCSV} aria-label="Download your hours as CSV for your counselor">Download CSV</Button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

/* ---- pieces -------------------------------------------------------------- */

/* In-page links to each section, drawn like the tab bar. They're links, not
   tabs: every section stays on the page and a link scrolls to it, so the
   current one is marked with aria-current. On a phone the row scrolls
   sideways and fades at the right edge while more links are hidden there. */
function SectionNav({ sections, value, onPick }) {
  const rowRef = useRef(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return undefined;
    const update = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 1);
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    return () => { el.removeEventListener('scroll', update); if (ro) ro.disconnect(); };
  }, [sections.length]);
  // Keep the current link in view when the scroll position moves it.
  useEffect(() => {
    const el = rowRef.current;
    const on = el && el.querySelector('[aria-current="true"]');
    if (!on || el.scrollWidth <= el.clientWidth) return;
    const l = on.offsetLeft - el.offsetLeft;
    if (l < el.scrollLeft || l + on.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollTo({ left: Math.max(0, l - 16) });
  }, [value]);
  const fade = more ? 'linear-gradient(to right, #000 calc(100% - 40px), transparent)' : '';
  return (
    <nav aria-label="Profile sections">
      <ul
        ref={rowRef}
        className="vu-scroll-x"
        style={sx(
          `margin:0;padding:0;list-style:none;display:flex;gap:28px;border-bottom:1px solid ${C.line};scrollbar-width:none`,
          fade ? `-webkit-mask-image:${fade};mask-image:${fade}` : ''
        )}
      >
        {sections.map((x) => {
          const on = x.v === value;
          return (
            <li key={x.v} style={S('flex:none')}>
              <a
                href={`#${x.id}`}
                aria-current={on ? 'true' : undefined}
                className={cx('vu-tab', on ? 'is-on' : '')}
                onClick={(e) => { e.preventDefault(); onPick(x.v); }}
                style={sx(
                  'display:inline-flex;align-items:center;gap:7px;white-space:nowrap;text-decoration:none',
                  'padding:12px 0 13px',
                  `border-bottom:2px solid ${on ? C.ink : 'transparent'}`,
                  `font:${on ? 600 : 500} 15px/1 ${F.body}`,
                  `color:${on ? C.ink : C.ink2}`
                )}
              >
                {x.l}
                {x.count !== undefined && x.count !== null ? (
                  <span style={S(`font-weight:500;color:${C.ink3};font-variant-numeric:tabular-nums`)}>{x.count}</span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const NUM = `font-weight:600;color:${C.ink};font-variant-numeric:tabular-nums`;

/* One number and its word, kept together: "<b>3</b> shifts". */
function Fact({ n, label }) {
  return (
    <span style={S('white-space:nowrap')}>
      <b style={S(NUM)}>{n}</b> <span>{label}</span>
    </span>
  );
}

/** "3 shifts with 2 organizations, rated 4.5 out of 5 by organizers" from data.
    One rating reads "by 1 organizer"; the plural needs two or more. */
function FactSentence({ shifts, orgs, rating, raters = 0 }) {
  const parts = [];
  if (shifts) {
    parts.push(<Fact key="s" n={shifts} label={shifts === 1 ? 'shift' : 'shifts'} />);
    if (orgs) parts.push(<span key="o"> with <Fact n={orgs} label={orgs === 1 ? 'organization' : 'organizations'} /></span>);
  }
  if (rating) {
    parts.push(
      <span key="r">
        {shifts ? ', rated ' : 'Rated '}
        <Fact n={rating} label="out of 5" /> {raters === 1 ? 'by 1 organizer' : 'by organizers'}
      </span>
    );
  }
  return <>{parts}</>;
}

/* Hours per cause as plain rows (name, hours), two columns on wide screens.
   Each row is a toggle that narrows the shift table to that cause. */
function CauseRows({ causes, isolated, onPick }) {
  const half = Math.ceil(causes.length / 2);
  const cols = [causes.slice(0, half), causes.slice(half)].filter((c) => c.length);
  return (
    <div style={S('margin-top:40px')}>
      <h3 style={S(`margin:0;font:600 16px/1.3 ${F.body};color:${C.ink}`)}>By cause</h3>
      <p style={S(`margin:4px 0 0;font:400 13px/1.45 ${F.body};color:${C.ink2}`)}>Includes hours not confirmed yet. Pick a cause to see only its shifts.</p>
      <div className="vu-pf-causes" style={S('margin-top:12px')}>
        {cols.map((col, ci) => (
          <div key={ci} className="vu-list">
            {col.map((b) => {
              const on = isolated === b.name;
              const dim = isolated && !on;
              return (
                <button
                  key={b.name}
                  type="button"
                  className="vu-row vu-row--nolead vu-pf-cause"
                  aria-pressed={on ? 'true' : 'false'}
                  aria-label={`${causeLabel(b.name)}, ${hoursWord(b.n)}`}
                  onClick={() => onPick(b.name)}
                  style={S(`width:100%;min-height:52px;grid-template-columns:minmax(0,1fr) auto;text-align:left;border:none;border-bottom:1px solid ${C.line};background:none;cursor:pointer;opacity:${dim ? 0.5 : 1};transition:opacity .16s ease`)}
                >
                  <span className="vu-row-t vu-pf-cause-name" style={S(`font-weight:${on ? 650 : 500}`)}>{causeLabel(b.name)}</span>
                  <span className="vu-row-end" aria-hidden="true" style={S('grid-column:2;justify-content:flex-end')}>
                    {on ? <span style={S(`display:inline-flex;color:${C.ink}`)}><Icon name="check" size={16} /></span> : null}
                    <span className="vu-row-num">{hrsShort(b.n)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* Earned badges as rows, then one line for the next badge. No progress bars:
   the next one says how far there is to go. At 0 confirmed hours a countdown
   ("25 hours to go") only repeats the badge name, so the line names the
   threshold instead. The school's goal, when set, sits under it in the same
   words Home uses. */
function Badges({ facts, goal = 0 }) {
  // Definitions come from lib/seed.js, never from the saved workspace:
  // accounts made through sign-up store badges: [], and earned/locked is
  // derived from facts anyway.
  const all = BADGE_DEFS.map((b) => ({ b, st: badgeStatus(b, facts) }));
  const earned = all.filter(({ st }) => st.on);
  const next = all.find(({ st }) => !st.on);
  const firstAtZero = !earned.length && facts.confirmed <= 0 && next && next.b.kind === 'hours';
  return (
    <div style={S('margin-top:12px')}>
      {earned.length ? (
        <ul className="vu-list" style={S('margin:0;padding:0;list-style:none')}>
          {earned.map(({ b }) => (
            <li key={b.id} data-earned="true" title={`${b.t}, earned`} className="vu-row vu-row--nolead">
              <div style={S('min-width:0')}>
                <span className="vu-row-t">{b.t}</span>
                <span className="vu-row-m">Earned</span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {next ? (
        firstAtZero ? (
          <p data-earned="false" title={`First badge at ${next.b.need} confirmed hours`} style={S(`margin:0;font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>
            First badge at <span style={S(`font-weight:600;color:${C.ink}`)}>{next.b.need} confirmed hours</span>
          </p>
        ) : (
          <p data-earned="false" title={`${next.b.t}, ${next.st.line}`} style={S(`margin:${earned.length ? '14px' : '0'} 0 0;font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>
            {earned.length ? 'Next badge: ' : 'First badge: '}
            <span style={S(`font-weight:600;color:${C.ink}`)}>{next.b.t}</span>
            <Sep />
            {next.st.line}
          </p>
        )
      ) : (
        <p style={S(`margin:14px 0 0;font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>You've earned every badge.</p>
      )}
      {goal > 0 ? (
        <p data-goal="true" style={S(`margin:8px 0 0;font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>
          {facts.confirmed >= goal ? `You've reached the ${hoursWord(goal)} your school needs` : `${fmtHours(facts.confirmed)} of the ${hoursWord(goal)} your school needs`}
        </p>
      ) : null}
    </div>
  );
}

function About({ a }) {
  const skills = (a.skills || '').split(',').map((sk) => sk.trim()).filter(Boolean).slice(0, 12);
  const resume = safeUrl(a.resumeUrl);
  const hasAbout = a.bio || a.headline || skills.length || (a.experience || '').trim() || (a.goals || '').trim() || resume;
  const block = (label, text) => (
    <div style={S('margin-top:18px')}>
      <h3 style={S(`margin:0;font:600 14px/1.3 ${F.body};color:${C.ink}`)}>{label}</h3>
      <p className="vu-break" style={S(`margin:4px 0 0;font:400 15px/1.55 ${F.body};color:${C.ink2};white-space:pre-wrap`)}>{text}</p>
    </div>
  );
  return (
    <div>
      <h2 id="vu-about-h" style={S(H2)}>About you</h2>
      <div style={S('max-width:640px')}>
        {a.headline || a.pronouns ? (
          <p style={S(`margin:16px 0 0;font:600 17px/1.4 ${F.body};color:${C.ink}`)}>
            {a.headline}
            {a.pronouns ? <span style={S(`font-weight:400;color:${C.ink2}`)}>{a.headline ? ` (${a.pronouns})` : a.pronouns}</span> : null}
          </p>
        ) : null}
        {a.bio ? <p className="vu-break" style={S(`margin:10px 0 0;font:400 16px/1.6 ${F.body};color:${C.ink};white-space:pre-wrap`)}>{a.bio}</p> : null}
        {skills.length ? (
          <ul aria-label="Skills and interests" style={S('margin:16px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:8px')}>
            {skills.map((sk) => (
              <li key={sk} style={S(`padding:7px 12px;border-radius:${R.pill};border:1px solid ${C.line2};font:500 13px/1 ${F.body};color:${C.ink}`)}>{sk}</li>
            ))}
          </ul>
        ) : null}
        {(a.experience || '').trim() ? block('Experience', a.experience) : null}
        {(a.goals || '').trim() ? block('Goals', a.goals) : null}
        {resume ? (
          <a href={resume} target="_blank" rel="noopener noreferrer" className="vu-link-ul" style={S(`margin-top:18px;display:inline-flex;align-items:center;gap:6px;font:600 14px/1 ${F.body};color:${C.ink};text-decoration:underline;text-underline-offset:3px`)}>
            View résumé
            <Icon name="external" size={14} />
          </a>
        ) : null}
        {!hasAbout ? (
          <p style={S(`margin:12px 0 0;font:400 15px/1.5 ${F.body};color:${C.ink2}`)}>Add a bio and a few skills with Edit profile so organizers know who's applying.</p>
        ) : null}
      </div>
    </div>
  );
}

/* Downscale a chosen image to a square ~256px JPEG data URL, small enough to
   ride along in the account blob, no storage bucket needed. */
function fileToAvatar(file, size = 256) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('Choose a JPG or PNG image.')); return; }
    if (file.size > 12 * 1024 * 1024) { reject(new Error('Choose an image under 12 MB.')); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        try { resolve(canvas.toDataURL('image/jpeg', 0.82)); } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error("We couldn't read that image. Try a JPG or PNG."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("We couldn't read that file. Try a JPG or PNG."));
    reader.readAsDataURL(file);
  });
}

const GAP = 'margin-top:16px';
const TWO = 'margin-top:16px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px';

function ProfileEditForm({ api, account }) {
  const fileRef = useRef(null);
  const [f, setF] = useState({
    firstName: account.firstName || '',
    lastName: account.lastName || '',
    avatar: account.avatar || '',
    headline: account.headline || '',
    pronouns: account.pronouns || '',
    age: account.age ? String(account.age) : '',
    school: account.school || '',
    city: account.city || '',
    phone: account.phone || '',
    bio: account.bio || '',
    skills: account.skills || '',
    experience: account.experience || '',
    goals: account.goals || '',
    resumeUrl: account.resumeUrl || '',
  });
  const [err, setErr] = useState({});
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function onPickFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    try {
      const dataUrl = await fileToAvatar(file);
      set('avatar', dataUrl);
    } catch (e2) {
      console.warn('Avatar read failed', e2);
      toast({ title: "Couldn't use that image", message: e2.message || 'Try a JPG or PNG.', tone: 'danger' });
    }
  }

  function save() {
    const e = {};
    if (!f.firstName.trim()) e.firstName = 'Enter your first name.';
    if (f.resumeUrl.trim() && !safeUrl(f.resumeUrl)) e.resumeUrl = 'Enter a full link that starts with https://';
    setErr(e);
    if (Object.keys(e).length) return;
    updateAccount({
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      avatar: f.avatar,
      headline: f.headline.trim(),
      pronouns: f.pronouns.trim(),
      age: f.age ? Number(f.age) : null,
      school: f.school.trim(),
      city: f.city.trim(),
      phone: f.phone.trim(),
      bio: f.bio.trim(),
      skills: f.skills.trim(),
      experience: f.experience.trim(),
      goals: f.goals.trim(),
      resumeUrl: f.resumeUrl.trim(),
    });
    api.close();
    track('profile_updated', { has_bio: !!f.bio.trim(), has_resume: !!f.resumeUrl.trim(), has_photo: !!f.avatar });
    toast({ title: 'Profile saved', tone: 'ok' });
  }

  const name = [f.firstName, f.lastName].filter(Boolean).join(' ');
  return (
    <div>
      <div style={S('display:flex;align-items:center;gap:16px;margin-bottom:4px;flex-wrap:wrap')}>
        <div style={S('width:72px;height:72px;border-radius:50%;overflow:hidden;flex:none')}>
          {f.avatar ? <ImageSlot src={f.avatar} shape="circle" placeholder="portrait" alt="" /> : <Avatar name={name || 'You'} fs={26} />}
        </div>
        <div style={S('min-width:0')}>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={S('display:none')} aria-hidden="true" tabIndex={-1} />
          <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>
            <Button variant="outline" size="sm" icon="upload" onClick={() => fileRef.current && fileRef.current.click()}>
              {f.avatar ? 'Change photo' : 'Upload photo'}
            </Button>
            {f.avatar ? (
              <Button variant="ghost" size="sm" onClick={() => set('avatar', '')}>Remove photo</Button>
            ) : null}
          </div>
          <div style={S(`margin-top:8px;font:400 13px/1.4 ${F.body};color:${C.ink2}`)}>JPG or PNG, cropped to a square.</div>
        </div>
      </div>
      <div className="vu-2col-keep" style={S(TWO)}>
        <Field label="First name" value={f.firstName} onChange={(v) => set('firstName', v)} maxLength={40} required error={err.firstName} autoComplete="given-name" />
        <Field label="Last name" value={f.lastName} onChange={(v) => set('lastName', v)} maxLength={40} autoComplete="family-name" />
      </div>
      <div style={S(GAP)}>
        <Field label="Headline" value={f.headline} onChange={(v) => set('headline', v)} placeholder="e.g. Tutors reading on weekends" maxLength={80} />
      </div>
      <div className="vu-2col-keep" style={S(TWO)}>
        <Field label="Pronouns (optional)" value={f.pronouns} onChange={(v) => set('pronouns', v)} placeholder="e.g. she/her" maxLength={24} />
        <Field label="Age (optional)" value={f.age} onChange={(v) => set('age', v.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" placeholder="e.g. 16" maxLength={2} />
      </div>
      <div className="vu-2col-keep" style={S(TWO)}>
        <Field label="School (optional)" value={f.school} onChange={(v) => set('school', v)} maxLength={60} />
        <Field label="City (optional)" value={f.city} onChange={(v) => set('city', v)} maxLength={60} />
      </div>
      <div style={S(GAP)}>
        <TextArea label="Bio" value={f.bio} onChange={(v) => set('bio', v)} placeholder="e.g. Junior at North Central. I help at the food bank most Saturdays." maxLength={400} minHeight={80} counter />
      </div>
      <div style={S(GAP)}>
        <Field label="Skills and interests, separated by commas" value={f.skills} onChange={(v) => set('skills', v)} placeholder="e.g. Tutoring, Spanish, first aid" maxLength={160} />
      </div>
      <div style={S(GAP)}>
        <TextArea label="Experience (optional)" value={f.experience} onChange={(v) => set('experience', v)} placeholder="e.g. Library reading buddy, summer 2025" maxLength={400} minHeight={70} counter />
      </div>
      <div style={S(GAP)}>
        <TextArea label="Goals (optional)" value={f.goals} onChange={(v) => set('goals', v)} placeholder="e.g. Try 2 new causes this year" maxLength={300} minHeight={60} counter />
      </div>
      <div style={S(GAP)}>
        <Field label="Résumé or portfolio link (optional)" value={f.resumeUrl} onChange={(v) => set('resumeUrl', v)} placeholder="https://" maxLength={300} inputMode="url" error={err.resumeUrl} />
      </div>
      <div style={S(`margin-top:20px;padding-top:16px;border-top:1px solid ${C.line};display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap`)}>
        <Button variant="outline" onClick={() => api.close()}>Cancel</Button>
        <Button variant="primary" onClick={save}>Save profile</Button>
      </div>
    </div>
  );
}
