'use client';

/* ==========================================================================
   MemberProjects.jsx, the volunteer/member side of a project they joined
   Once an organizer accepts you, this is where you see what's expected before
   you start: the steps for a volunteer program, or your role briefing and tasks
   for a task-based team. Progress is the member's own, saved on their
   application row so the same view follows them across devices. Renders nothing
   until they've been accepted somewhere.
   ========================================================================== */

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { S, s, cx, H } from '../lib/style.js';
import { loadMyMemberships, updateMemberState, setMyTaskStatus, logMemberHours, removeMemberHours, checkInMember, myShiftSignUps } from '../lib/listings.js';
import { openModal, toast, confirmDialog } from '../lib/overlays.js';
import { syncMyServiceHours } from '../lib/db.js';
import { checkInWindow, shiftDates } from '../lib/calendar.js';
import { Field, Pressable, Icon } from './ui.jsx';
import MessageThread from './MessageThread.jsx';
import { nextShiftInfo, shiftLabel } from './screens/JoinListing.jsx';
import { isoToday, isoEarliest, shortDateLabel, validateLogHours, cleanHoursInput } from './LogHoursForm.jsx';

const LABEL = 'font:600 13px/1.2 Geist;letter-spacing:-0.01em;color:#6B635C';
const CHIP = 'padding:4px 9px;border-radius:7px;font:500 12px/1 Geist';
const BTN_SECONDARY = 'flex:none;display:inline-flex;align-items:center;gap:6px;padding:0 13px;height:34px;border-radius:9px;border:1px solid #E7C0AC;background:#fff;font:600 12px/1 Geist;color:#C2603C;cursor:pointer';
const BTN_PRIMARY = 'flex:none;display:inline-flex;align-items:center;gap:6px;padding:0 14px;height:34px;border-radius:9px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 12px/1 Geist;cursor:pointer';
const MODAL_SECONDARY = 'display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer';
const MODAL_PRIMARY = 'display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 14px/1 Geist;cursor:pointer';
const HOURS_PREVIEW = 5;
/* Rows inside a project card are plain lines with a hairline between them,
   so the card doesn't hold a stack of bordered boxes. */
const ROW_RULE = 'border-top:1px solid #F1EBE4';
const rowRule = (i) => (i > 0 ? ROW_RULE : '');
/* checkInMember error codes whose message is safe to show as written. */
const CHECK_IN_REFUSALS = ['NOT_STARTED', 'ENDED', 'SIGNED_OUT'];

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

const KIND = {
  meeting: { icon: 'clock', label: 'Meeting', bg: '#EEF3FB', color: '#4A5A9E' },
  form: { icon: 'file', label: 'Form', bg: '#FDF3E7', color: '#8A5A20' },
  training: { icon: 'award', label: 'Training', bg: '#EAF3EC', color: '#3F6B4E' },
  check: { icon: 'check', label: 'Step', bg: '#F6F2EE', color: '#57504A' },
};

/** Session strings arrive as "Sat, Oct 24 · 10:00 AM-11:00 AM"; show them the way
    every screen does ("Sat, Oct 24 at 10–11 AM"). Text that isn't a shift comes back
    with any "·" turned into a comma. */
function plain(text) {
  const info = nextShiftInfo(text);
  return info ? info.label : String(text || '').replace(/\s*·\s*/g, ', ');
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

/** "1 hr", "2.5 hrs" for chips and tight rows. */
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

export default function MemberProjects() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

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
      cancelLabel: 'Keep it',
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

  return (
    <section aria-label="Projects you're in" style={S('padding:20px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
      <h2 style={S('margin:0;font:600 16px/1.3 Geist;letter-spacing:-0.015em;color:#1A1714')}>Projects you&apos;re in</h2>
      <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:12px')}>
        {[...rows].sort((a, b) => Number(!!a.listings.unlisted) - Number(!!b.listings.unlisted)).map((app) => {
          const l = app.listings;
          const isTeam = l.org_type === 'team';
          // The listing is hidden from members once the organizer archives or
          // pauses it, so only the saved copy comes back: no shifts, no steps.
          const closed = !!l.unlisted;
          // Archiving stamps closedAt on each member's row (markProjectClosed).
          // A listing that's only paused or unlisted has no stamp, and one the
          // organizer brought back is readable again, so neither reads archived.
          const archivedOn = closed ? archivedLabel(app.assignment && app.assignment.closedAt) : null;
          const meta = [l.cause, l.site, app.position].filter(Boolean).join(', ') || 'Student project';
          return (
            <article key={app.id} aria-label={l.name} style={S('padding:16px 18px;border-radius:14px;background:#FCFAF8;border:1px solid #F1EBE4')}>
              <div style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
                <div style={S('min-width:0;flex:1 1 220px')}>
                  <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                    <h3 style={S('margin:0;font:600 16px/1.25 Geist;letter-spacing:-0.02em;color:#1A1714')}>{l.name}</h3>
                    {archivedOn !== null ? <span style={s(CHIP, 'background:#F6F2EE;color:#6B635C')}>Archived</span> : null}
                  </div>
                  <div className="vu-break" style={S('margin-top:4px;font:450 12px/1.4 Geist;color:#8A8179')}>{meta}</div>
                </div>
                <button
                  type="button"
                  onClick={() => message(app)}
                  aria-label={`Message organizer of ${l.name}`}
                  className={cx(H.secondary, H.press)}
                  style={S(BTN_SECONDARY)}
                >
                  <Icon name="message" size={14} />
                  Message organizer
                </button>
              </div>

              {closed ? (
                <div style={S('margin-top:12px;font:450 13px/1.5 Geist;color:#57504A')}>
                  {archivedOn !== null
                    ? `The organizer archived ${l.name}${archivedOn ? ` on ${archivedOn}` : ''}, so there are no more shifts. Your hours stay on your profile.`
                    : `${l.name} isn't running right now, so there are no shifts to check in to.`}
                </div>
              ) : isTeam ? <TeamMember app={app} onAck={ackBriefing} onToggleTask={toggleTask} /> : <VolunteerMember app={app} onToggle={toggleStep} />}

              {(l.announcements || []).length ? (
                <div style={S('margin-top:16px;padding-top:14px;border-top:1px solid #EFE8E0')}>
                  <div style={S(LABEL)}>From the organizer</div>
                  <div style={S('margin-top:8px;display:flex;flex-direction:column;gap:10px')}>
                    {l.announcements.slice(0, 3).map((an) => (
                      <blockquote key={an.id} className="vu-break" style={S('margin:0;padding:1px 0 1px 12px;border-left:2px solid #E7C0AC;font:450 13px/1.55 Geist;color:#332D28;white-space:pre-wrap')}>
                        {an.body}
                      </blockquote>
                    ))}
                  </div>
                </div>
              ) : null}

              {closed || nothingToCheckInTo(l) ? null : <MemberCheckIn app={app} onCheckIn={() => checkInFor(app)} />}

              <MemberHours app={app} onLog={() => logHoursFor(app)} onRemove={(h) => removeHour(app, h)} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MemberHours({ app, onLog, onRemove }) {
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
    <div style={S('margin-top:16px;padding-top:14px;border-top:1px solid #EFE8E0')}>
      <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap')}>
        <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
          <div style={S(LABEL)}>Your hours</div>
          {rows.length ? (
            <>
              <span style={s(CHIP, 'background:#EAF3EC;color:#3F6B4E')}>{hrs(confirmedSum)} confirmed</span>
              {waitingSum > 0 ? <span style={s(CHIP, 'background:#FDF3E7;color:#8A5A20')}>{hrs(waitingSum)} waiting</span> : null}
            </>
          ) : null}
        </div>
        <button type="button" onClick={onLog} className={cx(H.secondary, H.press)} style={S(BTN_SECONDARY)}>
          <Icon name="plus" size={14} />
          Log hours
        </button>
      </div>
      {rows.length ? (
        <div style={S('margin-top:6px;display:flex;flex-direction:column')}>
          {shown.map((h, i) => {
            const v = h.v;
            return (
              <div key={h.key} style={s('display:flex;align-items:center;gap:10px;padding:6px 0', rowRule(i))}>
                <span className="vu-break" style={s('font:450 13px/1.35 Geist;flex:1;min-width:0', v ? 'color:#57504A' : 'color:#332D28')}>{h.activity}, {h.date}</span>
                <span style={S("font:500 12px/1 'Geist Mono',monospace;color:#332D28;flex:none")}>{hrs(h.hrs)}</span>
                {v ? (
                  <span title={h.posted ? 'Posted by the organizer from attendance' : 'Confirmed by the organizer'} style={S('flex:none;width:28px;height:28px;display:grid;place-items:center;color:#3F6B4E')}>
                    <Icon name="check" size={14} label="Confirmed" />
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label={`Remove ${h.activity}, ${h.date}`}
                    title="Remove"
                    onClick={() => onRemove(h)}
                    className={cx(H.press)}
                    style={S('flex:none;width:28px;height:28px;display:grid;place-items:center;border-radius:7px;border:0;background:none;color:#8A8179;cursor:pointer')}
                  >
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
            );
          })}
          {rows.length > HOURS_PREVIEW ? (
            <button type="button" onClick={() => setShowAll((x) => !x)} aria-expanded={showAll} className={cx(H.press)} style={S('margin-top:4px;align-self:flex-start;border:0;background:none;padding:4px 2px;font:600 12px/1 Geist;color:#C2603C;cursor:pointer')}>
              {showAll ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          ) : null}
        </div>
      ) : (
        <div style={S('margin-top:8px;font:450 13px/1.5 Geist;color:#8A8179')}>Log the time you put in here, and {app.listings.name} can confirm it.</div>
      )}
    </div>
  );
}

/* "Sat, Oct 24 at 8 AM", the moment check-in opens. */
function opensAtLabel(d) {
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return day;
  return `${day} at ${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

function MemberCheckIn({ app, onCheckIn }) {
  const checkins = (app.member_state && app.member_state.checkins) || [];
  const last = checkins[0];
  const nextSession = postedShift(app.listings);
  const scheduled = !!nextSession;
  // Check-in opens 1 hour before the shift and closes at the end of its day
  // (same rule checkInMember enforces), so there's no button a week early.
  const win = scheduled ? checkInWindow(nextSession) : { state: 'unknown' };
  const doneForThis = !!(last && scheduled && last.session && plain(last.session) === nextSession);
  let note = null;
  if (win.state === 'early') note = `Check-in opens ${opensAtLabel(win.opensAt)}.`;
  else if (win.state === 'over') note = 'No new shift posted yet. If you went, log your hours.';
  const canCheckIn = (win.state === 'open' || win.state === 'unknown') && !doneForThis;
  // The volunteer's own upcoming sign-ups, soonest first, so they can see
  // which shift they picked and get to the shift list to change it.
  const startOf = (x) => { const d = shiftDates(x); return d ? d.start.getTime() : Infinity; };
  const mySignUps = myShiftSignUps(app).filter((x) => !x.past).sort((a, b) => startOf(a) - startOf(b));
  return (
    <div style={S('margin-top:16px;padding-top:14px;border-top:1px solid #EFE8E0;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
      <div style={S('min-width:0;flex:1 1 220px')}>
        <div style={S(LABEL)}>Check in</div>
        <div style={S('margin-top:6px;font:450 13px/1.45 Geist;color:#57504A')}>
          {scheduled ? (
            <>{win.state === 'over' ? 'Last shift' : 'Next shift'} <span style={S('color:#1A1714;font-weight:500')}>{nextSession}</span></>
          ) : 'Check in when you get there.'}
        </div>
        {mySignUps.length ? (
          <div style={S('margin-top:6px;font:450 13px/1.45 Geist;color:#57504A')}>
            Signed up for <span style={S('color:#1A1714;font-weight:500')}>{shiftLabel(mySignUps[0])}</span>
            {mySignUps.length > 1 ? ` and ${mySignUps.length - 1} more` : ''}
          </div>
        ) : null}
        {app.listing_id ? (
          <Link
            href={`/join/${app.listing_id}`}
            aria-label={`See shifts for ${app.listings.name}`}
            className={cx(H.press)}
            style={S('margin-top:6px;display:block;width:fit-content;font:600 12px/1.4 Geist;color:#C2603C;text-decoration:none')}
          >
            See shifts
          </Link>
        ) : null}
        {last ? (
          <div style={S('margin-top:6px;display:inline-flex;align-items:center;gap:6px;font:450 12px/1.4 Geist;color:#3F6B4E')}>
            <Icon name="check" size={13} />
            <span>{checkedInLine(last)}</span>
          </div>
        ) : null}
        {note && !doneForThis ? <div style={S('margin-top:6px;font:450 12px/1.4 Geist;color:#8A8179')}>{note}</div> : null}
      </div>
      {canCheckIn ? (
        <button type="button" onClick={onCheckIn} className={cx(H.primary, H.press)} style={S(BTN_PRIMARY)}>
          {last ? 'Check in again' : 'Check in'}
        </button>
      ) : null}
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
        <div style={S('margin-bottom:14px;padding:12px 14px;border-radius:11px;background:#FCFAF8;border:1px solid #F1EBE4;font:450 13px/1.5 Geist;color:#57504A')}>
          Shift <span style={S('color:#1A1714;font-weight:500')}>{session}</span>
        </div>
      ) : null}
      <div>
        <Field
          label="Check-in code (optional)"
          value={code}
          onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 8))}
          placeholder="e.g. 3586"
          inputMode="numeric"
          maxLength={8}
          hint="Your organizer checks this code. No code? Leave it blank."
        />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap')}>
        <Pressable label="Cancel" onClick={onCancel} className={cx(H.secondary, H.press)} style={S(MODAL_SECONDARY)}>Cancel</Pressable>
        <Pressable label="Check in" disabled={busy} onClick={save} className={cx(H.primary, H.press)} style={S(MODAL_PRIMARY)}>{busy ? 'Checking in' : 'Check in'}</Pressable>
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
      <label htmlFor={fid} style={S('display:block;font:500 12px/1 Geist;color:#57504A')}>
        {label}
        {required ? <span aria-hidden="true" style={S('color:#C2603C')}>{' *'}</span> : null}
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
        className={H.input}
        style={S('margin-top:8px;display:block;width:100%;min-width:0;padding:11px 14px;border-radius:10px;border:1px solid #E8E1D9;background:#fff;font:450 15px/1.15 Geist;color:#1A1714;transition:border-color .16s ease')}
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
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <DateInput label="Date" value={f.date} onChange={(v) => setF((x) => ({ ...x, date: v }))} min={isoEarliest()} max={today} required error={err.date} />
        <Field label="Hours" value={f.hrs} onChange={(v) => setF((x) => ({ ...x, hrs: cleanHoursInput(v) }))} placeholder="e.g. 2.5" inputMode="decimal" required error={err.hrs} />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap')}>
        <Pressable label="Cancel" onClick={onCancel} className={cx(H.secondary, H.press)} style={S(MODAL_SECONDARY)}>Cancel</Pressable>
        <Pressable label="Log hours" disabled={busy} onClick={save} className={cx(H.primary, H.press)} style={S(MODAL_PRIMARY)}>{busy ? 'Logging hours' : 'Log hours'}</Pressable>
      </div>
    </div>
  );
}

function CheckBox({ on }) {
  return (
    <span
      aria-hidden="true"
      style={s('width:19px;height:19px;border-radius:6px;flex:none;margin-top:1px;display:grid;place-items:center', on ? 'background:#3F6B4E;color:#fff' : 'background:#fff;border:1px solid #D8D0C7;color:transparent')}
    >
      {on ? <Icon name="check" size={12} stroke={2.5} /> : null}
    </span>
  );
}

/* Volunteer program: the steps the member works through before their first shift. */
function VolunteerMember({ app, onToggle }) {
  const steps = (app.listings.pipeline || []).filter((x) => x && x.label);
  const done = (app.member_state && app.member_state.pipeline) || {};
  const required = steps.filter((x) => x.required !== false);
  const cleared = required.filter((x) => done[x.id]).length;
  const ready = required.length === 0 || cleared === required.length;

  if (!steps.length) {
    return (
      <div style={S('margin-top:12px;font:450 13px/1.5 Geist;color:#57504A')}>
        No steps before your first shift.
      </div>
    );
  }

  return (
    <div style={S('margin-top:16px')}>
      <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
        <div style={S(LABEL)}>Before your first shift</div>
        <span style={s(CHIP, ready ? 'background:#EAF3EC;color:#3F6B4E' : 'background:#FDF3E7;color:#8A5A20')}>
          {ready ? 'All done' : `${cleared} of ${required.length} done`}
        </span>
      </div>
      <div style={S('margin-top:6px;display:flex;flex-direction:column')}>
        {steps.map((step, i) => {
          const k = KIND[step.kind] || KIND.check;
          const on = !!done[step.id];
          const href = safeUrl(step.link);
          const actionLabel = step.kind === 'meeting' ? 'Join call' : step.kind === 'form' ? 'Open form' : 'Open link';
          const timing = step.kind === 'form' ? (step.due ? `Due ${step.due}` : '') : (step.when || '');
          return (
            <div
              key={step.id}
              style={s('display:flex;align-items:center;gap:8px;flex-wrap:wrap', rowRule(i))}
            >
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(app, step.id)}
                style={S('flex:1 1 220px;min-width:0;text-align:left;display:flex;align-items:flex-start;gap:11px;padding:11px 0;background:transparent;border:0;cursor:pointer')}
              >
                <CheckBox on={on} />
                <span style={S('min-width:0;flex:1')}>
                  <span style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                    {/* The kind icon sits before the title, so a long title can't wrap it onto a line of its own. */}
                    <span style={S('min-width:0;display:flex;align-items:flex-start;gap:7px')}>
                      <span title={k.label} style={s('flex:none;white-space:nowrap;display:inline-flex;align-items:center;padding:2px 5px;border-radius:6px', `background:${k.bg}`, `color:${k.color}`)}>
                        <Icon name={k.icon} size={12} label={k.label} />
                      </span>
                      <span style={s('min-width:0;font:600 13.5px/1.3 Geist', on ? 'color:#3F6B4E' : 'color:#1A1714')}>{step.label}</span>
                    </span>
                    {step.required === false ? <span style={S('font:450 11px/1 Geist;color:#8A8179')}>Optional</span> : null}
                    {timing ? <span style={s(CHIP, 'padding:3px 7px;font-size:11px', 'background:#EEF3FB;color:#4A5A9E')}>{plain(timing)}</span> : null}
                  </span>
                  {step.note ? <span style={S('display:block;margin-top:4px;font:450 12px/1.45 Geist;color:#8A8179')}>{step.note}</span> : null}
                </span>
              </button>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cx(H.secondary, H.press)}
                  style={S('flex:none;margin:0 0 10px auto;display:inline-flex;align-items:center;gap:6px;padding:0 12px;height:32px;border-radius:9px;border:1px solid #E7C0AC;background:#fff;font:600 12px/1 Geist;color:#C2603C;text-decoration:none;cursor:pointer')}
                >
                  {actionLabel}
                  <Icon name="external" size={13} label="opens in a new tab" />
                </a>
              ) : null}
            </div>
          );
        })}
      </div>
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
      <div style={S('margin-top:12px;font:450 13px/1.5 Geist;color:#57504A')}>
        Your organizer hasn&apos;t given you a role or tasks yet.
      </div>
    );
  }

  return (
    <div style={S('margin-top:16px;display:flex;flex-direction:column;gap:16px')}>
      {role ? (
        <div>
          <div style={S('display:flex;align-items:center;gap:8px')}>
            <span aria-hidden="true" style={s('width:9px;height:9px;border-radius:50%;flex:none', `background:${role.color || '#C2603C'}`)} />
            <div style={S(LABEL)}>Your role</div>
            <div style={S('font:600 13px/1.2 Geist;color:#1A1714')}>{role.name}</div>
          </div>
          {role.briefing ? (
            <blockquote className="vu-break" style={S('margin:10px 0 0;padding:1px 0 1px 12px;border-left:2px solid #E7C0AC;font:450 13.5px/1.6 Geist;color:#332D28')}>
              {role.briefing}
            </blockquote>
          ) : null}
          <div style={S('margin-top:12px')}>
            {acked ? (
              <span style={S('display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:9px;background:#EAF3EC;font:600 12px/1 Geist;color:#3F6B4E')}>
                <Icon name="check" size={13} />
                Briefing read
              </span>
            ) : (
              <button type="button" onClick={() => onAck(app, role.id)} className={cx(H.primary, H.press)} style={S('padding:0 15px;height:38px;border-radius:10px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 13px/1 Geist;cursor:pointer')}>
                I&apos;ve read the briefing
              </button>
            )}
          </div>
        </div>
      ) : null}

      {tasks.length ? (
        <div>
          <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px')}>
            <div style={S(LABEL)}>Your tasks</div>
            <span style={s(CHIP, doneCount === tasks.length ? 'background:#EAF3EC;color:#3F6B4E' : 'background:#FDF3E7;color:#8A5A20')}>{doneCount} of {tasks.length} done</span>
          </div>
          <div style={S('margin-top:6px;display:flex;flex-direction:column')}>
            {tasks.map((t, i) => {
              const on = doneMap[t.id] === 'done';
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggleTask(app, t.id)}
                  style={s('text-align:left;display:flex;align-items:flex-start;gap:11px;padding:11px 0;border:0;background:transparent;cursor:pointer', rowRule(i))}
                >
                  <CheckBox on={on} />
                  <span style={S('min-width:0;flex:1')}>
                    <span style={s('font:600 13.5px/1.3 Geist', on ? 'color:#3F6B4E;text-decoration:line-through' : 'color:#1A1714')}>{t.title}</span>
                    {t.detail ? <span style={S('display:block;margin-top:4px;font:450 12px/1.45 Geist;color:#8A8179')}>{t.detail}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : role && acked ? (
        <div style={S('font:450 13px/1.5 Geist;color:#8A8179')}>No tasks assigned yet.</div>
      ) : null}
    </div>
  );
}
