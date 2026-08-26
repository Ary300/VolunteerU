'use client';

/* ==========================================================================
   Tabs.jsx, Attendance, Applications, Hours, Quality, Messages, Settings
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Pressable, EmptyState, Toggle, Field, Select } from '../ui.jsx';
import { openModal, confirmDialog, toast, menuFromEvent } from '../../lib/overlays.js';
import CrossApplications from '../CrossApplications.jsx';
import {
  attendanceFor, attendanceStats, setAttendance, markAllPresent, postAttendance,
  pendingApplications, decideApplication, reopenApplication, updateScreeningQuestions,
  pendingHours, cleanHours, approveHours, adjustHours,
  recomputeCompliance, resolveDispute, fileIncident, closeIncident, resolveEscalation,
  sendMessage, readThread, toggleProjectSetting, inviteCoLead, removeCoLead, archiveProject,
  updateProject, rosterCSV, download, transcriptCSV, ATTEND_TONE, GRADE_TONE, tone,
} from '../../lib/db.js';
import { GRADE_SCALE, messageTemplates } from '../../lib/seed.js';

const MONO = "'Geist Mono',monospace";
const ATTEND_OPTIONS = ['Present', 'Late', 'Absent', 'Excused'];

/* ==========================================================================
   Attendance
   ========================================================================== */

export function AttendanceTab({ p, params, setParam, goTab }) {
  if (!p.attendanceSessions.length) {
    return (
      <div style={S('margin-top:22px')}>
        <EmptyState
          title="No sessions to take attendance for"
          body="Once a scheduled session starts, its roster shows up here for check-in, hours and scores."
          cta="Open sessions"
          onCta={() => goTab('shifts')}
        />
      </div>
    );
  }

  const openSession = p.attendanceSessions.find((x) => !x.posted) || p.attendanceSessions[0];
  const sessionParam = params.get('session');
  const sessionId = sessionParam && p.attendanceSessions.some((x) => x.id === sessionParam) ? sessionParam : openSession.id;
  const meta = p.attendanceSessions.find((x) => x.id === sessionId);
  const rows = attendanceFor(p, sessionId);
  const stats = attendanceStats(rows);
  const unmarked = rows.filter((r) => r.st === 'Unmarked').length;
  const openEscalations = p.escalations.filter((e) => !e.resolved);
  const locked = meta.posted;

  function changeStatus(e, row) {
    menuFromEvent(
      e,
      ATTEND_OPTIONS.map((v) => ({ key: v, label: v, checked: row.st === v })),
      (v) => {
        if (v === row.st) return;
        if (v === 'Absent' && row.hrs > 0) {
          confirmDialog({
            title: `Mark ${row.n} absent?`,
            body: 'Their logged hours for this session drop to zero and the score is cleared.',
            confirmLabel: 'Mark absent',
          }).then((ok) => {
            if (ok) {
              setAttendance(p.id, sessionId, row.personId, { st: v }, 'marked absent by lead');
              toast({ title: `${row.n} marked absent`, tone: 'ok' });
            }
          });
          return;
        }
        setAttendance(p.id, sessionId, row.personId, { st: v });
        toast({ title: `${row.n}: ${v}`, tone: 'ok', timeout: 2000 });
      }
    );
  }

  function changeGrade(e, row) {
    menuFromEvent(
      e,
      [...GRADE_SCALE.map((g) => ({ key: g.t, label: g.t, checked: row.grade === g.t })), { key: 'Not scored', label: 'Not scored', checked: row.grade === 'Not scored' }],
      (v) => {
        if (v === row.grade) return;
        setAttendance(p.id, sessionId, row.personId, { grade: v });
        toast({ title: `${row.n} scored ${v}`, tone: 'ok', timeout: 2000 });
      }
    );
  }

  function editHours(row) {
    openModal({
      title: `Hours for ${row.n}`,
      subtitle: 'A manual change is logged with your reason and shows as edited on the student record.',
      Body: function HoursBody({ api }) {
        return <HoursEditForm api={api} row={row} onSave={(hrs, reason) => setAttendance(p.id, sessionId, row.personId, { hrs }, reason)} />;
      },
    });
  }

  function editNote(row) {
    openModal({
      title: `Lead note on ${row.n}`,
      subtitle: 'This posts to their record with your name attached.',
      Body: function NoteBody({ api }) {
        return <SimpleNoteForm api={api} initial={row.note} onSave={(t) => setAttendance(p.id, sessionId, row.personId, { note: t })} />;
      },
    });
  }

  async function post() {
    if (unmarked) {
      toast({ title: `${unmarked} still unmarked`, message: 'Every volunteer needs a status before you can post.', tone: 'warn' });
      return;
    }
    const ok = await confirmDialog({
      title: 'Post attendance to student records?',
      body: 'Hours, punctuality and your score write to each volunteer profile with your name attached. This cannot be undone from here.',
      confirmLabel: 'Post to profiles',
      tone: 'brand',
    });
    if (!ok) return;
    try {
      const n = postAttendance(p.id, sessionId);
      toast({ title: `Posted to ${n} records`, message: 'Students can see their hours immediately.', tone: 'ok' });
    } catch (err) {
      toast({ title: 'Could not post', message: err.message, tone: 'danger' });
    }
  }

  return (
    <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 320px;gap:20px;margin-top:22px;align-items:start')}>
      <div style={S('display:flex;flex-direction:column;gap:16px')}>
        <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
          <div className="vu-stack vu-stack-gap" style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:16px')}>
            <div className="vu-scroll-x" style={S('display:flex;gap:8px')}>
              {p.attendanceSessions.map((x) => {
                const on = x.id === sessionId;
                return (
                  <Pressable
                    key={x.id}
                    label={`${x.d}, ${x.m}`}
                    pressed={on}
                    onClick={() => setParam({ session: x.id })}
                    className={cx(on ? '' : H.chip, H.press)}
                    style={s('padding:9px 13px;border-radius:10px;cursor:pointer;white-space:nowrap;transition:background .16s ease, border-color .16s ease', `border:1px solid ${on ? '#1F1B18' : '#E8E1D9'}`, `background:${on ? '#1F1B18' : '#FFFFFF'}`)}
                  >
                    <div style={s('font:500 13px/1 Geist', `color:${on ? '#FFFFFF' : '#332D28'}`)}>{x.d}</div>
                    <div style={s(`margin-top:5px;font:450 10px/1 ${MONO}`, `color:${on ? '#CFC7BF' : '#8A8179'}`)}>{x.m}</div>
                  </Pressable>
                );
              })}
            </div>
            <div style={S('display:flex;gap:9px;flex:none')}>
              <Pressable
                label="Mark everyone present"
                disabled={locked}
                onClick={() => {
                  const n = markAllPresent(p.id, sessionId);
                  toast(n ? { title: `${n} marked present`, message: 'Adjust anyone who was late or left early.', tone: 'ok' } : { title: 'Everyone is already marked', tone: 'brand' });
                }}
                className={cx(H.secondary, H.press)}
                style={S('display:inline-flex;align-items:center;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
              >
                Mark all present
              </Pressable>
              <Pressable
                label={locked ? 'Already posted' : 'Post attendance to student profiles'}
                disabled={locked}
                onClick={post}
                className={cx(locked ? '' : H.primary, H.press)}
                style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease')}
              >
                <span aria-hidden="true" style={S('font-size:10px;opacity:.9')}>▷</span>
                {locked ? 'Posted' : 'Post to profiles'}
              </Pressable>
            </div>
          </div>

          <div className="vu-table-wrap">
            <div>
              <div style={S(`display:grid;grid-template-columns:1.7fr 1fr 1.3fr .6fr 1fr 1.5fr;gap:12px;padding:12px 20px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>
                <div>Volunteer</div><div>Attendance</div><div>In and out</div><div>Hours</div><div>Score</div><div>Lead note</div>
              </div>
              {rows.length ? (
                rows.map((a) => {
                  const st = tone(ATTEND_TONE, a.st);
                  const g = GRADE_TONE[a.grade] || GRADE_TONE['Not scored'];
                  return (
                    <div key={a.personId} className={H.row} style={S('display:grid;grid-template-columns:1.7fr 1fr 1.3fr .6fr 1fr 1.5fr;gap:12px;padding:14px 20px;border-bottom:1px solid #F1EBE4;align-items:center;transition:background .16s ease')}>
                      <div style={S('display:flex;align-items:center;gap:11px;min-width:0')}>
                        <div style={S('width:30px;height:30px;border-radius:50%;overflow:hidden;flex:none')}>
                          <ImageSlot src={''} shape="circle" placeholder="face" />
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
                          style={s(`display:inline-block;padding:5px 9px;border-radius:7px;background:${st.stBg};font:500 11px/1 ${MONO};color:${st.stColor}`, `cursor:${locked ? 'default' : 'pointer'}`)}
                        >
                          {a.st}
                        </Pressable>
                      </div>
                      <div style={S('font:450 12px/1.3 Geist;color:#57504A')}>
                        {a.inOut}
                        {a.edited ? <span title="Edited by the lead" style={S('color:#8A5A20')}> ·edited</span> : null}
                      </div>
                      <Pressable
                        label={`${a.hrs} hours for ${a.n}. Adjust.`}
                        disabled={locked}
                        onClick={() => editHours(a)}
                        className={locked ? '' : H.toBrand}
                        style={s(`font:500 13px/1 ${MONO}`, `cursor:${locked ? 'default' : 'pointer'}`)}
                      >
                        {Number(a.hrs).toFixed(1)}
                      </Pressable>
                      <div>
                        <Pressable
                          label={`Score for ${a.n} is ${a.grade}. Change.`}
                          disabled={locked}
                          expanded={false}
                          onClick={(e) => changeGrade(e, a)}
                          className={locked ? '' : H.link}
                          style={s(`display:inline-block;padding:5px 9px;border-radius:7px;background:${g.gBg};font:500 11px/1 ${MONO};color:${g.gColor}`, `cursor:${locked ? 'default' : 'pointer'}`)}
                        >
                          {a.grade}
                        </Pressable>
                      </div>
                      <Pressable
                        label={`Note for ${a.n}`}
                        disabled={locked}
                        onClick={() => editNote(a)}
                        className={locked ? '' : H.toInk}
                        style={s('font:450 12px/1.4 Geist;color:#6B635C;transition:color .16s ease', `cursor:${locked ? 'default' : 'pointer'}`)}
                      >
                        {a.note || (locked ? '-' : 'Add a note')}
                      </Pressable>
                    </div>
                  );
                })
              ) : (
                <div style={S('padding:8px 20px 20px')}>
                  <EmptyState compact title="Nobody on this session" body="Add crew to the roster and they appear here at check-in." cta="Open roster" onCta={() => goTab('people')} />
                </div>
              )}
            </div>
          </div>

          <div className="vu-stack vu-stack-gap" style={S('padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:20px;font:450 12px/1.4 Geist;color:#8A8179')}>
            <div>
              {unmarked ? `${unmarked} still unmarked. ` : ''}
              Times come from the room geofence. A manual change is logged with a reason and shows as edited on the student record.
            </div>
            <Pressable label="Open the audit log" onClick={() => goTab('quality')} className={H.link} style={S('font:500 12px/1 Geist;color:#C2603C;cursor:pointer;white-space:nowrap')}>
              Audit log
            </Pressable>
          </div>
        </div>

        <div className="vu-2col" style={S('display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
          <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Session debrief</div>
            <DebriefForm p={p} />
          </div>
          <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Scoring scale</div>
            <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:10px')}>
              {GRADE_SCALE.map((g) => (
                <div key={g.t} style={S('padding:12px 14px;border-radius:11px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                  <div style={S('font:500 13px/1.2 Geist')}>{g.t}</div>
                  <div style={S('margin-top:5px;font:450 12px/1.3 Geist;color:#8A8179')}>{g.m}</div>
                </div>
              ))}
            </div>
            <div style={S('margin-top:14px;font:450 12px/1.5 Geist;color:#8A8179')}>
              Scores show on the student record and to organizations they apply to. Students can request a review within 14 days.
            </div>
          </div>
        </div>
      </div>

      <div style={S('display:flex;flex-direction:column;gap:14px')}>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>This session</div>
          <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:11px')}>
            {stats.map((x) => (
              <div key={x.l} style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;font:450 13px/1 Geist;color:#57504A')}>
                <span>{x.l}</span>
                <span style={S('color:#1A1714;font-weight:500')}>{x.v}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #EFE3DC;background:#FAF6F3')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Follow ups</div>
          <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:10px')}>
            {openEscalations.length ? (
              openEscalations.map((e) => (
                <div key={e.id} style={S('padding:12px 14px;border-radius:11px;background:#fff;border:1px solid #EFE3DC')}>
                  <div style={S('font:500 13px/1.2 Geist')}>
                    {e.n} · {e.step}
                  </div>
                  <div style={S('margin-top:6px;font:450 12px/1.4 Geist;color:#6B635C')}>{e.action}</div>
                  <div style={S('margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:10px')}>
                    <div style={S(`font:500 10px/1 ${MONO};color:#A8482A`)}>DUE {e.due}</div>
                    <Pressable
                      label={`Mark ${e.n} follow up done`}
                      onClick={() => {
                        resolveEscalation(p.id, e.id);
                        toast({ title: 'Follow up closed', message: `${e.n} · ${e.step}`, tone: 'ok' });
                      }}
                      className={H.link}
                      style={S('font:500 11px/1 Geist;color:#C2603C;cursor:pointer')}
                    >
                      Mark done
                    </Pressable>
                  </div>
                </div>
              ))
            ) : (
              <div style={S('padding:12px 14px;border-radius:11px;background:#fff;border:1px solid #EFE3DC;font:450 12px/1.5 Geist;color:#6B635C')}>
                Nothing outstanding. Misses and early leaves open a follow up here automatically.
              </div>
            )}
          </div>
        </div>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Posts to student records</div>
          <div style={S('margin-top:12px;font:450 13px/1.5 Geist;color:#6B635C')}>
            Publishing writes hours, punctuality and your score to each volunteer profile with your name attached.
          </div>
        </div>
      </div>
    </div>
  );
}

function DebriefForm({ p }) {
  const [worked, setWorked] = useState(p.debrief.worked);
  const [fix, setFix] = useState(p.debrief.fix);
  const saveRef = useRef(null);

  const save = (patch) => {
    clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => updateProject(p.id, { debrief: { worked, fix, ...patch } }), 500);
  };

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
            placeholder="What you would do the same way again."
            className={H.input}
            style={S('margin-top:7px;display:block;width:100%;padding:12px 14px;border-radius:11px;border:1px solid #E8E1D9;background:#FCFAF8;font:450 13px/1.5 Geist;color:#332D28;min-height:60px;transition:border-color .16s ease')}
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
            placeholder="One concrete change for next session."
            className={H.input}
            style={S('margin-top:7px;display:block;width:100%;padding:12px 14px;border-radius:11px;border:1px solid #E8E1D9;background:#FCFAF8;font:450 13px/1.5 Geist;color:#332D28;min-height:60px;transition:border-color .16s ease')}
          />
        </div>
      </div>
      <div style={S('margin-top:14px;display:flex;gap:8px;flex-wrap:wrap')}>
        <Pressable
          label="Save the debrief"
          onClick={() => {
            if (!worked.trim() && !fix.trim()) {
              toast({ title: 'Nothing to save yet', message: 'Write at least one line first.', tone: 'warn' });
              return;
            }
            updateProject(p.id, { debrief: { worked, fix } });
            toast({ title: 'Debrief saved', message: 'Kept on your project record, share it with your organization anytime.', tone: 'ok' });
          }}
          className={cx(H.secondary, H.press)}
          style={S('display:inline-flex;align-items:center;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease')}
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
        <Field label="Geofence says" value={row.inOut} readOnly />
      </div>
      <div style={S('margin-top:14px')}>
        <Field label="Reason for the change" value={reason} onChange={setReason} placeholder="Left early for a bus" maxLength={90} required error={err.reason} />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>
          Cancel
        </Pressable>
        <Pressable
          label="Save hours"
          onClick={() => {
            const e = {};
            const n = Number(hrs);
            if (Number.isNaN(n) || n < 0 || n > 24) e.hrs = 'Between 0 and 24 hours.';
            if (!reason.trim()) e.reason = 'A manual change needs a reason.';
            setErr(e);
            if (Object.keys(e).length) return;
            onSave(Math.round(n * 10) / 10, reason.trim());
            api.close();
            toast({ title: `${row.n}: ${Math.round(n * 10) / 10} hrs`, message: 'Logged on the audit trail.', tone: 'ok' });
          }}
          className={cx(H.primary, H.press)}
          style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
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
        placeholder="One line the student will see on their record."
        className={H.input}
        style={S('display:block;width:100%;padding:14px;border-radius:12px;border:1px solid #E8E1D9;background:#FCFAF8;min-height:100px;font:450 14px/1.55 Geist;color:#332D28')}
      />
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>
          Cancel
        </Pressable>
        <Pressable
          label="Save note"
          onClick={() => {
            onSave(t.trim());
            api.close();
            toast({ title: 'Note saved', tone: 'ok', timeout: 2200 });
          }}
          className={cx(H.primary, H.press)}
          style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
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

export function ApplicationsTab({ p, params, setParam, goTab, onCopyLink }) {
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
        body: 'They are told the position is filled. You can undo this while the position is still open.',
        confirmLabel: 'Decline',
      });
      if (!ok) return;
    }
    const res = decideApplication(p.id, a.id, decision);
    if (res && res.already) {
      toast({ title: 'Already decided', message: `${a.n} was ${a.status}.`, tone: 'warn' });
      return;
    }
    toast({
      title: decision === 'accepted' ? `${a.n} accepted` : decision === 'waitlisted' ? `${a.n} waitlisted` : `${a.n} declined`,
      message: decision === 'accepted' ? 'They are on the roster and get the session details.' : undefined,
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
      subtitle: `${a.s} · applied ${a.when}`,
      body: (
        <div style={S('display:flex;flex-direction:column;gap:16px')}>
          {p.screeningQuestions.map((q, i) => (
            <div key={q}>
              <div style={S('font:500 13px/1.35 Geist;color:#57504A')}>
                {i + 1}. {q}
              </div>
              <div className="vu-break" style={S('margin-top:7px;padding:12px 14px;border-radius:11px;background:#FCFAF8;border:1px solid #F1EBE4;font:450 14px/1.55 Geist;color:#332D28')}>
                {(a.answers && a.answers[i]) || 'No answer given.'}
              </div>
            </div>
          ))}
          <div style={S('display:flex;gap:6px;flex-wrap:wrap')}>
            {a.flags.map((f) => (
              <span key={f} style={S(`padding:5px 9px;border-radius:7px;background:#FDF3E7;font:500 11px/1 ${MONO};color:#8A5A20`)}>
                {f}
              </span>
            ))}
          </div>
        </div>
      ),
      footer: (api) =>
        a.status === 'pending' ? (
          <>
            <Pressable
              label={`Decline ${a.n}`}
              onClick={() => {
                api.close();
                decide(a, 'declined');
              }}
              className={cx(H.secondary, H.press)}
              style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;color:#8A8179;cursor:pointer')}
            >
              Decline
            </Pressable>
            <Pressable
              label={`Accept ${a.n}`}
              onClick={() => {
                api.close();
                decide(a, 'accepted');
              }}
              className={cx(H.primary, H.press)}
              style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
            >
              Accept
            </Pressable>
          </>
        ) : null,
    });
  }

  function editQuestions() {
    openModal({
      title: 'Screening questions',
      subtitle: 'Applicants answer these before you see them. Keep it to three.',
      Body: function QBody({ api }) {
        return <QuestionsForm api={api} project={p} />;
      },
    });
  }

  return (
    <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 320px;gap:20px;margin-top:22px;align-items:start')}>
      <div style={S('display:flex;flex-direction:column;gap:14px')}>
        {/* Real cross-user applications from published listings show here first;
            when none are pending it shows a helpful empty state (this is the tab
            named "Applications", so it should never be blank). */}
        <CrossApplications
          emptyState={all.length ? null : (
            <EmptyState
              title="No applications waiting"
              body="Share your join link to bring in volunteers. New applications land here the moment someone applies; accepted volunteers move to your roster."
              cta="Copy join link"
              onCta={() => onCopyLink()}
            />
          )}
        />
        {all.length ? (
          <div className="vu-scroll-x" style={S('display:flex;gap:8px')}>
            {[
              { k: 'pending', l: 'Waiting on you' },
              { k: 'accepted', l: 'Accepted' },
              { k: 'waitlisted', l: 'Waitlisted' },
              { k: 'declined', l: 'Declined' },
              { k: 'all', l: 'All' },
            ].map((f) => {
              const on = filter === f.k;
              return (
                <Pressable
                  key={f.k}
                  label={`${f.l}, ${counts[f.k]}`}
                  pressed={on}
                  onClick={() => setParam({ astatus: f.k === 'pending' ? null : f.k })}
                  className={cx(on ? '' : H.chip, H.press)}
                  style={s('padding:8px 13px;border-radius:9px;font:500 13px/1 Geist;cursor:pointer;white-space:nowrap;transition:background .16s ease, border-color .16s ease, color .16s ease', `border:1px solid ${on ? '#1F1B18' : '#E8E1D9'}`, `background:${on ? '#1F1B18' : '#FFFFFF'}`, `color:${on ? '#FFFFFF' : '#57504A'}`)}
                >
                  {f.l} <span style={S(`font:500 10px/1 ${MONO};opacity:.75`)}>{counts[f.k]}</span>
                </Pressable>
              );
            })}
          </div>
        ) : null}

        {rows.length ? (
          rows.map((a) => (
            <div key={a.id} style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
              <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:20px')}>
                <div style={S('display:flex;gap:13px;min-width:0')}>
                  <div style={S('width:44px;height:44px;border-radius:50%;overflow:hidden;flex:none')}>
                    <ImageSlot src={''} shape="circle" placeholder="face" />
                  </div>
                  <div style={S('min-width:0')}>
                    <div style={S('display:flex;align-items:center;gap:9px;flex-wrap:wrap')}>
                      <div style={S('font:600 16px/1.2 Geist;letter-spacing:-0.02em')}>{a.n}</div>
                      {a.status !== 'pending' ? (
                        <span
                          style={s(
                            `padding:4px 8px;border-radius:6px;font:500 10px/1 ${MONO};text-transform:uppercase`,
                            `background:${a.status === 'accepted' ? '#EAF3EC' : a.status === 'declined' ? '#F5E7E0' : '#F6F2EE'}`,
                            `color:${a.status === 'accepted' ? '#3F6B4E' : a.status === 'declined' ? '#A8482A' : '#6B635C'}`
                          )}
                        >
                          {a.status}
                        </span>
                      ) : null}
                    </div>
                    <div style={S('margin-top:5px;font:450 12px/1.3 Geist;color:#8A8179')}>
                      {a.s} · applied {a.when}
                    </div>
                    <div className="vu-break" style={S('margin-top:11px;font:450 14px/1.5 Geist;color:#332D28;max-width:520px')}>{a.note}</div>
                    <div style={S('margin-top:12px;display:flex;gap:6px;flex-wrap:wrap')}>
                      <span style={S(`padding:5px 9px;border-radius:7px;background:#F6F2EE;font:500 11px/1 ${MONO};color:#57504A`)}>{a.role}</span>
                      {a.flags.map((f) => (
                        <span key={f} style={S(`padding:5px 9px;border-radius:7px;background:#FDF3E7;font:500 11px/1 ${MONO};color:#8A5A20`)}>
                          {f}
                        </span>
                      ))}
                    </div>
                    <Pressable label={`Read ${a.n}'s answers`} onClick={() => answers(a)} className={H.link} style={S('margin-top:12px;font:500 12px/1 Geist;color:#C2603C;cursor:pointer;width:max-content')}>
                      Read their answers →
                    </Pressable>
                  </div>
                </div>
                <div style={S('display:flex;flex-direction:column;gap:8px;flex:none')}>
                  {a.status === 'pending' ? (
                    <>
                      <Pressable
                        label={`Accept ${a.n}`}
                        onClick={() => decide(a, 'accepted')}
                        className={cx(H.primary, H.press)}
                        style={S('display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;padding:0 14px;height:36px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease')}
                      >
                        <span aria-hidden="true" style={S('font-size:10px;opacity:.9')}>▷</span>
                        Accept
                      </Pressable>
                      <Pressable
                        label={`Waitlist ${a.n}`}
                        onClick={() => decide(a, 'waitlisted')}
                        className={cx(H.secondary, H.press)}
                        style={S('display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#57504A;cursor:pointer;transition:background .16s ease')}
                      >
                        Waitlist
                      </Pressable>
                      <Pressable
                        label={`Decline ${a.n}`}
                        onClick={() => decide(a, 'declined')}
                        className={cx(H.secondary, H.press)}
                        style={S('display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#8A8179;cursor:pointer;transition:background .16s ease')}
                      >
                        Decline
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      label={`Undo the decision for ${a.n}`}
                      onClick={() => {
                        reopenApplication(p.id, a.id);
                        toast({ title: 'Back in the queue', message: `${a.n} is waiting on you again.`, tone: 'ok' });
                      }}
                      className={cx(H.secondary, H.press)}
                      style={S('display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#57504A;cursor:pointer;transition:background .16s ease')}
                    >
                      Undo
                    </Pressable>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : all.length ? (
          <EmptyState
            title={filter === 'pending' ? 'Nothing waiting on you' : 'Nothing here'}
            body={filter === 'pending' ? 'Every application has a decision. New ones land here the moment a student applies.' : 'No applications with that status yet.'}
            cta={filter === 'pending' ? 'Copy recruit link' : 'Show all'}
            onCta={() => (filter === 'pending' ? onCopyLink() : setParam({ astatus: 'all' }))}
          />
        ) : null}
      </div>

      <div style={S('display:flex;flex-direction:column;gap:14px')}>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Screening questions</div>
          <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:10px;font:450 13px/1.45 Geist;color:#332D28')}>
            {p.screeningQuestions.length ? (
              p.screeningQuestions.map((q, i) => (
                <div key={q}>
                  {i + 1}. {q}
                </div>
              ))
            ) : (
              <div style={S('color:#8A8179')}>No questions yet. Applicants just send a note.</div>
            )}
          </div>
          <Pressable
            label="Edit screening questions"
            onClick={editQuestions}
            className={cx(H.secondary, H.press)}
            style={S('margin-top:14px;display:inline-flex;align-items:center;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
          >
            Edit questions
          </Pressable>
        </div>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #EFE3DC;background:#FAF6F3')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Rules in effect</div>
          <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:9px;font:450 13px/1.45 Geist;color:#57504A')}>
            {p.rules.map((r) => (
              <div key={r} style={S('display:flex;gap:9px')}>
                <span aria-hidden="true" style={S('color:#3F6B4E')}>✓</span>
                {r}
              </div>
            ))}
          </div>
          <Pressable label="Change the rules in settings" onClick={() => goTab('settings')} className={H.link} style={S('margin-top:12px;font:500 12px/1 Geist;color:#C2603C;cursor:pointer;width:max-content')}>
            Change in settings →
          </Pressable>
        </div>
      </div>
    </div>
  );
}

function QuestionsForm({ api, project }) {
  const [qs, setQs] = useState(project.screeningQuestions.length ? project.screeningQuestions.slice() : ['']);
  return (
    <div>
      <div style={S('display:flex;flex-direction:column;gap:12px')}>
        {qs.map((q, i) => (
          <div key={i} style={S('display:flex;gap:10px;align-items:flex-end')}>
            <div style={S('flex:1')}>
              <Field label={`Question ${i + 1}`} value={q} onChange={(v) => setQs((arr) => arr.map((x, j) => (j === i ? v : x)))} maxLength={120} />
            </div>
            <Pressable
              label={`Remove question ${i + 1}`}
              onClick={() => setQs((arr) => arr.filter((_, j) => j !== i))}
              className={cx(H.danger, H.press)}
              style={S('flex:none;width:40px;height:44px;border-radius:11px;border:1px solid #EBD3C8;background:#fff;color:#A8482A;display:grid;place-items:center;cursor:pointer')}
            >
              ✕
            </Pressable>
          </div>
        ))}
      </div>
      {qs.length < 5 ? (
        <Pressable
          label="Add another question"
          onClick={() => setQs((arr) => [...arr, ''])}
          className={cx(H.secondary, H.press)}
          style={S('margin-top:12px;display:inline-flex;align-items:center;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;cursor:pointer')}
        >
          Add question
        </Pressable>
      ) : null}
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>
          Cancel
        </Pressable>
        <Pressable
          label="Save questions"
          onClick={() => {
            updateScreeningQuestions(project.id, qs);
            api.close();
            toast({ title: 'Screening questions updated', message: 'New applicants see them straight away.', tone: 'ok' });
          }}
          className={cx(H.primary, H.press)}
          style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
        >
          Save
        </Pressable>
      </div>
    </div>
  );
}

/* ==========================================================================
   Hours
   ========================================================================== */

export function HoursTab({ p }) {
  const queue = pendingHours(p);
  const clean = cleanHours(p);

  async function approveAll() {
    const ok = await confirmDialog({
      title: `Approve ${clean.length} clean logs?`,
      body: 'Clean logs come straight from the geofence. They post to student records immediately.',
      confirmLabel: 'Approve all',
      tone: 'brand',
    });
    if (!ok) return;
    const n = approveHours(p.id, clean.map((q) => q.id));
    toast({ title: `${n} logs approved`, message: 'Hours posted to their records.', tone: 'ok' });
  }

  function adjust(q) {
    openModal({
      title: `Adjust hours for ${q.n}`,
      subtitle: q.src,
      Body: function AdjBody({ api }) {
        return (
          <HoursEditForm
            api={api}
            row={{ n: q.n, hrs: q.hrs, inOut: q.d }}
            onSave={(hrs, reason) => adjustHours(p.id, q.id, hrs, reason)}
          />
        );
      },
    });
  }

  return (
    <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 320px;gap:20px;margin-top:22px;align-items:start')}>
      <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
        <div className="vu-stack vu-stack-gap" style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:12px')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Hour approvals</div>
          <Pressable
            label={clean.length ? `Approve ${clean.length} clean logs` : 'No clean logs to approve'}
            disabled={!clean.length}
            onClick={approveAll}
            className={cx(clean.length ? H.primary : '', H.press)}
            style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease')}
          >
            <span aria-hidden="true" style={S('font-size:10px;opacity:.9')}>▷</span>
            Approve all clean logs
          </Pressable>
        </div>
        {queue.length ? (
          queue.map((q) => (
            <div key={q.id} className={H.row} style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;transition:background .16s ease')}>
              <div style={S('display:flex;align-items:center;gap:12px;min-width:0')}>
                <div style={S('width:32px;height:32px;border-radius:50%;overflow:hidden;flex:none')}>
                  <ImageSlot src={''} shape="circle" placeholder="face" />
                </div>
                <div style={S('min-width:0')}>
                  <div className="vu-trunc" style={S('font:500 14px/1.2 Geist')}>{q.n}</div>
                  <div className="vu-trunc" style={s('margin-top:4px;font:450 12px/1.3 Geist', `color:${q.ok ? '#8A8179' : '#8A5A20'}`)}>
                    {q.d} · {q.src}
                  </div>
                </div>
              </div>
              <div style={S('display:flex;align-items:center;gap:12px;flex:none')}>
                <div style={S('font:600 16px/1 Geist;letter-spacing:-0.02em')}>{q.hrs.toFixed(1)} hrs</div>
                <Pressable
                  label={`Adjust hours for ${q.n}`}
                  onClick={() => adjust(q)}
                  className={cx(H.secondary, H.press)}
                  style={S('display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease')}
                >
                  Adjust
                </Pressable>
                <Pressable
                  label={`Approve ${q.hrs} hours for ${q.n}`}
                  onClick={() => {
                    approveHours(p.id, [q.id]);
                    toast({ title: `${q.n}: ${q.hrs.toFixed(1)} hrs approved`, message: 'Posted to their record.', tone: 'ok' });
                  }}
                  className={cx(H.primary, H.press)}
                  style={S('display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;padding:0 14px;height:36px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease')}
                >
                  Approve
                </Pressable>
              </div>
            </div>
          ))
        ) : (
          <div style={S('padding:8px 20px 20px')}>
            <EmptyState compact icon="✓" title="Every log is approved" body="Clean check-outs post to student records the same day. Anything manual waits here for you." />
          </div>
        )}
      </div>

      <div style={S('display:flex;flex-direction:column;gap:14px')}>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>How verification works here</div>
          <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:11px;font:450 13px/1.5 Geist;color:#332D28')}>
            {[
              'Check-in and check-out come from the room geofence.',
              'Clean logs post to student records the same day.',
              'Anything manual needs your approval and shows as edited.',
            ].map((t) => (
              <div key={t} style={S('display:flex;gap:10px')}>
                <span aria-hidden="true" style={S('color:#C2603C;font-size:11px;margin-top:3px')}>▪</span>
                {t}
              </div>
            ))}
          </div>
        </div>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Export</div>
          <div style={S('margin-top:12px;font:450 13px/1.5 Geist;color:#6B635C')}>Send this term to the sponsor or to a counselor as a signed CSV.</div>
          <div style={S('margin-top:14px;display:flex;gap:8px')}>
            <Pressable
              label="Export this term as CSV"
              onClick={() => {
                download(`${p.name.toLowerCase().replace(/\s+/g, '-')}-roster.csv`, rosterCSV(p));
                toast({ title: 'Roster exported', message: 'Signed CSV downloaded.', tone: 'ok' });
              }}
              className={cx(H.secondary, H.press)}
              style={S('display:inline-flex;align-items:center;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease')}
            >
              CSV
            </Pressable>
            <Pressable
              label="Export this term as PDF"
              onClick={() => {
                toast({ title: 'Opening the print dialog', message: 'Choose “Save as PDF”.', tone: 'brand' });
                setTimeout(() => window.print(), 400);
              }}
              className={cx(H.secondary, H.press)}
              style={S('display:inline-flex;align-items:center;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease')}
            >
              PDF
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

export function QualityTab({ p, params, setParam, goTab }) {
  const compliance = recomputeCompliance(p);
  const auditAll = params.get('audit') === 'all';
  const reliability = p.people
    .filter((x) => x.st === 'Active' || x.st === 'Onboarding' || x.st === 'Inactive')
    .slice(0, 5)
    .map((x) => reliabilityRow(p, x));

  function file() {
    openModal({
      title: 'File an incident',
      subtitle: 'Incidents go to the sponsor the same day and stay on the project record.',
      Body: function IncBody({ api }) {
        return <IncidentForm api={api} project={p} />;
      },
    });
  }

  return (
    <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 330px;gap:20px;margin-top:22px;align-items:start')}>
      <div style={S('display:flex;flex-direction:column;gap:16px')}>
        <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
          <div style={S(`padding:16px 20px;border-bottom:1px solid #F1EBE4;font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>
            Reliability by volunteer
          </div>
          <div className="vu-table-wrap">
            <div>
              <div style={S(`display:grid;grid-template-columns:1.8fr .8fr .6fr 1.1fr 1fr;gap:12px;padding:12px 20px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>
                <div>Volunteer</div><div>Show rate</div><div>Late</div><div>Average score</div><div>Signal</div>
              </div>
              {reliability.length ? (
                reliability.map((r) => (
                  <div key={r.slug} className={H.row} style={S('display:grid;grid-template-columns:1.8fr .8fr .6fr 1.1fr 1fr;gap:12px;padding:14px 20px;border-bottom:1px solid #F1EBE4;align-items:center;transition:background .16s ease')}>
                    <div style={S('display:flex;align-items:center;gap:11px;min-width:0')}>
                      <div style={S('width:28px;height:28px;border-radius:50%;overflow:hidden;flex:none')}>
                        <ImageSlot src={''} shape="circle" placeholder="face" />
                      </div>
                      <div className="vu-trunc" style={S('font:500 13px/1 Geist')}>{r.n}</div>
                    </div>
                    <div style={S(`font:500 13px/1 ${MONO}`)}>{r.show}</div>
                    <div style={S('font:450 13px/1 Geist;color:#57504A')}>{r.late}</div>
                    <div style={S('font:450 13px/1 Geist;color:#57504A')}>{r.score}</div>
                    <div>
                      <span style={S(`padding:5px 9px;border-radius:7px;background:${r.bg};font:500 11px/1 ${MONO};color:${r.color}`)}>{r.trend}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={S('padding:20px;font:450 13px/1.5 Geist;color:#8A8179')}>No crew history yet. Reliability builds after the first posted session.</div>
              )}
            </div>
          </div>
        </div>

        <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
          <div style={S(`padding:16px 20px;border-bottom:1px solid #F1EBE4;font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Compliance</div>
          {compliance.map((c) => (
            <div key={c.id} className="vu-stack vu-stack-gap" style={S('padding:14px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:16px')}>
              <div style={S('font:450 14px/1.3 Geist;color:#332D28')}>{c.t}</div>
              <div style={S('display:flex;align-items:center;gap:12px;flex:none')}>
                <div style={S(`font:500 12px/1 ${MONO};color:#8A8179`)}>{c.v}</div>
                <span style={S(`padding:5px 9px;border-radius:7px;background:${c.bg};font:500 11px/1 ${MONO};color:${c.color}`)}>{c.st}</span>
                {c.st !== 'Clear' ? (
                  <Pressable
                    label={`Fix ${c.t} in People`}
                    onClick={() => {
                      toast({ title: c.t, message: c.id === 'cp1' ? 'Mark consent received on anyone still outstanding.' : 'Mark training complete once each person finishes it.', tone: 'ok' });
                      goTab && goTab('people');
                    }}
                    className={cx(H.secondary, H.press)}
                    style={S('padding:5px 9px;border-radius:7px;border:1px solid #E8E1D9;background:#fff;font:500 11px/1 Geist;color:#57504A;cursor:pointer;transition:background .16s ease')}
                  >
                    Fix
                  </Pressable>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="vu-2col" style={S('display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
          <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Incident log</div>
            <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:12px')}>
              {p.incidents.length ? (
                p.incidents.map((i) => (
                  <div key={i.id} style={S('padding:14px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                    <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
                      <div style={S('font:500 13px/1.2 Geist')}>{i.t}</div>
                      <span style={s(`padding:4px 8px;border-radius:6px;font:500 10px/1 ${MONO};flex:none`, `background:${i.st === 'Closed' ? '#EAF3EC' : '#FDF3E7'}`, `color:${i.st === 'Closed' ? '#3F6B4E' : '#8A5A20'}`)}>{i.st}</span>
                    </div>
                    <div style={S('margin-top:7px;font:450 12px/1.45 Geist;color:#6B635C')}>{i.note}</div>
                    <div style={S('margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:10px')}>
                      <div style={S(`font:500 10px/1 ${MONO};color:#A9A097`)}>
                        {i.d} · {i.who}
                      </div>
                      {i.st !== 'Closed' ? (
                        <Pressable
                          label={`Close incident: ${i.t}`}
                          onClick={() => {
                            closeIncident(p.id, i.id);
                            toast({ title: 'Incident closed', tone: 'ok' });
                          }}
                          className={H.link}
                          style={S('font:500 11px/1 Geist;color:#C2603C;cursor:pointer')}
                        >
                          Close
                        </Pressable>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div style={S('font:450 13px/1.5 Geist;color:#8A8179')}>No incidents on record.</div>
              )}
            </div>
            <Pressable
              label="File an incident"
              onClick={file}
              className={cx(H.secondary, H.press)}
              style={S('margin-top:14px;display:inline-flex;align-items:center;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
            >
              File an incident
            </Pressable>
          </div>

          <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Hour disputes</div>
            <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:12px')}>
              {p.disputes.length ? (
                p.disputes.map((d) => (
                  <div key={d.id} style={S('padding:14px;border-radius:12px;border:1px solid #EFE3DC;background:#FAF6F3')}>
                    <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
                      <div style={S('font:500 13px/1.2 Geist')}>
                        {d.n} · {d.d}
                      </div>
                      <span style={s(`padding:4px 8px;border-radius:6px;font:500 10px/1 ${MONO};flex:none`, `background:${d.st === 'Open' ? '#F5E7E0' : '#EAF3EC'}`, `color:${d.st === 'Open' ? '#A8482A' : '#3F6B4E'}`)}>{d.st}</span>
                    </div>
                    <div style={S('margin-top:7px;font:450 12px/1.45 Geist;color:#6B635C')}>{d.claim}</div>
                    <div style={S('margin-top:8px;font:450 12px/1.45 Geist;color:#332D28')}>Next step: {d.action}</div>
                    {d.st === 'Open' ? (
                      <div style={S('margin-top:10px;display:flex;gap:8px')}>
                        <Pressable
                          label={`Uphold ${d.n}'s claim`}
                          onClick={() => {
                            resolveDispute(p.id, d.id, 'upheld', 'Geofence exit matched the sign-out sheet.');
                            toast({ title: 'Dispute upheld', message: `${d.n}'s hours were corrected on their record.`, tone: 'ok' });
                          }}
                          className={cx(H.secondary, H.press)}
                          style={S('padding:6px 10px;border-radius:8px;border:1px solid #E4DDD4;background:#fff;font:500 12px/1 Geist;color:#332D28;cursor:pointer')}
                        >
                          Uphold
                        </Pressable>
                        <Pressable
                          label={`Decline ${d.n}'s claim`}
                          onClick={() => {
                            resolveDispute(p.id, d.id, 'declined', 'Geofence exit stands.');
                            toast({ title: 'Dispute declined', message: 'The original hours stand and the student is notified.', tone: 'brand' });
                          }}
                          className={cx(H.secondary, H.press)}
                          style={S('padding:6px 10px;border-radius:8px;border:1px solid #E4DDD4;background:#fff;font:500 12px/1 Geist;color:#8A8179;cursor:pointer')}
                        >
                          Decline
                        </Pressable>
                      </div>
                    ) : d.resolvedNote ? (
                      <div style={S('margin-top:8px;font:450 12px/1.45 Geist;color:#8A8179')}>{d.resolvedNote}</div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div style={S('font:450 13px/1.5 Geist;color:#8A8179')}>No open disputes.</div>
              )}
            </div>
            <div style={S('margin-top:14px;font:450 12px/1.5 Geist;color:#8A8179')}>
              An open dispute freezes that hour on the student record until you or the sponsor rules on it.
            </div>
          </div>
        </div>
      </div>

      <div style={S('display:flex;flex-direction:column;gap:14px')}>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Audit log</div>
          <div style={S('margin-top:12px;display:flex;flex-direction:column')}>
            {p.auditLog.slice(0, auditAll ? 40 : 5).map((a) => (
              <div key={a.id} style={S('padding:11px 0;border-bottom:1px solid #F1EBE4')}>
                <div style={S('font:450 13px/1.4 Geist;color:#332D28')}>{a.t}</div>
                <div style={S(`margin-top:5px;font:500 10px/1 ${MONO};color:#A9A097`)}>
                  {a.who} · {a.w}
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
        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>No-show policy</div>
          <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:10px;font:450 13px/1.45 Geist;color:#332D28')}>
            {['First miss: automatic check-in message', 'Second miss: lead conversation required', 'Third miss: seat released to the waitlist'].map((t) => (
              <div key={t} style={S('display:flex;gap:10px')}>
                <span aria-hidden="true" style={S('color:#C2603C;font-size:11px;margin-top:3px')}>▪</span>
                {t}
              </div>
            ))}
          </div>
        </div>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Sponsor review</div>
          <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:9px;font:450 13px/1.4 Geist;color:#57504A')}>
            <div style={S('display:flex;justify-content:space-between;gap:10px')}>
              <span>Last review</span>
              <span style={S('color:#1A1714;font-weight:500')}>{p.sponsor.lastReview}</span>
            </div>
            <div style={S('display:flex;justify-content:space-between;gap:10px')}>
              <span>Rating of your project</span>
              <span style={S('color:#1A1714;font-weight:500')}>{p.sponsor.rating}</span>
            </div>
            <div style={S('display:flex;justify-content:space-between;gap:10px')}>
              <span>Renewal</span>
              <span style={s('font-weight:500', `color:${p.sponsor.renewal === 'Recommended' ? '#3F6B4E' : '#8A8179'}`)}>{p.sponsor.renewal}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function reliabilityRow(p, person) {
  const sessions = Object.values(p.attendance);
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
    trend = 'No data';
    t = { bg: '#F6F2EE', color: '#6B635C' };
  } else if (show < 70) {
    trend = `${total - attended} miss${total - attended === 1 ? '' : 'es'}`;
    t = { bg: '#F5E7E0', color: '#A8482A' };
  } else if (show < 100 || late > 1) {
    trend = 'Watch';
    t = { bg: '#FDF3E7', color: '#8A5A20' };
  }
  return { n: person.n, slug: person.slug, show: `${show}%`, late: String(late), score: avg, trend, bg: t.bg, color: t.color };
}

function IncidentForm({ api, project }) {
  const [f, setF] = useState({ t: '', note: '', d: 'Today' });
  const [err, setErr] = useState({});
  return (
    <div>
      <Field label="What happened" value={f.t} onChange={(v) => setF((x) => ({ ...x, t: v }))} maxLength={90} required error={err.t} placeholder="Scraped knee at the supply table" />
      <div style={S('margin-top:14px')}>
        <label htmlFor="inc-note" style={S('font:500 12px/1 Geist;color:#57504A')}>What you did about it</label>
        <textarea
          id="inc-note"
          value={f.note}
          onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))}
          maxLength={400}
          placeholder="Who helped, whether a guardian was notified, and anything the sponsor needs to know."
          className={H.input}
          style={S('margin-top:8px;display:block;width:100%;padding:14px;border-radius:12px;border:1px solid #E8E1D9;background:#FCFAF8;min-height:100px;font:450 14px/1.55 Geist;color:#332D28')}
        />
        {err.note ? <div className="vu-err">{err.note}</div> : null}
      </div>
      <div style={S('margin-top:14px;padding:12px 14px;border-radius:11px;background:#FDF3E7;border:1px solid #F3E3CD;font:450 12px/1.5 Geist;color:#8A5A20')}>
        Anything involving injury or a guardian goes to {project.sponsor.name} the same day.
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>
          Cancel
        </Pressable>
        <Pressable
          label="File the incident"
          onClick={() => {
            const e = {};
            if (!f.t.trim()) e.t = 'A one-line summary is required.';
            if (f.note.trim().length < 10) e.note = 'Add a little more detail for the sponsor.';
            setErr(e);
            if (Object.keys(e).length) return;
            fileIncident(project.id, { t: f.t.trim(), note: f.note.trim(), d: f.d });
            api.close();
            toast({ title: 'Incident filed', message: `${project.sponsor.name} has been notified.`, tone: 'ok' });
          }}
          className={cx(H.primary, H.press)}
          style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
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

export function MessagesTab({ p, params, setParam }) {
  const threadParam = params.get('thread');
  const threadId = threadParam && p.threads.some((t) => t.id === threadParam) ? threadParam : p.threads[0] && p.threads[0].id;
  const th = p.threads.find((t) => t.id === threadId);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (threadId) readThread(p.id, threadId);
  }, [p.id, threadId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [threadId, th && th.messages.length]);

  if (!p.threads.length || !th) {
    return (
      <div style={S('margin-top:22px')}>
        <EmptyState title="No threads yet" body="Crew announcements, sponsor updates and one-to-one messages all land here." />
      </div>
    );
  }

  function send() {
    const body = draft.trim();
    if (!body) {
      toast({ title: 'Nothing to send', message: 'Write a message first.', tone: 'warn' });
      return;
    }
    sendMessage(p.id, th.id, body);
    setDraft('');
    toast({ title: 'Posted to the thread', message: 'For updates that reach members who joined online, use the announcements board.', tone: 'ok', timeout: 2600 });
  }

  function templates(e) {
    menuFromEvent(
      e,
      messageTemplates.map((t) => ({ key: t.id, label: t.t, icon: '✎' })),
      (key) => {
        const t = messageTemplates.find((x) => x.id === key);
        if (t) setDraft(t.body);
      }
    );
  }

  return (
    <div className="vu-split" style={S('display:grid;grid-template-columns:320px 1fr;gap:20px;margin-top:22px;align-items:start')}>
      <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
        <div style={S(`padding:14px 18px;border-bottom:1px solid #F1EBE4;font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Threads</div>
        {p.threads.map((t) => {
          const on = t.id === threadId;
          return (
            <Pressable
              key={t.id}
              label={`${t.n}${t.unread ? `, ${t.unread} unread` : ''}`}
              current={on ? 'true' : undefined}
              onClick={() => setParam({ thread: t.id })}
              className={cx(H.row, H.press)}
              style={s('padding:14px 18px;border-bottom:1px solid #F1EBE4;cursor:pointer;transition:background .16s ease', on ? 'background:#FAF6F3' : '')}
            >
              <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px')}>
                <div className="vu-trunc" style={S('font:500 13px/1.2 Geist')}>{t.n}</div>
                <div style={S('display:flex;align-items:center;gap:7px;flex:none')}>
                  {t.unread ? <span style={S('min-width:16px;height:16px;padding:0 5px;border-radius:8px;background:#C2603C;color:#fff;font:600 9px/16px Geist;text-align:center')}>{t.unread}</span> : null}
                  <div style={S(`font:500 10px/1 ${MONO};color:#A9A097`)}>{t.when}</div>
                </div>
              </div>
              <div className="vu-trunc" style={S('margin-top:6px;font:450 12px/1.4 Geist;color:#8A8179')}>{t.p}</div>
            </Pressable>
          );
        })}
      </div>

      <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;min-height:420px;display:flex;flex-direction:column')}>
        <div className="vu-stack vu-stack-gap" style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:12px')}>
          <div style={S('min-width:0')}>
            <div className="vu-trunc" style={S('font:600 15px/1.2 Geist;letter-spacing:-0.02em')}>{th.n}</div>
            <div style={S('margin-top:5px;font:450 12px/1 Geist;color:#8A8179')}>
              {th.members} member{th.members === 1 ? '' : 's'} · replies {th.repliesOff ? 'off' : 'on'}
            </div>
          </div>
          <Pressable
            label="Insert a message template"
            expanded={false}
            onClick={templates}
            className={cx(H.secondary, H.press)}
            style={S('display:inline-flex;align-items:center;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
          >
            Templates
          </Pressable>
        </div>

        <div ref={scrollRef} style={S('padding:20px;display:flex;flex-direction:column;gap:14px;flex:1;max-height:440px;overflow-y:auto')}>
          {th.messages.length ? (
            th.messages.map((m) => (
              <div key={m.id} style={S('max-width:460px;align-self:flex-start')}>
                {m.who !== 'me' ? <div style={S(`margin-bottom:5px;font:500 11px/1 ${MONO};color:#A9A097`)}>{m.whoName || 'Them'}</div> : null}
                <div className="vu-break" style={s('padding:14px 16px;border-radius:12px;font:450 14px/1.55 Geist;color:#332D28', `background:${m.who === 'me' ? '#FCFAF8' : '#FAF6F3'}`, `border:1px solid ${m.who === 'me' ? '#F1EBE4' : '#EFE3DC'}`)}>
                  {m.body}
                </div>
                <div style={S(`margin-top:5px;font:500 10px/1 ${MONO};color:#BEB5AC`)}>{m.when}</div>
              </div>
            ))
          ) : (
            <div style={S('margin:auto;text-align:center;max-width:320px')}>
              <div style={S('font:500 14px/1.3 Geist;color:#57504A')}>No messages yet</div>
              <div style={S('margin-top:7px;font:450 13px/1.5 Geist;color:#8A8179')}>Send the first announcement so the crew knows when and where to show up.</div>
            </div>
          )}
        </div>

        <div style={S('padding:16px 20px;border-top:1px solid #F1EBE4;display:flex;align-items:center;gap:12px')}>
          <input
            type="text"
            value={draft}
            placeholder="Write to the crew"
            aria-label="Message body"
            maxLength={600}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
            className={H.input}
            style={S('flex:1;min-width:0;padding:12px 14px;border-radius:11px;border:1px solid #E8E1D9;background:#FCFAF8;font:450 14px/1.15 Geist;color:#1A1714;transition:border-color .16s ease')}
          />
          <Pressable
            label="Send message"
            onClick={send}
            className={cx(H.primary, H.press)}
            style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 16px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer;transition:background .16s ease')}
          >
            <span aria-hidden="true" style={S('font-size:11px;opacity:.9')}>▷</span>
            Send
          </Pressable>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   Settings
   ========================================================================== */

export function SettingsTab({ p }) {
  function editDetails() {
    openModal({
      title: 'Project details',
      subtitle: 'What students see on your recruiting page.',
      Body: function DetailsBody({ api }) {
        return <DetailsForm api={api} project={p} />;
      },
    });
  }

  function invite() {
    openModal({
      title: 'Invite a co-lead',
      subtitle: 'Co-leads can edit the roster and sessions. They cannot archive the project.',
      Body: function InviteBody({ api }) {
        return <CoLeadForm api={api} project={p} />;
      },
    });
  }

  async function archive() {
    const ok = await confirmDialog({
      title: `Archive ${p.name}?`,
      body: 'The project stops accepting applications and disappears from the public feed. Hours already posted stay on every student record.',
      confirmLabel: 'Archive project',
      requireText: 'ARCHIVE',
    });
    if (!ok) return;
    archiveProject(p.id);
    toast({ title: 'Project archived', message: 'Every posted hour stays on the students’ records.', tone: 'ok' });
  }

  return (
    <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 320px;gap:20px;margin-top:22px;align-items:start')}>
      <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
        <div style={S(`padding:16px 20px;border-bottom:1px solid #F1EBE4;font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Project settings</div>
        {p.settings.map((r) => (
          <div key={r.id} className="vu-stack vu-stack-gap" style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:16px')}>
            <div style={S('font:450 14px/1.4 Geist;color:#332D28')}>
              {r.t}
              {r.locked ? (
                <span title="Required by policy" style={S('color:#A9A097;font-size:12px')}>
                  {' '}· required
                </span>
              ) : null}
            </div>
            <div style={S('display:flex;align-items:center;gap:12px;flex:none')}>
              <div style={S(`font:500 12px/1 ${MONO};color:#8A8179`)}>{r.v}</div>
              <Toggle
                on={r.on}
                label={r.t}
                disabled={r.locked}
                onChange={() => {
                  if (r.locked) {
                    toast({ title: 'This one is not optional', message: 'Guardian consent under 16 is required by the sponsor.', tone: 'warn' });
                    return;
                  }
                  const row = toggleProjectSetting(p.id, r.id);
                  if (row) toast({ title: `${row.t}: ${row.v}`, tone: 'ok', timeout: 2200 });
                }}
              />
            </div>
          </div>
        ))}
        <div style={S('padding:18px 20px;display:flex;flex-wrap:wrap;gap:10px')}>
          <Pressable
            label="Edit project details"
            onClick={editDetails}
            className={cx(H.secondary, H.press)}
            style={S('display:inline-flex;align-items:center;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease')}
          >
            Edit project details
          </Pressable>
          <Pressable
            label={p.archived ? 'Already archived' : 'Archive this project'}
            disabled={p.archived}
            onClick={archive}
            className={cx(H.danger, H.press)}
            style={S('display:inline-flex;align-items:center;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #EBD3C8;background:#fff;font:600 13px/1 Geist;color:#A8482A;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
          >
            {p.archived ? 'Archived' : 'Archive project'}
          </Pressable>
        </div>
      </div>

      <div style={S('display:flex;flex-direction:column;gap:14px')}>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Documents</div>
          <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:10px;font:450 13px/1.4 Geist;color:#332D28')}>
            {p.documents.map((d) => (
              <Pressable
                key={d.t}
                label={`Open ${d.t}`}
                onClick={() =>
                  openModal({
                    title: d.t,
                    subtitle: `Status: ${d.v}`,
                    body: (
                      <div style={S('font:450 14px/1.6 Geist;color:#57504A')}>
                        {d.t === 'Safety plan'
                          ? 'Version 3, approved by the sponsor on Jul 12. Covers supervision ratios, the two-adult rule, first aid location and the weather cancellation policy.'
                          : d.t === 'Room agreement'
                          ? `Signed with ${p.sponsor.name}. The community room is held every Saturday 9:45–12:15 through ${p.sponsor.roomBookedTo}.`
                          : 'Guardian consent is collected at accept time for anyone under 16. Outstanding forms are listed in the Quality tab.'}
                      </div>
                    ),
                  })
                }
                className={cx(H.toBrand, H.press)}
                style={S('display:flex;justify-content:space-between;gap:10px;cursor:pointer;transition:color .16s ease')}
              >
                <span>{d.t}</span>
                <span style={s(`color:${d.tone === 'ok' ? '#3F6B4E' : '#8A5A20'}`)}>{d.v}</span>
              </Pressable>
            ))}
          </div>
        </div>

        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Co-leads</div>
          {p.coleads.length ? (
            <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:9px')}>
              {p.coleads.map((c) => (
                <div key={c.id} style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;font:450 13px/1.4 Geist;color:#332D28')}>
                  <div style={S('min-width:0')}>
                    <div className="vu-trunc">{c.name}</div>
                    <div className="vu-trunc" style={S('font:450 11px/1.3 Geist;color:#8A8179')}>
                      {c.email} · {c.status}
                    </div>
                  </div>
                  <Pressable
                    label={`Remove ${c.name}`}
                    onClick={() => {
                      removeCoLead(p.id, c.id);
                      toast({ title: `${c.name} removed`, tone: 'ok' });
                    }}
                    className={H.link}
                    style={S('font:500 11px/1 Geist;color:#A8482A;cursor:pointer;flex:none')}
                  >
                    Remove
                  </Pressable>
                </div>
              ))}
            </div>
          ) : (
            <div style={S('margin-top:12px;font:450 13px/1.5 Geist;color:#6B635C')}>Give another student edit access to the roster and sessions.</div>
          )}
          <Pressable
            label="Invite a co-lead"
            onClick={invite}
            className={cx(H.secondary, H.press)}
            style={S('margin-top:14px;display:inline-flex;align-items:center;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
          >
            Invite a co-lead
          </Pressable>
        </div>
      </div>
    </div>
  );
}

function DetailsForm({ api, project }) {
  const [f, setF] = useState({ name: project.name, site: project.site, mission: project.mission, bio: project.bio });
  const [err, setErr] = useState({});
  return (
    <div>
      <Field label="Project name" value={f.name} onChange={(v) => setF((x) => ({ ...x, name: v }))} maxLength={60} required error={err.name} />
      <div style={S('margin-top:14px')}>
        <Field label="Site or location" value={f.site} onChange={(v) => setF((x) => ({ ...x, site: v }))} maxLength={90} required error={err.site} />
      </div>
      <div style={S('margin-top:14px')}>
        <label htmlFor="pd-mission" style={S('font:500 12px/1 Geist;color:#57504A')}>Mission</label>
        <textarea
          id="pd-mission"
          value={f.mission}
          maxLength={240}
          onChange={(e) => setF((x) => ({ ...x, mission: e.target.value }))}
          className={H.input}
          style={S('margin-top:8px;display:block;width:100%;padding:14px;border-radius:12px;border:1px solid #E8E1D9;background:#FCFAF8;min-height:84px;font:450 14px/1.55 Geist;color:#332D28')}
        />
      </div>
      <div style={S('margin-top:14px')}>
        <label htmlFor="pd-bio" style={S('font:500 12px/1 Geist;color:#57504A')}>Short bio</label>
        <textarea
          id="pd-bio"
          value={f.bio}
          maxLength={400}
          onChange={(e) => setF((x) => ({ ...x, bio: e.target.value }))}
          className={H.input}
          style={S('margin-top:8px;display:block;width:100%;padding:14px;border-radius:12px;border:1px solid #E8E1D9;background:#FCFAF8;min-height:70px;font:450 14px/1.55 Geist;color:#332D28')}
        />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>
          Cancel
        </Pressable>
        <Pressable
          label="Save project details"
          onClick={() => {
            const e = {};
            if (!f.name.trim()) e.name = 'The project needs a name.';
            if (!f.site.trim()) e.site = 'Where does it happen?';
            setErr(e);
            if (Object.keys(e).length) return;
            updateProject(project.id, { name: f.name.trim(), site: f.site.trim(), siteShort: f.site.trim(), mission: f.mission.trim(), bio: f.bio.trim() });
            api.close();
            toast({ title: 'Project updated', message: 'Your recruiting page shows the new details.', tone: 'ok' });
          }}
          className={cx(H.primary, H.press)}
          style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
        >
          Save
        </Pressable>
      </div>
    </div>
  );
}

function CoLeadForm({ api, project }) {
  const [f, setF] = useState({ name: '', email: '' });
  const [err, setErr] = useState({});
  return (
    <div>
      <Field label="Name" value={f.name} onChange={(v) => setF((x) => ({ ...x, name: v }))} maxLength={60} required error={err.name} />
      <div style={S('margin-top:14px')}>
        <Field label="School email" type="email" value={f.email} onChange={(v) => setF((x) => ({ ...x, email: v }))} required error={err.email} placeholder="them@school.edu" />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>
          Cancel
        </Pressable>
        <Pressable
          label="Send the invite"
          onClick={() => {
            const e = {};
            if (!f.name.trim()) e.name = 'Who are you inviting?';
            if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(f.email.trim())) e.email = 'That does not look like an email address.';
            setErr(e);
            if (Object.keys(e).length) return;
            inviteCoLead(project.id, f.name.trim(), f.email.trim());
            api.close();
            toast({ title: `Invite sent to ${f.name.trim()}`, message: 'They get edit access once they accept.', tone: 'ok' });
          }}
          className={cx(H.primary, H.press)}
          style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
        >
          Send invite
        </Pressable>
      </div>
    </div>
  );
}
