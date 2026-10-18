'use client';

/* ==========================================================================
   Tabs.jsx, Attendance, Applications, Hours, Quality, Messages, Settings
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { S, s, cx, H } from '../../lib/style.js';
import { Avatar, Pressable, EmptyState, Toggle, Field, TextArea, Icon, Button, StatusText, IconButton } from '../ui.jsx';
import { C, F, R, TONES } from '../../lib/tokens.js';
import DateBlock from '../vu/DateBlock.jsx';
import { openModal, confirmDialog, toast, menuFromEvent } from '../../lib/overlays.js';
import { update } from '../../lib/store.js';
import { shiftDates, isPastShift } from '../../lib/calendar.js';
import CrossApplications from '../CrossApplications.jsx';
import { ShareLink } from './CrossMembers.jsx';
import MessageThread from '../MessageThread.jsx';
import { formatShiftTime } from '../screens/JoinListing.jsx';
import { supabase } from '../../lib/supabase.js';
import { loadProjectMembers, confirmMemberHour, publishListing, myId, loadOwnerApplications, setMemberAssignment, postedShiftOnDate } from '../../lib/listings.js';
import {
  attendanceFor, attendanceStats, setAttendance, postAttendance,
  decideApplication, reopenApplication,
  pendingHours, cleanHours, approveHours, adjustHours, validateHours,
  recomputeCompliance, resolveDispute, fileIncident, closeIncident, resolveEscalation,
  sendMessage, readThread, toggleProjectSetting, archiveProject, logAudit,
  updateProject, download, parseSessionDate, getProject, messageTemplateText, ATTEND_TONE, GRADE_TONE, tone,
} from '../../lib/db.js';
import { GRADE_SCALE, messageTemplates } from '../../lib/seed.js';

const ATTEND_OPTIONS = ['Present', 'Late', 'Absent', 'Excused'];

/* ---- type and layout atoms (photo-first system, same scale as Lead.jsx) ---- */

/** Section heading (h2) in the main column. */
export const H2 = `margin:0;font:650 22px/1.15 ${F.display};letter-spacing:-0.02em;color:${C.ink}`;
/** Rail heading. */
export const H3 = `margin:0;font:600 18px/1.2 ${F.display};letter-spacing:-0.012em;color:${C.ink}`;
export const LABEL = `font:600 15px/1.3 ${F.body};color:${C.ink}`;
export const META = `font:400 14px/1.4 ${F.body};color:${C.ink2}`;
export const SMALL = `font:400 13px/1.45 ${F.body};color:${C.ink2}`;
export const BODY = `font:400 15px/1.5 ${F.body};color:${C.ink}`;
export const NUM = 'font-variant-numeric:tabular-nums';
/** A row divided from the next by a 1px rule. */
export const RULE = `border-bottom:1px solid ${C.line}`;
/** Table column header. */
export const TH = `font:600 13px/1.2 ${F.body};color:${C.ink2}`;
/** Underlined ink text action. Links are never colored. */
export const TEXT_LINK = `font:600 14px/1.2 ${F.body};color:${C.ink};text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px;cursor:pointer;background:none;border:0;padding:0;white-space:nowrap`;
/** Sections in the main column sit 48px apart. */
const SEC_GAP = 'margin-top:48px';
const DISABLED = 'opacity:.5;cursor:default';

/** Text color for a status tone: the tone's own, or ink2 for mute. */
function toneFg(tone) {
  const t = TONES[tone];
  return tone === 'mute' || !t ? C.ink2 : t.fg;
}

/** A status word that opens a menu (attendance, score): dot + word + chevron,
    no fill. It reads like StatusText and gains a mist fill on hover. */
function statusTrigger(tone, locked) {
  return s(
    'display:inline-flex;align-items:center;gap:6px;white-space:nowrap;width:max-content;height:32px;padding:0 8px;margin-left:-8px;border-radius:10px;transition:background .16s ease',
    `color:${toneFg(tone)};font:600 13px/1 ${F.body}`,
    `cursor:${locked ? 'default' : 'pointer'}`
  );
}

/** The 7px dot that leads a status word. */
function StatusDot({ tone }) {
  return <i aria-hidden="true" style={S(`width:7px;height:7px;border-radius:50%;flex:none;background:${toneFg(tone)}`)} />;
}

const ATTEND_PILL = { Present: 'ok', Late: 'wait', Absent: 'bad', Excused: 'mute', Unmarked: 'mute' };
const GRADE_PILL = { Exceptional: 'ok', Strong: 'ok', Solid: 'mute', 'Needs support': 'wait', 'Not scored': 'mute' };

/** True under `max` px. Starts false so server and first client render agree. */
export function useNarrow(max = 720) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(`(max-width: ${max}px)`);
    const on = () => setNarrow(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on);
    else mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on));
  }, [max]);
  return narrow;
}

/** Dialog footer: cancel on the left of the confirm action, right aligned. */
export function DialogActions({ children, left = null }) {
  return (
    <div style={S('margin-top:24px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap')}>
      {left || <span />}
      <div style={S('display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end')}>{children}</div>
    </div>
  );
}

function fmtHours(n) {
  const v = Math.round(Number(n || 0) * 10) / 10;
  return `${v} ${v === 1 ? 'hour' : 'hours'}`;
}

function shortHrs(n) {
  const v = Math.round(Number(n || 0) * 10) / 10;
  return `${v} ${v === 1 ? 'hr' : 'hrs'}`;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many || `${one}s`}`;
}

/* ==========================================================================
   Attendance
   ========================================================================== */

/** Length of a shift in hours from its time label ("1:00-4:00 PM"), or 0. */
function shiftLength(sn) {
  const d = shiftDates({ d: sn.d, t: sn.t || sn.m });
  if (!d) return 0;
  const h = (d.end.getTime() - d.start.getTime()) / 3600000;
  return h > 0 && h <= 24 ? Math.round(h * 10) / 10 : 0;
}

function hasStarted(sn, now) {
  const d = shiftDates(sn, undefined, now);
  if (d) return d.start.getTime() <= now.getTime();
  return isPastShift(sn, now);
}

/** When a shift ends, or null when its time label can't be read. */
function shiftEnd(sn, now) {
  const d = shiftDates({ d: sn.d, t: sn.t || sn.m }, undefined, now);
  return d ? d.end : null;
}

/** "6 PM", "6:30 PM", "noon" for a Date. */
function clockLabel(d) {
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 12 && m === 0) return 'noon';
  if (h === 0 && m === 0) return 'midnight';
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * A shift's time range in the app's one format ("9 AM–noon", "1–4 PM").
 * Posting overwrites an attendance session's `m` with a summary
 * ("3 of 3 present, posted"), so fall back to the scheduled shift.
 */
function sessionTime(p, x) {
  const sn = x.t ? null : (p.sessions || []).find((s) => s.id === x.id);
  const raw = x.t || (sn && sn.t) || (x.posted ? '' : x.m || '');
  return formatShiftTime(raw);
}

/* ---- posted hours reach the volunteer ------------------------------------ */

/**
 * Write posted attendance hours onto a linked member's application, in the
 * owner-written half (`assignment.attendanceHours`). The lead posted them, so
 * they count as confirmed for the volunteer. Keyed by entry id, so a retry
 * replaces instead of adding twice. Returns { ok, gone }.
 */
async function creditAttendanceHours(applicationId, entry) {
  if (!supabase) return { ok: false };
  const me = await myId();
  if (!me) return { ok: false };
  const { data: cur, error: readErr } = await supabase.from('applications').select('assignment').eq('id', applicationId).maybeSingle();
  if (readErr) return { ok: false, error: readErr };
  if (!cur) return { ok: false, gone: true };
  const a = cur.assignment || {};
  const list = Array.isArray(a.attendanceHours) ? a.attendanceHours.filter((h) => h && h.id !== entry.id) : [];
  const next = { ...a, attendanceHours: [entry, ...list] };
  const { data, error } = await supabase.from('applications').update({ assignment: next }).eq('id', applicationId).eq('owner_id', me).select('id');
  if (error) return { ok: false, error };
  return { ok: Array.isArray(data) ? data.length > 0 : true };
}

/**
 * The accepted application on this project's listing for a roster row that is
 * linked to an account (`accountId`) but didn't come in through the join link,
 * so has no `appId`. Posted hours live on that application. Returns its id,
 * null when there is none, or undefined when the lookup failed.
 */
async function memberApplicationFor(listingId, accountId) {
  if (!supabase || !listingId || !accountId) return null;
  const me = await myId();
  if (!me) return undefined;
  const { data, error } = await supabase
    .from('applications')
    .select('id')
    .eq('listing_id', listingId)
    .eq('applicant_id', accountId)
    .eq('owner_id', me)
    .eq('status', 'accepted')
    .limit(1);
  if (error) {
    console.error('[lead] could not look up the application for a linked roster row', error);
    return undefined;
  }
  return Array.isArray(data) && data[0] ? data[0].id : null;
}

/**
 * Where each row's posted hours can go. Rows with hours get one of:
 * - `appId`: the application the hours are written to (join-link members, and
 *   rows linked to an account that is an accepted member)
 * - `unlinked: true`: added by the lead with no VolunteerU account linked
 * - `notMember: true`: linked to an account that isn't an accepted member of
 *   this project, so there's no application to write to yet
 * - `lookupFailed: true`: the application lookup itself failed
 * Rows with no hours are left out.
 */
async function postTargets(p, rows, cache = new Map()) {
  const out = [];
  for (const r of rows) {
    if (!(Number(r.hrs) > 0)) continue;
    const person = (p.people || []).find((x) => x.id === r.personId);
    if (person && person.appId) {
      out.push({ row: r, appId: person.appId });
      continue;
    }
    const accountId = person && person.accountId;
    if (!accountId) {
      out.push({ row: r, unlinked: true });
      continue;
    }
    if (!cache.has(accountId)) {
      let found;
      try {
        found = await memberApplicationFor(p.listingId, accountId);
      } catch (err) {
        console.error('[lead] application lookup failed', err);
        found = undefined;
      }
      cache.set(accountId, found);
    }
    const appId = cache.get(accountId);
    if (appId) out.push({ row: r, appId });
    else if (appId === undefined) out.push({ row: r, lookupFailed: true });
    else out.push({ row: r, notMember: true });
  }
  return out;
}

/** "Owen Park", "Owen Park and Priya Nair", "Owen Park, Priya Nair and Ana Ruiz", or "4 people". */
function nameList(names) {
  if (names.length > 3) return plural(names.length, 'person', 'people');
  if (names.length < 2) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "has" or "have" to follow nameList(names). */
const hasHave = (names) => (names.length === 1 ? 'has' : 'have');

/**
 * Who sees posted hours. `seen` is how many people get the hours on their
 * profile; the name lists are the ones who don't. The confirm dialog says what
 * that means (`future`); the toast after posting only names who's left out.
 */
function reachCopy({ seen, unlinked = [], notMember = [], future }) {
  const parts = [];
  if (seen) parts.push(future ? `${plural(seen, 'person', 'people')} will see these hours on their profile.` : `${plural(seen, 'person', 'people')} can now see these hours.`);
  if (unlinked.length) {
    parts.push(`${nameList(unlinked)} ${hasHave(unlinked)} no VolunteerU account linked${future ? ', so their hours stay on your People tab' : ''}.`);
  }
  if (notMember.length) {
    const one = notMember.length === 1;
    parts.push(future
      ? `${nameList(notMember)} won't see them until you accept them through your join link.`
      : `${nameList(notMember)} ${one ? "isn't an accepted member" : "aren't accepted members"} yet.`);
  }
  return parts.join(' ');
}

/**
 * Send every posted shift's hours to the members linked to an account and
 * who haven't received them yet. `credited` on the session remembers who did,
 * so this is safe to run again (it is, each time Attendance opens), and a row
 * the lead links after posting gets its hours on the next run.
 * Returns names per outcome: `delivered` (written now or earlier), `failed`
 * (write or lookup failed, retried later), `unlinked` (no account linked) and
 * `notMember` (account linked, not an accepted member yet).
 */
async function creditPostedAttendance(projectId, onlySessionId) {
  const p = getProject(projectId);
  const result = { delivered: [], failed: [], unlinked: [], notMember: [] };
  if (!p) return result;
  const cache = new Map();
  const posted = (p.attendanceSessions || []).filter((x) => x.posted && (!onlySessionId || x.id === onlySessionId));
  for (const meta of posted) {
    const done = meta.credited || {};
    const rows = (p.attendance && p.attendance[meta.id]) || [];
    const time = sessionTime(p, meta);
    const targets = await postTargets(p, rows, cache);
    for (const t of targets) {
      const r = t.row;
      if (t.unlinked) { result.unlinked.push(r.n); continue; }
      if (t.notMember) { result.notMember.push(r.n); continue; }
      if (t.lookupFailed) { result.failed.push(r.n); continue; }
      const appId = t.appId;
      if (done[appId]) {
        if (done[appId] === true) result.delivered.push(r.n);
        else result.notMember.push(r.n);
        continue;
      }
      const entry = {
        id: `att-${meta.id}`,
        date: String(meta.d || '').replace(/^[A-Za-z]{3},\s*/, ''),
        activity: time ? `Shift, ${time}` : 'Shift',
        hrs: Math.round(Number(r.hrs) * 10) / 10,
        postedAt: new Date().toISOString(),
      };
      let res;
      try {
        res = await creditAttendanceHours(appId, entry);
      } catch (err) {
        res = { ok: false, error: err };
      }
      if (res.ok || res.gone) {
        update((st) => {
          const proj = st.projects.find((x) => x.id === projectId);
          const m = proj && (proj.attendanceSessions || []).find((x) => x.id === meta.id);
          if (m) m.credited = { ...(m.credited || {}), [appId]: res.ok ? true : 'gone' };
        });
        if (res.ok) result.delivered.push(r.n);
        else result.notMember.push(r.n);
      } else {
        console.error('[lead] could not send posted hours to', r.n, res.error);
        result.failed.push(r.n);
      }
    }
  }
  return result;
}

/**
 * Every shift attendance can be taken for: ones already opened for attendance,
 * plus any scheduled shift whose start time has passed. Newest first.
 */
function attendanceSessionList(p, now = new Date()) {
  const known = p.attendanceSessions || [];
  const ids = new Set(known.map((x) => x.id));
  const started = (p.sessions || [])
    .filter((sn) => sn.st !== 'Cancelled' && !ids.has(sn.id) && hasStarted(sn, now))
    .map((sn) => ({ id: sn.id, d: sn.d, m: sn.t, t: sn.t, posted: false, pending: true }));
  return [...known, ...started].sort((a, b) => parseSessionDate(b.d, now) - parseSessionDate(a.d, now));
}

/** Record a started shift as an attendance session so posting can lock it. */
function ensureAttendanceSession(projectId, meta) {
  if (!meta || !meta.pending) return;
  update((st) => {
    const proj = st.projects.find((x) => x.id === projectId);
    if (!proj) return;
    const list = proj.attendanceSessions || [];
    if (list.some((x) => x.id === meta.id)) return;
    proj.attendanceSessions = [...list, { id: meta.id, d: meta.d, m: meta.m, t: meta.t, posted: false }];
  });
}

export function AttendanceTab({ p, params, setParam, goTab }) {
  const [now, setNow] = useState(() => new Date());
  const narrow = useNarrow();
  const sessions = attendanceSessionList(p, now);
  const anyRunning = sessions.some((x) => {
    const end = !x.posted && shiftEnd(x, now);
    return end && end.getTime() > now.getTime();
  });

  // Re-check each minute while a shift is running, so Post unlocks when it ends.
  useEffect(() => {
    if (!anyRunning) return undefined;
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, [anyRunning]);

  // Hours posted earlier that didn't reach a member's profile (offline, a
  // failed write) go out again each time Attendance opens.
  const retried = useRef(false);
  useEffect(() => {
    if (retried.current) return;
    retried.current = true;
    creditPostedAttendance(p.id).catch((err) => console.error('[lead] retry posted hours failed', err));
  }, [p.id]);

  if (!sessions.length) {
    return (
      <div style={S('margin-top:32px')}>
        <EmptyState
          icon="calendar"
          title="No shifts have started yet"
          body="Attendance opens here once a shift's start time passes."
          cta="Open shifts"
          onCta={() => goTab('shifts')}
        />
      </div>
    );
  }

  const openSession = sessions.find((x) => !x.posted) || sessions[0];
  const sessionParam = params.get('session');
  const sessionId = sessionParam && sessions.some((x) => x.id === sessionParam) ? sessionParam : openSession.id;
  const meta = sessions.find((x) => x.id === sessionId);
  const rows = attendanceFor(p, sessionId);
  const stats = attendanceStats(rows);
  const unmarked = rows.filter((r) => r.st === 'Unmarked').length;
  // Rates over a roster nobody has marked yet would read as 0%, so the rail waits.
  const anyMarked = rows.length > 0 && unmarked < rows.length;
  const openEscalations = p.escalations.filter((e) => !e.resolved);
  const locked = !!meta.posted;
  const length = shiftLength(meta);
  const timeLabel = sessionTime(p, meta);
  // A shift still running can be marked, but its hours post once it ends.
  const endsAt = locked ? null : shiftEnd(meta, now);
  const running = !!endsAt && endsAt.getTime() > now.getTime();
  const endLabel = running ? clockLabel(endsAt) : '';

  const ensure = () => ensureAttendanceSession(p.id, meta);

  function arrivePatch(v, row) {
    // Coming from Unmarked or Absent, give them the shift's real length.
    if ((v === 'Present' || v === 'Late') && (row.st === 'Unmarked' || row.st === 'Absent') && length) {
      return { st: v, hrs: length, inOut: timeLabel || row.inOut };
    }
    return { st: v };
  }

  function changeStatus(e, row) {
    menuFromEvent(
      e,
      ATTEND_OPTIONS.map((v) => ({ key: v, label: v, checked: row.st === v })),
      (v) => {
        if (v === row.st) return;
        if (v === 'Absent' && row.hrs > 0) {
          confirmDialog({
            title: `Mark ${row.n} absent?`,
            body: `Their ${fmtHours(row.hrs)} for this shift go to 0 and their score is cleared.`,
            confirmLabel: 'Mark absent',
            cancelLabel: 'Keep it',
          }).then((ok) => {
            if (ok) {
              ensure();
              setAttendance(p.id, sessionId, row.personId, { st: v }, 'marked absent by lead');
              toast({ title: `Marked ${row.n} absent`, tone: 'ok' });
            }
          });
          return;
        }
        ensure();
        setAttendance(p.id, sessionId, row.personId, arrivePatch(v, row));
        toast({ title: `Marked ${row.n} ${v.toLowerCase()}`, tone: 'ok', timeout: 2000 });
      }
    );
  }

  function changeGrade(e, row) {
    menuFromEvent(
      e,
      [...GRADE_SCALE.map((g) => ({ key: g.t, label: g.t, checked: row.grade === g.t })), { key: 'Not scored', label: 'Not scored', checked: row.grade === 'Not scored' }],
      (v) => {
        if (v === row.grade) return;
        ensure();
        setAttendance(p.id, sessionId, row.personId, { grade: v });
        toast({ title: v === 'Not scored' ? 'Score cleared' : 'Score saved', message: `${row.n}: ${v}`, tone: 'ok', timeout: 2000 });
      }
    );
  }

  function editHours(row) {
    openModal({
      title: `Hours for ${row.n}`,
      subtitle: 'Changes need a reason and go in the audit log.',
      Body: function HoursBody({ api }) {
        return (
          <HoursEditForm
            api={api}
            row={{ ...row, inOut: timeLabel || row.inOut }}
            onSave={(hrs, reason) => {
              ensure();
              setAttendance(p.id, sessionId, row.personId, { hrs }, reason);
            }}
          />
        );
      },
    });
  }

  function editNote(row) {
    openModal({
      title: `Note on ${row.n}`,
      subtitle: 'Only you see this note.',
      Body: function NoteBody({ api }) {
        return (
          <SimpleNoteForm
            api={api}
            initial={row.note}
            onSave={(t) => {
              ensure();
              setAttendance(p.id, sessionId, row.personId, { note: t });
            }}
          />
        );
      },
    });
  }

  function markAll() {
    const todo = rows.filter((r) => r.st === 'Unmarked' || r.st === 'Absent');
    if (!todo.length) {
      toast({ title: 'Everyone is marked', tone: 'brand' });
      return;
    }
    ensure();
    todo.forEach((r) => setAttendance(p.id, sessionId, r.personId, { st: 'Present', hrs: length, inOut: timeLabel || r.inOut }));
    let message = length ? `${fmtHours(length)} each. Change anyone who was late or left early.` : "Set each person's hours before you post.";
    if (running) message = `${length ? `${fmtHours(length)} each. ` : ''}You can post once the shift ends at ${endLabel}.`;
    toast({ title: `Marked ${todo.length} present`, message, tone: 'ok' });
  }

  async function post() {
    if (running) {
      toast({ title: 'Shift is still running', message: `Post attendance after it ends at ${endLabel}.`, tone: 'warn' });
      return;
    }
    if (unmarked) {
      toast({ title: `${unmarked} still unmarked`, message: 'Mark everyone before you post.', tone: 'warn' });
      return;
    }
    // Say who will and won't see the hours before they're locked in.
    let targets = [];
    try {
      targets = await postTargets(p, rows);
    } catch (err) {
      console.error('[lead] could not check who gets posted hours', err);
    }
    const names = (pick) => targets.filter(pick).map((t) => t.row.n);
    const reach = reachCopy({
      seen: targets.filter((t) => t.appId || t.lookupFailed).length,
      unlinked: names((t) => t.unlinked),
      notMember: names((t) => t.notMember),
      future: true,
    });
    const ok = await confirmDialog({
      title: `Post attendance for ${meta.d}?`,
      body: `This locks the shift and adds the hours to each person's total on your People tab. You can't edit it afterward.${reach ? ` ${reach}` : ''}`,
      confirmLabel: 'Post attendance',
      cancelLabel: 'Go back',
      tone: 'brand',
    });
    if (!ok) return;
    let n;
    try {
      ensure();
      n = postAttendance(p.id, sessionId);
    } catch (err) {
      console.error('[lead] post attendance failed', err);
      toast({ title: "Couldn't post attendance", message: err && err.code === 'DUPLICATE' ? 'This shift was already posted.' : 'Mark everyone, then try again.', tone: 'danger' });
      return;
    }
    let res;
    try {
      res = await creditPostedAttendance(p.id, sessionId);
    } catch (err) {
      console.error('[lead] sending posted hours failed', err);
      toast({ title: 'Attendance posted', message: "Hours didn't reach volunteers' profiles yet. We'll retry when you reopen Attendance.", tone: 'warn' });
      return;
    }
    if (!n) {
      toast({ title: 'Attendance posted', message: 'Nobody had hours to add.', tone: 'ok' });
      return;
    }
    const sent = reachCopy({ seen: res.delivered.length, unlinked: res.unlinked, notMember: res.notMember, future: false });
    if (res.failed.length) {
      toast({
        title: 'Attendance posted',
        message: `${nameList(res.failed)} won't see these hours yet. We'll retry when you reopen Attendance.${sent ? ` ${sent}` : ''}`,
        tone: 'warn',
      });
    } else {
      toast({ title: 'Attendance posted', message: sent || `Hours added for ${plural(n, 'person', 'people')}.`, tone: 'ok' });
    }
  }

  const COLS = 'display:grid;grid-template-columns:minmax(0,1.6fr) 128px 72px 156px minmax(0,1fr);gap:16px';
  const shiftMeta = [meta.d, timeLabel, length ? fmtHours(length) : ''].filter(Boolean).join(', ');

  const statusBtn = (a) => (
    <Pressable
      label={`${a.n} is ${a.st}. Change attendance.`}
      aria-disabled={locked ? 'true' : undefined}
      tabIndex={locked ? -1 : 0}
      expanded={false}
      onClick={(e) => (locked ? null : changeStatus(e, a))}
      className={locked ? '' : cx(H.row, H.press)}
      style={statusTrigger(ATTEND_PILL[a.st] || 'mute', locked)}
    >
      <StatusDot tone={ATTEND_PILL[a.st] || 'mute'} />
      {a.st}
      {locked ? null : <Icon name="chevron-down" size={14} />}
    </Pressable>
  );
  const hoursBtn = (a) => (
    <Pressable
      label={`${fmtHours(a.hrs)} for ${a.n}. Change hours.`}
      aria-disabled={locked ? 'true' : undefined}
      tabIndex={locked ? -1 : 0}
      onClick={() => (locked ? null : editHours(a))}
      className={locked ? '' : 'vu-link'}
      style={s(`font:600 15px/1 ${F.body};color:${C.ink};${NUM};width:max-content`, `cursor:${locked ? 'default' : 'pointer'}`, locked ? '' : `text-decoration:underline;text-decoration-color:${C.line2};text-underline-offset:4px`)}
    >
      {Math.round(Number(a.hrs) * 10) / 10}
    </Pressable>
  );
  const gradeBtn = (a) => (
    <Pressable
      label={`Score for ${a.n} is ${a.grade}. Change score.`}
      aria-disabled={locked ? 'true' : undefined}
      tabIndex={locked ? -1 : 0}
      expanded={false}
      onClick={(e) => (locked ? null : changeGrade(e, a))}
      className={locked ? '' : cx(H.row, H.press)}
      style={statusTrigger(GRADE_PILL[a.grade] || 'mute', locked)}
    >
      <StatusDot tone={GRADE_PILL[a.grade] || 'mute'} />
      {a.grade}
      {locked ? null : <Icon name="chevron-down" size={14} />}
    </Pressable>
  );
  const noteBtn = (a) => (
    <Pressable
      label={a.note ? `Edit note for ${a.n}` : `Add a note for ${a.n}`}
      aria-disabled={locked ? 'true' : undefined}
      tabIndex={locked ? -1 : 0}
      onClick={() => (locked ? null : editNote(a))}
      className={locked ? '' : H.toInk}
      style={s(`font:${!a.note && !locked ? 600 : 400} 14px/1.4 ${F.body};min-width:0;transition:color .16s ease`, `color:${a.note ? C.ink2 : C.ink}`, `cursor:${locked ? 'default' : 'pointer'}`, !a.note && !locked ? 'text-decoration:underline;text-underline-offset:3px' : '')}
    >
      {a.note || (locked ? '' : 'Add a note')}
    </Pressable>
  );
  const edited = (a) => (a.edited ? <span title="Changed by you" style={S(`font:600 13px/1.45 ${F.body};color:${C.waiting}`)}>Edited</span> : null);
  const person = (a) => (
    <div style={S('display:flex;align-items:center;gap:12px;min-width:0')}>
      <div style={S('width:36px;height:36px;border-radius:50%;overflow:hidden;flex:none')}>
        <Avatar name={a.n} fs={13} />
      </div>
      <div style={S('min-width:0')}>
        <div className="vu-trunc" style={S(LABEL)}>{a.n}</div>
        <div className="vu-trunc" style={S(`margin-top:2px;${SMALL}`)}>
          {a.role}
        </div>
      </div>
    </div>
  );

  return (
    <div className="vu-layout-rail" style={S('margin-top:32px')}>
      <div style={S('min-width:0')}>
        <section aria-labelledby="att-h">
          <div className="vu-sec-head" style={S('flex-wrap:wrap;align-items:center')}>
            <div style={S('min-width:0')}>
              <h2 id="att-h" style={S(H2)}>Attendance</h2>
              <p style={S(`margin:6px 0 0;${META}`)}>{shiftMeta}</p>
            </div>
            <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>
              <Button variant="outline" size="sm" icon="check" disabled={locked} aria-disabled={locked ? 'true' : undefined} onClick={markAll} aria-label="Mark all present">
                Mark all present
              </Button>
              {locked ? (
                <Button
                  size="sm"
                  icon="check"
                  aria-disabled="true"
                  aria-label="Attendance posted"
                  extra={`cursor:default;padding:0 4px;border-color:transparent;background:transparent;color:${C.confirmed}`}
                >
                  Posted
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={running}
                  aria-disabled={running ? 'true' : undefined}
                  onClick={post}
                  aria-label={running ? `Post attendance after ${endLabel}` : 'Post attendance'}
                >
                  {running ? `Post after ${endLabel}` : 'Post attendance'}
                </Button>
              )}
            </div>
          </div>

          <div role="group" aria-label="Pick a shift" className="vu-scroll-x" style={S('margin:20px -6px 0;padding:6px;display:flex;gap:6px')}>
            {sessions.map((x) => {
              const on = x.id === sessionId;
              // Keep the time on posted shifts: two shifts on one day must stay tellable apart.
              const time = sessionTime(p, x);
              return (
                <Pressable
                  key={x.id}
                  label={`${x.d}${time ? `, ${time}` : ''}${x.posted ? ', posted' : ''}`}
                  pressed={on}
                  onClick={() => setParam({ session: x.id })}
                  className={cx(on ? '' : H.row, H.press)}
                  style={s(
                    'flex:none;width:84px;padding:8px 4px 10px;border-radius:10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;transition:background .16s ease, box-shadow .16s ease',
                    `box-shadow:inset 0 0 0 ${on ? `2px ${C.ink}` : '0 transparent'}`
                  )}
                >
                  <DateBlock date={x.d} month tone={on ? 'white' : 'line'} />
                  <span style={S(`display:inline-flex;align-items:center;gap:4px;font:600 12px/1.2 ${F.body};color:${x.posted ? C.confirmed : C.ink2};text-align:center`)}>
                    {x.posted ? <Icon name="check" size={13} stroke={2} /> : null}
                    {x.posted ? 'Posted' : time || 'Open'}
                  </span>
                </Pressable>
              );
            })}
          </div>

          {narrow ? (
            rows.length ? (
              <ul aria-label="Volunteers on this shift" style={S(`margin:20px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
                {rows.map((a) => (
                  <li key={a.personId} style={S(`padding:16px 0;${RULE};display:flex;flex-direction:column;gap:12px`)}>
                    {person(a)}
                    <div style={S('display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-left:48px')}>
                      {statusBtn(a)}
                      {gradeBtn(a)}
                      <span style={S(`display:inline-flex;align-items:center;gap:6px;${SMALL}`)}>
                        {hoursBtn(a)}
                        <span>{Number(a.hrs) === 1 ? 'hour' : 'hours'}</span>
                        {edited(a)}
                      </span>
                    </div>
                    <div style={S('padding-left:48px')}>{noteBtn(a)}</div>
                  </li>
                ))}
              </ul>
            ) : null
          ) : (
            <div role="table" aria-label="Volunteers on this shift" style={S('margin-top:20px')}>
              <div role="row" style={S(`${COLS};align-items:center;padding:0 0 10px;border-bottom:1px solid ${C.line};${TH}`)}>
                <div role="columnheader">Volunteer</div><div role="columnheader">Attendance</div><div role="columnheader">Hours</div><div role="columnheader">Score</div><div role="columnheader">Note</div>
              </div>
              {rows.map((a) => (
                <div key={a.personId} role="row" className={H.row} style={S(`${COLS};padding:14px 0;${RULE};align-items:center;transition:background .16s ease`)}>
                  <div role="cell" style={S('min-width:0')}>{person(a)}</div>
                  <div role="cell">{statusBtn(a)}</div>
                  <div role="cell" style={S('display:flex;flex-direction:column;gap:4px')}>{hoursBtn(a)}{edited(a)}</div>
                  <div role="cell">{gradeBtn(a)}</div>
                  <div role="cell" style={S('min-width:0')}>{noteBtn(a)}</div>
                </div>
              ))}
            </div>
          )}
          {rows.length ? null : (
            <EmptyState compact icon="users" title="Nobody on this shift's roster" body="Accept volunteers and they show up here." cta="Open People" onCta={() => goTab('people')} />
          )}

          <div style={S(`margin-top:14px;display:flex;align-items:baseline;justify-content:space-between;gap:8px 20px;flex-wrap:wrap;${SMALL}`)}>
            <div>
              {locked
                ? 'Posted. This shift is locked.'
                : `${running ? `Shift ends at ${endLabel}. ` : ''}${unmarked ? `${unmarked} still unmarked. ` : ''}Hour changes need a reason and go in the audit log.`}
            </div>
            <button type="button" aria-label="Open the audit log" onClick={() => goTab('quality')} className={cx('vu-link', H.press)} style={S(`${TEXT_LINK};font-size:13px`)}>
              Audit log
            </button>
          </div>
        </section>

        <section aria-labelledby="deb-h" style={S(SEC_GAP)}>
          <h2 id="deb-h" style={S(H2)}>Debrief</h2>
          <p style={S(`margin:6px 0 0;${META}`)}>What to keep and what to change after {meta.d}.</p>
          <DebriefForm key={sessionId} p={p} sessionId={sessionId} />
        </section>
      </div>

      <aside aria-label="Shift summary" style={S('min-width:0;display:flex;flex-direction:column')}>
        <section aria-labelledby="att-sum">
          <h2 id="att-sum" style={S(H3)}>This shift</h2>
          {anyMarked ? (
            <dl style={S(`margin:10px 0 0;border-top:1px solid ${C.line}`)}>
              {stats.map((x) => (
                <div key={x.l} style={S(`padding:11px 0;${RULE};display:flex;align-items:baseline;justify-content:space-between;gap:10px;${META}`)}>
                  <dt>{x.l === 'Hours this session' ? 'Hours this shift' : x.l}</dt>
                  <dd style={S(`margin:0;font:600 15px/1 ${F.body};color:${C.ink};${NUM}`)}>{x.v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p style={S(`margin:6px 0 0;${SMALL}`)}>
              {rows.length ? 'Mark attendance to see the show rate.' : 'The show rate appears once someone is on the roster.'}
            </p>
          )}
        </section>

        {openEscalations.length ? (
          <section aria-labelledby="att-fu" style={S('margin-top:40px')}>
            <h2 id="att-fu" style={S(H3)}>Follow-ups</h2>
            <ul style={S(`margin:10px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
              {openEscalations.map((e) => (
                <li key={e.id} style={S(`padding:14px 0;${RULE}`)}>
                  <div style={S(LABEL)}>{e.n}, {e.step}</div>
                  <div style={S(`margin-top:4px;${SMALL}`)}>{e.action}</div>
                  <div style={S('margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:10px')}>
                    <StatusText tone="wait">Due {e.due}</StatusText>
                    <button
                      type="button"
                      aria-label={`Mark ${e.n} follow-up done`}
                      onClick={() => {
                        resolveEscalation(p.id, e.id);
                        toast({ title: 'Follow-up done', message: `${e.n}, ${e.step}`, tone: 'ok' });
                      }}
                      className={cx('vu-link', H.press)}
                      style={S(`${TEXT_LINK};font-size:13px`)}
                    >
                      Mark done
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="att-sc" style={S('margin-top:40px')}>
          <h2 id="att-sc" style={S(H3)}>Scores</h2>
          <dl style={S(`margin:10px 0 0;border-top:1px solid ${C.line}`)}>
            {GRADE_SCALE.map((g) => (
              <div key={g.t} style={S(`padding:11px 0;${RULE};display:flex;justify-content:space-between;align-items:baseline;gap:12px`)}>
                <dt style={S(`font:600 14px/1.3 ${F.body};color:${C.ink}`)}>{g.t}</dt>
                <dd style={S(`margin:0;${SMALL};text-align:right`)}>{g.m}</dd>
              </div>
            ))}
          </dl>
          <p style={S(`margin:10px 0 0;${SMALL}`)}>Only you see scores. Volunteers don't.</p>
        </section>
      </aside>
    </div>
  );
}

/** One shift's debrief. Older projects kept a single `debrief` for the whole
    project; it isn't tied to any shift, so it isn't shown under one. */
function shiftDebrief(p, sessionId) {
  const d = p && p.debriefs && p.debriefs[sessionId];
  return { worked: (d && d.worked) || '', fix: (d && d.fix) || '' };
}

/* Writes one shift's debrief, keeping every other shift's as it is. */
function saveShiftDebrief(projectId, sessionId, value) {
  const cur = getProject(projectId);
  if (!cur) return;
  updateProject(projectId, { debriefs: { ...(cur.debriefs || {}), [sessionId]: { worked: value.worked, fix: value.fix } } });
}

function DebriefForm({ p, sessionId }) {
  const initial = shiftDebrief(p, sessionId);
  const [worked, setWorked] = useState(initial.worked);
  const [fix, setFix] = useState(initial.fix);
  const saveRef = useRef(null);
  const pendingRef = useRef(null);

  // Leaving the shift (or the tab) before the autosave fires still saves it.
  useEffect(
    () => () => {
      clearTimeout(saveRef.current);
      if (pendingRef.current) saveShiftDebrief(p.id, sessionId, pendingRef.current);
    },
    [p.id, sessionId]
  );

  const save = (patch) => {
    clearTimeout(saveRef.current);
    pendingRef.current = { worked, fix, ...patch };
    saveRef.current = setTimeout(() => {
      const value = pendingRef.current;
      pendingRef.current = null;
      if (value) saveShiftDebrief(p.id, sessionId, value);
    }, 500);
  };

  return (
    <>
      <div className="vu-2col" style={S('margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
        <TextArea
          id="deb-worked"
          label="What worked"
          value={worked}
          minHeight={88}
          onChange={(v) => {
            setWorked(v);
            save({ worked: v });
          }}
          placeholder="e.g. Pairing new tutors with returning ones"
        />
        <TextArea
          id="deb-fix"
          label="Fix before next time"
          value={fix}
          minHeight={88}
          onChange={(v) => {
            setFix(v);
            save({ fix: v });
          }}
          placeholder="e.g. Set out books before kids arrive"
        />
      </div>
      <div style={S('margin-top:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap')}>
        <Button
          variant="outline"
          size="sm"
          aria-label="Save debrief"
          onClick={() => {
            if (!worked.trim() && !fix.trim()) {
              toast({ title: 'Nothing to save yet', message: 'Write at least one line first.', tone: 'warn' });
              return;
            }
            clearTimeout(saveRef.current);
            pendingRef.current = null;
            saveShiftDebrief(p.id, sessionId, { worked, fix });
            toast({ title: 'Debrief saved', tone: 'ok', timeout: 2200 });
          }}
        >
          Save debrief
        </Button>
        <span style={S(SMALL)}>Saves as you type. Only you see it.</span>
      </div>
    </>
  );
}

function HoursEditForm({ api, row, onSave }) {
  const [hrs, setHrs] = useState(String(row.hrs));
  const [reason, setReason] = useState('');
  const [err, setErr] = useState({});
  return (
    <div>
      <div className="vu-2col-keep" style={S('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="Hours" value={hrs} onChange={(v) => setHrs(v.replace(/[^\d.]/g, '').slice(0, 5))} inputMode="decimal" error={err.hrs} />
        <Field label="Shift time" value={row.inOut || ''} readOnly />
      </div>
      <div style={S('margin-top:16px')}>
        <Field label="Reason for the change" value={reason} onChange={setReason} placeholder="e.g. Left early for the bus" maxLength={90} required error={err.reason} />
      </div>
      <DialogActions>
        <Button variant="outline" onClick={() => api.close()} aria-label="Cancel">
          Cancel
        </Button>
        <Button
          variant="primary"
          aria-label="Save hours"
          onClick={() => {
            const e = {};
            const bad = validateHours(hrs, { allowZero: true });
            if (bad) e.hrs = bad;
            if (!reason.trim()) e.reason = 'Enter a reason.';
            setErr(e);
            if (Object.keys(e).length) return;
            const n = Math.round(Number(hrs) * 10) / 10;
            try {
              onSave(n, reason.trim());
            } catch (ex) {
              console.error('[lead] save hours failed', ex);
              setErr({ hrs: (ex && ex.code === 'INVALID_HOURS' && ex.message) || "Couldn't save those hours. Try again." });
              return;
            }
            api.close();
            toast({ title: 'Hours changed', message: `${row.n}, ${fmtHours(n)}. Saved to the audit log.`, tone: 'ok' });
          }}
        >
          Save hours
        </Button>
      </DialogActions>
    </div>
  );
}

function SimpleNoteForm({ api, initial, onSave }) {
  const [t, setT] = useState(initial || '');
  return (
    <div>
      <TextArea value={t} onChange={setT} maxLength={240} ariaLabel="Note" minHeight={110} placeholder="e.g. Great with the younger readers" />
      <DialogActions>
        <Button variant="outline" onClick={() => api.close()} aria-label="Cancel">
          Cancel
        </Button>
        <Button
          variant="primary"
          aria-label="Save note"
          onClick={() => {
            onSave(t.trim());
            api.close();
            toast({ title: t.trim() ? 'Note saved' : 'Note cleared', tone: 'ok', timeout: 2200 });
          }}
        >
          Save note
        </Button>
      </DialogActions>
    </div>
  );
}

/* ==========================================================================
   Applications
   ========================================================================== */

export function ApplicationsTab({ p, params, setParam, onCopyLink }) {
  const filter = params.get('astatus') || 'pending';
  const all = p.applications || [];

  async function decide(a, decision) {
    if (decision === 'declined') {
      const ok = await confirmDialog({
        title: `Decline ${a.n}?`,
        body: 'You can undo this from the Declined filter.',
        confirmLabel: 'Decline',
        cancelLabel: 'Keep it',
      });
      if (!ok) return;
    }
    const res = decideApplication(p.id, a.id, decision);
    if (res && res.already) {
      toast({ title: 'Already decided', message: `${a.n} is ${res.status}.`, tone: 'warn' });
      return;
    }
    toast({
      title: decision === 'accepted' ? `Accepted ${a.n}` : decision === 'waitlisted' ? `Waitlisted ${a.n}` : `Declined ${a.n}`,
      message: decision === 'accepted' ? 'Added to your People tab.' : undefined,
      tone: decision === 'declined' ? 'brand' : 'ok',
      actionLabel: 'Undo',
      onAction: () => {
        reopenApplication(p.id, a.id);
        toast({ title: 'Decision undone', tone: 'ok', timeout: 2200 });
      },
    });
  }

  function answers(a) {
    openModal({
      title: a.n,
      subtitle: `${a.s}, applied ${a.when}`,
      body: (
        <div style={S('display:flex;flex-direction:column;gap:18px')}>
          {(p.screeningQuestions || []).map((q, i) => (
            <div key={q}>
              <div style={S(`font:600 14px/1.35 ${F.body};color:${C.ink}`)}>{q}</div>
              <div className="vu-break" style={S(`margin-top:6px;${BODY};color:${a.answers && a.answers[i] ? C.ink : C.ink2}`)}>
                {(a.answers && a.answers[i]) || 'No answer given.'}
              </div>
            </div>
          ))}
          {(a.flags || []).length ? (
            <div style={S('display:flex;gap:8px 16px;flex-wrap:wrap')}>
              {a.flags.map((f) => <StatusText key={f} tone="wait">{f}</StatusText>)}
            </div>
          ) : null}
          {a.note ? (
            <div>
              <div style={S(`font:600 14px/1.35 ${F.body};color:${C.ink}`)}>Their note</div>
              <div className="vu-break" style={S(`margin-top:6px;${BODY}`)}>{a.note}</div>
            </div>
          ) : null}
        </div>
      ),
      footer: (api) =>
        a.status === 'pending' ? (
          <>
            <Button variant="outline" aria-label={`Decline ${a.n}`} onClick={() => { api.close(); decide(a, 'declined'); }}>
              Decline
            </Button>
            <Button variant="primary" aria-label={`Accept ${a.n}`} onClick={() => { api.close(); decide(a, 'accepted'); }}>
              Accept
            </Button>
          </>
        ) : null,
    });
  }

  return (
    <div style={S('margin-top:32px;max-width:880px')}>
      {/* One list: join-link applications and the project's own ones share
          the filter, the row pattern and the actions. */}
      <CrossApplications
        listingId={p.listingId}
        emptyState={<EmptyState icon="inbox" title="No applications waiting" body="Share your join link. New applications show up here." cta="Copy link" onCta={() => onCopyLink()} />}
        local={{
          items: all,
          filter,
          onFilter: (k) => setParam({ astatus: k === 'pending' ? null : k }),
          onDecide: decide,
          onUndo: (a) => {
            reopenApplication(p.id, a.id);
            toast({ title: 'Decision undone', message: `${a.n} is waiting on you again.`, tone: 'ok' });
          },
          onAnswers: (p.screeningQuestions || []).length ? answers : null,
          renderEmpty: (f) => (
            <EmptyState
              compact
              title={f === 'pending' ? 'Nothing waiting on you' : 'None with this status'}
              body={f === 'pending' ? 'Every application has a decision. New ones show up here.' : 'Switch filters to see the rest.'}
              cta={f === 'pending' ? 'Copy link' : 'Show all'}
              onCta={() => (f === 'pending' ? onCopyLink() : setParam({ astatus: 'all' }))}
            />
          ),
        }}
      />
    </div>
  );
}

/* ==========================================================================
   Hours
   ========================================================================== */

/** Logged hours from volunteers who joined this project's listing online. */
function useMemberHours(listingId) {
  const [members, setMembers] = useState(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      setMembers(await loadProjectMembers(listingId));
      setFailed(false);
    } catch (err) {
      console.error('[lead] could not load member hours', err);
      setFailed(true);
      setMembers([]);
    }
  }, [listingId]);
  useEffect(() => {
    load();
  }, [load]);
  return { members, failed, load };
}

function memberHourRows(members) {
  const out = [];
  for (const app of members || []) {
    const log = (app.member_state && app.member_state.hoursLog) || [];
    const confirmed = (app.assignment && app.assignment.confirmedHours) || {};
    for (const h of log) {
      const isConfirmed = !!confirmed[h.id];
      // A waiting entry on a day the lead already posted from Attendance
      // would count that shift twice, so it can't be confirmed.
      const posted = isConfirmed ? null : postedShiftOnDate(app, h.date);
      out.push({ app, h, confirmed: isConfirmed, posted, name: app.applicant_name || 'Volunteer' });
    }
  }
  return out;
}

/* "1 entry on a day Attendance already covered", "2 entries on days …" */
function coveredEntries(n) {
  return n === 1 ? '1 entry on a day Attendance already covered' : `${n} entries on days Attendance already covered`;
}

/* "Attendance for Oct 18 already gave Ravi Shah 3.6 hrs. Ask them to remove this entry." */
function postedNote(r) {
  const day = String(r.posted.date || '').replace(/^[A-Za-z]{3},\s*/, '');
  return `Attendance for ${day} already gave ${r.name} ${shortHrs(r.posted.hrs)}. Ask them to remove this entry.`;
}

const round1 = (n) => Math.round(Number(n || 0) * 10) / 10;

/* Names and tags come from other people's profiles, so a text cell that starts
   like a formula (=, +, -, @, tab, CR) gets a leading quote before a spreadsheet
   opens it. Plain numbers and a lone dash pass through untouched. */
function csvCell(v) {
  const raw = String(v == null ? '' : v);
  const inert = typeof v === 'number' || raw === '-' || /^-?\d+(\.\d+)?$/.test(raw);
  const t = !inert && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** A join-link member's hours: the ones they logged, split by whether the lead
    confirmed them, plus shifts the lead posted in Attendance (confirmed). */
function memberTotals(app) {
  const log = (app.member_state && app.member_state.hoursLog) || [];
  const ok = (app.assignment && app.assignment.confirmedHours) || {};
  const posted = (app.assignment && Array.isArray(app.assignment.attendanceHours) && app.assignment.attendanceHours) || [];
  const sum = (rows) => round1(rows.reduce((a, h) => a + Number(h.hrs || 0), 0));
  return {
    confirmed: round1(sum(log.filter((h) => ok[h.id])) + sum(posted)),
    waiting: sum(log.filter((h) => !ok[h.id])),
    last: (log[0] && log[0].date) || (posted[0] && posted[0].date) || '',
  };
}

/** People tab roster with each person's hours, plus accepted join-link members
    who aren't on the roster (not linked yet, or removed from it), so no
    confirmed hours drop out of the export. */
function hoursCSV(p, members) {
  const head = ['Name', 'School', 'Grade', 'Role', 'Status', 'Hours confirmed', 'Hours waiting', 'Last seen', 'Tags', 'Joined through'];
  const byApp = new Map((members || []).map((app) => [app.id, app]));
  const waitingByName = {};
  for (const q of pendingHours(p)) waitingByName[q.n] = (waitingByName[q.n] || 0) + Number(q.hrs || 0);
  const roster = (p.people || []).map((x) => {
    const app = x.appId ? byApp.get(x.appId) : null;
    const waiting = (waitingByName[x.n] || 0) + (app ? memberTotals(app).waiting : 0);
    return [x.n, x.school, x.grade, x.role, x.st, round1(x.hrs), round1(waiting), x.last, (x.tags || []).join(' | '), x.appId ? 'Join link' : 'Added by you'];
  });
  const onRoster = new Set((p.people || []).map((x) => x.appId).filter(Boolean));
  const offRoster = (members || []).filter((app) => !onRoster.has(app.id)).map((app) => {
    const t = memberTotals(app);
    const role = (app.assignment && app.assignment.role) || app.position || '';
    return [app.applicant_name || 'Volunteer', '', '', role, 'Member', t.confirmed, t.waiting, t.last, '', 'Join link'];
  });
  return [head, ...roster, ...offRoster].map((r) => r.map(csvCell).join(',')).join('\n');
}

export function HoursTab({ p }) {
  const queue = pendingHours(p);
  const clean = cleanHours(p);
  const { members, failed, load } = useMemberHours(p.listingId);
  const [busy, setBusy] = useState(null);
  const memberRows = memberHourRows(members);
  const waiting = memberRows.filter((r) => !r.confirmed);
  const done = memberRows.filter((r) => r.confirmed);
  const waitingHrs = waiting.reduce((a, r) => a + Number(r.h.hrs || 0), 0);
  const blocked = waiting.filter((r) => r.posted);
  const confirmable = waiting.filter((r) => !r.posted);
  const confirmableHrs = confirmable.reduce((a, r) => a + Number(r.h.hrs || 0), 0);
  // One total for the heading: People-tab shifts plus join-link shifts, the
  // same sum the tab badge and "Needs you today" show.
  const allCount = queue.length + waiting.length;
  const allHrs = queue.reduce((a, q) => a + Number(q.hrs || 0), 0) + waitingHrs;

  async function confirmRow(r, value) {
    if (busy) return;
    setBusy(r.h.id);
    const { ok, error } = await confirmMemberHour(r.app.id, r.h.id, value);
    setBusy(null);
    if (!ok && error && error.code === 'ATTENDANCE_POSTED') {
      toast({ title: 'Hours not confirmed', message: error.message, tone: 'warn' });
      load();
    } else if (ok) {
      toast(value
        ? { title: 'Hours confirmed', message: `${r.name}, ${fmtHours(r.h.hrs)} on ${r.h.date}.`, tone: 'ok' }
        : { title: 'Confirmation undone', message: `${r.name}'s ${fmtHours(r.h.hrs)} ${Number(r.h.hrs) === 1 ? 'is' : 'are'} waiting again.`, tone: 'ok' });
      load();
      window.dispatchEvent(new Event('vu:applications-changed'));
    } else {
      toast({ title: "Couldn't save that", message: 'Check your connection and try again.', tone: 'danger' });
    }
  }

  // One Confirm all for the whole list: join-link entries plus People-tab
  // entries that passed check-in. Flagged ones and days Attendance already
  // covered stay for the lead to look at one by one.
  const bulkTotal = confirmable.length + clean.length;
  const cleanHrs = clean.reduce((a, q) => a + Number(q.hrs || 0), 0);
  const flagged = queue.length - clean.length;

  async function confirmAll() {
    if (busy || !bulkTotal) return;
    const left = [
      blocked.length ? `${coveredEntries(blocked.length)} ${blocked.length === 1 ? 'stays' : 'stay'} unconfirmed.` : '',
      flagged ? `${flagged === 1 ? '1 flagged entry stays' : `${flagged} flagged entries stay`} for you to check.` : '',
    ].filter(Boolean).join(' ');
    const ok = await confirmDialog({
      title: `Confirm ${plural(bulkTotal, 'shift')}?`,
      body: `${fmtHours(confirmableHrs + cleanHrs)} in total. Each one counts toward that volunteer's confirmed hours.${left ? ` ${left}` : ''}`,
      confirmLabel: 'Confirm all',
      cancelLabel: 'Go back',
      tone: 'brand',
    });
    if (!ok) return;
    setBusy('all');
    let n = clean.length ? approveHours(p.id, clean.map((q) => q.id)) : 0;
    let hrs = n ? cleanHrs : 0;
    // Shifts for one volunteer share a row, so write them one after another.
    // Entries on a day Attendance already covered are skipped, not failed.
    let skipped = 0;
    let failedCount = 0;
    let linked = 0;
    for (const r of confirmable) {
      const res = await confirmMemberHour(r.app.id, r.h.id, true);
      if (res.ok) {
        linked += 1;
        hrs += Number(r.h.hrs || 0);
      } else if (res.error && res.error.code === 'ATTENDANCE_POSTED') skipped += 1;
      else failedCount += 1;
    }
    n += linked;
    skipped += blocked.length;
    setBusy(null);
    if (confirmable.length) load();
    if (linked > 0) window.dispatchEvent(new Event('vu:applications-changed'));
    const skipNote = skipped ? `Skipped ${coveredEntries(skipped)}.` : '';
    if (failedCount) toast({ title: `Confirmed ${n} of ${n + failedCount}`, message: `Some didn't save. Check your connection and try again.${skipNote ? ` ${skipNote}` : ''}`, tone: 'warn' });
    else if (skipped) toast({ title: n ? `Confirmed ${plural(n, 'shift')}` : 'Hours not confirmed', message: skipNote, tone: n ? 'ok' : 'warn' });
    else toast({ title: 'Hours confirmed', message: `${plural(n, 'shift')} added to volunteers' totals, ${fmtHours(hrs)} in all.`, tone: 'ok' });
  }
  function adjust(q) {
    openModal({
      title: `Change hours for ${q.n}`,
      subtitle: q.src,
      Body: function AdjBody({ api }) {
        return <HoursEditForm api={api} row={{ n: q.n, hrs: q.hrs, inOut: q.d }} onSave={(hrs, reason) => adjustHours(p.id, q.id, hrs, reason)} />;
      },
    });
  }

  const loading = members === null;
  const hrsCell = (n) => <span style={S(`font:600 15px/1 ${F.body};color:${C.ink};${NUM};white-space:nowrap`)}>{shortHrs(n)}</span>;
  const sep = <span className="vu-sep"> · </span>;
  // Rows that can't be edited keep an empty slot, so every hours number and
  // Confirm button lines up down the list.
  const noEdit = <span aria-hidden="true" style={S('width:36px;height:36px;flex:none')} />;
  const hourRow = ({ key, name, meta, note, noteId, hrs, confirm, edit }) => (
    <li key={key} className="vu-row">
      <span className="vu-row-avatar">
        <Avatar name={name} fs={13} />
      </span>
      <div style={S('min-width:0')}>
        <span className="vu-row-t">{name}</span>
        <span className="vu-row-m vu-row-m--wrap">{meta}</span>
        {note ? (
          <span id={noteId} style={S(`display:flex;align-items:flex-start;gap:6px;margin-top:6px;${SMALL};color:${TONES.wait.fg}`)}>
            <Icon name="alert" size={14} style={{ flex: 'none', marginTop: 2 }} />
            <span>{note}</span>
          </span>
        ) : null}
      </div>
      <div className="vu-row-end">
        {hrsCell(hrs)}
        {confirm}
        {edit || noEdit}
      </div>
    </li>
  );
  const linkRows = waiting.map((r) =>
    hourRow({
      key: `${r.app.id}:${r.h.id}`,
      name: r.name,
      meta: <>{r.h.date}{sep}{r.h.activity || 'Volunteering'}{sep}From your join link</>,
      note: r.posted ? postedNote(r) : '',
      noteId: `hrs-dup-${r.h.id}`,
      hrs: r.h.hrs,
      confirm: (
        <Button variant="outline" size="sm" icon="check" busy={busy === r.h.id} disabled={!!busy} onClick={() => confirmRow(r, true)} aria-label={`Confirm ${fmtHours(r.h.hrs)} for ${r.name}`} aria-describedby={r.posted ? `hrs-dup-${r.h.id}` : undefined}>
          {busy === r.h.id ? 'Confirming' : 'Confirm'}
        </Button>
      ),
    })
  );
  const queueRows = queue.map((q) =>
    hourRow({
      key: q.id,
      name: q.n,
      meta: <>{q.d}{sep}<span style={S(q.ok ? '' : `color:${C.waiting};font-weight:600`)}>{q.src}</span>{sep}From your People tab</>,
      hrs: q.hrs,
      confirm: (
        <Button
          variant="outline"
          size="sm"
          icon="check"
          disabled={!!busy}
          aria-label={`Confirm ${fmtHours(q.hrs)} for ${q.n}`}
          onClick={() => {
            approveHours(p.id, [q.id]);
            toast({ title: 'Hours confirmed', message: `${q.n}, ${fmtHours(q.hrs)}.`, tone: 'ok' });
          }}
        >
          Confirm
        </Button>
      ),
      edit: <IconButton icon="edit" label={`Change hours for ${q.n}`} disabled={!!busy} onClick={() => adjust(q)} />,
    })
  );
  const anyLogged = memberRows.length > 0 || (p.hoursQueue || []).length > 0;

  return (
    <div className="vu-layout-rail" style={S('margin-top:32px')}>
      <div style={S('min-width:0')}>
        <section aria-labelledby="hrs-h">
          <div className="vu-sec-head" style={S('flex-wrap:wrap;align-items:center')}>
            <div style={S('min-width:0')}>
              <h2 id="hrs-h" style={S(H2)}>
                {!loading && allCount ? `${fmtHours(allHrs)} to confirm` : 'Hours to confirm'}
              </h2>
              <p style={S(`margin:6px 0 0;${META}`)}>
                {!loading && allCount ? `${plural(allCount, 'shift')} logged for ${p.name}.` : `Hours volunteers logged for ${p.name}.`}
              </p>
            </div>
            {bulkTotal > 1 ? (
              <Button variant="primary" size="sm" icon="check" busy={busy === 'all'} disabled={!!busy} onClick={confirmAll} aria-label={`Confirm ${plural(bulkTotal, 'shift')}`}>
                {busy === 'all' ? 'Confirming' : 'Confirm all'}
              </Button>
            ) : !bulkTotal && anyLogged ? (
              <button type="button" aria-label="Nothing to confirm" aria-disabled="true" tabIndex={-1} className="vu-sr">Confirm all</button>
            ) : null}
          </div>

          {failed ? (
            <div role="alert" style={S(`margin-top:16px;padding:16px 0;border-top:1px solid ${C.line};${RULE};display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;${META}`)}>
              Couldn't load hours from your join link. Check your connection and try again.
              <Button variant="outline" size="sm" icon="refresh" onClick={load} aria-label="Try again">Try again</Button>
            </div>
          ) : null}

          {linkRows.length || queueRows.length ? (
            <ul style={S(`margin:${failed ? 0 : 16}px 0 0;padding:0;list-style:none;${failed ? '' : `border-top:1px solid ${C.line}`}`)}>
              {linkRows}
              {queueRows}
            </ul>
          ) : null}

          {loading ? (
            <div role="status" style={S(`margin-top:16px;${SMALL}`)}>{queueRows.length ? 'Loading hours from your join link' : 'Loading hours'}</div>
          ) : !failed && !linkRows.length && !queueRows.length ? (
            <EmptyState
              compact
              icon="check-circle"
              title={anyLogged ? 'Every shift is confirmed' : 'No hours logged yet'}
              body={anyLogged ? 'New hours show up here when a volunteer logs them.' : 'Volunteers log hours from their Home tab after each shift.'}
            />
          ) : null}

          {done.length ? (
            <details className="vu-details" style={S('margin-top:20px')}>
              <summary style={S(`display:inline-flex;align-items:center;gap:6px;cursor:pointer;list-style:none;${TEXT_LINK}`)}>
                Confirmed ({done.length})
                <Icon name="chevron-down" size={16} />
              </summary>
              <ul style={S(`margin:12px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
                {done.map((r) => (
                  <li key={`${r.app.id}:${r.h.id}`} className="vu-row vu-row--nolead" style={S('padding:12px 0')}>
                    <div style={S(`min-width:0;${META}`)}>
                      <span style={S(`color:${C.ink};font-weight:600`)}>{r.name}</span>, {r.h.activity || 'Volunteering'}, {r.h.date}
                    </div>
                    <div className="vu-row-end" style={S('gap:16px')}>
                      {hrsCell(r.h.hrs)}
                      <StatusText tone="ok">Confirmed</StatusText>
                      <button type="button" aria-label={`Undo confirmation for ${r.name}, ${r.h.date}`} disabled={!!busy} onClick={() => confirmRow(r, false)} className={cx('vu-link', H.press)} style={S(`${TEXT_LINK};font-size:13px`)}>
                        Undo
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      </div>
      <aside aria-label="Export hours" style={S('min-width:0')}>
        <section aria-labelledby="hrs-x">
          <h2 id="hrs-x" style={S(H3)}>Export</h2>
          <p style={S(`margin:6px 0 0;${SMALL}`)}>Everyone on your People tab and everyone who joined online, with their hours.</p>
          <div style={S('margin-top:16px;display:flex;gap:8px;flex-wrap:wrap')}>
            <Button
              variant="outline"
              size="sm"
              icon="download"
              aria-label="Download roster as CSV"
              onClick={() => {
                if (loading) {
                  toast({ title: 'Hours still loading', message: 'Try again in a moment.', tone: 'warn' });
                  return;
                }
                download(`${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-roster.csv`, hoursCSV(p, members));
                toast(failed
                  ? { title: 'Roster downloaded', message: "Volunteers who joined online aren't in it. Reload and try again.", tone: 'warn' }
                  : { title: 'Roster downloaded', message: 'Saved as a CSV file.', tone: 'ok' });
              }}
            >
              Download CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon="file"
              aria-label="Print this page"
              onClick={() => {
                toast({ title: 'Opening print', message: 'Choose "Save as PDF" to keep a copy.', tone: 'brand' });
                setTimeout(() => window.print(), 400);
              }}
            >
              Print
            </Button>
          </div>
        </section>
      </aside>
    </div>
  );
}

/* ==========================================================================
   Quality
   ========================================================================== */

/* Only the compliance rows the app computes from the roster. */
const LIVE_COMPLIANCE = new Set(['cp1', 'cp2']);

export function QualityTab({ p, params, setParam, goTab }) {
  const compliance = recomputeCompliance(p).filter((c) => LIVE_COMPLIANCE.has(c.id));
  const auditAll = params.get('audit') === 'all';
  const narrow = useNarrow();
  const reliability = p.people
    .filter((x) => x.st === 'Active' || x.st === 'Onboarding' || x.st === 'Inactive')
    .slice(0, 5)
    .map((x) => reliabilityRow(p, x));

  function file() {
    openModal({
      title: 'File an incident',
      subtitle: "Saved to this project's incident log.",
      Body: function IncBody({ api }) {
        return <IncidentForm api={api} project={p} />;
      },
    });
  }

  const RCOLS = 'display:grid;grid-template-columns:minmax(0,1.8fr) 96px 64px minmax(0,1.1fr) minmax(0,1fr);gap:16px';
  const sevTone = (st) => (st === 'Clear' ? 'ok' : 'wait');

  return (
    <div className="vu-layout-rail" style={S('margin-top:32px')}>
      <div style={S('min-width:0')}>
        <section aria-labelledby="q-rel">
          <h2 id="q-rel" style={S(H2)}>Reliability</h2>
          <p style={S(`margin:6px 0 0;${META}`)}>From the attendance you've posted.</p>
          {!reliability.length ? (
            <div style={S(`margin-top:16px;padding:16px 0;border-top:1px solid ${C.line};${RULE};${META}`)}>Nobody on your roster yet. Reliability fills in after you post attendance.</div>
          ) : narrow ? (
            <ul style={S(`margin:16px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
              {reliability.map((r) => (
                <li key={r.id || r.slug || r.n} style={S(`padding:14px 0;${RULE};display:flex;align-items:center;justify-content:space-between;gap:12px`)}>
                  <div style={S('display:flex;align-items:center;gap:12px;min-width:0')}>
                    <div style={S('width:36px;height:36px;border-radius:50%;overflow:hidden;flex:none')}>
                      <Avatar name={r.n} fs={13} />
                    </div>
                    <div style={S('min-width:0')}>
                      <div className="vu-trunc" style={S(LABEL)}>{r.n}</div>
                      {r.show ? (
                        <div style={S(`margin-top:2px;${SMALL}`)}>{`${r.show} show rate, ${r.late} late`}{r.score && r.score !== 'Not scored' ? `, ${r.score.toLowerCase()}` : ''}</div>
                      ) : null}
                    </div>
                  </div>
                  <StatusText tone={r.tone}>{r.trend}</StatusText>
                </li>
              ))}
            </ul>
          ) : (
            <div role="table" aria-label="Reliability" style={S('margin-top:16px')}>
              <div role="row" style={S(`${RCOLS};align-items:center;padding:0 0 10px;border-bottom:1px solid ${C.line};${TH}`)}>
                <div role="columnheader">Volunteer</div><div role="columnheader">Show rate</div><div role="columnheader">Late</div><div role="columnheader">Average score</div><div role="columnheader">Trend</div>
              </div>
              {reliability.map((r) => (
                <div key={r.id || r.slug || r.n} role="row" className={H.row} style={S(`${RCOLS};padding:12px 0;${RULE};align-items:center;transition:background .16s ease`)}>
                  <div role="cell" style={S('display:flex;align-items:center;gap:12px;min-width:0')}>
                    <div style={S('width:36px;height:36px;border-radius:50%;overflow:hidden;flex:none')}>
                      <Avatar name={r.n} fs={13} />
                    </div>
                    <div className="vu-trunc" style={S(LABEL)}>{r.n}</div>
                  </div>
                  {r.show ? (
                    <>
                      <div role="cell" style={S(`font:600 15px/1 ${F.body};color:${C.ink};${NUM}`)}>{r.show}</div>
                      <div role="cell" style={S(`${META};${NUM}`)}>{r.late}</div>
                      <div role="cell" style={S(META)}>{r.score}</div>
                      <div role="cell"><StatusText tone={r.tone}>{r.trend}</StatusText></div>
                    </>
                  ) : (
                    // No posted shifts: one sentence across the metric columns, not three blank cells.
                    <div role="cell" style={S('grid-column:2 / -1')}><StatusText tone={r.tone}>{r.trend}</StatusText></div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {compliance.length ? (
          <section aria-labelledby="q-pw" style={S(SEC_GAP)}>
            <h2 id="q-pw" style={S(H2)}>Paperwork</h2>
            <ul style={S(`margin:16px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
              {compliance.map((c) => (
                <li key={c.id} style={S(RULE)}>
                  <div className="vu-stack vu-stack-gap" style={S('padding:14px 0;display:flex;align-items:center;justify-content:space-between;gap:16px')}>
                  <div style={S(`min-width:0;${LABEL}`)}>{c.t}</div>
                  <div style={S('display:flex;align-items:center;gap:12px;flex:none;flex-wrap:wrap')}>
                    <span style={S(`${META};${NUM}`)}>{c.v}</span>
                    <StatusText tone={sevTone(c.st)}>{c.st}</StatusText>
                    {c.st !== 'Clear' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Fix ${c.t} in People`}
                        onClick={() => {
                          toast({ title: c.id === 'cp1' ? 'Mark each guardian consent form' : 'Mark training done', message: c.id === 'cp1' ? 'Open each person who is missing one.' : 'Open each tutor once they finish it.', tone: 'brand' });
                          goTab && goTab('people');
                        }}
                      >
                        Fix in People
                      </Button>
                    ) : null}
                  </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="q-inc" style={S(SEC_GAP)}>
          <div className="vu-sec-head" style={S('flex-wrap:wrap;align-items:center')}>
            <h2 id="q-inc" style={S(H2)}>Incident log</h2>
            <Button variant="outline" size="sm" icon="plus" onClick={file} aria-label="File an incident">
              File an incident
            </Button>
          </div>
          {p.incidents.length ? (
            <ul style={S(`margin:16px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
              {p.incidents.map((i) => (
                <li key={i.id} style={S(`padding:16px 0;${RULE}`)}>
                  <div>
                  <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
                    <h3 style={S(`margin:0;${LABEL}`)}>{i.t}</h3>
                    <StatusText tone={i.st === 'Closed' ? 'ok' : 'wait'}>{i.st}</StatusText>
                  </div>
                  <p className="vu-break" style={S(`margin:6px 0 0;${META};max-width:600px`)}>{i.note}</p>
                  <div style={S('margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:10px')}>
                    <div style={S(SMALL)}>{i.d}, {/^logged by /i.test(String(i.who || '')) ? String(i.who).replace(/^Logged/, 'logged') : `logged by ${i.who}`}</div>
                    {i.st !== 'Closed' ? (
                      <button
                        type="button"
                        aria-label={`Close incident: ${i.t}`}
                        onClick={() => {
                          closeIncident(p.id, i.id);
                          toast({ title: 'Incident closed', tone: 'ok' });
                        }}
                        className={cx('vu-link', H.press)}
                        style={S(`${TEXT_LINK};font-size:13px`)}
                      >
                        Close
                      </button>
                    ) : null}
                  </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div style={S(`margin-top:16px;padding:16px 0;border-top:1px solid ${C.line};${RULE};${META}`)}>No incidents filed.</div>
          )}
        </section>

        {p.disputes.length ? (
          <section aria-labelledby="q-dis" style={S(SEC_GAP)}>
            <h2 id="q-dis" style={S(H2)}>Hour disputes</h2>
            <ul style={S(`margin:16px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
              {p.disputes.map((d) => (
                <li key={d.id} style={S(`padding:16px 0;${RULE}`)}>
                  <div>
                  <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
                    <h3 style={S(`margin:0;${LABEL}`)}>{d.n}, {d.d}</h3>
                    <StatusText tone={d.st === 'Open' ? 'wait' : 'ok'}>{String(d.st).replace(/\s*·\s*/g, ', ')}</StatusText>
                  </div>
                  <p className="vu-break" style={S(`margin:6px 0 0;${META};max-width:600px`)}>{d.claim}</p>
                  {d.st === 'Open' ? (
                    <div style={S('margin-top:12px;display:flex;align-items:center;gap:8px 16px;flex-wrap:wrap')}>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Uphold ${d.n}'s dispute`}
                        onClick={() => {
                          resolveDispute(p.id, d.id, 'upheld', 'Upheld. Hours to be corrected in Attendance.');
                          toast({ title: 'Dispute upheld', message: `Change ${d.n}'s hours in Attendance.`, tone: 'ok' });
                        }}
                      >
                        Uphold
                      </Button>
                      <button
                        type="button"
                        aria-label={`Decline ${d.n}'s dispute`}
                        onClick={() => {
                          resolveDispute(p.id, d.id, 'declined', 'Declined. The original hours stand.');
                          toast({ title: 'Dispute declined', message: 'The original hours stand.', tone: 'brand' });
                        }}
                        className={cx('vu-link', H.press)}
                        style={S(TEXT_LINK)}
                      >
                        Decline
                      </button>
                    </div>
                  ) : d.resolvedNote ? (
                    <div style={S(`margin-top:8px;${SMALL}`)}>{d.resolvedNote}</div>
                  ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <aside aria-label="Audit log" style={S('min-width:0')}>
        <section aria-labelledby="q-audit">
          <h2 id="q-audit" style={S(H3)}>Audit log</h2>
          <p style={S(`margin:6px 0 0;${SMALL}`)}>Every hour change and decision, newest first.</p>
          <ol style={S(`margin:12px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
            {p.auditLog.slice(0, auditAll ? 60 : 5).map((a) => (
              <li key={a.id} style={S(`padding:11px 0;${RULE}`)}>
                <div className="vu-break" style={S(`font:400 14px/1.4 ${F.body};color:${C.ink}`)}>{a.t}</div>
                <div style={S(`margin-top:3px;${SMALL}`)}>
                  {a.who}, {a.w}
                </div>
              </li>
            ))}
          </ol>
          {p.auditLog.length > 5 ? (
            <button
              type="button"
              aria-label={auditAll ? 'Show fewer audit entries' : 'Show the full audit log'}
              onClick={() => setParam({ audit: auditAll ? null : 'all' })}
              className={cx('vu-link', H.press)}
              style={S(`margin-top:14px;${TEXT_LINK}`)}
            >
              {auditAll ? 'Show less' : `Show all ${p.auditLog.length}`}
            </button>
          ) : null}
        </section>
      </aside>
    </div>
  );
}

function reliabilityRow(p, person) {
  const sessions = Object.values(p.attendance || {});
  let total = 0;
  let attended = 0;
  let late = 0;
  const scores = [];
  for (const rows of sessions) {
    const r = rows.find((x) => x.personId === person.id);
    if (!r || r.st === 'Unmarked') continue;
    total += 1;
    if (r.st !== 'Absent') attended += 1;
    if (r.st === 'Late') late += 1;
    if (r.grade && r.grade !== 'Not scored') scores.push(r.grade);
  }
  const order = ['Needs support', 'Solid', 'Strong', 'Exceptional'];
  const avg = scores.length ? order[Math.round(scores.reduce((a, g) => a + Math.max(0, order.indexOf(g)), 0) / scores.length)] : 'Not scored';
  const show = total ? Math.round((attended / total) * 100) : 0;
  let trend = 'Steady';
  let t = 'ok';
  if (!total) {
    trend = 'No posted shifts yet';
    t = 'mute';
  } else if (show < 70) {
    trend = `${total - attended} missed`;
    t = 'bad';
  } else if (show < 100 || late > 1) {
    trend = 'Watch';
    t = 'wait';
  }
  // With no posted shifts the number fields stay empty and the row shows the trend sentence alone.
  return { id: person.id, n: person.n, slug: person.slug, show: total ? `${show}%` : '', late: total ? String(late) : '', score: total ? avg : '', trend, tone: t };
}

function IncidentForm({ api, project }) {
  const [f, setF] = useState({ t: '', note: '', d: 'Today' });
  const [err, setErr] = useState({});
  const contact = project.sponsor && project.sponsor.name ? project.sponsor.name : 'your organization';
  return (
    <div>
      <Field label="What happened" value={f.t} onChange={(v) => setF((x) => ({ ...x, t: v }))} maxLength={90} required error={err.t} placeholder="e.g. Scraped knee at the supply table" />
      <div style={S('margin-top:16px')}>
        <TextArea
          id="inc-note"
          label="What you did about it"
          value={f.note}
          onChange={(v) => setF((x) => ({ ...x, note: v }))}
          maxLength={400}
          minHeight={100}
          error={err.note}
          placeholder="e.g. Cleaned and bandaged it, called a parent"
        />
      </div>
      <div style={S(`margin-top:16px;display:flex;gap:8px;align-items:flex-start;font:400 14px/1.45 ${F.body};color:${C.ink}`)}>
        <span style={S(`flex:none;margin-top:2px;color:${C.waiting}`)}><Icon name="alert" size={16} /></span>
        <span>Nobody is notified from here. If someone got hurt or a parent was called, tell {contact} today.</span>
      </div>
      <DialogActions>
        <Button variant="outline" onClick={() => api.close()} aria-label="Cancel">
          Cancel
        </Button>
        <Button
          variant="primary"
          aria-label="File incident"
          onClick={() => {
            const e = {};
            if (!f.t.trim()) e.t = 'Enter what happened.';
            if (f.note.trim().length < 10) e.note = 'Enter a few more words about what you did.';
            setErr(e);
            if (Object.keys(e).length) return;
            fileIncident(project.id, { t: f.t.trim(), note: f.note.trim(), d: f.d });
            api.close();
            toast({ title: 'Incident filed', message: 'Saved to the incident log.', tone: 'ok' });
          }}
        >
          File incident
        </Button>
      </DialogActions>
    </div>
  );
}

/* ==========================================================================
   Messages
   ========================================================================== */

const THREAD_POLL_MS = 15000;
const APP_STATUS_LABEL = { pending: 'Applied', accepted: 'Member', declined: 'Not accepted', withdrawn: 'Withdrew' };

function shortDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Threads volunteers started with this project's listing (applications with
    at least one message), newest first. Reads only, so opening the tab never
    marks anything read; MessageThread does that when a thread is opened. */
function useVolunteerThreads(listingId) {
  const [threads, setThreads] = useState(null);
  const [failed, setFailed] = useState(false);
  // False once the tab unmounts, so a read cut off by navigation is dropped
  // instead of logged as a failure.
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!supabase || !listingId) {
      setThreads([]);
      return;
    }
    try {
      const me = await myId();
      if (!me) {
        setThreads([]);
        return;
      }
      const { data: apps, error: appErr } = await supabase
        .from('applications')
        .select('id, applicant_id, applicant_name, status')
        .eq('owner_id', me)
        .eq('listing_id', listingId);
      if (appErr) throw appErr;
      const ids = (apps || []).map((a) => a.id);
      let msgs = [];
      if (ids.length) {
        const { data, error } = await supabase
          .from('messages')
          .select('application_id, recipient_id, body, created_at, read_at')
          .in('application_id', ids)
          .order('created_at', { ascending: false });
        if (error) throw error;
        msgs = data || [];
      }
      const byApp = new Map();
      for (const m of msgs) {
        const cur = byApp.get(m.application_id) || { last: m, unread: 0 };
        byApp.set(m.application_id, { last: cur.last, unread: cur.unread + (m.recipient_id === me && !m.read_at ? 1 : 0) });
      }
      const out = (apps || [])
        .filter((a) => byApp.has(a.id))
        .map((a) => {
          const t = byApp.get(a.id);
          return { id: `app-${a.id}`, app: a, last: t.last, fromThem: t.last.recipient_id === me, unread: t.unread };
        })
        .sort((x, y) => String(y.last.created_at || '').localeCompare(String(x.last.created_at || '')));
      if (!alive.current) return;
      setThreads(out);
      setFailed(false);
    } catch (err) {
      if (!alive.current) return;
      console.error('[lead] could not load volunteer messages', err);
      setFailed(true);
      setThreads((cur) => cur || []);
    }
  }, [listingId]);
  useEffect(() => {
    alive.current = true;
    load();
    const timer = setInterval(load, THREAD_POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [load]);
  return { threads, failed, load };
}

/* MessageThread keeps a fixed height so its composer stays put in dialogs. On one
   column that left a tall gap under a short thread, so here the thread takes
   its content's height (up to the same cap) and the composer follows it. */
const MSG_FIT_CSS = '.vu-msgfit>div{height:auto!important;max-height:min(60vh,460px)}';

const UNREAD_BADGE = `min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:${C.ember};color:#fff;display:inline-grid;place-items:center;font:700 11px/1 ${F.body};${NUM}`;

function ThreadRow({ name, unread, when, preview, on, onClick, avatar = true }) {
  return (
    <Pressable
      label={`${name}${unread ? `, ${unread} unread` : ''}`}
      current={on ? 'true' : undefined}
      onClick={onClick}
      className={cx(on ? '' : H.row, H.press)}
      style={s('display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:12px;border-radius:10px;cursor:pointer;transition:background .16s ease', on ? `background:${C.mist}` : '')}
    >
      {avatar ? (
        <div style={S('width:36px;height:36px;border-radius:50%;overflow:hidden;flex:none')}>
          <Avatar name={name} fs={13} />
        </div>
      ) : null}
      <div style={S('min-width:0;flex:1')}>
        <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px')}>
          <div className="vu-trunc" style={S(`font:${unread ? 700 : 600} 15px/1.25 ${F.body};color:${C.ink}`)}>{name}</div>
          <div style={S('display:flex;align-items:center;gap:7px;flex:none')}>
            {unread ? <span style={S(UNREAD_BADGE)}>{unread}</span> : null}
            {when ? <div style={S(`${SMALL};${NUM};white-space:nowrap`)}>{when}</div> : null}
          </div>
        </div>
        {preview ? <div className="vu-trunc" style={S(`margin-top:3px;${SMALL};color:${unread ? C.ink : C.ink2}`)}>{preview}</div> : null}
      </div>
    </Pressable>
  );
}

export function MessagesTab({ p, params, setParam }) {
  const { threads: vol, failed: volFailed, load: loadVol } = useVolunteerThreads(p.listingId);
  const stacked = useNarrow(1179);
  const volThreads = vol || [];
  const threadParam = params.get('thread');
  const volPicked = volThreads.find((t) => t.id === threadParam);
  const notePicked = p.threads.find((t) => t.id === threadParam);
  // Volunteer threads come first, so a new message is what the lead sees on arrival.
  const sel = volPicked || notePicked || volThreads[0] || (vol === null && threadParam && threadParam.startsWith('app-') ? null : p.threads[0]) || null;
  const volSel = sel && volThreads.includes(sel) ? sel : null;
  const th = sel && !volSel ? sel : null;
  const threadId = sel ? sel.id : null;
  const [draft, setDraft] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (th) readThread(p.id, th.id);
  }, [p.id, th && th.id]);

  // Switching threads re-reads unread counts, since opening one marks it read.
  useEffect(() => {
    if (threadId) loadVol();
  }, [threadId, loadVol]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [threadId, th && th.messages.length]);

  if (vol !== null && !volFailed && !volThreads.length && !p.threads.length) {
    return (
      <div>
        <EmptyState icon="message" title="No messages yet" body="When a volunteer messages you, the thread shows up here." />
      </div>
    );
  }

  function send() {
    const body = draft.trim();
    if (!body) {
      toast({ title: 'Nothing to save', message: 'Write something first.', tone: 'warn' });
      return;
    }
    sendMessage(p.id, th.id, body);
    setDraft('');
    toast({ title: 'Note saved', message: 'Only you see it.', tone: 'ok', timeout: 3200 });
  }

  function templates(e) {
    menuFromEvent(
      e,
      messageTemplates.map((t) => ({ key: t.id, label: t.t, icon: 'edit' })),
      (key) => {
        const t = messageTemplates.find((x) => x.id === key);
        if (t) setDraft(messageTemplateText(p, key));
      }
    );
  }

  const volName = (t) => t.app.applicant_name || 'Volunteer';
  // These threads are private notes. Older projects named the first one
  // "Announcements" or "Crew announcements", which read like a post to members.
  const noteName = (t) => (p.threads.length === 1 || /announce/i.test(t.n || '') ? 'Notes' : t.n || 'Notes');
  const listHead = (id, text) => <h3 id={id} style={S(`margin:0 0 6px;padding:0 12px;${TH}`)}>{text}</h3>;
  const paneStyle = stacked ? 'min-width:0;display:flex;flex-direction:column' : `min-width:0;display:flex;flex-direction:column;border-left:1px solid ${C.line};padding-left:32px;min-height:420px`;

  return (
    <section aria-labelledby="msg-h">
      <h2 id="msg-h" style={S(H2)}>Messages</h2>
      <div style={S(`margin-top:20px;display:grid;grid-template-columns:${stacked ? 'minmax(0,1fr)' : '300px minmax(0,1fr)'};gap:${stacked ? 28 : 24}px;align-items:start`)}>
        <nav aria-label="Conversations" style={S('min-width:0;margin:0 -12px;display:flex;flex-direction:column;gap:22px')}>
          <div role="group" aria-labelledby="msg-vol">
            {listHead('msg-vol', 'From volunteers')}
            {vol === null ? (
              <div role="status" style={S(`padding:8px 12px;${SMALL}`)}>Loading messages</div>
            ) : volFailed && !volThreads.length ? (
              <div role="alert" style={S(`padding:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;${SMALL}`)}>
                Couldn't load volunteer messages.
                <Button variant="outline" size="sm" icon="refresh" onClick={loadVol} aria-label="Try again">Try again</Button>
              </div>
            ) : !volThreads.length ? (
              <div style={S(`padding:8px 12px;${SMALL}`)}>When a volunteer messages you, the thread shows up here.</div>
            ) : (
              <div style={S('display:flex;flex-direction:column;gap:2px')}>
                {volThreads.map((t) => {
                  const on = t.id === threadId;
                  return (
                    <ThreadRow
                      key={t.id}
                      name={volName(t)}
                      unread={on ? 0 : t.unread}
                      when={shortDay(t.last.created_at)}
                      preview={t.fromThem ? t.last.body : `You: ${t.last.body}`}
                      on={on}
                      onClick={() => setParam({ thread: t.id })}
                    />
                  );
                })}
              </div>
            )}
          </div>
          {p.threads.length ? (
            <div role="group" aria-labelledby="msg-notes">
              {listHead('msg-notes', 'Your notes')}
              <div style={S('display:flex;flex-direction:column;gap:2px')}>
                {p.threads.map((t) => (
                  <ThreadRow
                    key={t.id}
                    name={noteName(t)}
                    avatar={false}
                    unread={t.unread}
                    when={t.messages.length ? t.when : ''}
                    preview={t.messages.length ? t.p : ''}
                    on={t.id === threadId}
                    onClick={() => setParam({ thread: t.id })}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </nav>

        {volSel ? (
          <div style={S(paneStyle)}>
            <div style={S(`padding-bottom:16px;${RULE};display:flex;align-items:center;gap:12px;min-width:0`)}>
              <div style={S('width:44px;height:44px;border-radius:50%;overflow:hidden;flex:none')}>
                <Avatar name={volName(volSel)} fs={16} />
              </div>
              <div style={S('min-width:0')}>
                <div className="vu-trunc" style={S(H3)}>{volName(volSel)}</div>
                <div style={S('margin-top:6px')}>
                  <StatusText tone={volSel.app.status === 'accepted' ? 'ok' : volSel.app.status === 'pending' ? 'wait' : volSel.app.status === 'declined' ? 'bad' : 'mute'}>
                    {APP_STATUS_LABEL[volSel.app.status] || 'Applied'}
                  </StatusText>
                </div>
              </div>
            </div>
            <div className={stacked ? 'vu-msgfit' : undefined} style={S('padding-top:16px')}>
              {stacked ? <style>{MSG_FIT_CSS}</style> : null}
              <MessageThread key={volSel.app.id} applicationId={volSel.app.id} recipientId={volSel.app.applicant_id} recipientName={volName(volSel)} />
            </div>
          </div>
        ) : th ? (
          <div style={S(paneStyle)}>
            <div className="vu-stack vu-stack-gap" style={S(`padding-bottom:16px;${RULE};display:flex;align-items:center;justify-content:space-between;gap:12px`)}>
              <div style={S('min-width:0')}>
                <div className="vu-trunc" style={S(H3)}>{noteName(th)}</div>
                <div style={S(`margin-top:4px;${SMALL}`)}>Only you see these.</div>
              </div>
              <div style={S('flex:none')}>
                <Button variant="outline" size="sm" aria-label="Insert a message template" aria-haspopup="menu" aria-expanded="false" onClick={templates}>
                  Templates
                  <Icon name="chevron-down" size={14} />
                </Button>
              </div>
            </div>

            <div ref={scrollRef} style={S('padding:20px 0;display:flex;flex-direction:column;gap:16px;flex:1;max-height:440px;overflow-y:auto')}>
              {th.messages.length ? (
                th.messages.map((m) => (
                  <div key={m.id} style={S(`max-width:min(480px, 100%);align-self:${m.who === 'me' ? 'flex-end' : 'flex-start'}`)}>
                    {m.who !== 'me' ? <div style={S(`margin-bottom:5px;font:600 13px/1.45 ${F.body};color:${C.ink2}`)}>{m.whoName || 'Them'}</div> : null}
                    <div className="vu-break" style={s(`padding:12px 16px;border-radius:16px;${BODY}`, m.who === 'me' ? `background:${C.ink};color:#fff` : `background:${C.mist}`)}>
                      {m.body}
                    </div>
                    <div style={S(`margin-top:5px;${SMALL};text-align:${m.who === 'me' ? 'right' : 'left'}`)}>{m.when}</div>
                  </div>
                ))
              ) : (
                <p style={S(`margin:0;${META}`)}>Jot notes for yourself here.</p>
              )}
            </div>

            <div style={S(`padding-top:16px;border-top:1px solid ${C.line};display:flex;align-items:center;gap:10px`)}>
              <input
                type="text"
                value={draft}
                placeholder="e.g. Ask the park office for more trash bags"
                aria-label="Note"
                maxLength={600}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') send();
                }}
                className={cx('vu-input', H.input)}
                style={S(`flex:1;min-width:0;height:44px;padding:0 14px;border-radius:${R.control};border:1px solid ${C.line2};background:#fff;font:400 15px/1.2 ${F.body};color:${C.ink};transition:border-color .16s ease`)}
              />
              <Button variant="dark" onClick={send} disabled={!draft.trim()} aria-disabled={draft.trim() ? undefined : 'true'} aria-label="Save note">
                Save note
              </Button>
            </div>
          </div>
        ) : (
          <div role="status" style={S(`${paneStyle};align-items:center;justify-content:center;min-height:200px;${SMALL}`)}>
            Loading messages
          </div>
        )}
      </div>
    </section>
  );
}

/* ==========================================================================
   Settings
   ========================================================================== */

/* Settings rows that something in the app acts on. The rest stay hidden until
   they do (auto-approve, digests and so on were never wired up). */
const LIVE_SETTINGS = { 'set-public': 'Show project on Discover' };

function isPublic(proj) {
  const row = (proj.settings || []).find((r) => r.id === 'set-public');
  return row ? !!row.on : true;
}

/** Push the project to its public listing. Hidden or archived ones go paused. */
export async function syncListing(projectId) {
  const proj = getProject(projectId);
  if (!proj || !proj.listingId) return true;
  try {
    await publishListing({ ...proj, archived: proj.archived || !isPublic(proj) });
    return true;
  } catch (err) {
    console.error('[lead] listing sync failed', err);
    return false;
  }
}

/* Archiving stamped closedAt on each accepted or waiting application
   (markProjectClosed), which members read as "closed this project". Clear
   those stamps when the lead brings the project back. Best-effort per row;
   returns how many rows couldn't be cleared. */
async function clearClosedStamps(listingId) {
  if (!listingId) return 0;
  const apps = await loadOwnerApplications({ throwOnError: true });
  const stamped = apps.filter((a) => a.listing_id === listingId && a.assignment && a.assignment.closedAt && ['accepted', 'pending'].includes(a.status));
  const results = await Promise.all(stamped.map((a) => setMemberAssignment(a.id, { closedAt: null }).catch((error) => ({ ok: false, error }))));
  const failed = results.filter((r) => !r.ok);
  if (failed.length) console.error('[lead] could not clear the archived stamp on', failed.length, 'applications', failed[0].error);
  if (stamped.length) window.dispatchEvent(new Event('vu:applications-changed'));
  return failed.length;
}

export function SettingsTab({ p }) {
  const rows = (p.settings || []).filter((r) => LIVE_SETTINGS[r.id]);
  // On one column the join link sits under Project settings, so Archive stays last.
  const stacked = useNarrow(1179);
  const joinLink = <ShareLink p={p} tone="soft" />;

  function editDetails() {
    openModal({
      title: 'Project details',
      subtitle: 'Volunteers see these on your join page.',
      Body: function DetailsBody({ api }) {
        return <DetailsForm api={api} project={p} />;
      },
    });
  }

  async function archive() {
    const ok = await confirmDialog({
      title: `Archive ${p.name}?`,
      body: "It comes off Discover, its join link stops taking applications and members see it as closed. Hours volunteers already logged aren't touched. You can restore it from Settings later.",
      confirmLabel: 'Archive project',
      cancelLabel: 'Keep it',
      requireText: 'ARCHIVE',
    });
    if (!ok) return;
    archiveProject(p.id);
    const synced = await syncListing(p.id);
    toast(synced
      ? { title: 'Project archived', message: 'It no longer shows on Discover.', tone: 'ok' }
      : { title: 'Archived here only', message: "Discover didn't update. Check your connection and try again.", tone: 'warn' });
  }

  async function restore() {
    const ok = await confirmDialog({
      title: `Restore ${p.name}?`,
      body: isPublic(p)
        ? 'It goes back on Discover and its join link takes applications again.'
        : "Its join link takes applications again. It stays off Discover until you turn on 'Show project on Discover'.",
      confirmLabel: 'Restore project',
      cancelLabel: 'Keep it archived',
      tone: 'primary',
    });
    if (!ok) return;
    update((st) => {
      const proj = st.projects.find((x) => x.id === p.id);
      if (proj) {
        proj.archived = false;
        proj.status = 'LIVE';
      }
    });
    logAudit(p.id, 'Project restored');
    const synced = await syncListing(p.id);
    let stampsLeft = 0;
    try {
      stampsLeft = await clearClosedStamps(p.listingId);
    } catch (err) {
      console.error('[lead] could not load applications to reopen', err);
      stampsLeft = 1;
    }
    if (!synced) {
      toast({ title: 'Restored here only', message: "Discover didn't update. Check your connection and try again.", tone: 'warn' });
    } else if (stampsLeft) {
      toast({ title: 'Project restored', message: "Some members' project pages still say it closed. Check your connection.", tone: 'warn' });
    } else {
      toast({ title: 'Project restored', message: isPublic(p) ? 'It shows on Discover again.' : 'Your join link takes applications again.', tone: 'ok' });
    }
  }

  async function toggle(r) {
    const row = toggleProjectSetting(p.id, r.id);
    if (!row) return;
    const synced = await syncListing(p.id);
    if (!synced) {
      toast({ title: "Couldn't update Discover", message: 'Saved here. Check your connection and try again.', tone: 'warn' });
      return;
    }
    // Hiding pauses the listing, and paused listings can't be opened by anyone
    // else, so the join link stops working too. Say so instead of promising it works.
    toast({ title: row.on ? 'Showing on Discover' : 'Hidden from Discover', message: row.on ? 'Your join link works again.' : 'Your join link is paused until you turn this back on.', tone: 'ok', timeout: 3200 });
  }

  const details = [
    ['Project name', p.name],
    ['Where it happens', p.site || (p.delivery === 'remote' ? 'Remote' : '')],
    ['What volunteers do', p.mission],
    ['Details', p.bio],
  ];

  return (
    <div className="vu-layout-rail" style={S('margin-top:32px')}>
      <div style={S('min-width:0')}>
        <section aria-labelledby="set-h">
          <h2 id="set-h" style={S(H2)}>Project settings</h2>
          <div style={S(`margin-top:16px;border-top:1px solid ${C.line}`)}>
            {p.archived ? (
              <div style={S(`padding:16px 0;${RULE};display:flex;align-items:center;gap:12px;flex-wrap:wrap;${META}`)}>
                <StatusText tone="wait">Archived</StatusText>
                This project doesn't show on Discover.
              </div>
            ) : (
              rows.map((r) => (
                <div key={r.id} style={S(`padding:16px 0;${RULE};display:flex;align-items:center;justify-content:space-between;gap:16px`)}>
                  <div style={S('min-width:0')}>
                    <div style={S(LABEL)}>{LIVE_SETTINGS[r.id]}</div>
                    <div style={S(`margin-top:3px;${SMALL}`)}>{r.on ? 'Volunteers can find it by searching and open your join link.' : 'Hidden from Discover, and your join link is paused.'}</div>
                  </div>
                  <Toggle on={r.on} label={LIVE_SETTINGS[r.id]} onChange={() => toggle(r)} />
                </div>
              ))
            )}
          </div>
        </section>

        {stacked ? (
          <section aria-label="Join link" style={S('margin-top:28px')}>
            {joinLink}
          </section>
        ) : null}

        <section aria-labelledby="set-det" style={S(SEC_GAP)}>
          <div className="vu-sec-head" style={S('flex-wrap:wrap;align-items:center')}>
            <h2 id="set-det" style={S(H2)}>Project details</h2>
            <Button variant="outline" size="sm" icon="edit" onClick={editDetails} aria-label="Edit project details">
              Edit project details
            </Button>
          </div>
          <dl style={S(`margin:16px 0 0;border-top:1px solid ${C.line}`)}>
            {details.map(([k, v]) => (
              <div key={k} className="vu-stack" style={S(`padding:14px 0;${RULE};display:flex;gap:6px 24px`)}>
                <dt style={S(`flex:none;width:180px;${META}`)}>{k}</dt>
                <dd className="vu-break" style={S(`margin:0;min-width:0;${BODY};color:${v ? C.ink : C.ink2}`)}>{v || 'Not added yet'}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="set-arc" style={S(SEC_GAP)}>
          <h2 id="set-arc" style={S(H2)}>Archive</h2>
          <p style={S(`margin:6px 0 0;${META};max-width:560px`)}>
            {p.archived
              ? "This project is archived. Hours volunteers already logged are kept. Restore it to take applications again."
              : "Takes the project off Discover and stops new applications. Hours volunteers already logged aren't touched. You can restore it later."}
          </p>
          <div style={S('margin-top:16px')}>
            {p.archived ? (
              <Button variant="outline" size="sm" icon="refresh" onClick={restore} aria-label="Restore project">
                Restore project
              </Button>
            ) : (
              <Button variant="danger" size="sm" icon="folder" onClick={archive} aria-label="Archive project">
                Archive project
              </Button>
            )}
          </div>
        </section>
      </div>

      {stacked ? null : (
        <aside aria-label="Join link" style={S('min-width:0')}>
          {joinLink}
        </aside>
      )}
    </div>
  );
}

function DetailsForm({ api, project }) {
  // Same rule as /create: a remote project doesn't need a place.
  const remote = project.delivery === 'remote';
  const [f, setF] = useState({ name: project.name || '', site: project.site || '', mission: project.mission || '', bio: project.bio || '' });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <Field label="Project name" value={f.name} onChange={(v) => setF((x) => ({ ...x, name: v }))} maxLength={60} required error={err.name} />
      <div style={S('margin-top:16px')}>
        <Field label="Where it happens" value={f.site} onChange={(v) => setF((x) => ({ ...x, site: v }))} maxLength={90} required={!remote} error={err.site} placeholder={remote ? 'Optional for a remote project' : 'e.g. Carmel Clay Public Library'} />
      </div>
      <div style={S('margin-top:16px')}>
        <TextArea id="pd-mission" label="What volunteers do" value={f.mission} maxLength={240} minHeight={84} onChange={(v) => setF((x) => ({ ...x, mission: v }))} />
      </div>
      <div style={S('margin-top:16px')}>
        <TextArea id="pd-bio" label="Details" value={f.bio} maxLength={400} minHeight={70} onChange={(v) => setF((x) => ({ ...x, bio: v }))} />
      </div>
      <DialogActions>
        <Button variant="outline" onClick={() => api.close()} aria-label="Cancel">
          Cancel
        </Button>
        <Button
          variant="primary"
          aria-label="Save details"
          busy={busy}
          onClick={async () => {
            const e = {};
            if (!f.name.trim()) e.name = 'Enter a project name.';
            if (!remote && !f.site.trim()) e.site = 'Enter where it happens.';
            setErr(e);
            if (Object.keys(e).length) return;
            setBusy(true);
            updateProject(project.id, { name: f.name.trim(), site: f.site.trim(), siteShort: f.site.trim(), mission: f.mission.trim(), bio: f.bio.trim() });
            const synced = await syncListing(project.id);
            setBusy(false);
            api.close();
            toast(synced
              ? { title: 'Details saved', message: 'Your join page shows the new details.', tone: 'ok' }
              : { title: 'Saved here only', message: "Your join page didn't update. Try again in a minute.", tone: 'warn' });
          }}
        >
          {busy ? 'Saving' : 'Save details'}
        </Button>
      </DialogActions>
    </div>
  );
}
