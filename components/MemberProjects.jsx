'use client';

/* ==========================================================================
   MemberProjects.jsx — the volunteer/member side of a project they joined
   Once a founder accepts you, this is where you see what's expected before you
   start: the QC pipeline for a volunteer program, or your role briefing for a
   task-based team. Progress is the member's own, saved on their application row
   so the same view follows them across devices. Renders nothing until they have
   been accepted somewhere real.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S, s, cx, H } from '../lib/style.js';
import { loadMyMemberships, updateMemberState, setMyTaskStatus, logMemberHours, removeMemberHours, checkInMember } from '../lib/listings.js';
import { openModal, toast, confirmDialog } from '../lib/overlays.js';
import { Field, Pressable } from './ui.jsx';
import MessageThread from './MessageThread.jsx';

const MONO = "'Geist Mono',monospace";

/* Only ever hand the browser an http(s) link the organizer pasted. Anything
   with another scheme (javascript:, data:, mailto slipups) is dropped; a bare
   domain gets https:// so "zoom.us/j/123" still opens. */
export function safeUrl(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return ''; // some other scheme — reject
  if (/^[\w-]+(\.[\w-]+)+/.test(v)) return `https://${v}`; // looks like a domain
  return '';
}

const KIND = {
  meeting: { icon: '◷', bg: '#EEF3FB', color: '#5B6BB0' },
  form: { icon: '▤', bg: '#FDF3E7', color: '#8A5A20' },
  training: { icon: '◈', bg: '#EAF3EC', color: '#3F6B4E' },
  check: { icon: '✓', bg: '#F6F2EE', color: '#57504A' },
};

export default function MemberProjects() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadMyMemberships().then(setRows).catch(() => setRows([]));
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
    else toast({ title: 'Could not save that', message: 'Check your connection and try again.', tone: 'danger' });
    setBusy(false);
  }

  async function ackBriefing(app, roleId) {
    if (busy) return;
    setBusy(true);
    const cur = (app.member_state && app.member_state.briefingAck) || {};
    const { ok, member_state } = await updateMemberState(app.id, { briefingAck: { ...cur, [roleId]: true } });
    if (ok) { patchLocal(app.id, member_state); toast({ title: 'Briefing confirmed', tone: 'ok', timeout: 2000 }); }
    else toast({ title: 'Could not save that', tone: 'danger' });
    setBusy(false);
  }

  async function toggleTask(app, taskId) {
    if (busy) return;
    setBusy(true);
    const cur = (app.member_state && app.member_state.tasks) || {};
    const next = cur[taskId] === 'done' ? 'todo' : 'done';
    const { ok, member_state } = await setMyTaskStatus(app.id, taskId, next);
    if (ok) { patchLocal(app.id, member_state); if (next === 'done') toast({ title: 'Nice — marked done', tone: 'ok', timeout: 1600 }); }
    else toast({ title: 'Could not save that', tone: 'danger' });
    setBusy(false);
  }

  function message(app) {
    openModal({
      title: app.listings.name,
      subtitle: "You're a member",
      Body: () => <MessageThread applicationId={app.id} recipientId={app.owner_id} recipientName={app.listings.name} />,
    });
  }

  function logHoursFor(app) {
    openModal({
      title: `Log hours · ${app.listings.name}`,
      subtitle: 'The organizer confirms these, and confirmed hours count on your verified record.',
      Body: ({ api }) => (
        <MemberHoursForm
          onSave={async (entry) => {
            const { ok, member_state } = await logMemberHours(app.id, entry);
            if (ok) { patchLocal(app.id, member_state); toast({ title: 'Hours logged', message: 'Waiting on the organizer to confirm.', tone: 'ok' }); api.close(); }
            else toast({ title: 'Could not log that', tone: 'danger' });
          }}
          onCancel={() => api.close()}
        />
      ),
    });
  }

  async function removeHour(app, hourId) {
    const ok = await confirmDialog({ title: 'Remove this entry?', body: 'It disappears from your log.', confirmLabel: 'Remove' });
    if (!ok) return;
    const res = await removeMemberHours(app.id, hourId);
    if (res.ok) patchLocal(app.id, res.member_state);
  }

  function checkInFor(app) {
    const session = app.listings.next_session || 'the next session';
    openModal({
      title: `Check in · ${app.listings.name}`,
      subtitle: 'Confirm you have arrived. Enter the code your organizer gave you if you have one.',
      Body: ({ api }) => (
        <CheckInForm
          session={session}
          onSave={async (entry) => {
            const { ok, member_state } = await checkInMember(app.id, { session, ...entry });
            if (ok) { patchLocal(app.id, member_state); toast({ title: 'Checked in', message: 'Your organizer can see you arrived.', tone: 'ok' }); api.close(); }
            else toast({ title: 'Could not check you in', tone: 'danger' });
          }}
          onCancel={() => api.close()}
        />
      ),
    });
  }

  return (
    <div style={S('padding:20px;border-radius:16px;border:1px solid #EFE3DC;background:#FAF6F3')}>
      <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>You're in</div>
      <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:14px')}>
        {rows.map((app) => {
          const l = app.listings;
          const isTeam = l.org_type === 'team';
          return (
            <div key={app.id} style={S('padding:16px 18px;border-radius:14px;background:#fff;border:1px solid #F1EBE4')}>
              <div style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
                <div style={S('min-width:0')}>
                  <div style={S('font:600 16px/1.25 Geist;letter-spacing:-0.02em;color:#1A1714')}>{l.name}</div>
                  <div style={S('margin-top:4px;font:450 12px/1.4 Geist;color:#8A8179')}>
                    {[l.cause, l.site].filter(Boolean).join(' · ') || 'Student-led project'}
                    {app.position ? ` · ${app.position}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => message(app)}
                  style={S('flex:none;padding:0 13px;height:32px;border-radius:9px;border:1px solid #E4DDD4;background:#fff;font:600 12px/1 Geist;color:#57504A;cursor:pointer')}
                >
                  Message organizer
                </button>
              </div>

              {isTeam ? <TeamMember app={app} onAck={ackBriefing} onToggleTask={toggleTask} /> : <VolunteerMember app={app} onToggle={toggleStep} />}

              {(l.announcements || []).length ? (
                <div style={S('margin-top:14px')}>
                  <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>From the organizer</div>
                  <div style={S('margin-top:8px;display:flex;flex-direction:column;gap:8px')}>
                    {l.announcements.slice(0, 3).map((an) => (
                      <div key={an.id} style={S('padding:11px 13px;border-radius:11px;background:#FCFAF8;border:1px solid #F1EBE4')}>
                        <div style={S('font:450 13px/1.55 Geist;color:#332D28;white-space:pre-wrap')}>{an.body}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <MemberCheckIn app={app} onCheckIn={() => checkInFor(app)} />

              <MemberHours app={app} onLog={() => logHoursFor(app)} onRemove={(hid) => removeHour(app, hid)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MemberHours({ app, onLog, onRemove }) {
  const log = (app.member_state && app.member_state.hoursLog) || [];
  const confirmed = (app.assignment && app.assignment.confirmedHours) || {};
  const verified = log.filter((h) => confirmed[h.id]).reduce((a, h) => a + Number(h.hrs || 0), 0);
  const pending = log.filter((h) => !confirmed[h.id]).reduce((a, h) => a + Number(h.hrs || 0), 0);
  return (
    <div style={S('margin-top:14px')}>
      <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px')}>
        <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>Your hours here</div>
        <button type="button" onClick={onLog} style={S('flex:none;padding:0 12px;height:32px;border-radius:9px;border:1px solid #E4DDD4;background:#fff;font:600 12px/1 Geist;color:#1A1714;cursor:pointer')}>+ Log hours</button>
      </div>
      {log.length ? (
        <>
          <div style={S('margin-top:8px;display:flex;gap:8px;flex-wrap:wrap')}>
            <span style={s('padding:4px 9px;border-radius:7px;font:500 11px/1', 'font-family:' + MONO, 'background:#EAF3EC;color:#3F6B4E')}>{Math.round(verified * 10) / 10} verified</span>
            {pending > 0 ? <span style={s('padding:4px 9px;border-radius:7px;font:500 11px/1', 'font-family:' + MONO, 'background:#FDF3E7;color:#8A5A20')}>{Math.round(pending * 10) / 10} awaiting</span> : null}
          </div>
          <div style={S('margin-top:10px;display:flex;flex-direction:column;gap:6px')}>
            {log.slice(0, 5).map((h) => {
              const v = !!confirmed[h.id];
              return (
                <div key={h.id} style={S('display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:9px;background:#FCFAF8;border:1px solid #F1EBE4')}>
                  <span style={s('font:450 13px/1.3 Geist;flex:1;min-width:0', v ? 'color:#57504A' : 'color:#332D28')}>{h.activity} · {h.date}</span>
                  <span style={s('font:500 12px/1', 'font-family:' + MONO)}>{h.hrs} hrs</span>
                  {v ? (
                    <span title="Confirmed by the organization" style={S('color:#3F6B4E;font-size:12px')}>✓</span>
                  ) : (
                    <button type="button" aria-label="Remove entry" onClick={() => onRemove(h.id)} style={S('border:0;background:none;color:#A9A097;font-size:12px;cursor:pointer;padding:0 2px')}>✕</button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div style={S('margin-top:8px;font:450 12px/1.5 Geist;color:#8A8179')}>Log time you put in here. The organizer confirms it, and confirmed hours become verified on your record.</div>
      )}
    </div>
  );
}

function MemberCheckIn({ app, onCheckIn }) {
  const checkins = (app.member_state && app.member_state.checkins) || [];
  const last = checkins[0];
  const nextSession = app.listings.next_session;
  return (
    <div style={S('margin-top:14px;padding:13px 15px;border-radius:12px;background:#FCFAF8;border:1px solid #F1EBE4')}>
      <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
        <div style={S('min-width:0')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>Check in</div>
          <div style={S('margin-top:6px;font:450 13px/1.45 Geist;color:#57504A')}>
            {nextSession ? <>Next session · <span style={S('color:#1A1714;font-weight:500')}>{nextSession}</span></> : 'Confirm you arrived so the organizer can mark you present.'}
          </div>
          {last ? (
            <div style={S('margin-top:6px;font:450 12px/1.4 Geist;color:#3F6B4E')}>
              ✓ Checked in{last.session ? ` for ${last.session}` : ''}{last.at ? ` · ${last.at}` : ''}
            </div>
          ) : null}
        </div>
        <button type="button" onClick={onCheckIn} style={S('flex:none;padding:0 14px;height:34px;border-radius:9px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 12px/1 Geist;cursor:pointer')}>
          {last ? 'Check in again' : 'Check in'}
        </button>
      </div>
    </div>
  );
}

function CheckInForm({ session, onSave, onCancel }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    await onSave({ code, at: 'Today' });
    setBusy(false);
  }
  return (
    <div>
      <div style={S('padding:12px 14px;border-radius:11px;background:#FCFAF8;border:1px solid #F1EBE4;font:450 13px/1.5 Geist;color:#57504A')}>
        Session · <span style={S('color:#1A1714;font-weight:500')}>{session}</span>
      </div>
      <div style={S('margin-top:14px')}>
        <Field
          label="Check-in code (optional)"
          value={code}
          onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 8))}
          placeholder="e.g. 3586"
          inputMode="numeric"
          maxLength={8}
          hint="Your organizer shows this code at the site. No code? You can still check in."
        />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={onCancel} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>Cancel</Pressable>
        <Pressable label="Check in" disabled={busy} onClick={save} className={cx(H.primary, H.press)} style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}>{busy ? 'Checking in…' : 'Check in'}</Pressable>
      </div>
    </div>
  );
}

function MemberHoursForm({ onSave, onCancel }) {
  const [f, setF] = useState({ activity: '', date: '', hrs: '' });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  async function save() {
    const e = {};
    if (!f.activity.trim()) e.activity = 'What did you do?';
    const n = Number(f.hrs);
    if (!n || n <= 0 || n > 24) e.hrs = 'Enter hours between 0 and 24.';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    await onSave(f);
    setBusy(false);
  }
  return (
    <div>
      <Field label="What you did" value={f.activity} onChange={(v) => setF((x) => ({ ...x, activity: v }))} placeholder="e.g. Sorted donations, tutored reading" maxLength={80} required error={err.activity} />
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="Date" value={f.date} onChange={(v) => setF((x) => ({ ...x, date: v }))} placeholder="e.g. Aug 9" maxLength={20} />
        <Field label="Hours" value={f.hrs} onChange={(v) => setF((x) => ({ ...x, hrs: v.replace(/[^\d.]/g, '').slice(0, 5) }))} placeholder="e.g. 2.5" inputMode="decimal" required error={err.hrs} />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={onCancel} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>Cancel</Pressable>
        <Pressable label="Log hours" disabled={busy} onClick={save} className={cx(H.primary, H.press)} style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}>{busy ? 'Saving…' : 'Log hours'}</Pressable>
      </div>
    </div>
  );
}

/* Volunteer program: the QC pipeline the member works through before shift one. */
function VolunteerMember({ app, onToggle }) {
  const steps = (app.listings.pipeline || []).filter((x) => x && x.label);
  const done = (app.member_state && app.member_state.pipeline) || {};
  const required = steps.filter((x) => x.required !== false);
  const cleared = required.filter((x) => done[x.id]).length;
  const ready = required.length === 0 || cleared === required.length;

  if (!steps.length) {
    return (
      <div style={S('margin-top:12px;padding:12px 14px;border-radius:11px;background:#EAF3EC;font:450 13px/1.5 Geist;color:#3F6B4E')}>
        You're all set — no steps to clear. Watch for your first shift details.
      </div>
    );
  }

  return (
    <div style={S('margin-top:14px')}>
      <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
        <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>Before your first shift</div>
        <span style={s('padding:4px 9px;border-radius:7px;font:500 11px/1', 'font-family:' + MONO, ready ? 'background:#EAF3EC;color:#3F6B4E' : 'background:#FDF3E7;color:#8A5A20')}>
          {ready ? 'Ready to start' : `${cleared}/${required.length} done`}
        </span>
      </div>
      <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:8px')}>
        {steps.map((step) => {
          const k = KIND[step.kind] || KIND.check;
          const on = !!done[step.id];
          const href = safeUrl(step.link);
          const actionLabel = step.kind === 'meeting' ? 'Join call' : step.kind === 'form' ? 'Open form' : 'Open link';
          const timing = step.kind === 'form' ? (step.due ? `Due ${step.due}` : '') : (step.when || '');
          return (
            <div
              key={step.id}
              style={s(
                'display:flex;align-items:stretch;gap:8px;border-radius:11px;transition:background .16s ease',
                on ? 'background:#F3F8F4;border:1px solid #CFE4D5' : 'background:#FCFAF8;border:1px solid #F1EBE4'
              )}
            >
              <button
                type="button"
                onClick={() => onToggle(app, step.id)}
                style={S('flex:1;min-width:0;text-align:left;display:flex;align-items:flex-start;gap:11px;padding:12px 14px;background:transparent;border:0;cursor:pointer')}
              >
                <span style={s('width:19px;height:19px;border-radius:6px;flex:none;margin-top:1px;display:grid;place-items:center;font:600 10px/1 Geist', on ? 'background:#3F6B4E;color:#fff' : 'background:#fff;border:1px solid #D8D0C7;color:transparent')}>✓</span>
                <span style={S('min-width:0;flex:1')}>
                  <span style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                    <span style={s('font:600 13.5px/1.3 Geist', on ? 'color:#3F6B4E' : 'color:#1A1714')}>{step.label}</span>
                    <span style={s('padding:2px 7px;border-radius:6px;font:500 10px/1 Geist', `background:${k.bg}`, `color:${k.color}`)}>{k.icon}</span>
                    {step.required === false ? <span style={S('font:450 10px/1 Geist;color:#A9A097')}>optional</span> : null}
                    {timing ? <span style={s(`padding:2px 7px;border-radius:6px;font:500 10px/1 ${MONO}`, 'background:#EEF3FB;color:#5B6BB0')}>{timing}</span> : null}
                  </span>
                  {step.note ? <span style={S('display:block;margin-top:4px;font:450 12px/1.45 Geist;color:#8A8179')}>{step.note}</span> : null}
                </span>
              </button>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={S('flex:none;align-self:center;margin-right:10px;display:inline-flex;align-items:center;gap:5px;padding:0 12px;height:32px;border-radius:9px;border:1px solid #E4DDD4;background:#fff;font:600 12px/1 Geist;color:#C2603C;text-decoration:none;cursor:pointer')}
                >
                  {actionLabel} →
                </a>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Task-based team: your assigned role briefing + the tasks the organizer gave you. */
function TeamMember({ app, onAck, onToggleTask }) {
  const a = app.assignment || {};
  // Prefer the role the organizer assigned to you; fall back to matching the
  // role you applied for against the listing's roles.
  const listingRoles = app.listings.task_roles || [];
  const role = a.role
    || listingRoles.find((r) => r.name && app.position && r.name.toLowerCase() === String(app.position).toLowerCase())
    || null;
  const tasks = a.tasks || [];
  const doneMap = (app.member_state && app.member_state.tasks) || {};
  const acked = role && app.member_state && app.member_state.briefingAck && app.member_state.briefingAck[role.id];
  const doneCount = tasks.filter((t) => doneMap[t.id] === 'done').length;

  if (!role && !tasks.length) {
    return (
      <div style={S('margin-top:12px;padding:12px 14px;border-radius:11px;background:#FCFAF8;border:1px solid #F1EBE4;font:450 13px/1.5 Geist;color:#57504A')}>
        You're on the team. Your organizer will set your role and assign your first tasks — they'll appear here.
      </div>
    );
  }

  return (
    <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:14px')}>
      {role ? (
        <div>
          <div style={S('display:flex;align-items:center;gap:8px')}>
            <span style={s('width:9px;height:9px;border-radius:50%;flex:none', `background:${role.color || '#C2603C'}`)} />
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>Your role · {role.name}</div>
          </div>
          {role.briefing ? (
            <div style={S('margin-top:10px;padding:14px 16px;border-radius:12px;background:#FCFAF8;border:1px solid #F1EBE4;font:450 13.5px/1.6 Geist;color:#332D28')}>
              {role.briefing}
            </div>
          ) : null}
          <div style={S('margin-top:12px')}>
            {acked ? (
              <span style={S('display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:9px;background:#EAF3EC;font:600 12px/1 Geist;color:#3F6B4E')}>✓ Briefing read</span>
            ) : (
              <button type="button" onClick={() => onAck(app, role.id)} style={S('padding:0 15px;height:38px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer')}>
                I've read the briefing
              </button>
            )}
          </div>
        </div>
      ) : null}

      {tasks.length ? (
        <div>
          <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>Your tasks</div>
            <span style={s('padding:4px 9px;border-radius:7px;font:500 11px/1', 'font-family:' + MONO, doneCount === tasks.length ? 'background:#EAF3EC;color:#3F6B4E' : 'background:#FDF3E7;color:#8A5A20')}>{doneCount}/{tasks.length} done</span>
          </div>
          <div style={S('margin-top:10px;display:flex;flex-direction:column;gap:8px')}>
            {tasks.map((t) => {
              const on = doneMap[t.id] === 'done';
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onToggleTask(app, t.id)}
                  style={s('text-align:left;display:flex;align-items:flex-start;gap:11px;padding:12px 14px;border-radius:11px;cursor:pointer;transition:background .16s ease', on ? 'background:#F3F8F4;border:1px solid #CFE4D5' : 'background:#FCFAF8;border:1px solid #F1EBE4')}
                >
                  <span style={s('width:19px;height:19px;border-radius:6px;flex:none;margin-top:1px;display:grid;place-items:center;font:600 10px/1 Geist', on ? 'background:#3F6B4E;color:#fff' : 'background:#fff;border:1px solid #D8D0C7;color:transparent')}>✓</span>
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
        <div style={S('font:450 12px/1.5 Geist;color:#8A8179')}>No tasks yet — your organizer will assign them here.</div>
      ) : null}
    </div>
  );
}
