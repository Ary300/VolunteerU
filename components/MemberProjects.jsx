'use client';

/* ==========================================================================
   MemberProjects.jsx, the volunteer/member side of a project they joined
   Once an organizer accepts you, this is where you see what's expected before
   you start: the steps for a volunteer program, or your role briefing and tasks
   for a task-based team. Progress is the member's own, saved on their
   application row so the same view follows them across devices. Renders nothing
   until they've been accepted somewhere.

   Each project is a plain block (no card chrome): a header with the
   listing's own photo when it has one, "You're in" and the project name, then
   two columns (steps or tasks on the left, notes from the organizer and
   check-in on the right) and the hours the member logged for it, as rows.
   Blocks are separated by a rule.
   ========================================================================== */

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { S, s } from '../lib/style.js';
import { C, F, R } from '../lib/tokens.js';
import { loadMyMemberships, updateMemberState, setMyTaskStatus, logMemberHours, removeMemberHours, checkInMember, myShiftSignUps } from '../lib/listings.js';
import { openModal, toast, confirmDialog } from '../lib/overlays.js';
import { syncMyServiceHours } from '../lib/db.js';
import { checkInWindow, shiftDates } from '../lib/calendar.js';
import { Field, Icon, Button, StatusText, IconButton } from './ui.jsx';
import { Sep } from './vu/ListingCard.jsx';
import { photoFor } from '../lib/photos.js';
import DateBlock, { dateParts } from './vu/DateBlock.jsx';
import MessageThread from './MessageThread.jsx';
import { formatShiftTime } from './screens/JoinListing.jsx';
import { causeOf, causeKey } from '../lib/tokens.js';
import { isoToday, isoEarliest, shortDateLabel, validateLogHours, cleanHoursInput } from './LogHoursForm.jsx';

const HOURS_PREVIEW = 5;
/* checkInMember error codes whose message is safe to show as written. */
const CHECK_IN_REFUSALS = ['NOT_STARTED', 'ENDED', 'SIGNED_OUT'];

/* Type used inside a project block. */
const H3 = `margin:0;font:600 15px/1.3 ${F.body};color:${C.ink}`;
const SMALL = `font:400 13px/1.45 ${F.body};color:${C.ink2}`;
const COUNT = `font:400 13px/1.3 ${F.body};color:${C.ink2};font-variant-numeric:tabular-nums;white-space:nowrap`;
const ROW_RULE = `border-top:1px solid ${C.line}`;
/* Organizer notes and briefings are plain text under their heading, no fill. */
const NOTE = `margin:0;font:400 15px/1.5 ${F.body};color:${C.ink};white-space:pre-wrap`;

/* Only ever hand the browser an http(s) link the organizer pasted. Anything
   with another scheme (javascript:, data:, mailto slipups) is dropped; a bare
   domain gets https:// so "zoom.us/j/123" still opens. */
export function safeUrl(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return ''; // some other scheme, reject
  if (/^[\w-]+(\.[\w-]+)+/.test(v)) return `https://${v}`; // looks like a domain
  return '';
}

/* What each kind of step is, named at the start of its meta line. */
const KIND = {
  meeting: { label: 'Meeting' },
  form: { label: 'Form' },
  training: { label: 'Training' },
  check: { label: 'Step' },
};

/* A stored session ("Sat, Oct 24 · 10:00 AM-11:00 AM", "Sat, Oct 24 at 1:00-4:00 PM"
   or "Sat, Oct 24, 1:00-4:00 PM") split into its date text and its time in the
   house format ("10 to 11 AM"). Null for empty or "Not scheduled", and for text
   that isn't a dated shift. */
function sessionParts(text) {
  const t = String(text || '').trim();
  if (!t || /not scheduled/i.test(t)) return null;
  const m = /^(.+?)\s*·\s*(.+)$/.exec(t) || /^(.+?)\s+at\s+(.+)$/.exec(t) || /^([A-Za-z]{3},\s*[A-Za-z]{3}\s+\d{1,2}),\s*(.+)$/.exec(t);
  if (m && dateParts(m[1]) && /\d|noon|midnight/i.test(m[2])) return { date: m[1].trim(), time: formatShiftTime(m[2].trim()) };
  return dateParts(t) && !m ? { date: t, time: '' } : null;
}

/** "Sat, Oct 24 · 10 to 11 AM", the way every card and row writes a shift.
    Text that isn't a shift comes back with any "·" turned into a comma. */
function plain(text) {
  const p = sessionParts(text);
  if (!p) return String(text || '').replace(/\s*·\s*/g, ', ');
  return p.time ? `${p.date} · ${p.time}` : p.date;
}

/** Just the time of a stored session ("10 to 11 AM"), '' when it has none. */
function sessionTime(text) {
  const p = sessionParts(text);
  return p ? p.time : '';
}

/** A shift sign-up ({ d, t }) in the same words as plain(). */
function signUpLabel(sh) {
  if (!sh) return '';
  const t = formatShiftTime(sh.t);
  return t ? `${sh.d} · ${t}` : String(sh.d || '');
}

/** True when a sign-up ({ d, t }) is for the shift a stored session names. */
function sameShift(sh, session) {
  const a = sh && dateParts(sh.d);
  const p = sessionParts(session);
  const b = p && dateParts(p.date);
  if (!a || !b) return false;
  return a.month === b.month && a.day === b.day && formatShiftTime(sh.t) === p.time;
}

/** The cause as the rest of the app names it ("Food and hunger"); free text
    the cause list doesn't know is shown as written. */
function causeLabel(cause) {
  if (!cause) return '';
  return causeKey(cause) === 'other' ? cause : causeOf(cause).label;
}

/** The shift label when one is posted, '' for none or "Not scheduled". */
function postedShift(l) {
  const v = plain(l && l.next_session);
  return v && !/^not scheduled$/i.test(v) ? v : '';
}

/** A project with nowhere to show up to: a task-based team or a remote
    program, with no shift posted. Check-in makes no sense there. */
function nothingToCheckInTo(l) {
  if (postedShift(l)) return false;
  return l.org_type === 'team' || l.delivery === 'remote' || /remote|online|virtual/i.test(l.site || '');
}

/** "Checked in for Sat, Oct 17", with the day added only when it says something new. */
function checkedInLine(last) {
  const sess = plain(last.session);
  const dated = !!sess && !/^(next (shift|session)|not scheduled)$/i.test(sess);
  const at = last.at && last.at !== 'Today' && !(dated && sess.startsWith(last.at)) ? last.at : '';
  if (dated) return `Checked in for ${sess}${at ? ` on ${at}` : ''}`;
  return `Checked in${at ? ` on ${at}` : ''}`;
}

/** "Sat, Oct 17" for today, stored on a check-in so it never reads "Today" a week later. */
function todayLong() {
  return new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Oct 16" for an archive stamp, '' when the stamp has no readable date,
    null when the project wasn't archived. */
function archivedLabel(closedAt) {
  if (!closedAt) return null;
  const d = new Date(closedAt);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Oct 14" for an organizer note's timestamp, '' when it has none. */
function noteDate(at) {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "1 hr", "2.5 hrs" for tight rows and the hours sub line. */
function hrs(n) {
  const h = Math.round(Number(n || 0) * 10) / 10;
  return `${h} ${h === 1 ? 'hr' : 'hrs'}`;
}

/** "1 hour", "2.5 hours" for sentences. */
function hoursWord(n) {
  const h = Math.round(Number(n || 0) * 10) / 10;
  return `${h} ${h === 1 ? 'hour' : 'hours'}`;
}

/** The role the organizer assigned. Handles the role object the lead screen
    writes, a bare roleId, or a role name, and prefers the listing's current copy
    of that role so an edited briefing shows up. */
function resolveRole(assignment, listingRoles, position) {
  const a = assignment || {};
  const byId = (id) => listingRoles.find((r) => r && r.id === id) || null;
  const byName = (name) => listingRoles.find((r) => r && r.name && r.name.toLowerCase() === String(name).toLowerCase()) || null;
  if (a.role && typeof a.role === 'object') {
    const live = byId(a.role.id);
    return live ? { ...a.role, ...live } : a.role;
  }
  if (a.roleId && byId(a.roleId)) return byId(a.roleId);
  const name = typeof a.role === 'string' && a.role ? a.role : position;
  return name ? byName(name) : null;
}

/* hoursInRail: the page already shows the student's hours summary (Home's
   rail), so each project titles its list by name and leaves out its own
   confirmed/waiting line instead of saying the same totals twice. /crew
   passes nothing and keeps the "Your hours" summary per project. */
export default function MemberProjects({ hoursInRail = false } = {}) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  // Prefix for each block's heading id, so "Message organizer" keeps its
  // visible text as its name and points at the project name for context.
  const uid = useId();

  useEffect(() => {
    let alive = true;
    loadMyMemberships()
      .then((r) => { if (alive) setRows(r || []); })
      .catch((err) => {
        console.error('[members] could not load memberships', err);
        if (alive) setRows([]);
      });
    return () => { alive = false; };
  }, []);

  if (rows === null || rows.length === 0) return null;

  function patchLocal(appId, member_state) {
    setRows((rs) => rs.map((r) => (r.id === appId ? { ...r, member_state } : r)));
  }

  async function toggleStep(app, stepId) {
    if (busy) return;
    setBusy(true);
    const cur = (app.member_state && app.member_state.pipeline) || {};
    const nextPipeline = { ...cur, [stepId]: !cur[stepId] };
    const { ok, member_state } = await updateMemberState(app.id, { pipeline: nextPipeline });
    if (ok) patchLocal(app.id, member_state);
    else toast({ title: "Couldn't save that step", message: 'Check your connection and try again.', tone: 'danger' });
    setBusy(false);
  }

  async function ackBriefing(app, roleId) {
    if (busy) return;
    setBusy(true);
    const cur = (app.member_state && app.member_state.briefingAck) || {};
    const { ok, member_state } = await updateMemberState(app.id, { briefingAck: { ...cur, [roleId]: true } });
    if (ok) { patchLocal(app.id, member_state); toast({ title: 'Briefing read', tone: 'ok', timeout: 2000 }); }
    else toast({ title: "Couldn't save that", message: 'Check your connection and try again.', tone: 'danger' });
    setBusy(false);
  }

  async function toggleTask(app, taskId) {
    if (busy) return;
    setBusy(true);
    const cur = (app.member_state && app.member_state.tasks) || {};
    const next = cur[taskId] === 'done' ? 'todo' : 'done';
    const { ok, member_state } = await setMyTaskStatus(app.id, taskId, next);
    if (ok) { patchLocal(app.id, member_state); toast({ title: next === 'done' ? 'Marked done' : 'Marked not done', tone: 'ok', timeout: 1600 }); }
    else toast({ title: "Couldn't save that", message: 'Check your connection and try again.', tone: 'danger' });
    setBusy(false);
  }

  function message(app) {
    openModal({
      title: app.listings.name,
      subtitle: 'Messages with the organizer',
      Body: () => <MessageThread applicationId={app.id} recipientId={app.owner_id} recipientName={app.listings.name} />,
    });
  }

  // Home's "Your hours" reads stats from the store, which Providers only
  // resyncs on navigation. Refresh it now so the waiting total updates in place.
  function refreshHourTotals() {
    syncMyServiceHours().catch(() => { /* next navigation retries */ });
  }

  function logHoursFor(app) {
    const name = app.listings.name;
    openModal({
      title: `Log hours for ${name}`,
      subtitle: `${name} will see this and can confirm it.`,
      Body: ({ api }) => (
        <MemberHoursForm
          onSave={async (entry) => {
            const { ok, member_state, error } = await logMemberHours(app.id, entry);
            if (ok) {
              patchLocal(app.id, member_state);
              refreshHourTotals();
              toast({ title: 'Hours logged', message: `Waiting on ${name} to confirm.`, tone: 'ok' });
              api.close();
            } else {
              const bad = error && error.code === 'INVALID_HOURS';
              toast({ title: 'Hours not logged', message: bad ? error.message : 'Check your connection and try again.', tone: 'danger' });
            }
          }}
          onCancel={() => api.close()}
        />
      ),
    });
  }

  async function removeHour(app, h) {
    const ok = await confirmDialog({
      title: 'Remove these hours?',
      body: `${h.activity}, ${h.date} (${hoursWord(h.hrs)}) comes off your hours for ${app.listings.name}. You can log it again later.`,
      confirmLabel: 'Remove hours',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!ok) return;
    const res = await removeMemberHours(app.id, h.id);
    if (res.ok) {
      patchLocal(app.id, res.member_state);
      refreshHourTotals();
      toast({ title: 'Hours removed', tone: 'ok', timeout: 2000 });
    } else {
      toast({ title: "Couldn't remove those hours", message: 'Check your connection and try again.', tone: 'danger' });
    }
  }

  function checkInFor(app) {
    const session = postedShift(app.listings);
    openModal({
      title: `Check in to ${app.listings.name}`,
      subtitle: 'Enter the code from your organizer if they gave you one.',
      Body: ({ api }) => (
        <CheckInForm
          session={session}
          onSave={async (entry) => {
            const { ok, member_state, error } = await checkInMember(app.id, { session, ...entry });
            // The code can't be checked in the browser (only the organizer can
            // see the project's code), so the toast never implies it matched.
            if (ok) {
              patchLocal(app.id, member_state);
              const parts = [session ? `For ${session}.` : '', entry.code ? 'The organizer checks your code.' : ''].filter(Boolean);
              toast({ title: 'Checked in', message: parts.join(' ') || undefined, tone: 'ok' });
              api.close();
              return;
            }
            // The shift's time window refuses early and late check-ins; say why
            // instead of blaming the connection.
            const known = error && CHECK_IN_REFUSALS.includes(error.code);
            toast({ title: "Couldn't check you in", message: known ? error.message : 'Check your connection and try again.', tone: 'danger' });
            if (known) api.close();
          }}
          onCancel={() => api.close()}
        />
      ),
    });
  }

  const ordered = [...rows].sort((a, b) => Number(!!a.listings.unlisted) - Number(!!b.listings.unlisted));

  return (
    <section aria-label="Projects you're in" className="vu-sec">
      {ordered.map((app, i) => (
        <ProjectBlock
          key={app.id}
          app={app}
          first={i === 0}
          nameId={`${uid}-name-${app.id}`}
          onMessage={() => message(app)}
          onToggleStep={toggleStep}
          onAck={ackBriefing}
          onToggleTask={toggleTask}
          onCheckIn={() => checkInFor(app)}
          onLog={() => logHoursFor(app)}
          onRemove={(h) => removeHour(app, h)}
          hoursInRail={hoursInRail}
        />
      ))}
    </section>
  );
}

/* The listing's own cover, the same image /join and the applications list
   show for it, as a 72px thumb. A listing without one (or whose photo fails to
   load) gets nothing, and the title block starts at the left edge. Stock
   photos never stand in for a listing the member is in. */
function ProjectImage({ listing }) {
  const photo = photoFor(listing, { seed: false });
  const src = photo && (photo.sm || photo.src);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (!src || broken) return null;
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      style={{ display: 'block', flex: 'none', width: 72, height: 72, objectFit: 'cover', objectPosition: photo.pos || 'center', borderRadius: R.control, background: C.mist }}
    />
  );
}

/* One project the member is in. The inner div holds the whole block so the
   name, its message button and its hours all live in one container. */
function ProjectBlock({ app, first, nameId, onMessage, onToggleStep, onAck, onToggleTask, onCheckIn, onLog, onRemove, hoursInRail }) {
  const l = app.listings;
  const isTeam = l.org_type === 'team';
  // The listing is hidden from members once the organizer archives or
  // pauses it, so only the saved copy comes back: no shifts, no steps.
  const closed = !!l.unlisted;
  // Archiving stamps closedAt on each member's row (markProjectClosed).
  // A listing that's only paused or unlisted has no stamp, and one the
  // organizer brought back is readable again, so neither reads archived.
  const archivedOn = closed ? archivedLabel(app.assignment && app.assignment.closedAt) : null;
  // One meta line, each fact once: cause, the member's role, the place.
  const meta = [causeLabel(l.cause), app.position, l.site].filter(Boolean);
  const notes = (l.announcements || []).slice(0, 3);
  const showCheckIn = !(closed || nothingToCheckInTo(l));

  return (
    <article aria-labelledby={nameId} style={S(first ? '' : `margin-top:48px;padding-top:40px;${ROW_RULE}`)}>
      <div>
        <div style={S('display:flex;align-items:center;gap:20px;flex-wrap:wrap')}>
          <div style={S('display:flex;align-items:center;gap:16px;min-width:0;flex:1 1 320px')}>
            <ProjectImage listing={l} />
            <div style={S('min-width:0;flex:1')}>
              {archivedOn !== null ? (
                <StatusText tone="mute">Archived</StatusText>
              ) : closed ? (
                <StatusText tone="mute">Paused</StatusText>
              ) : (
                <StatusText tone="ok">You&apos;re in</StatusText>
              )}
              <h2 id={nameId} className="vu-break" style={S(`margin:8px 0 0;font:650 clamp(21px,2.4vw,26px)/1.15 ${F.display};letter-spacing:-0.02em;color:${C.ink}`)}>{l.name}</h2>
              {meta.length ? (
                <div className="vu-break" style={S(`margin-top:4px;font:400 14px/1.4 ${F.body};color:${C.ink2}`)}>
                  {meta.map((m, i) => <span key={i}>{i ? <Sep /> : null}{m}</span>)}
                </div>
              ) : null}
            </div>
          </div>
          <Button size="sm" icon="message" onClick={onMessage} aria-describedby={nameId}>
            Message organizer
          </Button>
        </div>

        <div style={S('margin-top:28px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:28px 40px;align-items:start')}>
          <div style={S(notes.length || showCheckIn ? 'min-width:0' : 'min-width:0;max-width:640px')}>
            {closed ? (
              <p style={S(`margin:0;font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>
                {archivedOn !== null
                  ? `The organizer archived ${l.name}${archivedOn ? ` on ${archivedOn}` : ''}, so there are no more shifts. Your hours stay on your profile.`
                  : `${l.name} isn't running right now, so there are no shifts to check in to.`}
              </p>
            ) : isTeam ? (
              <TeamMember app={app} onAck={onAck} onToggleTask={onToggleTask} />
            ) : (
              <VolunteerMember app={app} onToggle={onToggleStep} />
            )}
          </div>

          {notes.length || showCheckIn ? (
            <div style={S('min-width:0;display:flex;flex-direction:column;gap:20px')}>
              {notes.length ? (
                <div>
                  <h3 style={S(`${H3};margin-bottom:8px`)}>From the organizer</h3>
                  <ul style={S('margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:12px')}>
                    {notes.map((an) => {
                      const on = noteDate(an.at);
                      return (
                        <li key={an.id}>
                          <p className="vu-break" style={S(NOTE)}>{an.body}</p>
                          {on ? <div style={S(`margin-top:2px;${SMALL}`)}>{on}</div> : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {showCheckIn ? <MemberCheckIn app={app} onCheckIn={onCheckIn} /> : null}
            </div>
          ) : null}
        </div>

        <MemberHours app={app} nameId={nameId} onLog={onLog} onRemove={onRemove} hoursInRail={hoursInRail} />
      </div>
    </article>
  );
}

function MemberHours({ app, nameId, onLog, onRemove, hoursInRail }) {
  const [showAll, setShowAll] = useState(false);
  const log = (app.member_state && app.member_state.hoursLog) || [];
  const confirmed = (app.assignment && app.assignment.confirmedHours) || {};
  // Shifts the organizer posted in Attendance. They wrote these into the
  // assignment, so they count as confirmed and the volunteer can't remove them.
  const posted = (app.assignment && Array.isArray(app.assignment.attendanceHours) ? app.assignment.attendanceHours : [])
    .filter((h) => h && h.id && Number(h.hrs) > 0);
  const sum = (rows) => rows.reduce((a, h) => a + Number(h.hrs || 0), 0);
  const confirmedSum = sum(log.filter((h) => confirmed[h.id])) + sum(posted);
  const waitingSum = sum(log.filter((h) => !confirmed[h.id]));
  const rows = [
    ...posted.map((h) => ({ ...h, key: `posted:${h.id}`, v: true, posted: true })),
    ...log.map((h) => ({ ...h, key: `log:${h.id}`, v: !!confirmed[h.id], posted: false })),
  ];
  const shown = showAll ? rows : rows.slice(0, HOURS_PREVIEW);
  return (
    <div style={S('margin-top:40px')}>
      <div style={S('display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
        <div style={S('min-width:0')}>
          <h3 className="vu-t-h3s vu-break" style={S(`margin:0;color:${C.ink}`)}>
            {hoursInRail ? `Hours on ${app.listings.name}` : 'Your hours'}
          </h3>
          {rows.length && !hoursInRail ? (
            <p style={S(`margin:4px 0 0;${SMALL};font-variant-numeric:tabular-nums`)}>
              <span>{hrs(confirmedSum)} confirmed</span>
              {waitingSum > 0 ? <><Sep /><span>{hrs(waitingSum)} waiting on the organizer</span></> : null}
            </p>
          ) : null}
        </div>
        <Button size="sm" icon="plus" onClick={onLog} aria-describedby={nameId}>Log hours</Button>
      </div>
      {rows.length ? (
        <div className="vu-list" style={S('margin-top:12px')}>
          {shown.map((h) => {
            const when = dateParts(h.date);
            const hasDate = !!when;
            // The date block carries the weekday, day and month, so the meta
            // line adds only what it can't show: a year that isn't this one
            // and where the hours came from. Empty meta means no second line.
            const otherYear = hasDate && when.date.getFullYear() !== new Date().getFullYear() ? String(when.date.getFullYear()) : '';
            const meta = [
              hasDate ? otherYear : h.date,
              h.posted ? 'From attendance' : '',
            ].filter(Boolean);
            return (
              // Two grid cells: the date, then one wrapping line of title and
              // hours. On a wide row the hours sit at the right edge; on a
              // phone they drop under the title, still beside the date.
              <div key={h.key} className={hasDate ? 'vu-row' : 'vu-row vu-row--nolead'} style={S(`grid-template-columns:${hasDate ? 'auto ' : ''}minmax(0,1fr)`)}>
                {hasDate ? <DateBlock date={h.date} size="md" month /> : null}
                <div style={S('min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px')}>
                  {/* A 240px basis makes every row wrap the same way on a
                      phone instead of only the ones with long titles. */}
                  <div style={S('min-width:0;flex:1 1 240px')}>
                    <span className="vu-row-t">{h.activity}</span>
                    {meta.length ? <span className="vu-row-m">{meta.map((m, i) => <span key={i}>{i ? <Sep /> : null}{m}</span>)}</span> : null}
                  </div>
                  <div className="vu-row-end" style={S('flex:none')}>
                    <span className="vu-row-num">{hrs(h.hrs)}</span>
                    {h.v ? (
                      <StatusText tone="ok" title={h.posted ? 'Posted by the organizer from attendance' : 'Confirmed by the organizer'}>Confirmed</StatusText>
                    ) : (
                      <>
                        <StatusText tone="wait">Waiting</StatusText>
                        <IconButton
                          icon="trash"
                          label={`Remove ${hrs(h.hrs)} for ${h.activity}, ${h.date}`}
                          onClick={() => onRemove(h)}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {rows.length > HOURS_PREVIEW ? (
            <div style={S('padding-top:12px')}>
              <Button variant="ghost" size="sm" onClick={() => setShowAll((x) => !x)} aria-expanded={showAll}>
                {showAll ? 'Show fewer' : `Show all ${rows.length}`}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <p style={S(`margin:8px 0 0;font:400 15px/1.5 ${F.body};color:${C.ink2}`)}>Nothing logged yet. Log your time after a shift and {app.listings.name} can confirm it.</p>
      )}
    </div>
  );
}

/* When check-in opens: "at 9 AM" on the shift's own day (the date is already
   on screen), "Fri, Oct 23 at 11 PM" when it opens the day before. */
function opensAtLabel(d, session) {
  const h = d.getHours();
  const m = d.getMinutes();
  const time = `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
  const sp = dateParts(sessionParts(session) ? sessionParts(session).date : session);
  const sameDay = !!sp && sp.date.getMonth() === d.getMonth() && sp.date.getDate() === d.getDate();
  if (sameDay) return h === 0 && m === 0 ? 'when the day starts' : `at ${time}`;
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return h === 0 && m === 0 ? day : `${day} at ${time}`;
}

const STRONG = `font-weight:600;color:${C.ink}`;

/* The check-in block. The date block names the day once; the lines next to it
   say what the member has to do with that shift. A member who hasn't signed
   up for the next shift is asked to sign up instead of being told when
   check-in opens, so the block never reads as if they're going. */
function MemberCheckIn({ app, onCheckIn }) {
  const checkins = (app.member_state && app.member_state.checkins) || [];
  const last = checkins[0];
  const nextSession = postedShift(app.listings);
  const scheduled = !!nextSession;
  // Check-in opens 1 hour before the shift and closes at the end of its day
  // (same rule checkInMember enforces), so there's no button a week early.
  const win = scheduled ? checkInWindow(nextSession) : { state: 'unknown' };
  const doneForThis = !!(last && scheduled && last.session && plain(last.session) === nextSession);
  // The volunteer's own upcoming sign-ups, soonest first, so they can see
  // which shift they picked and get to the shift list to change it.
  const startOf = (x) => { const d = shiftDates(x); return d ? d.start.getTime() : Infinity; };
  const mySignUps = myShiftSignUps(app).filter((x) => !x.past).sort((a, b) => startOf(a) - startOf(b));
  const over = win.state === 'over';
  const forNext = scheduled ? mySignUps.find((x) => sameShift(x, nextSession)) : null;
  const others = mySignUps.filter((x) => x !== forNext);
  // Scheduled, still ahead, and the member hasn't picked it: ask them to sign up.
  const askToSignUp = scheduled && !over && !mySignUps.length;
  let note = null;
  if (win.state === 'early' && forNext) note = `Check-in opens ${opensAtLabel(win.opensAt, nextSession)}`;
  else if (over) note = 'No new shift posted yet. If you went, log your hours.';
  // Checking in again for the same shift stays possible (a mistyped code, a
  // second visit that day); the label says it's another check-in.
  const canCheckIn = win.state === 'open' || win.state === 'unknown';
  const time = sessionTime(nextSession);
  const moreLine = (n) => `${n} more ${n === 1 ? 'shift' : 'shifts'}`;
  const shiftsHref = app.listing_id ? `/join/${app.listing_id}#vu-join-apply` : '';

  // The heading names what the block is about right now. "Check in" only
  // when there's something to check in to: a shift the member signed up for
  // whose window is open, or a project with no posted shift (check in on
  // arrival). Otherwise it names the shift the lines describe.
  const heading = !scheduled || (forNext && canCheckIn) ? 'Check in' : over ? 'Last shift' : 'Next shift';

  let lines;
  if (!scheduled) {
    lines = 'Check in when you get there.';
  } else if (askToSignUp) {
    lines = <b style={S(STRONG)}>{nextSession}</b>;
  } else if (forNext) {
    lines = (
      <>
        <b style={S(STRONG)}>Signed up</b>
        {time ? <><Sep />{time}</> : null}
        {others.length ? <><Sep />{moreLine(others.length)}</> : null}
      </>
    );
  } else {
    lines = (
      <>
        {time ? <b style={S(STRONG)}>{time}</b> : null}
        {mySignUps.length ? (
          <div style={S('margin-top:2px')}>
            Signed up for <b style={S(STRONG)}>{signUpLabel(mySignUps[0])}</b>
            {mySignUps.length > 1 ? ` and ${moreLine(mySignUps.length - 1)}` : ''}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div>
      <h3 style={S(H3)}>{heading}</h3>
      <div style={S('margin-top:10px;display:flex;align-items:center;gap:14px')}>
        {scheduled && !askToSignUp ? <DateBlock date={app.listings.next_session} size="md" month /> : null}
        <div style={S(`min-width:0;flex:1;font:400 14px/1.45 ${F.body};color:${C.ink2}`)}>{lines}</div>
      </div>
      {last ? (
        <div style={S(`margin-top:10px;display:flex;align-items:center;gap:6px;font:500 13px/1.4 ${F.body};color:${C.confirmed}`)}>
          <Icon name="check-circle" size={16} />
          <span>{doneForThis ? 'Checked in for this shift' : checkedInLine(last)}</span>
        </div>
      ) : null}
      <div style={S('margin-top:12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap')}>
        {askToSignUp && shiftsHref ? (
          <Button variant="dark" size="sm" href={shiftsHref} aria-label={`Sign up for a shift at ${app.listings.name}`}>
            Sign up
          </Button>
        ) : null}
        {canCheckIn ? (
          // Ember only while the check-in window is actually open; ink otherwise,
          // so a page of projects doesn't carry an Ember button per block.
          <Button variant={win.state === 'open' ? 'primary' : askToSignUp ? 'outline' : 'dark'} size="sm" onClick={onCheckIn}>
            {last ? 'Check in again' : 'Check in'}
          </Button>
        ) : null}
        {note && !doneForThis ? <span style={S(SMALL)}>{note}</span> : null}
        {shiftsHref && !askToSignUp ? (
          <Link
            href={shiftsHref}
            aria-label={`See shifts for ${app.listings.name}`}
            className="vu-link-ul"
            style={S(`font:600 13px/1.4 ${F.body}`)}
          >
            See shifts
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function CheckInForm({ session, onSave, onCancel }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (busy) return;
    setBusy(true);
    await onSave({ code, at: todayLong() });
    setBusy(false);
  }
  return (
    <div>
      {session ? (
        <p style={S(`margin:0 0 20px;font:400 14px/1.45 ${F.body};color:${C.ink2}`)}>
          Shift <b style={S(`font-weight:600;color:${C.ink}`)}>{plain(session)}</b>
        </p>
      ) : null}
      <Field
        label="Check-in code (optional)"
        value={code}
        onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 8))}
        placeholder="e.g. 3586"
        inputMode="numeric"
        maxLength={8}
        hint="Your organizer checks this code. No code? Leave it blank."
      />
      <div style={S('margin-top:20px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap')}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={save} busy={busy}>{busy ? 'Checking in' : 'Check in'}</Button>
      </div>
    </div>
  );
}

/** Date picker bounded by min/max, matching the one in LogHoursForm. */
function DateInput({ label, value, onChange, min, max, error, required }) {
  const fid = useId();
  const eid = `${fid}-err`;
  return (
    <div>
      <label htmlFor={fid} style={S(`display:block;font:600 13px/1.2 ${F.body};color:${C.ink}`)}>
        {label}
        {required ? <span aria-hidden="true" style={S(`color:${C.ember}`)}>{' *'}</span> : null}
      </label>
      <input
        id={fid}
        type="date"
        value={value}
        min={min}
        max={max}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        data-invalid={error ? 'true' : undefined}
        aria-describedby={error ? eid : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="vu-input"
        style={S(`margin-top:8px;display:block;width:100%;min-width:0;height:46px;padding:0 14px;border-radius:${R.control};border:1px solid ${C.line2};background:#fff;font:400 15px/1.2 ${F.body};color:${C.ink};transition:border-color .16s ease`)}
      />
      {error ? <div className="vu-err" id={eid}>{error}</div> : null}
    </div>
  );
}

function MemberHoursForm({ onSave, onCancel }) {
  const today = isoToday();
  const [f, setF] = useState(() => ({ activity: '', date: today, hrs: '' }));
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  async function save() {
    if (busy) return;
    // Same checks as the Profile log-hours form, so the error text matches.
    const e = validateLogHours(f, today);
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    await onSave({ activity: f.activity.trim(), date: shortDateLabel(f.date), hrs: f.hrs });
    setBusy(false);
  }
  return (
    <div>
      <Field label="What you did" value={f.activity} onChange={(v) => setF((x) => ({ ...x, activity: v }))} placeholder="e.g. Sorted donations" maxLength={80} required error={err.activity} />
      <div className="vu-2col-keep" style={S('margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <DateInput label="Date" value={f.date} onChange={(v) => setF((x) => ({ ...x, date: v }))} min={isoEarliest()} max={today} required error={err.date} />
        <Field label="Hours" value={f.hrs} onChange={(v) => setF((x) => ({ ...x, hrs: cleanHoursInput(v) }))} placeholder="e.g. 2.5" inputMode="decimal" required error={err.hrs} />
      </div>
      <div style={S('margin-top:20px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap')}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={save} busy={busy}>{busy ? 'Logging hours' : 'Log hours'}</Button>
      </div>
    </div>
  );
}

/* The square a step or task row toggles. Ink when done. */
function CheckBox({ on }) {
  return (
    <span
      aria-hidden="true"
      style={s(
        'width:20px;height:20px;border-radius:6px;flex:none;margin-top:1px;display:grid;place-items:center',
        on ? `background:${C.ink};color:#fff` : `background:#fff;box-shadow:inset 0 0 0 1.5px ${C.line2};color:transparent`,
      )}
    >
      {on ? <Icon name="check" size={13} stroke={2.5} /> : null}
    </span>
  );
}

/* "2 of 3 done", or "Ready to start" once every required step is checked. */
function ProgressCount({ done, total, readyLabel }) {
  if (readyLabel && done >= total) return <StatusText tone="ok">{readyLabel}</StatusText>;
  return <span style={S(COUNT)}>{done} of {total} done</span>;
}

/* Volunteer program: the steps the member works through before their first shift. */
function VolunteerMember({ app, onToggle }) {
  const steps = (app.listings.pipeline || []).filter((x) => x && x.label);
  const done = (app.member_state && app.member_state.pipeline) || {};
  const required = steps.filter((x) => x.required !== false);
  const cleared = required.filter((x) => done[x.id]).length;

  if (!steps.length) {
    return (
      <div>
        <h3 style={S(H3)}>Before your first shift</h3>
        <p style={S(`margin:6px 0 0;${SMALL}`)}>Nothing to do before your first shift.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;min-height:24px')}>
        <h3 style={S(H3)}>Before your first shift</h3>
        <ProgressCount done={cleared} total={required.length} readyLabel="Ready to start" />
      </div>
      {steps.map((step) => {
        const k = KIND[step.kind] || KIND.check;
        const on = !!done[step.id];
        const href = safeUrl(step.link);
        const actionLabel = step.kind === 'meeting' ? 'Join call' : step.kind === 'form' ? 'Open form' : 'Open link';
        // "Form due Oct 30", "Meeting, Mon 5 PM", or just the kind.
        const when = step.kind === 'form' ? (step.due ? `${k.label} due ${plain(step.due)}` : '') : (step.when ? `${k.label}, ${plain(step.when)}` : '');
        return (
          <div key={step.id} style={S(`display:flex;align-items:flex-start;gap:12px;${ROW_RULE}`)}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(app, step.id)}
              style={S('flex:1;min-width:0;text-align:left;display:flex;align-items:flex-start;gap:12px;padding:12px 0;background:transparent;border:0;cursor:pointer;color:inherit')}
            >
              <CheckBox on={on} />
              <span style={S('min-width:0;flex:1')}>
                <span style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                  <span style={s(`min-width:0;font:600 14px/1.35 ${F.body}`, on ? `color:${C.ink2};text-decoration:line-through;text-decoration-color:${C.ink3}` : `color:${C.ink}`)}>{step.label}</span>
                  {step.required === false ? <span style={S(`font:400 13px/1 ${F.body};color:${C.ink3}`)}>Optional</span> : null}
                </span>
                <span className="vu-break" style={S(`display:block;margin-top:2px;${SMALL}`)}>
                  {[when || k.label, step.note].filter(Boolean).join('. ')}
                </span>
              </span>
            </button>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="vu-btn vu-btn-outline"
                style={S(`flex:none;margin-top:8px;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:${R.control};border:1px solid ${C.line2};background:#fff;font:600 13px/1 ${F.body};color:${C.ink};text-decoration:none;white-space:nowrap`)}
              >
                {actionLabel}
                <Icon name="external" size={14} label="opens in a new tab" />
              </a>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* Task-based team: your assigned role briefing and the tasks the organizer gave you. */
function TeamMember({ app, onAck, onToggleTask }) {
  const a = app.assignment || {};
  const role = resolveRole(a, app.listings.task_roles || [], app.position);
  const tasks = a.tasks || [];
  const doneMap = (app.member_state && app.member_state.tasks) || {};
  const acked = role && app.member_state && app.member_state.briefingAck && app.member_state.briefingAck[role.id];
  const doneCount = tasks.filter((t) => doneMap[t.id] === 'done').length;

  if (!role && !tasks.length) {
    return (
      <div>
        <h3 style={S(H3)}>Your role</h3>
        <p style={S(`margin:6px 0 0;${SMALL}`)}>Your organizer hasn&apos;t given you a role or tasks yet.</p>
      </div>
    );
  }

  return (
    <div style={S('display:flex;flex-direction:column;gap:28px')}>
      {role ? (
        <div>
          <div style={S('display:flex;align-items:baseline;gap:8px;flex-wrap:wrap')}>
            <h3 style={S(H3)}>Your role</h3>
            <span style={S(`display:inline-flex;align-items:center;gap:7px;font:400 15px/1.3 ${F.body};color:${C.ink}`)}>
              <span aria-hidden="true" style={s('width:8px;height:8px;border-radius:50%;flex:none', `background:${role.color || C.ink2}`)} />
              {role.name}
            </span>
          </div>
          {role.briefing ? (
            <p className="vu-break" style={S(`${NOTE};margin-top:8px`)}>
              {role.briefing}
            </p>
          ) : null}
          <div style={S('margin-top:12px')}>
            {acked ? (
              <StatusText tone="ok">Briefing read</StatusText>
            ) : (
              <Button variant="dark" size="sm" onClick={() => onAck(app, role.id)}>
                I&apos;ve read the briefing
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {tasks.length ? (
        <div>
          <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px')}>
            <h3 style={S(H3)}>Your tasks</h3>
            <ProgressCount done={doneCount} total={tasks.length} />
          </div>
          {tasks.map((t) => {
            const on = doneMap[t.id] === 'done';
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => onToggleTask(app, t.id)}
                style={S(`width:100%;text-align:left;display:flex;align-items:flex-start;gap:12px;padding:12px 0;border:0;background:transparent;cursor:pointer;color:inherit;${ROW_RULE}`)}
              >
                <CheckBox on={on} />
                <span style={S('min-width:0;flex:1')}>
                  <span style={s(`font:600 14px/1.35 ${F.body}`, on ? `color:${C.ink2};text-decoration:line-through;text-decoration-color:${C.ink3}` : `color:${C.ink}`)}>{t.title}</span>
                  {t.detail ? <span className="vu-break" style={S(`display:block;margin-top:3px;${SMALL}`)}>{t.detail}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : role && acked ? (
        <p style={S(`margin:0;${SMALL}`)}>No tasks assigned yet.</p>
      ) : null}
    </div>
  );
}
