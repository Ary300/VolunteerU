'use client';

/* ==========================================================================
   Tabs.jsx, Attendance, Applications, Hours, Quality, Messages, Settings
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { S, s, cx, H } from '../../lib/style.js';
import { Avatar, Pressable, EmptyState, Toggle, Field, Icon, SectionLabel } from '../ui.jsx';
import { openModal, confirmDialog, toast, menuFromEvent } from '../../lib/overlays.js';
import { update } from '../../lib/store.js';
import { shiftDates, isPastShift } from '../../lib/calendar.js';
import CrossApplications from '../CrossApplications.jsx';
import { ShareLink } from './CrossMembers.jsx';
import MessageThread from '../MessageThread.jsx';
import { formatShiftTime } from '../screens/JoinListing.jsx';
import { supabase } from '../../lib/supabase.js';
import { loadProjectMembers, confirmMemberHour, publishListing, myId } from '../../lib/listings.js';
import {
  attendanceFor, attendanceStats, setAttendance, postAttendance,
  decideApplication, reopenApplication,
  pendingHours, cleanHours, approveHours, adjustHours, validateHours,
  recomputeCompliance, resolveDispute, fileIncident, closeIncident, resolveEscalation,
  sendMessage, readThread, toggleProjectSetting, archiveProject,
  updateProject, download, parseSessionDate, getProject, messageTemplateText, ATTEND_TONE, GRADE_TONE, tone,
} from '../../lib/db.js';
import { GRADE_SCALE, messageTemplates } from '../../lib/seed.js';

const MONO = "'Geist Mono',monospace";
const ATTEND_OPTIONS = ['Present', 'Late', 'Absent', 'Excused'];

/* Shared button looks. Solid brand fill, no gradient. */
const BTN = 'display:inline-flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease, border-color .16s ease';
const BTN_PRIMARY = `${BTN};border:1px solid #A8482A;background:#C2603C;color:#fff`;
const BTN_BRAND = `${BTN};border:1px solid #E7C0AC;background:#fff;color:#C2603C`;
const BTN_PLAIN = `${BTN};border:1px solid #E4DDD4;background:#fff;color:#57504A`;
const BTN_DANGER = `${BTN};border:1px solid #EBD3C8;background:#fff;color:#A8482A`;
const MODAL_CANCEL = 'display:inline-flex;align-items:center;justify-content:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;color:#1A1714;cursor:pointer';
const MODAL_PRIMARY = 'display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 14px/1 Geist;cursor:pointer';
const TABLE_HEAD = 'font:500 12px/1 Geist;color:#8A8179';
const CARD = 'padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff';
const DISABLED = 'opacity:.5;cursor:default';

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
 * Write posted attendance hours onto a join-link member's application, in the
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
 * Send every posted shift's hours to the members who joined through the link
 * and haven't received them yet. `credited` on the session remembers who did,
 * so this is safe to run again (it is, each time Attendance opens).
 * Returns the names that couldn't be written.
 */
async function creditPostedAttendance(projectId, onlySessionId) {
  const p = getProject(projectId);
  if (!p) return [];
  const failed = [];
  const posted = (p.attendanceSessions || []).filter((x) => x.posted && (!onlySessionId || x.id === onlySessionId));
  for (const meta of posted) {
    const done = meta.credited || {};
    const rows = (p.attendance && p.attendance[meta.id]) || [];
    const time = sessionTime(p, meta);
    for (const r of rows) {
      const person = (p.people || []).find((x) => x.id === r.personId);
      const appId = person && person.appId;
      if (!appId || done[appId] || !(Number(r.hrs) > 0)) continue;
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
      } else {
        console.error('[lead] could not send posted hours to', r.n, res.error);
        failed.push(r.n);
      }
    }
  }
  return failed;
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
      <div style={S('margin-top:22px')}>
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
    const ok = await confirmDialog({
      title: `Post attendance for ${meta.d}?`,
      body: "This locks the shift and adds the hours to each person's total on your People tab. You can't edit it afterward.",
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
    const failed = await creditPostedAttendance(p.id, sessionId).catch((err) => {
      console.error('[lead] sending posted hours failed', err);
      return ['Some volunteers'];
    });
    if (failed.length) {
      toast({
        title: 'Attendance posted',
        message: `${failed.join(', ')} won't see these hours yet. We'll retry when you reopen Attendance.`,
        tone: 'warn',
      });
    } else {
      toast({ title: 'Attendance posted', message: `Hours added for ${plural(n, 'person', 'people')}.`, tone: 'ok' });
    }
  }

  const COLS = 'display:grid;grid-template-columns:1.7fr 1fr 1.3fr .6fr 1fr 1.5fr;gap:12px';

  return (
    <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 320px;gap:20px;margin-top:22px;align-items:start')}>
      <div style={S('display:flex;flex-direction:column;gap:16px;min-width:0')}>
        <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
          <div className="vu-stack vu-stack-gap" style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:16px')}>
            <div className="vu-scroll-x" style={S('display:flex;gap:8px;min-width:0')}>
              {sessions.map((x) => {
                const on = x.id === sessionId;
                // Keep the time on posted chips: two shifts on one day must stay tellable apart.
                const time = sessionTime(p, x);
                const sub = x.posted ? (
                  <span style={S('display:inline-flex;align-items:center;gap:4px')}>
                    <Icon name="check" size={10} />
                    {time || 'Posted'}
                  </span>
                ) : time;
                return (
                  <Pressable
                    key={x.id}
                    label={`${x.d}${time ? `, ${time}` : ''}${x.posted ? ', posted' : ''}`}
                    pressed={on}
                    onClick={() => setParam({ session: x.id })}
                    className={cx(on ? '' : H.chip, H.press)}
                    style={s('flex:none;padding:9px 13px;border-radius:10px;cursor:pointer;white-space:nowrap;transition:background .16s ease, border-color .16s ease', `border:1px solid ${on ? '#1F1B18' : '#E8E1D9'}`, `background:${on ? '#1F1B18' : '#FFFFFF'}`)}
                  >
                    <div style={s('font:500 13px/1 Geist', `color:${on ? '#FFFFFF' : '#332D28'}`)}>{x.d}</div>
                    <div style={s(`margin-top:5px;font:450 10px/1 ${MONO}`, `color:${on ? '#CFC7BF' : '#8A8179'}`)}>{sub}</div>
                  </Pressable>
                );
              })}
            </div>
            <div style={S('display:flex;gap:9px;flex:none')}>
              <Pressable
                label="Mark all present"
                disabled={locked}
                onClick={markAll}
                className={cx(locked ? '' : H.secondary, H.press)}
                style={s(BTN_BRAND, locked ? DISABLED : '')}
              >
                Mark all present
              </Pressable>
              <Pressable
                label={locked ? 'Attendance posted' : running ? `Post attendance after ${endLabel}` : 'Post attendance'}
                disabled={locked || running}
                onClick={post}
                className={cx(locked || running ? '' : H.primary, H.press)}
                style={s(BTN_PRIMARY, locked || running ? DISABLED : '')}
              >
                {locked ? <Icon name="check" size={14} /> : null}
                {locked ? 'Posted' : running ? `Post after ${endLabel}` : 'Post attendance'}
              </Pressable>
            </div>
          </div>

          <div className="vu-table-wrap">
            <div>
              <div style={S(`${COLS};padding:12px 20px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;${TABLE_HEAD}`)}>
                <div>Volunteer</div><div>Attendance</div><div>Time</div><div>Hours</div><div>Score</div><div>Note</div>
              </div>
              {rows.length ? (
                rows.map((a) => {
                  const st = tone(ATTEND_TONE, a.st);
                  const g = GRADE_TONE[a.grade] || GRADE_TONE['Not scored'];
                  return (
                    <div key={a.personId} className={H.row} style={S(`${COLS};padding:14px 20px;border-bottom:1px solid #F1EBE4;align-items:center;transition:background .16s ease`)}>
                      <div style={S('display:flex;align-items:center;gap:11px;min-width:0')}>
                        <div style={S('width:30px;height:30px;border-radius:50%;overflow:hidden;flex:none')}>
                          <Avatar name={a.n} fs={12} />
                        </div>
                        <div style={S('min-width:0')}>
                          <div className="vu-trunc" style={S('font:500 13px/1.2 Geist')}>{a.n}</div>
                          <div className="vu-trunc" style={S('margin-top:3px;font:450 11px/1.2 Geist;color:#8A8179')}>{a.role}</div>
                        </div>
                      </div>
                      <div>
                        <Pressable
                          label={`${a.n} is ${a.st}. Change attendance.`}
                          disabled={locked}
                          expanded={false}
                          onClick={(e) => changeStatus(e, a)}
                          className={locked ? '' : H.link}
                          style={s(`display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:7px;background:${st.stBg};font:500 11px/1 ${MONO};color:${st.stColor}`, `cursor:${locked ? 'default' : 'pointer'}`)}
                        >
                          {a.st}
                          {locked ? null : <Icon name="chevron-down" size={11} />}
                        </Pressable>
                      </div>
                      <div style={S('font:450 12px/1.3 Geist;color:#57504A;display:flex;align-items:center;gap:6px;flex-wrap:wrap')}>
                        <span>{a.st === 'Unmarked' ? 'Not marked' : a.inOut}</span>
                        {a.edited ? <span title="Changed by you" style={S('padding:2px 6px;border-radius:5px;background:#FDF3E7;font:500 10px/1.2 Geist;color:#8A5A20')}>Edited</span> : null}
                      </div>
                      <Pressable
                        label={`${fmtHours(a.hrs)} for ${a.n}. Change hours.`}
                        disabled={locked}
                        onClick={() => editHours(a)}
                        className={locked ? '' : H.toBrand}
                        style={s(`font:500 13px/1 ${MONO};width:max-content`, `cursor:${locked ? 'default' : 'pointer'}`, locked ? '' : 'text-decoration:underline;text-decoration-color:#E7C0AC;text-underline-offset:3px')}
                      >
                        {Math.round(Number(a.hrs) * 10) / 10}
                      </Pressable>
                      <div>
                        <Pressable
                          label={`Score for ${a.n} is ${a.grade}. Change score.`}
                          disabled={locked}
                          expanded={false}
                          onClick={(e) => changeGrade(e, a)}
                          className={locked ? '' : H.link}
                          style={s(`display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:7px;background:${g.gBg};font:500 11px/1 ${MONO};color:${g.gColor}`, `cursor:${locked ? 'default' : 'pointer'}`)}
                        >
                          {a.grade}
                          {locked ? null : <Icon name="chevron-down" size={11} />}
                        </Pressable>
                      </div>
                      <Pressable
                        label={a.note ? `Edit note for ${a.n}` : `Add a note for ${a.n}`}
                        disabled={locked}
                        onClick={() => editNote(a)}
                        className={locked ? '' : H.toInk}
                        style={s('font:450 12px/1.4 Geist;color:#6B635C;transition:color .16s ease;min-width:0', `cursor:${locked ? 'default' : 'pointer'}`)}
                      >
                        {a.note || (locked ? '-' : 'Add a note')}
                      </Pressable>
                    </div>
                  );
                })
              ) : (
                <div style={S('padding:8px 20px 20px')}>
                  <EmptyState compact icon="users" title="Nobody on this shift's roster" body="Accept volunteers and they show up here." cta="Open People" onCta={() => goTab('people')} />
                </div>
              )}
            </div>
          </div>

          <div className="vu-stack vu-stack-gap" style={S('padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:20px;font:450 12px/1.4 Geist;color:#8A8179')}>
            <div>
              {locked
                ? 'Posted. This shift is locked.'
                : `${running ? `Shift ends at ${endLabel}. ` : ''}${unmarked ? `${unmarked} still unmarked. ` : ''}Hour changes need a reason and go in the audit log.`}
            </div>
            <Pressable label="Open the audit log" onClick={() => goTab('quality')} className={H.link} style={S('font:500 12px/1 Geist;color:#C2603C;cursor:pointer;white-space:nowrap')}>
              Audit log
            </Pressable>
          </div>
        </div>

        <div className="vu-2col" style={S('display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
          <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <SectionLabel>Debrief</SectionLabel>
            <DebriefForm key={sessionId} p={p} sessionId={sessionId} />
          </div>
          <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <SectionLabel>Scores</SectionLabel>
            <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:10px')}>
              {GRADE_SCALE.map((g) => (
                <div key={g.t} style={S('display:flex;justify-content:space-between;gap:12px;padding-bottom:10px;border-bottom:1px solid #F1EBE4')}>
                  <div style={S('font:500 13px/1.3 Geist')}>{g.t}</div>
                  <div style={S('font:450 12px/1.3 Geist;color:#8A8179;text-align:right')}>{g.m}</div>
                </div>
              ))}
            </div>
            <div style={S('margin-top:12px;font:450 12px/1.5 Geist;color:#8A8179')}>
              Only you see scores. Volunteers don't.
            </div>
          </div>
        </div>
      </div>

      <div style={S('display:flex;flex-direction:column;gap:14px')}>
        <div style={S(CARD)}>
          <SectionLabel>{meta.d}</SectionLabel>
          {timeLabel ? <div style={S('margin-top:5px;font:450 12px/1.3 Geist;color:#8A8179')}>{timeLabel}{length ? `, ${fmtHours(length)}` : ''}</div> : null}
          <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:11px')}>
            {stats.map((x) => (
              <div key={x.l} style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;font:450 13px/1 Geist;color:#57504A')}>
                <span>{x.l === 'Hours this session' ? 'Hours this shift' : x.l}</span>
                <span style={S('color:#1A1714;font-weight:500')}>{x.v}</span>
              </div>
            ))}
          </div>
        </div>
        {openEscalations.length ? (
          <div style={S('padding:20px;border-radius:14px;border:1px solid #EFE3DC;background:#FAF6F3')}>
            <SectionLabel>Follow-ups</SectionLabel>
            <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:10px')}>
              {openEscalations.map((e) => (
                <div key={e.id} style={S('padding:12px 14px;border-radius:11px;background:#fff;border:1px solid #EFE3DC')}>
                  <div style={S('font:500 13px/1.2 Geist')}>{e.n}, {e.step}</div>
                  <div style={S('margin-top:6px;font:450 12px/1.4 Geist;color:#6B635C')}>{e.action}</div>
                  <div style={S('margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:10px')}>
                    <div style={S('font:500 11px/1 Geist;color:#A8482A')}>Due {e.due}</div>
                    <Pressable
                      label={`Mark ${e.n} follow-up done`}
                      onClick={() => {
                        resolveEscalation(p.id, e.id);
                        toast({ title: 'Follow-up done', message: `${e.n}, ${e.step}`, tone: 'ok' });
                      }}
                      className={H.link}
                      style={S('font:500 11px/1 Geist;color:#C2603C;cursor:pointer')}
                    >
                      Mark done
                    </Pressable>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
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

  const area = 'margin-top:7px;display:block;width:100%;padding:12px 14px;border-radius:11px;border:1px solid #E8E1D9;background:#FCFAF8;font:450 13px/1.5 Geist;color:#332D28;min-height:60px;transition:border-color .16s ease';

  return (
    <>
      <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:12px')}>
        <div>
          <label htmlFor="deb-worked" style={S('font:500 12px/1 Geist;color:#57504A')}>What worked</label>
          <textarea
            id="deb-worked"
            value={worked}
            onChange={(e) => {
              setWorked(e.target.value);
              save({ worked: e.target.value });
            }}
            placeholder="e.g. Pairing new tutors with returning ones"
            className={H.input}
            style={S(area)}
          />
        </div>
        <div>
          <label htmlFor="deb-fix" style={S('font:500 12px/1 Geist;color:#57504A')}>Fix before next time</label>
          <textarea
            id="deb-fix"
            value={fix}
            onChange={(e) => {
              setFix(e.target.value);
              save({ fix: e.target.value });
            }}
            placeholder="e.g. Set out books before kids arrive"
            className={H.input}
            style={S(area)}
          />
        </div>
      </div>
      <div style={S('margin-top:14px;display:flex;gap:8px;flex-wrap:wrap')}>
        <Pressable
          label="Save debrief"
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
          className={cx(H.secondary, H.press)}
          style={S(BTN_BRAND)}
        >
          Save debrief
        </Pressable>
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
      <div style={S('margin-top:14px')}>
        <Field label="Reason for the change" value={reason} onChange={setReason} placeholder="e.g. Left early for the bus" maxLength={90} required error={err.reason} />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(MODAL_CANCEL)}>
          Cancel
        </Pressable>
        <Pressable
          label="Save hours"
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
          className={cx(H.primary, H.press)}
          style={S(MODAL_PRIMARY)}
        >
          Save hours
        </Pressable>
      </div>
    </div>
  );
}

function SimpleNoteForm({ api, initial, onSave }) {
  const [t, setT] = useState(initial || '');
  return (
    <div>
      <textarea
        value={t}
        onChange={(e) => setT(e.target.value)}
        maxLength={240}
        aria-label="Note"
        placeholder="e.g. Great with the younger readers"
        className={H.input}
        style={S('display:block;width:100%;padding:14px;border-radius:12px;border:1px solid #E8E1D9;background:#FCFAF8;min-height:100px;font:450 14px/1.55 Geist;color:#332D28')}
      />
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(MODAL_CANCEL)}>
          Cancel
        </Pressable>
        <Pressable
          label="Save note"
          onClick={() => {
            onSave(t.trim());
            api.close();
            toast({ title: t.trim() ? 'Note saved' : 'Note cleared', tone: 'ok', timeout: 2200 });
          }}
          className={cx(H.primary, H.press)}
          style={S(MODAL_PRIMARY)}
        >
          Save note
        </Pressable>
      </div>
    </div>
  );
}

/* ==========================================================================
   Applications
   ========================================================================== */

const APP_FILTERS = [
  { k: 'pending', l: 'Waiting on you' },
  { k: 'accepted', l: 'Accepted' },
  { k: 'waitlisted', l: 'Waitlisted' },
  { k: 'declined', l: 'Declined' },
  { k: 'all', l: 'All' },
];

const APP_CHIP = {
  accepted: { l: 'Accepted', bg: '#EAF3EC', color: '#3F6B4E' },
  waitlisted: { l: 'Waitlisted', bg: '#F6F2EE', color: '#6B635C' },
  declined: { l: 'Declined', bg: '#F5E7E0', color: '#A8482A' },
};

export function ApplicationsTab({ p, params, setParam, onCopyLink }) {
  const filter = params.get('astatus') || 'pending';
  const all = p.applications;
  const rows = filter === 'all' ? all : all.filter((a) => a.status === filter);

  const counts = {
    pending: all.filter((a) => a.status === 'pending').length,
    accepted: all.filter((a) => a.status === 'accepted').length,
    waitlisted: all.filter((a) => a.status === 'waitlisted').length,
    declined: all.filter((a) => a.status === 'declined').length,
    all: all.length,
  };

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
        <div style={S('display:flex;flex-direction:column;gap:16px')}>
          {(p.screeningQuestions || []).map((q, i) => (
            <div key={q}>
              <div style={S('font:500 13px/1.35 Geist;color:#57504A')}>
                {i + 1}. {q}
              </div>
              <div className="vu-break" style={S('margin-top:7px;padding:12px 14px;border-radius:11px;background:#FCFAF8;border:1px solid #F1EBE4;font:450 14px/1.55 Geist;color:#332D28')}>
                {(a.answers && a.answers[i]) || 'No answer given.'}
              </div>
            </div>
          ))}
          {a.note ? <div className="vu-break" style={S('font:450 14px/1.55 Geist;color:#332D28')}>{a.note}</div> : null}
        </div>
      ),
      footer: (api) =>
        a.status === 'pending' ? (
          <>
            <Pressable label={`Decline ${a.n}`} onClick={() => { api.close(); decide(a, 'declined'); }} className={cx(H.secondary, H.press)} style={S(`${MODAL_CANCEL};color:#8A8179`)}>
              Decline
            </Pressable>
            <Pressable label={`Accept ${a.n}`} onClick={() => { api.close(); decide(a, 'accepted'); }} className={cx(H.primary, H.press)} style={S(MODAL_PRIMARY)}>
              Accept
            </Pressable>
          </>
        ) : null,
    });
  }

  return (
    <div style={S('margin-top:22px;display:flex;flex-direction:column;gap:14px;max-width:880px')}>
      {/* Cross-user applications from the published listing come first. When
          nothing is pending and there are no local ones, show an empty state. */}
      <CrossApplications
        listingId={p.listingId}
        emptyState={all.length ? null : (
          <EmptyState
            icon="inbox"
            title="No applications waiting"
            body="Share your join link. New applications show up here."
            cta="Copy join link"
            onCta={() => onCopyLink()}
          />
        )}
      />
      {all.length ? (
        <div className="vu-scroll-x" style={S('display:flex;gap:8px')}>
          {APP_FILTERS.map((f) => {
            const on = filter === f.k;
            return (
              <Pressable
                key={f.k}
                label={`${f.l}, ${counts[f.k]}`}
                pressed={on}
                onClick={() => setParam({ astatus: f.k === 'pending' ? null : f.k })}
                className={cx(on ? '' : H.chip, H.press)}
                style={s('flex:none;padding:8px 13px;border-radius:9px;font:500 13px/1 Geist;cursor:pointer;white-space:nowrap;transition:background .16s ease, border-color .16s ease, color .16s ease', `border:1px solid ${on ? '#1F1B18' : '#E8E1D9'}`, `background:${on ? '#1F1B18' : '#FFFFFF'}`, `color:${on ? '#FFFFFF' : '#57504A'}`)}
              >
                {f.l} <span style={S(`font:500 10px/1 ${MONO};opacity:.75`)}>{counts[f.k]}</span>
              </Pressable>
            );
          })}
        </div>
      ) : null}

      {rows.length ? (
        rows.map((a) => {
          const chip = APP_CHIP[a.status];
          return (
            <div key={a.id} style={S(CARD)}>
              <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:20px')}>
                <div style={S('display:flex;gap:13px;min-width:0')}>
                  <div style={S('width:44px;height:44px;border-radius:50%;overflow:hidden;flex:none')}>
                    <Avatar name={a.n} fs={15} />
                  </div>
                  <div style={S('min-width:0')}>
                    <div style={S('display:flex;align-items:center;gap:9px;flex-wrap:wrap')}>
                      <div style={S('font:600 16px/1.2 Geist;letter-spacing:-0.02em')}>{a.n}</div>
                      {chip ? (
                        <span style={S(`padding:4px 8px;border-radius:6px;font:500 11px/1 Geist;background:${chip.bg};color:${chip.color}`)}>{chip.l}</span>
                      ) : null}
                    </div>
                    <div style={S('margin-top:5px;font:450 12px/1.3 Geist;color:#8A8179')}>
                      {a.s}, applied {a.when}
                    </div>
                    {a.note ? <div className="vu-break" style={S('margin-top:11px;font:450 14px/1.5 Geist;color:#332D28;max-width:520px')}>{a.note}</div> : null}
                    <div style={S('margin-top:12px;display:flex;gap:6px;flex-wrap:wrap')}>
                      <span style={S('padding:5px 9px;border-radius:7px;background:#F6F2EE;font:500 11px/1 Geist;color:#57504A')}>{a.role}</span>
                      {(a.flags || []).map((f) => (
                        <span key={f} style={S('padding:5px 9px;border-radius:7px;background:#FDF3E7;font:500 11px/1 Geist;color:#8A5A20')}>
                          {f}
                        </span>
                      ))}
                    </div>
                    {(p.screeningQuestions || []).length && a.answers && a.answers.length ? (
                      <Pressable label={`Read ${a.n}'s answers`} onClick={() => answers(a)} className={H.link} style={S('margin-top:12px;display:inline-flex;align-items:center;gap:5px;font:500 12px/1 Geist;color:#C2603C;cursor:pointer;width:max-content')}>
                        Read their answers
                        <Icon name="arrow-right" size={12} />
                      </Pressable>
                    ) : null}
                  </div>
                </div>
                <div style={S('display:flex;flex-direction:column;gap:8px;flex:none')}>
                  {a.status === 'pending' ? (
                    <>
                      <Pressable label={`Accept ${a.n}`} onClick={() => decide(a, 'accepted')} className={cx(H.primary, H.press)} style={S(BTN_PRIMARY)}>
                        Accept
                      </Pressable>
                      <Pressable label={`Waitlist ${a.n}`} onClick={() => decide(a, 'waitlisted')} className={cx(H.secondary, H.press)} style={S(BTN_PLAIN)}>
                        Waitlist
                      </Pressable>
                      <Pressable label={`Decline ${a.n}`} onClick={() => decide(a, 'declined')} className={cx(H.secondary, H.press)} style={S(`${BTN_PLAIN};color:#8A8179`)}>
                        Decline
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      label={`Undo the decision for ${a.n}`}
                      onClick={() => {
                        reopenApplication(p.id, a.id);
                        toast({ title: 'Decision undone', message: `${a.n} is waiting on you again.`, tone: 'ok' });
                      }}
                      className={cx(H.secondary, H.press)}
                      style={S(BTN_PLAIN)}
                    >
                      Undo
                    </Pressable>
                  )}
                </div>
              </div>
            </div>
          );
        })
      ) : all.length ? (
        <EmptyState
          compact
          title={filter === 'pending' ? 'Nothing waiting on you' : 'None with this status'}
          body={filter === 'pending' ? 'Every application has a decision. New ones show up here.' : 'Switch filters to see the rest.'}
          cta={filter === 'pending' ? 'Copy join link' : 'Show all'}
          onCta={() => (filter === 'pending' ? onCopyLink() : setParam({ astatus: 'all' }))}
        />
      ) : null}
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
      out.push({ app, h, confirmed: !!confirmed[h.id], name: app.applicant_name || 'Volunteer' });
    }
  }
  return out;
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

  async function confirmRow(r, value) {
    if (busy) return;
    setBusy(r.h.id);
    const { ok } = await confirmMemberHour(r.app.id, r.h.id, value);
    setBusy(null);
    if (ok) {
      toast(value
        ? { title: 'Hours confirmed', message: `${r.name}, ${fmtHours(r.h.hrs)} on ${r.h.date}.`, tone: 'ok' }
        : { title: 'Confirmation undone', message: `${r.name}'s ${fmtHours(r.h.hrs)} ${Number(r.h.hrs) === 1 ? 'is' : 'are'} waiting again.`, tone: 'ok' });
      load();
      window.dispatchEvent(new Event('vu:applications-changed'));
    } else {
      toast({ title: "Couldn't save that", message: 'Check your connection and try again.', tone: 'danger' });
    }
  }

  async function confirmAllMembers() {
    const ok = await confirmDialog({
      title: `Confirm ${plural(waiting.length, 'shift')}?`,
      body: `${fmtHours(waitingHrs)} in total. Each volunteer sees them as confirmed.`,
      confirmLabel: 'Confirm all',
      cancelLabel: 'Go back',
      tone: 'brand',
    });
    if (!ok) return;
    setBusy('all');
    // Shifts for one volunteer share a row, so write them one after another.
    let n = 0;
    for (const r of waiting) {
      const res = await confirmMemberHour(r.app.id, r.h.id, true);
      if (res.ok) n += 1;
    }
    setBusy(null);
    load();
    if (n > 0) window.dispatchEvent(new Event('vu:applications-changed'));
    if (n === waiting.length) toast({ title: 'Hours confirmed', message: `${plural(n, 'shift')}, ${fmtHours(waitingHrs)}.`, tone: 'ok' });
    else toast({ title: `Confirmed ${n} of ${waiting.length}`, message: 'Some didn\'t save. Check your connection and try again.', tone: 'warn' });
  }

  async function approveAll() {
    const ok = await confirmDialog({
      title: `Approve ${plural(clean.length, 'shift')}?`,
      body: "Each one is added to that person's total on your People tab.",
      confirmLabel: 'Approve all',
      cancelLabel: 'Go back',
      tone: 'brand',
    });
    if (!ok) return;
    const n = approveHours(p.id, clean.map((q) => q.id));
    toast({ title: 'Hours approved', message: `${plural(n, 'shift')} added to your People tab.`, tone: 'ok' });
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

  return (
    <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 320px;gap:20px;margin-top:22px;align-items:start')}>
      <div style={S('display:flex;flex-direction:column;gap:16px;min-width:0')}>
        <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
          <div className="vu-stack vu-stack-gap" style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:12px')}>
            <div>
              <h2 style={S('margin:0;font:600 16px/1.25 Geist;letter-spacing:-0.02em')}>
                {loading ? 'Hours to confirm' : waiting.length ? `${fmtHours(waitingHrs)} to confirm` : 'Hours to confirm'}
              </h2>
              <div style={S('margin-top:4px;font:450 12px/1.4 Geist;color:#8A8179')}>Hours volunteers logged for {p.name}.</div>
            </div>
            {waiting.length > 1 ? (
              <Pressable label={`Confirm all ${waiting.length}`} disabled={!!busy} onClick={confirmAllMembers} className={cx(busy ? '' : H.primary, H.press)} style={s(BTN_PRIMARY, busy ? DISABLED : '')}>
                {busy === 'all' ? 'Confirming' : `Confirm all ${waiting.length}`}
              </Pressable>
            ) : null}
          </div>

          {loading ? (
            <div style={S('padding:20px;font:450 13px/1.5 Geist;color:#8A8179')}>Loading hours</div>
          ) : failed ? (
            <div role="alert" style={S('padding:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font:450 13px/1.5 Geist;color:#57504A')}>
              Couldn't load logged hours. Check your connection and try again.
              <Pressable label="Try again" onClick={load} className={cx(H.secondary, H.press)} style={S(BTN_PLAIN)}>Try again</Pressable>
            </div>
          ) : waiting.length ? (
            waiting.map((r) => (
              <div key={`${r.app.id}:${r.h.id}`} className={H.row} style={S('padding:14px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;transition:background .16s ease')}>
                <div style={S('min-width:0;flex:1 1 200px')}>
                  <div className="vu-trunc" style={S('font:500 14px/1.2 Geist')}>{r.name}</div>
                  <div className="vu-trunc" style={S('margin-top:4px;font:450 12px/1.3 Geist;color:#8A8179')}>{r.h.activity || 'Volunteering'}, {r.h.date}</div>
                </div>
                <div style={S('display:flex;align-items:center;gap:12px;flex:none')}>
                  <div style={S(`font:500 14px/1 ${MONO}`)}>{shortHrs(r.h.hrs)}</div>
                  <Pressable label={`Confirm ${fmtHours(r.h.hrs)} for ${r.name}`} disabled={!!busy} onClick={() => confirmRow(r, true)} className={cx(busy ? '' : H.primary, H.press)} style={s(BTN_PRIMARY, busy ? DISABLED : '')}>
                    {busy === r.h.id ? 'Confirming' : 'Confirm'}
                  </Pressable>
                </div>
              </div>
            ))
          ) : (
            <div style={S('padding:8px 20px 20px')}>
              <EmptyState
                compact
                icon="check-circle"
                title={memberRows.length ? 'All logged hours are confirmed' : 'No hours logged yet'}
                body={memberRows.length ? 'New hours show up here when a volunteer logs them.' : 'Volunteers log hours from their Home tab after each shift.'}
              />
            </div>
          )}

          {done.length ? (
            <details style={S('border-top:1px solid #F1EBE4')}>
              <summary style={S('padding:14px 20px;cursor:pointer;font:500 13px/1 Geist;color:#57504A')}>Confirmed ({done.length})</summary>
              {done.map((r) => (
                <div key={`${r.app.id}:${r.h.id}`} style={S('padding:10px 20px;border-top:1px solid #F6F2EE;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
                  <div style={S('min-width:0;font:450 13px/1.4 Geist;color:#57504A')}>
                    {r.name}, {r.h.activity || 'Volunteering'}, {r.h.date}
                  </div>
                  <div style={S('display:flex;align-items:center;gap:12px;flex:none')}>
                    <span style={S('display:inline-flex;align-items:center;gap:5px;font:500 12px/1 Geist;color:#3F6B4E')}>
                      <Icon name="check" size={12} />
                      {shortHrs(r.h.hrs)}
                    </span>
                    <Pressable label={`Undo confirmation for ${r.name}, ${r.h.date}`} disabled={!!busy} onClick={() => confirmRow(r, false)} className={H.link} style={S('font:500 12px/1 Geist;color:#C2603C;cursor:pointer')}>
                      Undo
                    </Pressable>
                  </div>
                </div>
              ))}
            </details>
          ) : null}
        </div>

        {queue.length ? (
          <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
            <div className="vu-stack vu-stack-gap" style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:12px')}>
              <SectionLabel>From your People tab</SectionLabel>
              {clean.length ? (
                <Pressable label={`Approve ${plural(clean.length, 'shift')}`} onClick={approveAll} className={cx(H.primary, H.press)} style={S(BTN_PRIMARY)}>
                  Approve all
                </Pressable>
              ) : null}
            </div>
            {queue.map((q) => (
              <div key={q.id} className={H.row} style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;transition:background .16s ease')}>
                <div style={S('min-width:0')}>
                  <div className="vu-trunc" style={S('font:500 14px/1.2 Geist')}>{q.n}</div>
                  <div className="vu-trunc" style={s('margin-top:4px;font:450 12px/1.3 Geist', `color:${q.ok ? '#8A8179' : '#8A5A20'}`)}>
                    {q.d}, {q.src}
                  </div>
                </div>
                <div style={S('display:flex;align-items:center;gap:12px;flex:none')}>
                  <div style={S(`font:500 14px/1 ${MONO}`)}>{shortHrs(q.hrs)}</div>
                  <Pressable label={`Change hours for ${q.n}`} onClick={() => adjust(q)} className={cx(H.secondary, H.press)} style={S(BTN_BRAND)}>
                    Change
                  </Pressable>
                  <Pressable
                    label={`Approve ${fmtHours(q.hrs)} for ${q.n}`}
                    onClick={() => {
                      approveHours(p.id, [q.id]);
                      toast({ title: 'Hours approved', message: `${q.n}, ${fmtHours(q.hrs)}.`, tone: 'ok' });
                    }}
                    className={cx(H.primary, H.press)}
                    style={S(BTN_PRIMARY)}
                  >
                    Approve
                  </Pressable>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div style={S('display:flex;flex-direction:column;gap:14px')}>
        <div style={S(CARD)}>
          <SectionLabel>Export</SectionLabel>
          <div style={S('margin-top:10px;font:450 13px/1.5 Geist;color:#6B635C')}>Everyone on your People tab and everyone who joined online, with their hours.</div>
          <div style={S('margin-top:14px;display:flex;gap:8px;flex-wrap:wrap')}>
            <Pressable
              label="Download roster as CSV"
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
              className={cx(H.secondary, H.press)}
              style={S(BTN_BRAND)}
            >
              <Icon name="download" size={14} />
              Download CSV
            </Pressable>
            <Pressable
              label="Print this page"
              onClick={() => {
                toast({ title: 'Opening print', message: 'Choose "Save as PDF" to keep a copy.', tone: 'brand' });
                setTimeout(() => window.print(), 400);
              }}
              className={cx(H.secondary, H.press)}
              style={S(BTN_BRAND)}
            >
              <Icon name="file" size={14} />
              Print
            </Pressable>
          </div>
        </div>
      </div>
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

  const RCOLS = 'display:grid;grid-template-columns:1.8fr .8fr .6fr 1.1fr 1fr;gap:12px';

  return (
    <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 330px;gap:20px;margin-top:22px;align-items:start')}>
      <div style={S('display:flex;flex-direction:column;gap:16px;min-width:0')}>
        <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
          <div style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4')}>
            <SectionLabel>Reliability</SectionLabel>
          </div>
          <div className="vu-table-wrap">
            <div>
              <div style={S(`${RCOLS};padding:12px 20px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;${TABLE_HEAD}`)}>
                <div>Volunteer</div><div>Show rate</div><div>Late</div><div>Average score</div><div>Trend</div>
              </div>
              {reliability.length ? (
                reliability.map((r) => (
                  <div key={r.id || r.slug || r.n} className={H.row} style={S(`${RCOLS};padding:14px 20px;border-bottom:1px solid #F1EBE4;align-items:center;transition:background .16s ease`)}>
                    <div style={S('display:flex;align-items:center;gap:11px;min-width:0')}>
                      <div style={S('width:28px;height:28px;border-radius:50%;overflow:hidden;flex:none')}>
                        <Avatar name={r.n} fs={11} />
                      </div>
                      <div className="vu-trunc" style={S('font:500 13px/1 Geist')}>{r.n}</div>
                    </div>
                    <div style={S(`font:500 13px/1 ${MONO}`)}>{r.show}</div>
                    <div style={S('font:450 13px/1 Geist;color:#57504A')}>{r.late}</div>
                    <div style={S('font:450 13px/1 Geist;color:#57504A')}>{r.score}</div>
                    <div>
                      <span style={S(`padding:5px 9px;border-radius:7px;background:${r.bg};font:500 11px/1 Geist;color:${r.color}`)}>{r.trend}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={S('padding:20px;font:450 13px/1.5 Geist;color:#8A8179')}>Nobody on your roster yet. Reliability fills in after you post attendance.</div>
              )}
            </div>
          </div>
        </div>

        {compliance.length ? (
          <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
            <div style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4')}>
              <SectionLabel>Paperwork</SectionLabel>
            </div>
            {compliance.map((c) => (
              <div key={c.id} className="vu-stack vu-stack-gap" style={S('padding:14px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:16px')}>
                <div style={S('font:450 14px/1.3 Geist;color:#332D28')}>{c.t}</div>
                <div style={S('display:flex;align-items:center;gap:12px;flex:none')}>
                  <div style={S(`font:500 12px/1 ${MONO};color:#8A8179`)}>{c.v}</div>
                  <span style={S(`padding:5px 9px;border-radius:7px;background:${c.bg};font:500 11px/1 Geist;color:${c.color}`)}>{c.st}</span>
                  {c.st !== 'Clear' ? (
                    <Pressable
                      label={`Fix ${c.t} in People`}
                      onClick={() => {
                        toast({ title: c.id === 'cp1' ? "Mark each parent's OK" : 'Mark training done', message: c.id === 'cp1' ? 'Open each person who is missing one.' : 'Open each tutor once they finish it.', tone: 'brand' });
                        goTab && goTab('people');
                      }}
                      className={cx(H.secondary, H.press)}
                      style={S('display:inline-flex;align-items:center;padding:6px 10px;border-radius:7px;border:1px solid #E8E1D9;background:#fff;font:500 12px/1 Geist;color:#57504A;cursor:pointer;transition:background .16s ease')}
                    >
                      Fix in People
                    </Pressable>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="vu-2col" style={S(`display:grid;grid-template-columns:${p.disputes.length ? '1fr 1fr' : '1fr'};gap:16px`)}>
          <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
              <SectionLabel>Incident log</SectionLabel>
              <Pressable label="File an incident" onClick={file} className={cx(H.secondary, H.press)} style={S(BTN_BRAND)}>
                <Icon name="plus" size={14} />
                File an incident
              </Pressable>
            </div>
            <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:12px')}>
              {p.incidents.length ? (
                p.incidents.map((i) => (
                  <div key={i.id} style={S('padding:14px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                    <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
                      <div style={S('font:500 13px/1.2 Geist')}>{i.t}</div>
                      <span style={s('padding:4px 8px;border-radius:6px;font:500 11px/1 Geist;flex:none', `background:${i.st === 'Closed' ? '#EAF3EC' : '#FDF3E7'}`, `color:${i.st === 'Closed' ? '#3F6B4E' : '#8A5A20'}`)}>{i.st}</span>
                    </div>
                    <div className="vu-break" style={S('margin-top:7px;font:450 12px/1.45 Geist;color:#6B635C')}>{i.note}</div>
                    <div style={S('margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:10px')}>
                      <div style={S('font:450 11px/1.3 Geist;color:#A19891')}>
                        {i.d}, {i.who}
                      </div>
                      {i.st !== 'Closed' ? (
                        <Pressable
                          label={`Close incident: ${i.t}`}
                          onClick={() => {
                            closeIncident(p.id, i.id);
                            toast({ title: 'Incident closed', tone: 'ok' });
                          }}
                          className={H.link}
                          style={S('font:500 12px/1 Geist;color:#C2603C;cursor:pointer')}
                        >
                          Close
                        </Pressable>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div style={S('font:450 13px/1.5 Geist;color:#8A8179')}>No incidents filed.</div>
              )}
            </div>
          </div>

          {p.disputes.length ? (
            <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
              <SectionLabel>Hour disputes</SectionLabel>
              <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:12px')}>
                {p.disputes.map((d) => (
                  <div key={d.id} style={S('padding:14px;border-radius:12px;border:1px solid #EFE3DC;background:#FAF6F3')}>
                    <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
                      <div style={S('font:500 13px/1.2 Geist')}>{d.n}, {d.d}</div>
                      <span style={s('padding:4px 8px;border-radius:6px;font:500 11px/1 Geist;flex:none', `background:${d.st === 'Open' ? '#F5E7E0' : '#EAF3EC'}`, `color:${d.st === 'Open' ? '#A8482A' : '#3F6B4E'}`)}>{d.st}</span>
                    </div>
                    <div style={S('margin-top:7px;font:450 12px/1.45 Geist;color:#6B635C')}>{d.claim}</div>
                    {d.st === 'Open' ? (
                      <div style={S('margin-top:10px;display:flex;gap:8px')}>
                        <Pressable
                          label={`Uphold ${d.n}'s dispute`}
                          onClick={() => {
                            resolveDispute(p.id, d.id, 'upheld', 'Upheld. Hours to be corrected in Attendance.');
                            toast({ title: 'Dispute upheld', message: `Change ${d.n}'s hours in Attendance.`, tone: 'ok' });
                          }}
                          className={cx(H.secondary, H.press)}
                          style={S('display:inline-flex;align-items:center;padding:6px 10px;border-radius:8px;border:1px solid #E4DDD4;background:#fff;font:500 12px/1 Geist;color:#332D28;cursor:pointer')}
                        >
                          Uphold
                        </Pressable>
                        <Pressable
                          label={`Decline ${d.n}'s dispute`}
                          onClick={() => {
                            resolveDispute(p.id, d.id, 'declined', 'Declined. The original hours stand.');
                            toast({ title: 'Dispute declined', message: 'The original hours stand.', tone: 'brand' });
                          }}
                          className={cx(H.secondary, H.press)}
                          style={S('display:inline-flex;align-items:center;padding:6px 10px;border-radius:8px;border:1px solid #E4DDD4;background:#fff;font:500 12px/1 Geist;color:#8A8179;cursor:pointer')}
                        >
                          Decline
                        </Pressable>
                      </div>
                    ) : d.resolvedNote ? (
                      <div style={S('margin-top:8px;font:450 12px/1.45 Geist;color:#8A8179')}>{d.resolvedNote}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div style={S('display:flex;flex-direction:column;gap:14px')}>
        <div style={S(CARD)}>
          <SectionLabel>Audit log</SectionLabel>
          <div style={S('margin-top:12px;display:flex;flex-direction:column')}>
            {p.auditLog.slice(0, auditAll ? 60 : 5).map((a) => (
              <div key={a.id} style={S('padding:11px 0;border-bottom:1px solid #F1EBE4')}>
                <div style={S('font:450 13px/1.4 Geist;color:#332D28')}>{a.t}</div>
                <div style={S('margin-top:5px;font:450 11px/1.3 Geist;color:#A19891')}>
                  {a.who}, {a.w}
                </div>
              </div>
            ))}
          </div>
          {p.auditLog.length > 5 ? (
            <Pressable
              label={auditAll ? 'Show fewer audit entries' : 'Show the full audit log'}
              onClick={() => setParam({ audit: auditAll ? null : 'all' })}
              className={H.link}
              style={S('margin-top:12px;font:500 12px/1 Geist;color:#C2603C;cursor:pointer;width:max-content')}
            >
              {auditAll ? 'Show less' : `Show all ${p.auditLog.length}`}
            </Pressable>
          ) : null}
        </div>
      </div>
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
  let t = { bg: '#EAF3EC', color: '#3F6B4E' };
  if (!total) {
    trend = 'No shifts yet';
    t = { bg: '#F6F2EE', color: '#6B635C' };
  } else if (show < 70) {
    trend = `${total - attended} missed`;
    t = { bg: '#F5E7E0', color: '#A8482A' };
  } else if (show < 100 || late > 1) {
    trend = 'Watch';
    t = { bg: '#FDF3E7', color: '#8A5A20' };
  }
  return { id: person.id, n: person.n, slug: person.slug, show: total ? `${show}%` : '-', late: String(late), score: avg, trend, bg: t.bg, color: t.color };
}

function IncidentForm({ api, project }) {
  const [f, setF] = useState({ t: '', note: '', d: 'Today' });
  const [err, setErr] = useState({});
  const contact = project.sponsor && project.sponsor.name ? project.sponsor.name : 'your organization';
  return (
    <div>
      <Field label="What happened" value={f.t} onChange={(v) => setF((x) => ({ ...x, t: v }))} maxLength={90} required error={err.t} placeholder="e.g. Scraped knee at the supply table" />
      <div style={S('margin-top:14px')}>
        <label htmlFor="inc-note" style={S('font:500 12px/1 Geist;color:#57504A')}>What you did about it</label>
        <textarea
          id="inc-note"
          value={f.note}
          onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))}
          maxLength={400}
          placeholder="e.g. Cleaned and bandaged it, called a parent"
          className={H.input}
          style={S('margin-top:8px;display:block;width:100%;padding:14px;border-radius:12px;border:1px solid #E8E1D9;background:#FCFAF8;min-height:100px;font:450 14px/1.55 Geist;color:#332D28')}
        />
        {err.note ? <div className="vu-err">{err.note}</div> : null}
      </div>
      <div style={S('margin-top:14px;padding:12px 14px;border-radius:11px;background:#FDF3E7;border:1px solid #F3E3CD;font:450 12px/1.5 Geist;color:#8A5A20')}>
        Nobody is notified from here. If someone got hurt or a parent was called, tell {contact} today.
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(MODAL_CANCEL)}>
          Cancel
        </Pressable>
        <Pressable
          label="File incident"
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
          className={cx(H.primary, H.press)}
          style={S(MODAL_PRIMARY)}
        >
          File incident
        </Pressable>
      </div>
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
      setThreads(out);
      setFailed(false);
    } catch (err) {
      console.error('[lead] could not load volunteer messages', err);
      setFailed(true);
      setThreads((cur) => cur || []);
    }
  }, [listingId]);
  useEffect(() => {
    load();
    const timer = setInterval(load, THREAD_POLL_MS);
    return () => clearInterval(timer);
  }, [load]);
  return { threads, failed, load };
}

const THREAD_ROW = 'display:block;width:100%;text-align:left;padding:14px 18px;border-bottom:1px solid #F1EBE4;cursor:pointer;transition:background .16s ease';
const UNREAD_BADGE = 'min-width:16px;height:16px;padding:0 5px;border-radius:8px;background:#C2603C;color:#fff;font:600 9px/16px Geist;text-align:center';

function ThreadRow({ name, unread, when, preview, on, onClick }) {
  return (
    <Pressable
      label={`${name}${unread ? `, ${unread} unread` : ''}`}
      current={on ? 'true' : undefined}
      onClick={onClick}
      className={cx(H.row, H.press)}
      style={s(THREAD_ROW, on ? 'background:#FAF6F3' : '')}
    >
      <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px')}>
        <div className="vu-trunc" style={S('font:500 13px/1.2 Geist')}>{name}</div>
        <div style={S('display:flex;align-items:center;gap:7px;flex:none')}>
          {unread ? <span style={S(UNREAD_BADGE)}>{unread}</span> : null}
          <div style={S('font:450 11px/1 Geist;color:#A19891')}>{when}</div>
        </div>
      </div>
      <div className="vu-trunc" style={S('margin-top:6px;font:450 12px/1.4 Geist;color:#8A8179')}>{preview}</div>
    </Pressable>
  );
}

export function MessagesTab({ p, params, setParam }) {
  const { threads: vol, failed: volFailed, load: loadVol } = useVolunteerThreads(p.listingId);
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
      <div style={S('margin-top:22px')}>
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
    toast({ title: 'Saved', message: 'Members don\'t see this. Post on the board above to reach them.', tone: 'ok', timeout: 3200 });
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

  return (
    <div className="vu-split" style={S('display:grid;grid-template-columns:320px 1fr;gap:20px;align-items:start')}>
      <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
        <div style={S('padding:14px 18px;border-bottom:1px solid #F1EBE4')}>
          <SectionLabel>From volunteers</SectionLabel>
        </div>
        {vol === null ? (
          <div role="status" style={S('padding:14px 18px;border-bottom:1px solid #F1EBE4;font:450 13px/1.4 Geist;color:#8A8179')}>Loading messages</div>
        ) : volFailed && !volThreads.length ? (
          <div role="alert" style={S('padding:14px 18px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font:450 13px/1.4 Geist;color:#57504A')}>
            Couldn't load volunteer messages.
            <Pressable label="Try again" onClick={loadVol} className={cx(H.secondary, H.press)} style={S(BTN_PLAIN)}>Try again</Pressable>
          </div>
        ) : !volThreads.length ? (
          <div style={S('padding:14px 18px;border-bottom:1px solid #F1EBE4;font:450 13px/1.4 Geist;color:#8A8179')}>When a volunteer messages you, the thread shows up here.</div>
        ) : (
          volThreads.map((t) => {
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
          })
        )}
        {p.threads.length ? (
          <>
            <div style={S('padding:14px 18px;border-bottom:1px solid #F1EBE4')}>
              <SectionLabel>Your notes</SectionLabel>
            </div>
            {p.threads.map((t) => (
              <ThreadRow
                key={t.id}
                name={t.n}
                unread={t.unread}
                when={t.when}
                preview={t.messages.length ? t.p : 'Nothing saved yet'}
                on={t.id === threadId}
                onClick={() => setParam({ thread: t.id })}
              />
            ))}
          </>
        ) : null}
      </div>

      {volSel ? (
        <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;display:flex;flex-direction:column;min-width:0')}>
          <div style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;min-width:0')}>
            <div className="vu-trunc" style={S('font:600 15px/1.2 Geist;letter-spacing:-0.02em')}>{volName(volSel)}</div>
            <div style={S('margin-top:5px;font:450 12px/1.3 Geist;color:#8A8179')}>{APP_STATUS_LABEL[volSel.app.status] || 'Applied'}</div>
          </div>
          <div style={S('padding:16px 20px')}>
            <MessageThread key={volSel.app.id} applicationId={volSel.app.id} recipientId={volSel.app.applicant_id} recipientName={volName(volSel)} />
          </div>
        </div>
      ) : th ? (
        <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;min-height:360px;display:flex;flex-direction:column;min-width:0')}>
          <div className="vu-stack vu-stack-gap" style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:12px')}>
            <div style={S('min-width:0')}>
              <div className="vu-trunc" style={S('font:600 15px/1.2 Geist;letter-spacing:-0.02em')}>{th.n}</div>
              <div style={S('margin-top:5px;font:450 12px/1.3 Geist;color:#8A8179')}>Only you see this thread.</div>
            </div>
            <Pressable label="Insert a message template" expanded={false} onClick={templates} className={cx(H.secondary, H.press)} style={S(BTN_BRAND)}>
              Templates
              <Icon name="chevron-down" size={13} />
            </Pressable>
          </div>

          <div ref={scrollRef} style={S('padding:20px;display:flex;flex-direction:column;gap:14px;flex:1;max-height:440px;overflow-y:auto')}>
            {th.messages.length ? (
              th.messages.map((m) => (
                <div key={m.id} style={S('max-width:460px;align-self:flex-start')}>
                  {m.who !== 'me' ? <div style={S('margin-bottom:5px;font:500 11px/1 Geist;color:#A19891')}>{m.whoName || 'Them'}</div> : null}
                  <div className="vu-break" style={s('padding:14px 16px;border-radius:12px;font:450 14px/1.55 Geist;color:#332D28', `background:${m.who === 'me' ? '#FCFAF8' : '#FAF6F3'}`, `border:1px solid ${m.who === 'me' ? '#F1EBE4' : '#EFE3DC'}`)}>
                    {m.body}
                  </div>
                  <div style={S('margin-top:5px;font:450 11px/1 Geist;color:#A19891')}>{m.when}</div>
                </div>
              ))
            ) : (
              <div style={S('margin:auto;text-align:center;max-width:320px')}>
                <div style={S('font:500 14px/1.3 Geist;color:#57504A')}>Nothing saved yet</div>
                <div style={S('margin-top:7px;font:450 13px/1.5 Geist;color:#8A8179')}>Draft an announcement here, then post it on the board above.</div>
              </div>
            )}
          </div>

          <div style={S('padding:16px 20px;border-top:1px solid #F1EBE4;display:flex;align-items:center;gap:12px')}>
            <input
              type="text"
              value={draft}
              placeholder="e.g. We meet at the side door"
              aria-label="Message"
              maxLength={600}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send();
              }}
              className={H.input}
              style={S('flex:1;min-width:0;padding:12px 14px;border-radius:11px;border:1px solid #E8E1D9;background:#FCFAF8;font:450 14px/1.15 Geist;color:#1A1714;transition:border-color .16s ease')}
            />
            <Pressable label="Save message" onClick={send} className={cx(H.primary, H.press)} style={S(`${BTN_PRIMARY};height:40px;padding:0 16px;font-size:14px`)}>
              Save
            </Pressable>
          </div>
        </div>
      ) : (
        <div role="status" style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;min-height:200px;display:flex;align-items:center;justify-content:center;font:450 13px/1.5 Geist;color:#8A8179')}>
          Loading messages
        </div>
      )}
    </div>
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

export function SettingsTab({ p }) {
  const rows = (p.settings || []).filter((r) => LIVE_SETTINGS[r.id]);

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
      body: "It comes off Discover and stops taking applications. Hours volunteers already logged aren't touched.",
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

  return (
    <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 320px;gap:20px;margin-top:22px;align-items:start')}>
      <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden;min-width:0')}>
        <div style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4')}>
          <SectionLabel>Project settings</SectionLabel>
        </div>
        {p.archived ? (
          <div style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;font:450 14px/1.4 Geist;color:#8A5A20;background:#FDF3E7')}>
            Archived. This project doesn't show on Discover.
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.id} style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:16px')}>
              <div style={S('min-width:0')}>
                <div style={S('font:500 14px/1.3 Geist;color:#332D28')}>{LIVE_SETTINGS[r.id]}</div>
                <div style={S('margin-top:4px;font:450 12px/1.4 Geist;color:#8A8179')}>{r.on ? 'Volunteers can find it by searching and open your join link.' : 'Hidden from Discover, and your join link is paused.'}</div>
              </div>
              <Toggle on={r.on} label={LIVE_SETTINGS[r.id]} onChange={() => toggle(r)} />
            </div>
          ))
        )}
        <div style={S('padding:18px 20px;display:flex;flex-wrap:wrap;gap:10px')}>
          <Pressable label="Edit project details" onClick={editDetails} className={cx(H.secondary, H.press)} style={S(BTN_BRAND)}>
            <Icon name="edit" size={14} />
            Edit project details
          </Pressable>
          <Pressable
            label={p.archived ? 'Project archived' : 'Archive project'}
            disabled={p.archived}
            onClick={archive}
            className={cx(p.archived ? '' : H.danger, H.press)}
            style={s(BTN_DANGER, p.archived ? DISABLED : '')}
          >
            {p.archived ? 'Archived' : 'Archive project'}
          </Pressable>
        </div>
      </div>

      <div style={S('display:flex;flex-direction:column;gap:14px;min-width:0')}>
        <ShareLink p={p} tone="card" />
      </div>
    </div>
  );
}

function DetailsForm({ api, project }) {
  const [f, setF] = useState({ name: project.name, site: project.site, mission: project.mission || '', bio: project.bio || '' });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const area = 'margin-top:8px;display:block;width:100%;padding:14px;border-radius:12px;border:1px solid #E8E1D9;background:#FCFAF8;font:450 14px/1.55 Geist;color:#332D28';
  return (
    <div>
      <Field label="Project name" value={f.name} onChange={(v) => setF((x) => ({ ...x, name: v }))} maxLength={60} required error={err.name} />
      <div style={S('margin-top:14px')}>
        <Field label="Where it happens" value={f.site} onChange={(v) => setF((x) => ({ ...x, site: v }))} maxLength={90} required error={err.site} placeholder="e.g. Rivertown Public Library, Branch 4" />
      </div>
      <div style={S('margin-top:14px')}>
        <label htmlFor="pd-mission" style={S('font:500 12px/1 Geist;color:#57504A')}>What volunteers do</label>
        <textarea id="pd-mission" value={f.mission} maxLength={240} onChange={(e) => setF((x) => ({ ...x, mission: e.target.value }))} className={H.input} style={S(`${area};min-height:84px`)} />
      </div>
      <div style={S('margin-top:14px')}>
        <label htmlFor="pd-bio" style={S('font:500 12px/1 Geist;color:#57504A')}>Details</label>
        <textarea id="pd-bio" value={f.bio} maxLength={400} onChange={(e) => setF((x) => ({ ...x, bio: e.target.value }))} className={H.input} style={S(`${area};min-height:70px`)} />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(MODAL_CANCEL)}>
          Cancel
        </Pressable>
        <Pressable
          label="Save details"
          disabled={busy}
          onClick={async () => {
            const e = {};
            if (!f.name.trim()) e.name = 'Enter a project name.';
            if (!f.site.trim()) e.site = 'Enter where it happens.';
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
          className={cx(H.primary, H.press)}
          style={s(MODAL_PRIMARY, busy ? DISABLED : '')}
        >
          {busy ? 'Saving' : 'Save details'}
        </Pressable>
      </div>
    </div>
  );
}
